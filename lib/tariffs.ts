import { wallClockAt, wallClockToEpoch } from "./zoned-time";

// What parking costs in Ghent's car parks, kept by hand.
//
// Neither the live feed nor any of the city's datasets carries a rate, so
// these are copied from each operator's own page. Every entry says where it
// was read and when. A car park without an entry has an unknown price: the
// site then shows no amount and sorts it last, rather than guess. How to
// check and update the table is in the README ("Parking rates").
//
// Amounts are in euro cents, so sums stay exact.

const TIME_ZONE = "Europe/Brussels";

// Most operators price by "indivisible slices" ("per ondeelbare schijf"):
// 1 minute into a slice costs the whole slice.
export type Ladder = {
  sliceMinutes: number;
  // What a stretch costs after 1, 2, 3 … slices, as the operator's table
  // lists it. Past the end of the list, `cap` applies.
  prices?: number[];
  // Or: every slice costs the same.
  perSlice?: number;
  // The most one stretch in this band can cost: the "dagtarief" of a day
  // band, the "5 uur en volgende" of a night band.
  cap: number;
};

export type FreeTariff = {
  kind: "free";
  // Free only up to this long; beyond it the price is unknown.
  maxMinutes?: number;
  // Free only after registering the number plate in the city centre (P+R
  // The Loop).
  needsRegistration?: boolean;
};

// Rates that change at 7:00 and 19:00, and on some days of the week.
export type DayNightSchedule = {
  kind: "day-night";
  // The day band runs from `dayStartHour` to `dayEndHour`, local time; the
  // night band the rest.
  dayStartHour: number;
  dayEndHour: number;
  // The band for the day hours of each weekday, Sunday first.
  day: [string, string, string, string, string, string, string];
  // The band for the day hours of a Belgian public holiday, where it differs.
  holiday?: string;
  night: string;
};

// One rate around the clock.
export type AllDaySchedule = { kind: "all-day"; band: string };

export type PaidTariff = {
  kind: "paid";
  bands: Record<string, Ladder>;
  schedule: DayNightSchedule | AllDaySchedule;
  // The most 24 hours can cost, counted from arrival; longer stays start a
  // new 24 hours.
  dailyCap: number;
  // Leaving within this many minutes costs nothing.
  graceMinutes: number;
};

export type Tariff = FreeTariff | PaidTariff;

// Things worth saying next to the rates. Translated in messages ("tariffs").
export type TariffNote = "events" | "holidays" | "pcard" | "registration";

export type TariffEntry = {
  tariff: Tariff;
  operator: string;
  // The operator's page the rates were read from.
  sourceUrl: string;
  // When they were last read there (YYYY-MM-DD).
  checkedOn: string;
  notes: TariffNote[];
};

// --- The rates --------------------------------------------------------------

const CHECKED_ON = "2026-11-20";

// "€ 1,50, € 3, € 4,50 …" every half hour.
const halfHours = (...euros: number[]) => euros.map((euro) => Math.round(euro * 100));

// City of Ghent garages. Read from each garage's page on stad.gent and from
// the "Retributiereglement voor het parkeren in parkeergarages van de Stad
// Gent" (valid from 1 October 2026), which is where the Saturday rate comes
// from: the garage pages still show the April 2026 Saturday table, which goes
// on to €30 at 10 hours, where the newer regulation jumps to the €31 day rate
// after 9½ hours.
const CENTRE: PaidTariff = {
  kind: "paid",
  bands: {
    // "Regulier tarief": 7–19 h, Sunday to Friday.
    regular: {
      sliceMinutes: 30,
      prices: halfHours(1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12, 13.5, 15, 16.5, 18, 19.5, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30),
      cap: 3100,
    },
    // "Piektarief": 7–19 h on Saturday.
    peak: {
      sliceMinutes: 30,
      prices: halfHours(2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29),
      cap: 3100,
    },
    // "Nachttarief": 19–7 h.
    night: {
      sliceMinutes: 30,
      prices: halfHours(1, 2, 3, 4, 5, 6, 7, 8, 8.5),
      cap: 900,
    },
  },
  schedule: {
    kind: "day-night",
    dayStartHour: 7,
    dayEndHour: 19,
    day: ["regular", "regular", "regular", "regular", "regular", "regular", "peak"],
    night: "night",
  },
  dailyCap: 3100,
  // "Als je binnen de 7 minuten na het binnenrijden de parking terug
  // verlaat, wordt hiervoor geen tarief aangerekend."
  graceMinutes: 7,
};

