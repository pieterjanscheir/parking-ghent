import type { DirectoryEntry } from "../directory";
import type { Trend } from "../forecast";
import type { Profile } from "../history-profile";
import { fetchProfile } from "../history-profile-store";
import { fetchAllTrends } from "../parking-history";
import { fetchAllParkings } from "../parkings";
import type { Parking } from "../parkings.schema";
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

const CITIES: Record<CityId, City> = {
  ghent: {
    ...CITY_INFO.ghent,
    live: fetchAllParkings,
    trends: fetchAllTrends,
    profile: fetchProfile,
  },
  strasbourg: {
    ...CITY_INFO.strasbourg,
    live: async () => ({ parkings: await fetchStrasbourgParkings(), extras: [] }),
    trends: async () => ({}),
    profile: async () => null,
  },
};

export const DEFAULT_CITY: CityId = "ghent";

export function getCity(id: CityId | undefined): City {
  return CITIES[id ?? DEFAULT_CITY];
}
