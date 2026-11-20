// Clock time in a given time zone → a moment.
//
// Some feeds give times as the clock showed them in their city, with no time
// zone, or with one that is plainly wrong (Strasbourg labels its local time
// as UTC). "2026-11-19T18:30:30" in "Europe/Paris" is 17:30:30 UTC in winter
// and 16:30:30 UTC in summer.

const partsOf = (ms: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
};

export type WallClock = {
  year: number;
  // 1–12.
  month: number;
  day: number;
  hour: number;
  minute: number;
  // 0 = Sunday … 6 = Saturday, as Date#getUTCDay.
  weekday: number;
};

// A moment → what the clocks in the zone show. The reverse of
// wallClockToEpoch.
export function wallClockAt(ms: number, timeZone: string): WallClock {
  const asUtc = new Date(partsOf(ms, timeZone));
  return {
    year: asUtc.getUTCFullYear(),
    month: asUtc.getUTCMonth() + 1,
    day: asUtc.getUTCDate(),
    hour: asUtc.getUTCHours(),
    minute: asUtc.getUTCMinutes(),
    weekday: asUtc.getUTCDay(),
  };
}

// How far the zone's clocks are ahead of UTC at a moment, in ms.
const offsetAt = (ms: number, timeZone: string) => partsOf(ms, timeZone) - ms;

// null when the text isn't a date and time. Anything after the seconds (a
// time zone, fractions) is ignored on purpose.
export function wallClockToEpoch(text: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (!Number.isFinite(asUtc)) return null;
  // The offset depends on the moment, which is what we are looking for: take
  // it at a first guess, then once more at the result (they differ only
  // around a change of summer time).
  const guess = asUtc - offsetAt(asUtc, timeZone);
  return asUtc - offsetAt(guess, timeZone);
}