// Savaan, Sint-Pietersplein and Tolhuis share a night rate.
const SOUTH_NIGHT: Ladder = {
  sliceMinutes: 30,
  prices: halfHours(0.9, 1.8, 2.6, 3.4, 4.2, 5, 5.5, 6, 6.5),
  cap: 700,
};

const SAVAAN: PaidTariff = {
  kind: "paid",
  bands: {
    day: {
      sliceMinutes: 30,
      prices: halfHours(1.25, 2.5, 3.75, 5, 6.25, 7.5, 8.75, 10, 11.25, 12.5, 13.75, 15, 16.25, 17.5, 18.75),
      cap: 2000,
    },
    night: SOUTH_NIGHT,
  },
  schedule: { kind: "day-night", dayStartHour: 7, dayEndHour: 19, day: Array(7).fill("day") as DayNightSchedule["day"], night: "night" },
  dailyCap: 2000,
  graceMinutes: 7,
};

const SINT_PIETERSPLEIN_TOLHUIS: PaidTariff = {
  kind: "paid",
  bands: {
    day: {
      sliceMinutes: 30,
      prices: halfHours(0.9, 1.8, 2.6, 3.4, 4.2, 5, 5.8, 6.6, 7.4, 8, 8.6, 9.2, 9.8, 10.4, 11, 11.6, 12.2),
      cap: 1280,
    },
    night: SOUTH_NIGHT,
  },
  schedule: { kind: "day-night", dayStartHour: 7, dayEndHour: 19, day: Array(7).fill("day") as DayNightSchedule["day"], night: "night" },
  dailyCap: 1280,
  graceMinutes: 7,
};

// Ledeberg and Het Getouw: Sundays and public holidays cost the night rate
// ("Nacht- en zondagtarief … ook van 7 uur tot 19 uur op zon- en
// feestdagen").
const outskirts = (day: number[], dayCap: number): PaidTariff => ({
  kind: "paid",
  bands: {
    day: { sliceMinutes: 30, prices: day.map((euro) => Math.round(euro * 100)), cap: dayCap },
    nightAndSunday: { sliceMinutes: 30, prices: halfHours(0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5), cap: 500 },
  },
  schedule: {
    kind: "day-night",
    dayStartHour: 7,
    dayEndHour: 19,
    day: ["nightAndSunday", "day", "day", "day", "day", "day", "day"],
    holiday: "nightAndSunday",
    night: "nightAndSunday",
  },
  dailyCap: dayCap,
  graceMinutes: 7,
});

const LEDEBERG = outskirts(
  [0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 6, 6.6, 7.2, 7.8, 8.4, 9],
  960,
);

const HET_GETOUW = outskirts(
  [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5],
  800,
);

// The Loop, parkings B & C and D: one table around the clock. "Het dagtarief
// wordt automatisch aangerekend vanaf 8 uur 30 minuten parkeren. Parkeer je
// langer dan 24 uur? Betaal voor de extra parkeertijd volgens de
// uurtarieven." No free minutes are mentioned.
const THE_LOOP: PaidTariff = {
  kind: "paid",
  bands: {
    allDay: {
      sliceMinutes: 30,
      prices: halfHours(1.8, 3.6, 5.4, 7.2, 9, 10.2, 11.4, 12, 12.6, 13.2, 13.8, 14.4, 15, 15.6, 16.2, 16.8, 17.4),
      cap: 1800,
    },
  },
  schedule: { kind: "all-day", band: "allDay" },
  dailyCap: 1800,
  graceMinutes: 0,
};

