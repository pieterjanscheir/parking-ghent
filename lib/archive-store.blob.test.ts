import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlobNotFoundError, get, head, put } from "@vercel/blob";
import { blobStore } from "./archive-store";
import { recordSnapshot } from "./history-archive";
import type { Parking } from "./parkings.schema";

// The real error classes, with the three calls replaced by a pretend store.
vi.mock("@vercel/blob", async (original) => ({
  ...(await original<typeof import("@vercel/blob")>()),
  head: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
}));

// A pretend Blob store. `files` is what the store holds; `delivered` decides
// what a download returns for it, which in production is not always the same.
type Held = { text: string; etag: string };
const files = new Map<string, Held>();
let delivered: (file: string, held: Held) => { text: string; etag: string };

const etagOf = (text: string) => `"${createHash("md5").update(text).digest("hex")}"`;
const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
  files.clear();
  delivered = (_file, held) => held;

  vi.mocked(head).mockImplementation(async (file) => {
    const held = files.get(file);
    if (!held) throw new BlobNotFoundError();
    return { size: bytes(held.text).byteLength, etag: held.etag } as Awaited<ReturnType<typeof head>>;
  });

  vi.mocked(get).mockImplementation(async (file) => {
    const held = files.get(file);
    if (!held) return null;
    const copy = delivered(file, held);
    return {
      statusCode: 200,
      stream: new Response(copy.text).body,
      headers: new Headers({ "content-encoding": "br" }),
      blob: { etag: copy.etag },
    } as unknown as Awaited<ReturnType<typeof get>>;
  });

  vi.mocked(put).mockImplementation(async (file, body, options) => {
    const held = files.get(file);
    const { ifMatch, allowOverwrite } = options as { ifMatch?: string; allowOverwrite?: boolean };
    if (ifMatch !== undefined ? held?.etag !== ifMatch : held && !allowOverwrite) {
      throw new Error("Vercel Blob: Precondition failed: ETag mismatch.");
    }
    const text = String(body);
    files.set(file, { text, etag: etagOf(text) });
    return { etag: etagOf(text) } as Awaited<ReturnType<typeof put>>;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const hold = (file: string, text: string) => files.set(file, { text, etag: etagOf(text) });

describe("blobStore", () => {
  it("reads a missing file as null", async () => {
    expect(await blobStore().read("history/v1/2026/2026-11-19.jsonl")).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("uses the store's own version, not the one that came with the download", async () => {
    hold("day.jsonl", "one\ntwo\n");
    // What production did: the same contents, under a version a write is
    // not checked against.
    delivered = (_file, held) => ({ text: held.text, etag: `W/${held.etag}` });

    const store = blobStore();
    const read = await store.read("day.jsonl");
    expect(read).toEqual({ text: "one\ntwo\n", version: etagOf("one\ntwo\n") });

    await store.write("day.jsonl", "one\ntwo\nthree\n", read!.version);
    expect(files.get("day.jsonl")?.text).toBe("one\ntwo\nthree\n");
  });

  it("asks again when the download is an older copy", async () => {
    hold("day.jsonl", "one\ntwo\n");
    let downloads = 0;
    delivered = (_file, held) =>
      downloads++ === 0 ? { text: "one\n", etag: etagOf("one\n") } : held;

    vi.useFakeTimers();
    const reading = blobStore().read("day.jsonl");
    await vi.runAllTimersAsync();
    expect(await reading).toEqual({ text: "one\ntwo\n", version: etagOf("one\ntwo\n") });
    expect(downloads).toBe(2);
  });

  it("refuses to hand out an older copy, and says what it saw", async () => {
    hold("day.jsonl", "one\ntwo\n");
    delivered = () => ({ text: "one\n", etag: etagOf("one\n") });

    vi.useFakeTimers();
    const reading = blobStore().read("day.jsonl");
    const failure = expect(reading).rejects.toThrow(
      /day\.jsonl: could not read the current contents: the store has 8 bytes .* the download gave 4 bytes .*content-encoding: br/,
    );
    await vi.runAllTimersAsync();
    await failure;
    expect(get).toHaveBeenCalledTimes(3);
    expect(put).not.toHaveBeenCalled();
  });

  it("creates a new file without replacing one, and replaces only the version it read", async () => {
    const store = blobStore();
    await store.write("day.jsonl", "one\n", null);
    expect(put).toHaveBeenLastCalledWith(
      "day.jsonl",
      "one\n",
      expect.objectContaining({ access: "private", allowOverwrite: false, cacheControlMaxAge: 60 }),
    );

    await expect(store.write("day.jsonl", "other\n", null)).rejects.toThrow(/Precondition failed/);
    await expect(store.write("day.jsonl", "other\n", '"not-this-one"')).rejects.toThrow(
      /Precondition failed/,
    );

    await store.write("day.jsonl", "one\ntwo\n", etagOf("one\n"));
    expect(put).toHaveBeenLastCalledWith(
      "day.jsonl",
      "one\ntwo\n",
      expect.objectContaining({ ifMatch: etagOf("one\n"), cacheControlMaxAge: 60 }),
    );
    expect(files.get("day.jsonl")?.text).toBe("one\ntwo\n");
  });
});

describe("recordSnapshot on the Blob store", () => {
  const garage = { id: "parking-reep", hasLiveData: true, freeSpaces: 120, isOpen: true } as Parking;
  const at = (minute: number) => Date.UTC(2026, 10, 19, 13, minute, 5);

  it("keeps saving after the first update of a day file", async () => {
    // In production the third run of the day, and every run after it, failed.
    delivered = (_file, held) => ({ text: held.text, etag: `W/${held.etag}` });
    const store = blobStore();

    for (const minute of [30, 40, 50, 60]) {
      expect((await recordSnapshot(store, [garage], at(minute))).status).toBe("saved");
    }
    const day = files.get("history/v1/2026/2026-11-19.jsonl")!.text;
    expect(day.trimEnd().split("\n")).toHaveLength(4);
  });
});
