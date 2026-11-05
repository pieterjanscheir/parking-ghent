// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileProvider, useProfile } from "./profile";

const STORAGE_KEY = "parking.profile.v1";

const valid = {
  firstName: "Pieter-Jan",
  lastName: "Scheir",
  licensePlate: "1-ABC-123",
  carMakeModel: "Volvo XC40",
};

function renderProfile() {
  return renderHook(() => useProfile(), { wrapper: ProfileProvider });
}

describe("ProfileProvider", () => {
  afterEach(() => window.localStorage.clear());

  it("has no profile by default", () => {
    const { result } = renderProfile();
    expect(result.current.profile).toBeNull();
    expect(result.current.ready).toBe(true);
  });

  it("saves a trimmed profile and clears it again", () => {
    const { result } = renderProfile();

    act(() => result.current.save({ ...valid, firstName: "  Pieter-Jan " }));
    expect(result.current.profile).toEqual(valid);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(valid);

    act(() => result.current.clear());
    expect(result.current.profile).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("refuses to save an invalid profile", () => {
    const { result } = renderProfile();
    expect(() => result.current.save({ ...valid, lastName: "  " })).toThrow();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("loads a stored profile and ignores an invalid one", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
    expect(renderProfile().result.current.profile).toEqual(valid);

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...valid, licensePlate: "" }),
    );
    expect(renderProfile().result.current.profile).toBeNull();
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useProfile())).toThrow(
      /within ProfileProvider/,
    );
  });
});
