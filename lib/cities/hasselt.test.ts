import { describe, expect, it } from "vitest";
import { parseSites, parseStatus, toHasselt, usableSites } from "./hasselt";

// The structure and the counts are as the city's files gave them on
// 19 November 2026, trimmed to the elements that matter. Alverberg and
// Luikerpoort are real throughout; the addresses and positions of the other
// two, and the "closed" on Luikerpoort, are made up for the test. Every car
// park has two records: counts, and whether it is open.
const record = (id: string, body: string) => `
        <parkingRecordStatus xsi:type="ParkingSiteStatus">
          <parkingRecordReference id="${id}" version="1" targetClass="ParkingRecord" />
          <parkingStatusOriginTime>2026-11-19T23:55:02.5279503+01:00</parkingStatusOriginTime>${body}
        </parkingRecordStatus>`;

const counts = (free: number, vehicles: number, status: string) => `
          <parkingOccupancy>
            <parkingNumberOfVacantSpaces>${free}</parkingNumberOfVacantSpaces>
            <parkingNumberOfVehicles>${vehicles}</parkingNumberOfVehicles>
            <parkingOccupancyTrend>stable</parkingOccupancyTrend>
          </parkingOccupancy>
          <parkingAccessStatus>
            <accessReference id="P2OYBiWollqet_-irzzY8tpLm-4InG9E6NqsCHqUyh01" targetClass="ParkingAccess" />
            <accessOpeningStatus>open</accessOpeningStatus>
          </parkingAccessStatus>
          <parkingSiteStatus>${status}</parkingSiteStatus>`;

const opening = (value: string) => `
          <parkingSiteOpeningStatus>${value}</parkingSiteOpeningStatus>`;

const ALVERBERG = "RDiG9eQ0erSNseiLp4kz0ut-MEVB71PCwy9nWyksX3o1";
const DUSARTPLEIN = "aVhJktnjDy44AhDGYdSx_hFqNVlPDA-VBHbuvQNs1ZY1";
const LUIKERPOORT = "KROWk3OmoLQSDuj8tk43zxuRZrODOBziqKZj5mg29U81";
const NO_SITE = "KROWk3OmoLQSDuj8tk43z-not-on-the-website";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<d2LogicalModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" modelBaseVersion="2" xmlns="http://datex2.eu/schema/2/2_0">
  <payloadPublication xsi:type="GenericPublication" lang="nl">
    <publicationTime>2026-11-19T23:55:02.5279144+01:00</publicationTime>
    <genericPublicationExtension>
      <parkingStatusPublication>
        <parkingTableReference id="b8af6da3-f99a-4f1a-924b-a1038b9d6dd5" version="1" targetClass="ParkingTable" />${record(ALVERBERG, counts(202, 71, "spacesAvailable"))}${record(ALVERBERG, opening("open"))}${record(DUSARTPLEIN, counts(0, 194, "full"))}${record(DUSARTPLEIN, opening("open"))}${record(LUIKERPOORT, counts(242, 8, "spacesAvailable"))}${record(LUIKERPOORT, opening("closed"))}${record(NO_SITE, counts(0, 1, "full"))}${record(NO_SITE, opening("closed"))}
      </parkingStatusPublication>
    </genericPublicationExtension>
  </payloadPublication>