// Interparking lists "15 minuten € 0,70 · 1 uur € 2,80 · 24 uren" and an
// evening rate (19–7 h) with the same steps up to a 12-hour maximum. €0.70 a
// quarter is the only reading that fits both 15 minutes and 1 hour.
const interparking = (dayCap: number, eveningCap: number): PaidTariff => ({
  kind: "paid",
  bands: {
    day: { sliceMinutes: 15, perSlice: 70, cap: dayCap },
    evening: { sliceMinutes: 15, perSlice: 70, cap: eveningCap },
  },
  schedule: { kind: "day-night", dayStartHour: 7, dayEndHour: 19, day: Array(7).fill("day") as DayNightSchedule["day"], night: "evening" },
  dailyCap: dayCap,
  graceMinutes: 0,
});

const CITY_GARAGE_PAGE = "https://stad.gent/nl/mobiliteit-openbare-werken/parkeren/parkings-gent";
const PARK_AND_RIDE_PAGE = "https://stad.gent/nl/mobiliteit-openbare-werken/parkeren/park-and-ride-pr";
const MOBILITEITSBEDRIJF = "Mobiliteitsbedrijf Gent";

const city = (tariff: Tariff, page: string, notes: TariffNote[] = ["events"]): TariffEntry => ({
  tariff,
  operator: MOBILITEITSBEDRIJF,
  sourceUrl: `${CITY_GARAGE_PAGE}/${page}`,
  checkedOn: CHECKED_ON,
  notes,
});

// The city's list of Park & Ride sites marks these as "Gratis".
const freeParkAndRide: TariffEntry = {
  tariff: { kind: "free" },
  operator: MOBILITEITSBEDRIJF,
  sourceUrl: PARK_AND_RIDE_PAGE,
  checkedOn: CHECKED_ON,
  notes: [],
};

// Keyed by the ids the site uses: the live feed's for the garages it covers
// (lib/parkings.schema.ts), "p-…" and "pr-…" for the ones only the city's
// directory lists (lib/directory.ts).
export const GHENT_TARIFFS: Readonly<Record<string, TariffEntry>> = {
  "parking-ramen": city(CENTRE, "parking-ramen"),
  "parking-reep": city(CENTRE, "parking-reep"),
  "parking-sint-michiels": city(CENTRE, "parking-sint-michiels"),
  // The only city garage without the 7 free minutes.
  "parking-vrijdagmarkt": city({ ...CENTRE, graceMinutes: 0 }, "parking-vrijdagmarkt"),
  "parking-savaan": city(SAVAAN, "parking-savaan"),
  "parking-sint-pietersplein": city(SINT_PIETERSPLEIN_TOLHUIS, "parking-sint-pietersplein"),
  "parking-tolhuis": city(SINT_PIETERSPLEIN_TOLHUIS, "parking-tolhuis"),
  // The city lists no event rates for these two.
  "parking-ledeberg": city(LEDEBERG, "parking-ledeberg", ["holidays"]),
  "parking-het-getouw": city(HET_GETOUW, "parking-het-getouw", ["holidays"]),
  // The live feed's single "The Loop" is the city's parkings B and C.
  "mobiliteit-loop": city(THE_LOOP, "parkings-b-c-op-loop"),
  "parking-d-op-loop": city(THE_LOOP, "parking-d-op-loop"),
  // "Gratis na registratie van nummerplaat in centrum", for at most 72 hours.
  "pr-loopexpo": {
    tariff: { kind: "free", maxMinutes: 72 * 60, needsRegistration: true },
    operator: MOBILITEITSBEDRIJF,
    sourceUrl: `${PARK_AND_RIDE_PAGE}/pr-loop`,
    checkedOn: CHECKED_ON,
    notes: ["registration"],
  },
  "pr-gentbrugge-arsenaal": freeParkAndRide,
  "pr-gentbrugge-e17": freeParkAndRide,
  "pr-moscou": freeParkAndRide,
  "pr-mariakerke-post": freeParkAndRide,
  "pr-oostakker": freeParkAndRide,
  "pr-muide": freeParkAndRide,
  "pr-maaltebruggepark": freeParkAndRide,
  "pr-hekers": freeParkAndRide,
  "pr-watersportbaan": freeParkAndRide,
  "pr-bourgoyen": freeParkAndRide,
  // "P+R Wondelgem Neptunus" on the city's list.
  "pr-neptunus": freeParkAndRide,
  "pr-lubeck": freeParkAndRide,
  "p-kouter": {
    tariff: interparking(2800, 600),
    operator: "Interparking",
    sourceUrl: "https://www.interparking.be/nl/parkeren/gent/kouter/",
    checkedOn: CHECKED_ON,
    notes: ["events", "pcard"],
  },
  "p-center-parking": {
    tariff: interparking(2400, 600),
    operator: "Interparking",
    sourceUrl: "https://www.interparking.be/nl/parkeren/gent/center-parking/",
    checkedOn: CHECKED_ON,
    notes: ["events", "pcard"],
  },
};

