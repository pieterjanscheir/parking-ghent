import type { LatLng } from "./geo";

// Somewhere a visitor is heading: a well-known place from the list below, or
// a result from the OpenStreetMap search (lib/geocode.ts).
export type Place = LatLng & {
  id: string;
  name: string;
  // A second line that tells similar results apart ("Sint-Pietersnieuwstraat
  // 23, Kunstenkwartier"). Empty for the well-known places.
  detail: string;
};

type KnownPlace = LatLng & {
  id: string;
  name: string;
  // Other things people type for this place: older names and the English,
  // French, German and Spanish ones. Matched like the name, never shown.
  aliases: string[];
};

// Well-known Ghent destinations, so the most common searches work instantly,
// offline and without sending anything to a search service. The first few
// are offered before the visitor has typed anything.
//
// Coordinates © OpenStreetMap contributors (looked up November 2026).
const KNOWN_PLACES: KnownPlace[] = [
  { id: "gravensteen", name: "Gravensteen", lat: 51.05718, lng: 3.72077, aliases: ["castle of the counts", "château des comtes", "burcht", "kasteel", "castle", "grafenburg", "burg", "castillo de los condes", "castillo"] },
  { id: "korenmarkt", name: "Korenmarkt", lat: 51.05466, lng: 3.72192, aliases: [] },
  { id: "vooruit", name: "VIERNULVIER (Vooruit)", lat: 51.04758, lng: 3.72795, aliases: ["vooruit", "kunstencentrum"] },
  { id: "gent-sint-pieters", name: "Station Gent-Sint-Pieters", lat: 51.03493, lng: 3.71028, aliases: ["sint-pietersstation", "treinstation", "train station", "gare", "bahnhof", "estación"] },
  { id: "sint-baafskathedraal", name: "Sint-Baafskathedraal", lat: 51.05298, lng: 3.72716, aliases: ["st bavo", "saint bavo", "saint-bavon", "kathedraal", "cathedral", "cathédrale", "lam gods", "mystic lamb", "agneau mystique", "kathedrale", "genter altar", "catedral", "cordero místico"] },
  { id: "uz-gent", name: "UZ Gent", lat: 51.02354, lng: 3.72663, aliases: ["universitair ziekenhuis", "ziekenhuis", "hospital", "hôpital", "krankenhaus"] },
  { id: "vrijdagmarkt", name: "Vrijdagmarkt", lat: 51.05738, lng: 3.72570, aliases: ["friday market", "marché du vendredi", "freitagsmarkt", "mercado del viernes"] },
  { id: "belfort", name: "Belfort", lat: 51.05363, lng: 3.72468, aliases: ["belfry", "beffroi", "belfried", "campanario"] },
  { id: "graslei", name: "Graslei", lat: 51.05481, lng: 3.72077, aliases: ["korenlei"] },
  { id: "stadhuis", name: "Stadhuis", lat: 51.05453, lng: 3.72527, aliases: ["city hall", "town hall", "hôtel de ville", "rathaus", "ayuntamiento"] },
  { id: "stadshal", name: "Stadshal", lat: 51.05401, lng: 3.72438, aliases: ["city pavilion"] },
  { id: "veldstraat", name: "Veldstraat", lat: 51.05177, lng: 3.72155, aliases: ["winkelstraat", "shopping"] },
  { id: "kouter", name: "Kouter", lat: 51.05024, lng: 3.72383, aliases: ["bloemenmarkt", "flower market", "blumenmarkt", "mercado de flores"] },
  { id: "de-krook", name: "De Krook", lat: 51.04909, lng: 3.72884, aliases: ["krook", "bibliotheek", "library", "bibliothèque", "bibliothek", "biblioteca"] },
  { id: "opera", name: "Opera Gent", lat: 51.04953, lng: 3.72191, aliases: ["opera vlaanderen", "opéra", "oper", "ópera"] },
  { id: "ntgent", name: "NTGent Schouwburg", lat: 51.05386, lng: 3.72604, aliases: ["schouwburg", "theater", "theatre", "théâtre", "teatro"] },
  { id: "capitole", name: "Capitole Gent", lat: 51.04811, lng: 3.73214, aliases: [] },
  { id: "handelsbeurs", name: "Handelsbeurs", lat: 51.04972, lng: 3.72319, aliases: ["concertzaal"] },
  { id: "kinepolis", name: "Kinepolis Gent", lat: 51.04081, lng: 3.73075, aliases: ["cinema", "bioscoop", "cinéma", "kino", "cine"] },
  { id: "smak", name: "S.M.A.K.", lat: 51.03826, lng: 3.72278, aliases: ["smak", "museum voor actuele kunst", "contemporary art"] },
  { id: "msk", name: "MSK (Museum voor Schone Kunsten)", lat: 51.03798, lng: 3.72424, aliases: ["fine arts", "beaux-arts"] },
  { id: "stam", name: "STAM", lat: 51.04397, lng: 3.71737, aliases: ["stadsmuseum", "city museum"] },
  { id: "design-museum", name: "Design Museum Gent", lat: 51.05574, lng: 3.71976, aliases: [] },
  { id: "icc", name: "ICC Gent", lat: 51.03711, lng: 3.72101, aliases: ["congres", "convention", "citadelpark"] },
  { id: "gent-dampoort", name: "Station Gent-Dampoort", lat: 51.05584, lng: 3.74047, aliases: ["dampoort", "treinstation", "train station", "gare", "bahnhof", "estación"] },
  { id: "az-sint-lucas", name: "AZ Sint-Lucas", lat: 51.06255, lng: 3.72076, aliases: ["ziekenhuis", "hospital", "hôpital", "krankenhaus"] },
  { id: "az-maria-middelares", name: "AZ Maria Middelares", lat: 51.02565, lng: 3.70141, aliases: ["ziekenhuis", "hospital", "hôpital", "krankenhaus"] },
  { id: "planet-group-arena", name: "Planet Group Arena (KAA Gent)", lat: 51.01608, lng: 3.73253, aliases: ["ghelamco arena", "stadion", "stadium", "stade", "voetbal", "buffalo", "estadio", "fußball", "fútbol"] },
  { id: "flanders-expo", name: "Flanders Expo", lat: 51.02682, lng: 3.69202, aliases: ["beurs"] },
  { id: "blaarmeersen", name: "Blaarmeersen", lat: 51.04555, lng: 3.68641, aliases: ["recreatiedomein", "strand", "zwembad"] },
  { id: "kuipke", name: "'t Kuipke", lat: 51.03875, lng: 3.72077, aliases: ["kuipke", "zesdaagse", "velodroom"] },
  { id: "overpoort", name: "Overpoort", lat: 51.04008, lng: 3.72556, aliases: ["overpoortstraat", "uitgaan"] },
  { id: "patershol", name: "Patershol", lat: 51.05792, lng: 3.72263, aliases: [] },
  { id: "portus-ganda", name: "Portus Ganda", lat: 51.05389, lng: 3.73432, aliases: ["jachthaven", "marina"] },
  { id: "sint-pietersplein", name: "Sint-Pietersplein", lat: 51.04257, lng: 3.72588, aliases: ["sint-pietersabdij", "kermis"] },
  { id: "dok-noord", name: "Dok Noord", lat: 51.06626, lng: 3.73273, aliases: [] },
  { id: "gent-zuid", name: "Gent Zuid (Woodrow Wilsonplein)", lat: 51.04785, lng: 3.73049, aliases: ["zuid", "woodrow wilsonplein", "shopping zuid"] },
  { id: "sint-jacobs", name: "Bij Sint-Jacobs", lat: 51.05694, lng: 3.72767, aliases: ["sint-jacobs", "gentse feesten"] },
];

