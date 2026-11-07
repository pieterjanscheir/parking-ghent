// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FavoritesProvider, MAX_FAVORITES, useFavorites } from "./favorites";

const STORAGE_KEY = "parking.favorites.v1";

function renderFavorites() {
  return renderHook(() => useFavorites(), { wrapper: FavoritesProvider });
}

describe("FavoritesProvider", () => {
  afterEach(() => window.localStorage.clear());

  it("starts empty", () => {
    const { result } = renderFavorites();
    expect(result.current.ids).toEqual([]);
    expect(result.current.canAdd).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it("adds and removes a favorite", () => {
    const { result } = renderFavorites();

    act(() => {
      expect(result.current.toggle("a")).toEqual({ ok: true });
    });
    expect(result.current.ids).toEqual(["a"]);
    expect(result.current.isFavorite("a")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(["a"]);

    act(() => {
      result.current.toggle("a");
    });
    expect(result.current.ids).toEqual([]);
    expect(result.current.isFavorite("a")).toBe(false);
  });

  it(`refuses more than ${MAX_FAVORITES} favorites`, () => {
    const { result } = renderFavorites();
    for (const id of ["a", "b", "c"]) {
      act(() => {
        result.current.toggle(id);
      });
    }
    expect(result.current.canAdd).toBe(false);

    let outcome: ReturnType<typeof result.current.toggle> | undefined;
    act(() => {
      outcome = result.current.toggle("d");
    });
    expect(outcome).toEqual({ ok: false, reason: "at-capacity" });
    expect(result.current.ids).toEqual(["a", "b", "c"]);
  });

  it("still allows removing when at capacity", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b", "c"]));
    const { result } = renderFavorites();
    act(() => {
      result.current.toggle("b");
    });
    expect(result.current.ids).toEqual(["a", "c"]);
    expect(result.current.canAdd).toBe(true);
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["wrong shape", JSON.stringify({ ids: ["a"] })],
    ["too many entries", JSON.stringify(["a", "b", "c", "d"])],
  ])("ignores corrupt storage (%s)", (_label, raw) => {
    window.localStorage.setItem(STORAGE_KEY, raw);
    const { result } = renderFavorites();
    expect(result.current.ids).toEqual([]);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useFavorites())).toThrow(
      /within FavoritesProvider/,
    );
  });
});
