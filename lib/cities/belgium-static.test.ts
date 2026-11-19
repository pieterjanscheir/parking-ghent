import { describe, expect, it } from "vitest";
import { parseAntwerp, parseBrussels, parseLiege, parseNamur } from "./belgium-static";

// The first records of each list are as the city's service gave them on
// 19 November 2026, trimmed to the fields that are read plus a few that are
// not. The odd ones after them (planned, without a place, a second car park
// with the same name) are made up for the test.

describe("Antwerp", () => {
  const carParks = {
    features: [
      {
        attributes: { OBJECTID: 1, NAAM: "Parking Arenberg", STRAATNAAM: "Oudevaartplaats", HUISNUMMER: "2 - 4", EXPLOITANT: "Interparking", PLAATSEN: 387, TYPE: "Parkeergarage", ELEKTRISCHE_PLAATSEN: "13", GEBRUIK: "bestaand", LINK: "https://www.interparking.be/nl/parkeren/antwerpen/arenberg/", Prijs_uur: "€ 3,10" },
        geometry: { x: 4.408969027949773, y: 51.21511784104381 },
      },
      {
        attributes: { OBJECTID: 4, NAAM: "Parking Zuiderterras ", STRAATNAAM: "Ernest Van Dijckkaai", HUISNUMMER: null, PLAATSEN: 184, TYPE: "Parkeerterrein", ELEKTRISCHE_PLAATSEN: "0", GEBRUIK: "bestaand", LINK: "https://www.slimnaarantwerpen.be/nl/auto-taxi/publieke-parkings/parking-zuiderterras " },
        geometry: { x: 4.394926545888654, y: 51.2190 },
      },
      {
        attributes: { OBJECTID: 9, NAAM: "Parking in aanbouw", PLAATSEN: 500, GEBRUIK: "gepland", LINK: null },
        geometry: { x: 4.4, y: 51.2 },
      },
      { attributes: { NAAM: "Zonder plaats" } },
    ],
  };
  const parkAndRide = {
    features: [
      {
        attributes: { OBJECTID: 1, Naam: "P&R Schoonselhof", Plaatsen: 116, GEBRUIK: "bestaand", LINK: null, PRIJS: "Gratis", AANTAL_EL_LAADPALEN: null, STRAAT: "Dokter Kochlaan", HUISNR: "25" },
        geometry: { x: 4.3652306576145765, y: 51.16945751517619 },
      },
      {
        attributes: { OBJECTID: 7, Naam: "P&R Olympiade", Plaatsen: 188, GEBRUIK: "bestaand", LINK: null, PRIJS: "Gratis <12uur, € 1,00 / 24uur", AANTAL_EL_LAADPALEN: 18, STRAAT: "Jan Van Rijswijcklaan", HUISNR: "281" },
        geometry: { x: 4.39178601, y: 51.1835004 },
      },
    ],
  };

  it("lists the car parks in use, with Park & Ride marked", () => {
    const entries = parseAntwerp(carParks, parkAndRide);
    expect(entries.map((e) => e.name)).toEqual([
      "P&R Olympiade",
      "P&R Schoonselhof",
      "Parking Arenberg",
      "Parking Zuiderterras",
    ]);
    expect(entries[2]).toEqual({
      id: "parking-arenberg",
      name: "Parking Arenberg",
      lat: 51.21511784104381,
      lng: 4.408969027949773,
      parkAndRide: false,
      capacity: 387,
      address: "Oudevaartplaats 2 - 4",
      url: "https://www.interparking.be/nl/parkeren/antwerpen/arenberg/",
      note: null,
      isFree: null,
      evChargers: 13,
      evMaxKw: null,
    });
    // A link with a stray space, and a street without a number.
    expect(entries[3]).toMatchObject({
      address: "Ernest Van Dijckkaai",
      url: "https://www.slimnaarantwerpen.be/nl/auto-taxi/publieke-parkings/parking-zuiderterras",
      evChargers: 0,
    });
  });

  it("calls a Park & Ride free only when the price says exactly that", () => {
    const entries = parseAntwerp(carParks, parkAndRide);
    expect(entries[1]).toMatchObject({ name: "P&R Schoonselhof", parkAndRide: true, isFree: true, capacity: 116 });
    expect(entries[0]).toMatchObject({ name: "P&R Olympiade", isFree: false, evChargers: 18 });
  });
});