// Lowercase, without accents or punctuation: "Château des Comtes" and
// "chateau  des comtes" both become "chateau des comtes".
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// How well `query` matches one name: 3 = starts with it, 2 = one of its words
// starts with it, 1 = contains it, 0 = no match.
function matchScore(name: string, query: string): number {
  if (name.startsWith(query)) return 3;
  if (name.includes(` ${query}`)) return 2;
  if (name.includes(query)) return 1;
  return 0;
}

function toPlace(known: KnownPlace): Place {
  return { id: known.id, name: known.name, detail: "", lat: known.lat, lng: known.lng };
}

export const POPULAR_COUNT = 6;

// Well-known places matching what the visitor has typed so far, best match
// first. An empty query returns the most popular ones.
export function searchKnownPlaces(query: string, limit = POPULAR_COUNT): Place[] {
  const q = normalizeSearch(query);
  if (!q) return KNOWN_PLACES.slice(0, limit).map(toPlace);

  return KNOWN_PLACES.map((place, index) => {
    const nameScore = matchScore(normalizeSearch(place.name), q);
    const aliasScore = Math.max(
      0,
      ...place.aliases.map((alias) => matchScore(normalizeSearch(alias), q)),
    );
    // A match on the visible name beats the same match on a hidden alias.
    const score = Math.max(nameScore * 2, aliasScore * 2 - 1);
    return { place, index, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => toPlace(entry.place));
}

export function knownPlaces(): Place[] {
  return KNOWN_PLACES.map(toPlace);
}
