import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getCity } from "@/lib/cities";
import { CITY_IDS, type CityId } from "@/lib/cities/info";
import { WEEKDAYS } from "@/lib/history-profile";
import {
  ToolInputError,
  findParking,
  getGarage,
  listCities,
  listGarages,
  typicalAvailability,
  type Sources,
} from "@/lib/mcp-tools";
import { MCP_APP_MIME_TYPE, PARKING_CARD_HTML, PARKING_CARD_URI } from "@/lib/mcp-app/parking-card";
import { SITE_NAME } from "@/lib/site";

// An MCP server (Model Context Protocol, "Streamable HTTP"): lets an AI
// assistant ask this site where to park — in Ghent, and in the other cities
// it has a plug-in for (lib/cities). Add <site>/api/mcp as a
// connector in the assistant; no key needed, everything here is public data.
//
// Stateless: every POST is answered on its own with plain JSON, so nothing is
// kept between requests and no connection stays open. Each call costs one
// function run and reads the same cached feeds as the pages.

export const maxDuration = 15;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
} as const;

const siteOf = (request: Request) => new URL(request.url).origin;

async function sources(request: Request, cityId: CityId | undefined): Promise<Sources> {
  const city = getCity(cityId);
  // The live list is needed; the forecast and the weekly pattern are extras
  // an answer can do without.
  const [{ parkings, extras }, trends, profile] = await Promise.all([
    city.live(),
    city.trends().catch(() => ({})),
    city.profile().catch(() => null),
  ]);
  return { city, parkings, extras, trends, profile, now: Date.now(), siteUrl: siteOf(request) };
}

// The JSON as text for the model, and the same object as structured content
// for the card (lib/mcp-app) the host may draw next to the answer.
const asText = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 1) }],
  structuredContent: result as Record<string, unknown>,
});

// Tools whose answer is drawn as a card by hosts that support MCP Apps.
// Both keys: the current one and the older flat one some hosts still read.
const WITH_CARD = { ui: { resourceUri: PARKING_CARD_URI }, "ui/resourceUri": PARKING_CARD_URI } as const;

// Runs one tool: the result as JSON text, or a message the assistant can act
// on when the question was wrong or the city's feed is down.
async function answer<T>(
  request: Request,
  cityId: CityId | undefined,
  run: (src: Sources) => T,
) {
  try {
    return asText(run(await sources(request, cityId)));
  } catch (err) {
    const text =
      err instanceof ToolInputError
        ? err.message
        : `The live parking feed for ${getCity(cityId).name} could not be read just now. Try again in a minute.`;
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

const CITY = z
  .enum(CITY_IDS)
  .optional()
  .describe("Which city. Ghent when left out; list_cities says which others exist.");

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

function buildServer(request: Request): McpServer {
  const server = new McpServer({ name: SITE_NAME, version: "1.0.0" });

  server.registerTool(
    "list_cities",
    {
      title: "Cities this server knows",
      description:
        "The cities these tools can answer for and what is known about each. Live free spaces: Ghent and Hasselt in Belgium, Strasbourg in France. Car parks with their size and place but no live count: Antwerp, Brussels, Liège and Namur. A forecast and the usual weekly pattern only for Ghent, where the site keeps history.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => asText(listCities(siteOf(request))),
  );

  server.registerTool(
    "list_garages",
    {
      title: "Parking garages, live",
      description:
        "Every public car park in a city (Ghent by default) with its live number of free spaces, a forecast for the next hour where there is one, and facts such as Park & Ride, free of charge and EV charging where the city's data has them. Car parks for which the city publishes no count are listed separately; for some cities that is all of them (see list_cities).",
      inputSchema: {
        city: CITY,
        only_with_space: z
          .boolean()
          .optional()
          .describe("Only garages that are open and have free spaces according to a current count."),
      },
      annotations: READ_ONLY,
      _meta: WITH_CARD,
    },
    (input) => answer(request, input.city, (src) => listGarages(src, input)),
  );

  server.registerTool(
    "find_parking",
    {
      title: "Best garage for a destination",
      description:
        "Where to park for a destination: one recommended garage (the nearest that is open, has room and isn't about to fill up), why the nearest was passed over if it was, other garages with space, walking time, the nearest Park & Ride, and the nearest car parks without a live count. In a city without live counts only that last list is filled, by distance. In Ghent, give a well-known place by name (Gravensteen, Korenmarkt, Vooruit, UZ Gent, Gent-Sint-Pieters…); for anything else, and for every destination in another city, give coordinates you have geocoded.",
      inputSchema: {
        city: CITY,
        destination: z.string().max(120).optional().describe("A well-known place in Ghent by name, or a label for the coordinates."),
        lat: z.number().optional().describe("Latitude of the destination (with lng)."),
        lng: z.number().optional().describe("Longitude of the destination (with lat)."),
      },
      annotations: READ_ONLY,
      _meta: WITH_CARD,
    },
    (input) => answer(request, input.city, (src) => findParking(src, input)),
  );

  server.registerTool(
    "get_garage",
    {
      title: "One car park",
      description:
        "Everything known about one car park: live free spaces, address and position, and for Ghent also the forecast for the next hour, what is usual at this hour, opening hours, operator and the city's own remarks.",
      inputSchema: {
        city: CITY,
        garage: z.string().max(120).describe('Name or id, for example "Vrijdagmarkt" or "Sint-Pietersplein".'),
      },
      annotations: READ_ONLY,
      _meta: WITH_CARD,
    },
    (input) => answer(request, input.city, (src) => getGarage(src, input)),
  );

  server.registerTool(
    "typical_availability",
    {
      title: "How full the garages usually are",
      description:
        "For planning ahead: how many spaces are usually free in each garage at a given hour of the week (for example Saturday 14:00), from this site's own measurements. Most room first. Ghent only for now.",
      inputSchema: {
        city: CITY,
        weekday: z.enum(WEEKDAYS).describe("Day of the week."),
        hour: z.number().int().min(0).max(23).describe("Hour of the day in Ghent, 0 to 23."),
        garage: z.string().max(120).optional().describe("Only this garage (name or id)."),
      },
      annotations: READ_ONLY,
    },
    (input) => answer(request, input.city, (src) => typicalAvailability(src, input)),
  );

  // The card itself: one self-contained HTML page, no network access needed.
  server.registerResource(
    "parking-card",
    PARKING_CARD_URI,
    { title: "Parking card", mimeType: MCP_APP_MIME_TYPE },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: PARKING_CARD_HTML,
          _meta: { ui: { prefersBorder: false, csp: {} } },
        },
      ],
    }),
  );

  return server;
}

export async function POST(request: Request) {
  const server = buildServer(request);
  // No session id generator = stateless; such a transport serves one request.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // Questions are a few hundred bytes; nothing legitimate is larger.
    maxRequestBodySize: 64 * 1024,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}

// There is no stream to listen on and no session to end.
function notAllowed() {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null },
    { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } },
  );
}

export const GET = notAllowed;
export const DELETE = notAllowed;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