export function tariffFor(id: string): TariffEntry | null {
  return GHENT_TARIFFS[id] ?? null;
}

// --- What a stay costs -------------------------------------------------------

// One uninterrupted stretch in one band.
export function ladderCost(ladder: Ladder, minutes: number): number {
  if (minutes <= 0) return 0;
  const slices = Math.ceil(minutes / ladder.sliceMinutes);
  const price =
    ladder.prices !== undefined
      ? (ladder.prices[slices - 1] ?? ladder.cap)
      : slices * (ladder.perSlice ?? 0);
  return Math.min(price, ladder.cap);
}

// Belgium's ten legal public holidays, for the garages that charge their
// Sunday rate on them.
function easterSunday(year: number): { month: number; day: number } {
  // The anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

export function isBelgianPublicHoliday(year: number, month: number, day: number): boolean {
  const fixed = ["1-1", "5-1", "7-21", "8-15", "11-1", "11-11", "12-25"];
  if (fixed.includes(`${month}-${day}`)) return true;
  const easter = easterSunday(year);
  const easterMs = Date.UTC(year, easter.month - 1, easter.day);
  const thisMs = Date.UTC(year, month - 1, day);
  const daysAfterEaster = Math.round((thisMs - easterMs) / 86_400_000);
  // Easter Monday, Ascension Day, Whit Monday.
  return daysAfterEaster === 1 || daysAfterEaster === 39 || daysAfterEaster === 50;
}

const pad = (n: number) => String(n).padStart(2, "0");

// The moment the local clock shows `hour`:00 on the given date (which may
// run past the end of the month: 32 November is 2 December).
function localMoment(year: number, month: number, day: number, hour: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const text = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:00:00`;
  return wallClockToEpoch(text, TIME_ZONE)!;
}

// The band in force at a moment, and when it ends.
function bandAt(schedule: DayNightSchedule, at: number): { band: string; until: number } {
  const clock = wallClockAt(at, TIME_ZONE);
  const { year, month, day, hour } = clock;
  if (hour >= schedule.dayStartHour && hour < schedule.dayEndHour) {
    const holiday = schedule.holiday !== undefined && isBelgianPublicHoliday(year, month, day);
    return {
      band: holiday ? schedule.holiday! : schedule.day[clock.weekday],
      until: localMoment(year, month, day, schedule.dayEndHour),
    };
  }
  // Night: until the next morning, or this morning when it is past midnight.
  const nextDay = hour >= schedule.dayEndHour ? day + 1 : day;
  return { band: schedule.night, until: localMoment(year, month, nextDay, schedule.dayStartHour) };
}

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

// The cost of one stretch of at most 24 hours: each band charged on its own
// ladder, and the whole never more than the daily maximum.
function blockCost(tariff: PaidTariff, from: number, to: number): number {
  const { schedule } = tariff;
  if (schedule.kind === "all-day") {
    return Math.min(ladderCost(tariff.bands[schedule.band], (to - from) / MINUTE), tariff.dailyCap);
  }
  let total = 0;
  let at = from;
  while (at < to) {
    const { band, until } = bandAt(schedule, at);
    const end = Math.min(until, to);
    total += ladderCost(tariff.bands[band], (end - at) / MINUTE);
    at = end;
  }
  return Math.min(total, tariff.dailyCap);
}

// What arriving at `arrival` (epoch ms) and staying `minutes` costs, in euro
// cents; null when it isn't known.
//
// Each run of hours in one band (a day from 7 to 19 h, a night from 19 to
// 7 h) is charged on that band's table, every 24 hours from arrival are
// capped at the daily maximum, and a stay past 24 hours starts counting
// again. This is how the operators describe it; their machines may round a
// stay that crosses 7:00 or 19:00 a little differently, so it is an
// estimate. Event rates (Gentse Feesten, Lichtfestival …) are not included.
export function stayCost(tariff: Tariff, arrival: number, minutes: number): number | null {
  if (!Number.isFinite(arrival) || !Number.isFinite(minutes) || minutes < 0) return null;
  if (tariff.kind === "free") {
    return tariff.maxMinutes !== undefined && minutes > tariff.maxMinutes ? null : 0;
  }
  if (minutes <= tariff.graceMinutes) return 0;
  let total = 0;
  for (let start = 0; start < minutes; start += DAY_MINUTES) {
    const end = Math.min(start + DAY_MINUTES, minutes);
    total += blockCost(tariff, arrival + start * MINUTE, arrival + end * MINUTE);
  }
  return total;
}

// The same for a car park by its id; null for one not in the table.
export function stayCostFor(id: string, arrival: number, minutes: number): number | null {
  const entry = tariffFor(id);
  return entry ? stayCost(entry.tariff, arrival, minutes) : null;
}

// Every car park's cost for one stay, for sorting and showing.
export function stayCosts(ids: string[], arrival: number, minutes: number): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const id of ids) out[id] = stayCostFor(id, arrival, minutes);
  return out;
}

// --- For showing the rates ---------------------------------------------------

// The stays the overview offers, in minutes. 2 hours unless chosen.
export const STAY_OPTIONS = [60, 120, 180, 240, 480, 1440] as const;
export const DEFAULT_STAY = 120;

// One column of the rate table on a car park's page: a band and when it
// applies.
export type RateColumn = {
  band: string;
  // "day": from dayStartHour to dayEndHour on these weekdays (0 = Sunday);
  // "night": the other hours of every day; "always": around the clock.
  period: "day" | "night" | "always";
  weekdays: number[];
  // Also on public holidays.
  holidays: boolean;
};

export function rateColumns(tariff: PaidTariff): RateColumn[] {
  const { schedule } = tariff;
  if (schedule.kind === "all-day") {
    return [{ band: schedule.band, period: "always", weekdays: [0, 1, 2, 3, 4, 5, 6], holidays: false }];
  }
  const columns: RateColumn[] = [];
  schedule.day.forEach((band, weekday) => {
    const column = columns.find((c) => c.band === band);
    if (column) column.weekdays.push(weekday);
    else columns.push({ band, period: "day", weekdays: [weekday], holidays: schedule.holiday === band });
  });
  // Monday-first, the way the operators write it.
  columns.sort((a, b) => firstWeekday(a.weekdays) - firstWeekday(b.weekdays));
  columns.push({ band: schedule.night, period: "night", weekdays: [], holidays: false });
  return columns;
}

const mondayFirst = (weekday: number) => (weekday + 6) % 7;
const firstWeekday = (weekdays: number[]) => Math.min(...weekdays.map(mondayFirst));

// Runs of consecutive weekdays, Monday first: [1,2,3,4,5,0] → [[1,5],[0,0]].
export function weekdayRuns(weekdays: number[]): [number, number][] {
  const sorted = [...weekdays].sort((a, b) => mondayFirst(a) - mondayFirst(b));
  const runs: [number, number][] = [];
  for (const weekday of sorted) {
    const last = runs[runs.length - 1];
    if (last && mondayFirst(weekday) === mondayFirst(last[1]) + 1) last[1] = weekday;
    else runs.push([weekday, weekday]);
  }
  return runs;
}

// The stays shown as rows of the rate table, in minutes.
export const RATE_ROWS = [30, 60, 120, 240, 480] as const;

// What a stay of `minutes` costs when it lies wholly in one band.
export function bandStayCost(tariff: PaidTariff, band: string, minutes: number): number {
  if (minutes <= tariff.graceMinutes) return 0;
  return Math.min(ladderCost(tariff.bands[band], minutes), tariff.dailyCap);
}

// "€ 6,00": amounts in cents as the visitor's language writes euros.
export function formatEuro(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}
