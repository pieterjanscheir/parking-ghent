import type { DirectoryEntry } from "../directory";
import type { Trend } from "../forecast";
import type { Profile } from "../history-profile";
import { fetchProfile } from "../history-profile-store";
import { fetchAllTrends } from "../parking-history";
import { fetchAllParkings } from "../parkings";
import type { Parking } from "../parkings.schema";
import {
  fetchAntwerpCarParks,
  fetchBrusselsCarParks,
  fetchLiegeCarParks,
  fetchNamurCarParks,
} from "./belgium-static";
import { fetchHasselt } from "./hasselt";
import { CITY_INFO, type CityId, type CityInfo } from "./info";
import { fetchStrasbourgParkings } from "./strasbourg";

// A city the site can answer for: its facts (lib/cities/info.ts) plus the
// functions that fetch its data. The three loaders are all a city has to
// provide; the optional ones return "nothing" where the city has none.
export type City = CityInfo & {
  // The live list, and the car parks the city lists without a count.
  live: () => Promise<{ parkings: Parking[]; extras: DirectoryEntry[] }>;
  // Short-term forecasts by car park id.
  trends: () => Promise<Record<string, Trend>>;
  // What is usual per hour of the week.
  profile: () => Promise<Profile | null>;
};

// No history is kept for the cities below, so no forecast and no pattern.
const noHistory = { trends: async () => ({}), profile: async () => null };

// A city that only lists its car parks: nothing with a live count.
const listOnly = (id: CityId, load: () => Promise<DirectoryEntry[]>): City => ({
  ...CITY_INFO[id],
  live: async () => ({ parkings: [], extras: await load() }),
  ...noHistory,
});

const CITIES: Record<CityId, City> = {
  ghent: {
    ...CITY_INFO.ghent,
    live: fetchAllParkings,
    trends: fetchAllTrends,
    profile: fetchProfile,
  },
  hasselt: { ...CITY_INFO.hasselt, live: fetchHasselt, ...noHistory },
  antwerp: listOnly("antwerp", fetchAntwerpCarParks),
  brussels: listOnly("brussels", fetchBrusselsCarParks),
  liege: listOnly("liege", fetchLiegeCarParks),
  namur: listOnly("namur", fetchNamurCarParks),
  strasbourg: {
    ...CITY_INFO.strasbourg,
    live: async () => ({ parkings: await fetchStrasbourgParkings(), extras: [] }),
    ...noHistory,
  },
};

export const DEFAULT_CITY: CityId = "ghent";

export function getCity(id: CityId | undefined): City {
  return CITIES[id ?? DEFAULT_CITY];
}
