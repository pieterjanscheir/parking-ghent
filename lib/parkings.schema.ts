import { z } from "zod";

const LocationAndDimensionSchema = z
  .object({
    roadName: z.string().optional(),
    roadNumber: z.string().optional(),
    coordinatesForDisplay: z
      .object({
        latitude: z.number(),
        longitude: z.number(),
      })
      .partial()
      .optional(),
    contactDetailsTelephoneNumber: z.string().optional(),
    level: z.string().optional(),
    specificAccessInformation: z.array(z.string()).optional(),
  })
  .passthrough();

const RawFieldsSchema = z
  .object({
    name: z.string(),
    description: z.string().optional().default(""),
    openingtimesdescription: z.string().optional().default(""),
    urllinkaddress: z.string().optional().default(""),
    freeparking: z.number().optional().default(0),
    occupation: z.number().optional().default(0),
    availablecapacity: z.number().optional().default(0),
    totalcapacity: z.number().optional().default(0),
    temporaryclosed: z.number().optional().default(0),
    isopennow: z.number().optional().default(0),
    categorie: z.string().optional().default(""),
    type: z.string().optional().default(""),
    operatorinformation: z.string().optional().default(""),
    occupancytrend: z.string().optional().default("unknown"),
    lastupdate: z.string().optional().default(""),
    id: z.string().optional().default(""),
    location: z.array(z.number()).optional(),
    locationanddimension: z.string().optional().default(""),
    // Present only on records sourced from the mobi-parkings fallback feed
    // (the three Interparking garages). The primary feed never sets it.
    fotourl: z.string().optional().default(""),
  })
  .passthrough();

const RawRecordSchema = z.object({
  recordid: z.string(),
  fields: RawFieldsSchema,
});

export const RawResponseSchema = z.object({
  nhits: z.number(),
  records: z.array(RawRecordSchema),
});

export type Parking = {
  id: string;
  name: string;
  description: string;
  openingHours: string;
  websiteUrl: string;
  operator: string;
  type: string;
  typeLabel: string;
  category: string;
  categoryLabel: string;
  isInsideLez: boolean;
  isOpen: boolean;
  isTemporaryClosed: boolean;
  totalSpaces: number;
  freeSpaces: number;
  occupiedPercent: number;
  freePercent: number;
  bucket: "available" | "almost-full" | "full" | "closed";
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  lastUpdate: string;
  // Optional photo URL — only populated for parkings from the secondary
  // mobi-parkings feed (Kouter, Zuid, Center).
  photoUrl: string | null;
};

function parseLocation(raw: string): {
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
} {
  if (!raw) return { address: "", lat: null, lng: null, phone: null };
  try {
    const parsed = LocationAndDimensionSchema.parse(JSON.parse(raw));
    let address = (parsed.roadName ?? "").replace(/\s+/g, " ").trim();
    // Some records store unknown values as literal "?" — treat as missing.
    if (address === "?" || address === "" || /^\?+$/.test(address)) {
      address = "";
    }
    const lat = parsed.coordinatesForDisplay?.latitude ?? null;
    const lng = parsed.coordinatesForDisplay?.longitude ?? null;
    const rawPhone = (parsed.contactDetailsTelephoneNumber ?? "").trim();
    const phone =
      rawPhone && rawPhone !== "?" && !/^\?+$/.test(rawPhone) ? rawPhone : null;
    return { address, lat, lng, phone };
  } catch {
    return { address: "", lat: null, lng: null, phone: null };
  }
}

function bucketFor(
  isOpen: boolean,
  freePercent: number,
): Parking["bucket"] {
  if (!isOpen) return "closed";
  if (freePercent < 5) return "full";
  if (freePercent < 20) return "almost-full";
  return "available";
}

function typeLabel(type: string): string {
  switch (type) {
    case "carPark":
      return "Indoor garage";
    case "offStreetParkingGround":
      return "Surface lot";
    default:
      return type || "Unknown";
  }
}

function categoryLabel(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes("buiten")) return "Outside LEZ";
  if (lower.includes("lez")) return "Inside LEZ";
  return cat || "Unknown";
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableIdFromUrl(rawId: string, fallback: string): string {
  if (rawId) {
    try {
      const url = new URL(rawId);
      const last = url.pathname.split("/").filter(Boolean).pop();
      if (last) return last;
    } catch {
      /* not a URL — fall through */
    }
  }
  return slugify(fallback);
}

export function normalizeParking(record: {
  recordid: string;
  fields: z.infer<typeof RawFieldsSchema>;
}): Parking {
  const f = record.fields;
  const { address, lat, lng, phone } = parseLocation(f.locationanddimension);
  const isTemporaryClosed = f.temporaryclosed === 1;
  const isOpen = f.isopennow === 1 && !isTemporaryClosed;
  const totalSpaces = f.totalcapacity ?? 0;
  // In this dataset `availablecapacity` is the live free-spot count, and
  // `occupation` is the % occupied (= 100 − free/total × 100). The
  // `freeparking` field is unrelated to availability (likely "free of
  // charge"), so we ignore it for the count.
  const freeSpaces = Math.max(0, f.availablecapacity ?? 0);
  const freePercent =
    totalSpaces > 0 ? (freeSpaces / totalSpaces) * 100 : 0;
  // Derive occupied from free so the two always sum to 100. The API's
  // `occupation` is pre-rounded to an integer and can disagree by 1pp.
  const occupiedPercent = 100 - freePercent;
  const isInsideLez = (f.categorie ?? "").toLowerCase().includes("buiten")
    ? false
    : (f.categorie ?? "").toLowerCase().includes("lez");

  return {
    id: stableIdFromUrl(f.id ?? "", f.name),
    name: f.name,
    description: f.description ?? "",
    openingHours: f.openingtimesdescription ?? "",
    websiteUrl: f.urllinkaddress ?? "",
    operator: f.operatorinformation ?? "",
    type: f.type ?? "",
    typeLabel: typeLabel(f.type ?? ""),
    category: f.categorie ?? "",
    categoryLabel: categoryLabel(f.categorie ?? ""),
    isInsideLez,
    isOpen,
    isTemporaryClosed,
    totalSpaces,
    freeSpaces,
    occupiedPercent,
    freePercent,
    bucket: bucketFor(isOpen, freePercent),
    address,
    lat,
    lng,
    phone,
    lastUpdate: f.lastupdate ?? "",
    photoUrl: (f.fotourl ?? "").trim() || null,
  };
}
