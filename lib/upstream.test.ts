import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUpstream } from "./upstream";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...outcomes: Array<Response | Error>) {
  const mock = vi.fn(async () => {
    const next = outcomes.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("fetchUpstream", () => {
  it("returns the response on the first try when the portal answers", async () => {
    const mock = stubFetch(new Response("ok"));
    const res = await fetchUpstream("https://example.test/a");
    expect(res).toEqual({ ok: true, status: 200, statusText: "", text: "ok" });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("bypasses Next's fetch cache and sets a timeout", async () => {
    const mock = stubFetch(new Response("ok"));
    await fetchUpstream("https://example.test/a");
    const init = (mock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once after a network failure", async () => {
    const mock = stubFetch(new Error("ECONNRESET"), new Response("ok"));
    const res = await fetchUpstream("https://example.test/a");
    expect(res.text).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries when the headers arrive but the body fails halfway", async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("body stalled"));
        },
      }),
    );
    const mock = stubFetch(broken, new Response("ok"));
    const res = await fetchUpstream("https://example.test/a");
    expect(res.text).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second failure and reports the last error", async () => {
    const mock = stubFetch(new Error("first"), new Error("second"));
    await expect(fetchUpstream("https://example.test/a")).rejects.toThrow("second");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("does not retry an HTTP error status", async () => {
    const mock = stubFetch(new Response("nope", { status: 503 }));
    const res = await fetchUpstream("https://example.test/a");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(res.text).toBe("nope");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