</d2LogicalModel>`;

const site = (title: string, id: string, lat: number, lng: number, street: string, alias: string) => ({
  type: "node--contact",
  id: "b099c7e2-9595-4056-9bda-91204b8ef956",
  attributes: {
    title,
    path: { alias, pid: 1590, langcode: "nl" },
    field_address: { country_code: "BE", locality: "Hasselt", postal_code: "3500", address_line1: street },
    field_coordinates: { lat, lng, data: [], value: `${lat}, ${lng}` },
    field_parking_id: id,
  },
});

const SITES = {
  jsonapi: { version: "1.0" },
  data: [
    site("Parking Alverberg (gratis)", ALVERBERG, 50.9382, 5.31953, "Alverbergstraat", "/parking-alverberg-gratis"),
    site("Parking P Dusartplein (bovengronds)", DUSARTPLEIN, 50.93296, 5.33301, "Kolonel Dusartplein", "/parking-p-dusartplein"),
    site("P^ Luikerpoort (ondergrondse parking)", LUIKERPOORT, 50.92677, 5.33771, "inrit via Welvaartstraat", "/p-luikerpoort-ondergrondse-parking"),
    site("Parking P+R Kapermolen Hawaii (mobilhomes)", "an-id-the-file-does-not-have", 50.9352, 5.3472, "Elfde-Liniestraat", "/parking-pr-kapermolen"),
    { type: "node--contact", attributes: { title: "No parking id" } },
  ],
};

describe("Hasselt", () => {
  it("merges the two records of a car park and reads its time", () => {
    const statuses = parseStatus(XML);
    expect(statuses).toHaveLength(4);
    expect(statuses[0]).toEqual({
      id: ALVERBERG,
      free: 202,
      vehicles: 71,
      opening: "open",
      // 23:55:02 in Belgium, winter time.
      updatedAt: Date.UTC(2026, 10, 19, 22, 55, 2, 527),
    });
    expect(statuses[2].opening).toBe("closed");
  });

  it("reads nothing from something that isn't the file", () => {
    expect(parseStatus("<html><body>Pagina niet gevonden</body></html>")).toEqual([]);
    expect(parseStatus("")).toEqual([]);
  });

  it("tidies the website's names and skips rows it cannot read", () => {
    const sites = parseSites(SITES);
    expect(sites.map((s) => s.name)).toEqual([
      "Parking Alverberg (gratis)",
      "Parking P Dusartplein (bovengronds)",
      "Parking Luikerpoort (ondergrondse parking)",
      "Parking P+R Kapermolen Hawaii (mobilhomes)",
    ]);
    expect(sites[0]).toMatchObject({
      id: ALVERBERG,
      address: "Alverbergstraat",
      lat: 50.9382,
      lng: 5.31953,
      url: "https://www.hasselt.be/nl/parking-alverberg-gratis",
      parkAndRide: false,
    });
    // "P+R" in the name, but for motorhomes.
    expect(sites[3].parkAndRide).toBe(false);
    expect(parseSites({ data: [site("Parking P+R carpool Hasselt-Zuid (gratis)", "x", 50.9, 5.33, "Biezenstraat", "/pr")] })[0].parkAndRide).toBe(true);
  });

  it("refuses a list of car parks with nothing usable in it", () => {
    expect(usableSites(SITES)).toHaveLength(4);
    expect(() => usableSites({ data: [] })).toThrow(/empty/);
    expect(() => usableSites({ data: [{ attributes: { title: "No id" } }] })).toThrow(/empty/);
  });

  it("turns a car park with a count into the shape Ghent's garages have", () => {
    const { parkings } = toHasselt(parseStatus(XML), parseSites(SITES));
    expect(parkings.map((p) => p.name)).toEqual([
      "Parking Alverberg (gratis)",
      "Parking Luikerpoort (ondergrondse parking)",
      "Parking P Dusartplein (bovengronds)",
    ]);
    const alverberg = parkings[0];
    expect(alverberg).toMatchObject({
      id: "parking-alverberg-gratis",
      // The file has no capacity: free spaces plus vehicles.
      totalSpaces: 273,
      freeSpaces: 202,
      hasLiveData: true,
      isOpen: true,
      bucket: "available",
      lat: 50.9382,
      lng: 5.31953,
      websiteUrl: "https://www.hasselt.be/nl/parking-alverberg-gratis",
      lastUpdatedAt: Date.UTC(2026, 10, 19, 22, 55, 2, 527),
    });
    expect(alverberg.freePercent + alverberg.occupiedPercent).toBe(100);
  });

  it("marks a full car park full and a closed one closed", () => {
    const { parkings } = toHasselt(parseStatus(XML), parseSites(SITES));
    const byName = Object.fromEntries(parkings.map((p) => [p.name, p]));
    expect(byName["Parking P Dusartplein (bovengronds)"]).toMatchObject({
      freeSpaces: 0,
      totalSpaces: 194,
      bucket: "full",
      isOpen: true,
    });
    expect(byName["Parking Luikerpoort (ondergrondse parking)"]).toMatchObject({
      isOpen: false,
      bucket: "closed",
    });
  });

  it("lists a car park the file has no record for without a count, and drops records without a car park", () => {
    const { parkings, extras } = toHasselt(parseStatus(XML), parseSites(SITES));
    expect(extras).toHaveLength(1);
    expect(extras[0]).toMatchObject({
      name: "Parking P+R Kapermolen Hawaii (mobilhomes)",
      parkAndRide: false,
      capacity: null,
      lat: 50.9352,
      url: "https://www.hasselt.be/nl/parking-pr-kapermolen",
    });
    expect(parkings).toHaveLength(3);
  });

  it("has no count for a car park whose record gives none", () => {
    const xml = XML.replace(/<parkingOccupancy>[\s\S]*?<\/parkingOccupancy>/, "");
    const { parkings } = toHasselt(parseStatus(xml), parseSites(SITES));
    expect(parkings.find((p) => p.name.includes("Alverberg"))).toMatchObject({
      hasLiveData: false,
      freeSpaces: 0,
      bucket: "closed",
    });
  });
});
