import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

describe("isAuthorizedCron", () => {
  it("accepts the header Vercel sends", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong, partial or malformed secret", () => {
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCron("bearer s3cret", "s3cret")).toBe(false);
  });

  it("rejects a request without the header", () => {
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("", "s3cret")).toBe(false);
  });

  it("lets nobody in when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });
});
