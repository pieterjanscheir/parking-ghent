import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { WEEKDAYS } from "@/lib/history-profile";
import { fetchProfile } from "@/lib/history-profile-store";
import {
  ToolInputError,
  findParking,
  getGarage,
  listGarages,
  typicalAvailability,
  type Sources,
} from "@/lib/mcp-tools";
import { fetchAllTrends } from "@/lib/parking-history";
import { fetchAllParkings } from "@/lib/parkings";
import { SITE_NAME } from "@/lib/site";

// An MCP server (Model Context Protocol, "Streamable HTTP"): lets an AI
// assistant ask this site where to park in Ghent. Add <site>/api/mcp as a
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

async function sources(request: Request): Promise<Sources> {
  // The live list is needed; the forecast and the weekly pattern are extras
  // an answer can do without.
  const [{ parkings, extras }, trends, profile] = await Promise.all([
    fetchAllParkings(),
    fetchAllTrends().catch(() => ({})),
    fetchProfile().catch(() => null),
  ]);
  return { parkings, extras, trends, profile, now: Date.now(), siteUrl: new URL(request.url).origin };
}

// Runs one tool: the result as JSON text, or a message the assistant can act
// on when the question was wrong or the city's feed is down.
async function answer<T>(request: Request, run: (src: Sources) => T) {
  try {
    const result = run(await sources(request));
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 1) }] };
  } catch (err) {
    const text =
      err instanceof ToolInputError
        ? err.message
        : "The City of Ghent's parking feed could not be read just now. Try again in a minute.";
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

function buildServer(request: Request): McpServer {
  const server = new McpServer({ name: SITE_NAME, version: "1.0.0" });

  server.registerTool(
    "list_garages",
    {
      title: "Parking garages in Ghent, live",
      description:
        "Every public car park in Ghent (Belgium) with its live number of free spaces, a forecast for the next hour where there is one, and facts such as Park & Ride, free of charge and EV charging. Car parks for which the city publishes no count are listed separately.",
      inputSchema: {
        only_with_space: z
          .boolean()
          .optional()
          .describe("Only garages that are open and have free spaces according to a current count."),
      },
      annotations: READ_ONLY,
    },
    (input) => answer(request, (src) => listGarages(src, input)),
  );

  server.registerTool(
    "find_parking",
    {
      title: "Best garage for a destination in Ghent",
      description:
        "Where to park for a destination in Ghent: one recommended garage (the nearest that is open, has room and isn't about to fill up), why the nearest was passed over if it was, other garages with space, walking time, and the nearest Park & Ride. Give a well-known place by name (Gravensteen, Korenmarkt, Vooruit, UZ Gent, Gent-Sint-Pieters…) or coordinates for anything else, such as a street address you have geocoded.",
      inputSchema: {
        destination: z.string().max(120).optional().describe("A well-known place in Ghent, by name."),
        lat: z.number().optional().describe("Latitude of the destination (with lng)."),
        lng: z.number().optional().describe("Longitude of the destination (with lat)."),
      },
      annotations: READ_ONLY,
    },
    (input) => answer(request, (src) => findParking(src, input)),
  );

  server.registerTool(
    "get_garage",
    {
      title: "One car park in Ghent",
      description:
        "Everything about one car park in Ghent: live free spaces, forecast for the next hour, what is usual at this hour, opening hours, address, position, operator and the city's own remarks.",
      inputSchema: {
        garage: z.string().max(120).describe('Name or id, for example "Vrijdagmarkt" or "Sint-Pietersplein".'),
      },
      annotations: READ_ONLY,
    },
    (input) => answer(request, (src) => getGarage(src, input)),
  );

  server.registerTool(
    "typical_availability",
    {
      title: "How full Ghent's garages usually are",
      description:
        "For planning ahead: how many spaces are usually free in each garage at a given hour of the week (for example Saturday 14:00), from this site's own measurements. Most room first.",
      inputSchema: {
        weekday: z.enum(WEEKDAYS).describe("Day of the week."),
        hour: z.number().int().min(0).max(23).describe("Hour of the day in Ghent, 0 to 23."),
        garage: z.string().max(120).optional().describe("Only this garage (name or id)."),
      },
      annotations: READ_ONLY,
    },
    (input) => answer(request, (src) => typicalAvailability(src, input)),
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
