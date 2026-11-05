// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLocalStorageJson } from "./local-storage-store";

const KEY = "test.key";

function parseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

describe("useLocalStorageJson", () => {
  afterEach(() => window.localStorage.clear());

  it("returns null when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorageJson(KEY, parseNumber));
    expect(result.current.value).toBeNull();
    expect(result.current.mounted).toBe(true);
  });

  it("reads and parses an existing value", () => {
    window.localStorage.setItem(KEY, "42");
    const { result } = renderHook(() => useLocalStorageJson(KEY, parseNumber));
    expect(result.current.value).toBe(42);
  });

  it("returns null when the parser rejects the stored value", () => {
    window.localStorage.setItem(KEY, "not-a-number");
    const { result } = renderHook(() => useLocalStorageJson(KEY, parseNumber));
    expect(result.current.value).toBeNull();
  });

  it("persists writes as JSON and removes the key on null", () => {
    const { result } = renderHook(() => useLocalStorageJson(KEY, parseNumber));

    act(() => result.current.write(7));
    expect(window.localStorage.getItem(KEY)).toBe("7");
    expect(result.current.value).toBe(7);

    act(() => result.current.write(null));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(result.current.value).toBeNull();
  });

  it("keeps two hook instances on the same key in sync", () => {
    const a = renderHook(() => useLocalStorageJson(KEY, parseNumber));
    const b = renderHook(() => useLocalStorageJson(KEY, parseNumber));

    act(() => a.result.current.write(3));
    expect(b.result.current.value).toBe(3);
  });

  it("reacts to storage events from other tabs", () => {
    const { result } = renderHook(() => useLocalStorageJson(KEY, parseNumber));

    act(() => {
      window.localStorage.setItem(KEY, "99");
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.value).toBe(99);
  });

  it("returns a stable value reference across re-renders", () => {
    window.localStorage.setItem(KEY, "[1,2]");
    const parseArray = (raw: string) => JSON.parse(raw) as number[];
    const { result, rerender } = renderHook(() =>
      useLocalStorageJson(KEY, parseArray),
    );
    const first = result.current.value;
    rerender();
    expect(result.current.value).toBe(first);
  });
});
