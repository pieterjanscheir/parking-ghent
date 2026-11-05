import { describe, expect, it } from "vitest";
import { getHistoryDataset, parkingsWithHistory } from "./parking-history";

describe("getHistoryDataset / parkingsWithHistory", () => {
  it("returns null for unknown ids", () => {
    expect(getHistoryDataset("not-a-parking")).toBeNull();
  });

  it("returns a dataset slug for known ids", () => {
    expect(getHistoryDataset("parking-tolhuis")).toBe(
      "recente-bezetting-parking-tolhuis-gent",
    );
  });

  it("lists every id that has a dataset mapping", () => {
    const ids = parkingsWithHistory();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getHistoryDataset(id)).not.toBeNull();
    }
  });
});

describe("history dataset ids", () => {
  it("keys datasets by the id the live feed actually uses", () => {
    // The live feed's id for Savaan ends in /parking-savaan (not
    // -savaanstraat, which is only the dataset slug). A mismatch here
    // silently drops the parking's history and forecast.
    expect(getHistoryDataset("parking-savaan")).toBe(
      "recente-bezetting-parking-savaanstraat-gent",
    );
  });
});
