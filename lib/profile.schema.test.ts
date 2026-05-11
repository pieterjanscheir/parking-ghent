import { describe, expect, it } from "vitest";
import { ProfileSchema } from "./profile.schema";

const valid = {
  firstName: "Pieter-Jan",
  lastName: "Scheir",
  licensePlate: "1-ABC-123",
  carMakeModel: "Volvo XC40",
};

describe("ProfileSchema", () => {
  it("accepts a valid profile and returns it unchanged when already trimmed", () => {
    const parsed = ProfileSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it("trims whitespace from every field", () => {
    const parsed = ProfileSchema.parse({
      firstName: "  Pieter-Jan  ",
      lastName: "\tScheir\n",
      licensePlate: " 1-ABC-123 ",
      carMakeModel: " Volvo XC40 ",
    });
    expect(parsed).toEqual(valid);
  });

  it.each([
    ["firstName"],
    ["lastName"],
    ["licensePlate"],
    ["carMakeModel"],
  ] as const)("rejects an empty %s after trimming", (field) => {
    const result = ProfileSchema.safeParse({ ...valid, [field]: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === field);
      expect(issue).toBeDefined();
    }
  });

  it("rejects a missing field", () => {
    const { firstName: _omit, ...rest } = valid;
    void _omit;
    expect(ProfileSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a license plate longer than 20 characters", () => {
    const result = ProfileSchema.safeParse({
      ...valid,
      licensePlate: "A".repeat(21),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a license plate of exactly 20 characters", () => {
    const result = ProfileSchema.safeParse({
      ...valid,
      licensePlate: "A".repeat(20),
    });
    expect(result.success).toBe(true);
  });
});
