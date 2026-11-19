import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileStore, getArchiveStore, memoryStore, type ArchiveStore } from "./archive-store";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "archive-store-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

// Both stores must behave the same: the archive relies on these rules to
// never overwrite a snapshot.
const stores: [string, () => ArchiveStore][] = [
  ["memoryStore", () => memoryStore()],
  ["fileStore", () => fileStore(directory)],
];

describe.each(stores)("%s", (_name, create) => {
  it("reports a missing file as null", async () => {
    expect(await create().read("history/v1/2026/a.jsonl")).toBeNull();
  });

  it("creates a file, folders included, and reads it back", async () => {
    const store = create();
    await store.write("history/v1/2026/a.jsonl", "one\n", null);
    expect((await store.read("history/v1/2026/a.jsonl"))?.text).toBe("one\n");
  });

  it("replaces a file when given the version that was read", async () => {
    const store = create();
    await store.write("a.jsonl", "one\n", null);
    const read = await store.read("a.jsonl");
    await store.write("a.jsonl", "one\ntwo\n", read!.version);
    expect((await store.read("a.jsonl"))?.text).toBe("one\ntwo\n");
  });

  it("refuses to create a file that already exists", async () => {
    const store = create();
    await store.write("a.jsonl", "one\n", null);
    await expect(store.write("a.jsonl", "other\n", null)).rejects.toThrow();
    expect((await store.read("a.jsonl"))?.text).toBe("one\n");
  });

  it("refuses to replace a file that changed since it was read", async () => {
    const store = create();
    await store.write("a.jsonl", "one\n", null);
    const stale = await store.read("a.jsonl");
    await store.write("a.jsonl", "one\ntwo\n", stale!.version);
    await expect(store.write("a.jsonl", "one\nthree\n", stale!.version)).rejects.toThrow();
    expect((await store.read("a.jsonl"))?.text).toBe("one\ntwo\n");
  });
});

describe("fileStore", () => {
  it("stays inside its folder", async () => {
    const store = fileStore(directory);
    await expect(store.read("../outside.jsonl")).rejects.toThrow(/Refusing/);
    await expect(store.write("../outside.jsonl", "x", null)).rejects.toThrow(/Refusing/);
  });

  it("leaves no temporary files behind", async () => {
    const store = fileStore(directory);
    await store.write("a.jsonl", "one\n", null);
    expect(await readdir(directory)).toEqual(["a.jsonl"]);
  });

  it("lets only one of several simultaneous writers win", async () => {
    // All eight read the same version, then write at the same moment.
    const store = fileStore(directory);
    await store.write("a.jsonl", "start\n", null);
    const read = await store.read("a.jsonl");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        store.write("a.jsonl", `start\nwriter ${i}\n`, read!.version),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await store.read("a.jsonl"))?.text).toMatch(/^start\nwriter \d\n$/);
    expect(await readdir(directory)).toEqual(["a.jsonl"]);
  });

  it("lets only one of several simultaneous creators win", async () => {
    const store = fileStore(directory);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => store.write("new.jsonl", `writer ${i}\n`, null)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await readdir(directory)).toEqual(["new.jsonl"]);
  });

  it("keeps working after a refused write", async () => {
    const store = fileStore(directory);
    await store.write("a.jsonl", "one\n", null);
    await expect(store.write("a.jsonl", "other\n", null)).rejects.toThrow();
    const read = await store.read("a.jsonl");
    await store.write("a.jsonl", "one\ntwo\n", read!.version);
    expect((await store.read("a.jsonl"))?.text).toBe("one\ntwo\n");
  });
});

describe("getArchiveStore", () => {
  it("is off when no storage is configured", () => {
    expect(getArchiveStore({})).toBeNull();
  });

  it("uses a folder when HISTORY_ARCHIVE_DIR is set", async () => {
    const store = getArchiveStore({ HISTORY_ARCHIVE_DIR: directory })!;
    await store.write("a.jsonl", "one\n", null);
    expect(await readdir(directory)).toEqual(["a.jsonl"]);
  });

  it("uses Vercel Blob when the project has a store connected", () => {
    expect(getArchiveStore({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_example" })).not.toBeNull();
    expect(getArchiveStore({ BLOB_STORE_ID: "store_example" })).not.toBeNull();
  });
});
