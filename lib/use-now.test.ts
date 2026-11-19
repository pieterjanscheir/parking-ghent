import { describe, expect, it } from "vitest";
import { advanceServerClock } from "./use-now";

const SERVER = Date.UTC(2026, 10, 19, 9, 0, 0);
const MIN = 60_000;

describe("advanceServerClock", () => {
  it("is the server time during server render and hydration", () => {
    expect(advanceServerClock(SERVER, undefined, 0)).toBe(SERVER);
  });

  it("is the server time when the data has only just arrived", () => {
    expect(advanceServerClock(SERVER, undefined, SERVER + 5 * MIN)).toBe(SERVER);
  });

  it("moves forward by the time passed on the device since the data arrived", () => {
    const seenAt = SERVER + 2_000;
    expect(advanceServerClock(SERVER, seenAt, seenAt + 12 * MIN)).toBe(SERVER + 12 * MIN);
  });

  it("is unaffected by a device clock that is an hour behind", () => {
    const seenAt = SERVER - 60 * MIN;
    // Without this, the age would stay frozen for an hour.
    expect(advanceServerClock(SERVER, seenAt, seenAt + 31 * MIN)).toBe(SERVER + 31 * MIN);
  });

  it("is unaffected by a device clock that is 31 minutes ahead", () => {
    const seenAt = SERVER + 31 * MIN;
    // Without this, fresh data would look 31 minutes old straight away.
    expect(advanceServerClock(SERVER, seenAt, seenAt)).toBe(SERVER);
    expect(advanceServerClock(SERVER, seenAt, seenAt + MIN)).toBe(SERVER + MIN);
  });

  it("never runs backwards if the clock tick is older than the arrival", () => {
    const seenAt = SERVER + 10_000;
    expect(advanceServerClock(SERVER, seenAt, seenAt - 8_000)).toBe(SERVER);
  });
});