describe("Brussels", () => {
  const carParks = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "MultiPoint", coordinates: [[4.3522, 50.8631]] },
        properties: { id: 23, name_fr: "UP SITE", name_du: "UP SITE", addr_fr: "Quai de Willebroek 35", addr_du: "Willebroekkaai 35", type: "parking public", operator: "Indigo", capacity_car: 142, url: "https://be.parkindigo.com/fr/car-park/parking-up-site" },
      },
      {
        type: "Feature",
        geometry: { type: "MultiPoint", coordinates: [[4.3297, 50.8639]] },
        properties: { id: 14, name_fr: "SIMONIS", name_du: "SIMONIS", addr_fr: "Place Eugène Simonis 24", type: "parking régional", capacity_car: 116, url: "https://be.parkindigo.com/fr/car-park/parking-simonis" },
      },
      { type: "Feature", geometry: null, properties: { name_fr: "Sans géométrie" } },
    ],
  };
  const parkAndRide = {
    features: [
      {
        type: "Feature",
        geometry: { type: "MultiPoint", coordinates: [[4.3356, 50.8972]] },
        properties: { id: 9, name_fr: "Heysel", name_du: "Heizel", street_fr: "Avenue Impératrice Charlotte", housenr: null, capacity_car: 100, url: "https://parking.brussels/fr/pr-heysel", lez: 0 },
      },
    ],
  };

  it("lists public car parks and the region's Park & Ride sites", () => {
    const entries = parseBrussels(carParks, parkAndRide);
    expect(entries.map((e) => [e.id, e.name, e.parkAndRide, e.capacity])).toEqual([
      ["p-r-heysel", "P+R Heysel", true, 100],
      ["simonis", "SIMONIS", false, 116],
      ["up-site", "UP SITE", false, 142],
    ]);
    expect(entries[2]).toMatchObject({
      lat: 50.8631,
      lng: 4.3522,
      address: "Quai de Willebroek 35",
      url: "https://be.parkindigo.com/fr/car-park/parking-up-site",
      isFree: null,
    });
    expect(entries[0].address).toBe("Avenue Impératrice Charlotte");
  });
});

describe("Liège", () => {
  const carParks = [
    { gid: 1296, title: "Parking Guillemins P3", street_name: "Rue du Plan Incliné", house_number: "4", schedule: "24h/24 - 7j/7", available_spaces: 700, provider: "SNCB", website: "https://www.belgiantrain.be/fr/station-information/car-or-bike-at-station/b-parking/my-b-parking/liege-guillemins", charging_stations: 0, last_modified: "2024-07-29", geo_point_2d: { lon: 5.5643437302, lat: 50.6276065432 } },
    { gid: 2, title: "Parking Opéra", street_name: "Place de la République française", house_number: null, available_spaces: 245, website: null, charging_stations: 4, geo_point_2d: { lon: 5.5702, lat: 50.6437 } },
    { title: "Sans coordonnées", available_spaces: 10 },
  ];
  const parkAndRide = [
    { geo_point_2d: { lon: 5.5659116057, lat: 50.6241221083 }, note: "Gare des Guillemins sur 3 sites", available_spaces: 1350, name: "P+R Guillemins", status: "Existant", street_name: "Rue Mandeville", house_number: "8" },
    { geo_point_2d: { lon: 5.5988309848, lat: 50.6184623576 }, available_spaces: null, name: "P+R Cuivre & Zinc", status: "En projet", street_name: "Rue du Fourneau" },
  ];

  it("lists car parks and the Park & Ride sites that exist, not the planned ones", () => {
    const entries = parseLiege(carParks, parkAndRide);
    expect(entries.map((e) => e.name)).toEqual(["P+R Guillemins", "Parking Guillemins P3", "Parking Opéra"]);
    expect(entries[0]).toMatchObject({ parkAndRide: true, capacity: 1350, address: "Rue Mandeville 8", url: null });
    expect(entries[1]).toMatchObject({
      id: "parking-guillemins-p3",
      // "available_spaces" is the capacity, not a live count.
      capacity: 700,
      address: "Rue du Plan Incliné 4",
      lat: 50.6276065432,
      lng: 5.5643437302,
      evChargers: 0,
    });
    expect(entries[2]).toMatchObject({ evChargers: 4, url: null });
  });
});

describe("Namur", () => {
  const carParks = [
    { plsy_descri: "Parking  Namur Expo", places: 475, plsy_fonction: "Parking", ouverture: "7j/7 - 24h/24", rue_nom: "Avenue Sergent Vrithoff", adr_nopol: "11", identifiant: "7", geo_point_2d: { lon: 4.8479463013, lat: 50.4661241137 } },
    { plsy_descri: "Parking Relais - P+R Bouge", places: 716, plsy_fonction: "Parking Relais", rue_nom: "Rue Hébar", adr_nopol: null, identifiant: "14", geo_point_2d: { lon: 4.8943396054, lat: 50.4868023454 } },
    { plsy_descri: "Parking  Namur Expo", places: "30", plsy_fonction: "Parking Malin", geo_point_2d: { lon: 4.85, lat: 50.46 } },
  ];

  it("lists the car parks, with the Park & Ride sites marked", () => {
    const entries = parseNamur(carParks);
    expect(entries.map((e) => [e.id, e.name, e.parkAndRide, e.capacity])).toEqual([
      // Two car parks with one name get different ids.
      ["parking-namur-expo", "Parking Namur Expo", false, 475],
      ["parking-namur-expo-2", "Parking Namur Expo", false, 30],
      ["parking-relais-p-r-bouge", "Parking Relais - P+R Bouge", true, 716],
    ]);
    expect(entries[0].address).toBe("Avenue Sergent Vrithoff 11");
    expect(entries[2].address).toBe("Rue Hébar");
  });

  it("reads nothing from an empty or unreadable list", () => {
    expect(parseNamur([])).toEqual([]);
    expect(parseNamur([{ nom: "Autre format" }, 42])).toEqual([]);
  });
});
