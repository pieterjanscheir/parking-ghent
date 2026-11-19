import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUnsaved, readStored, writeStored } from "./local-storage-store";

// A minimal stand-in for the browser's localStorage.
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function stubWindow(localStorage: unknown) {
  vi.stubGlobal("window", { localStorage });
}

beforeEach(() => {
  clearUnsaved();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stored values — storage works", () => {
  it("writes to and reads from localStorage", () => {
    const storage = fakeStorage();
    stubWindow(storage);

    writeStored("k", '"google"');

    expect(storage.data.get("k")).toBe('"google"');
    expect(readStored("k")).toBe('"google"');
  });

  it("removes the key when given null", () => {
    const storage = fakeStorage();
    stubWindow(storage);
    writeStored("k", '"google"');

    writeStored("k", null);

    expect(storage.data.has("k")).toBe(false);
    expect(readStored("k")).toBeNull();
  });
});

describe("stored values — storage refuses writes (full, private mode)", () => {
  it("still returns the new value for the rest of the visit", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    stubWindow(storage);

    expect(() => writeStored("k", '"google"')).not.toThrow();
    expect(readStored("k")).toBe('"google"');
  });

  it("keeps values for different keys apart", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    stubWindow(storage);

    writeStored("map", '"google"');

    expect(readStored("favorites")).toBeNull();
  });

  it("goes back to localStorage once a write succeeds again", () => {
    const storage = fakeStorage();
    const realSetItem = storage.setItem;
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    stubWindow(storage);
    writeStored("k", '"google"');

    storage.setItem = realSetItem;
    writeStored("k", '"osm"');

    expect(storage.data.get("k")).toBe('"osm"');
    expect(readStored("k")).toBe('"osm"');
  });
});

describe("stored values — storage is blocked entirely", () => {
  // With site data blocked, merely touching window.localStorage throws.
  function stubBlockedStorage() {
    vi.stubGlobal(
      "window",
      Object.defineProperty({}, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
      }),
    );
  }

  it("reads as empty instead of crashing the page", () => {
    stubBlockedStorage();
    expect(readStored("k")).toBeNull();
  });

  it("still applies a choice for the rest of the visit", () => {
    stubBlockedStorage();

    expect(() => writeStored("k", '"google"')).not.toThrow();
    expect(readStored("k")).toBe('"google"');

    writeStored("k", null);
    expect(readStored("k")).toBeNull();
  });
});
