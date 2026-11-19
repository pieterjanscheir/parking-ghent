import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "./ttl-cache";

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cached", () => {
  it("loads once and reuses the value within the TTL", async () => {
    const load = vi.fn(async () => "a");
    expect(await cached("k", { ttlMs: 1000 }, load)).toBe("a");
    vi.advanceTimersByTime(999);
    expect(await cached("k", { ttlMs: 1000 }, load)).toBe("a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never returns a value older than the TTL", async () => {
    let n = 0;
    const load = vi.fn(async () => ++n);
    expect(await cached("k", { ttlMs: 1000 }, load)).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(await cached("k", { ttlMs: 1000 }, load)).toBe(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const a = cached("k", { ttlMs: 1000 }, load);
    const b = cached("k", { ttlMs: 1000 }, load);
    // Let the deferred start of the load run.
    await Promise.resolve();
    release("x");
    expect(await Promise.all([a, b])).toEqual(["x", "x"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting on a slow load instead of starting a second one after the TTL", async () => {
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const a = cached("k", { ttlMs: 1000 }, load);
    vi.advanceTimersByTime(5000);
    const b = cached("k", { ttlMs: 1000 }, load);
    await Promise.resolve();
    release("slow");
    expect(await Promise.all([a, b])).toEqual(["slow", "slow"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps keys separate", async () => {
    expect(await cached("a", { ttlMs: 1000 }, async () => 1)).toBe(1);
    expect(await cached("b", { ttlMs: 1000 }, async () => 2)).toBe(2);
  });

  it("rejects when the load fails, and retries after errorTtlMs", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce("back");
    const opts = { ttlMs: 60_000, errorTtlMs: 5000 };

    await expect(cached("k", opts, load)).rejects.toThrow("down");
    vi.advanceTimersByTime(4999);
    await expect(cached("k", opts, load)).rejects.toThrow("down");
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(await cached("k", opts, load)).toBe("back");
  });

  it("turns a synchronous throw in the loader into a rejection", async () => {
    const load = () => {
      throw new Error("sync");
    };
    await expect(cached("k", { ttlMs: 1000 }, load)).rejects.toThrow("sync");
  });

  it("does not fall back to an old value by default", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("old")
      .mockRejectedValueOnce(new Error("down"));
    await cached("k", { ttlMs: 1000 }, load);
    vi.advanceTimersByTime(1000);
    await expect(cached("k", { ttlMs: 1000 }, load)).rejects.toThrow("down");
  });

  it("with staleIfError, serves the last good value while refreshes fail, then recovers", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("v1")
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("still down"))
      .mockResolvedValueOnce("v2");
    const opts = { ttlMs: 1000, errorTtlMs: 100, staleIfError: true };

    expect(await cached("k", opts, load)).toBe("v1");
    vi.advanceTimersByTime(1000);
    expect(await cached("k", opts, load)).toBe("v1");
    vi.advanceTimersByTime(100);
    expect(await cached("k", opts, load)).toBe("v1");
    vi.advanceTimersByTime(100);
    expect(await cached("k", opts, load)).toBe("v2");
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("with staleIfError, still rejects when there is no earlier value", async () => {
    const load = async () => {
      throw new Error("down");
    };
    await expect(
      cached("k", { ttlMs: 1000, staleIfError: true }, load),
    ).rejects.toThrow("down");
  });
});
