// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_INTERVAL_MS, useAutoRefresh } from "./use-auto-refresh";

const STORAGE_KEY = "parking.refreshIntervalMs.v1";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useAutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("ticks on the default interval", () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useAutoRefresh(onTick));
    expect(result.current.intervalMs).toBe(DEFAULT_INTERVAL_MS);

    act(() => vi.advanceTimersByTime(DEFAULT_INTERVAL_MS - 1));
    expect(onTick).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("uses and persists a chosen interval", () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useAutoRefresh(onTick));

    act(() => result.current.setInterval(30_000));
    expect(result.current.intervalMs).toBe(30_000);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("30000");

    act(() => vi.advanceTimersByTime(30_000));
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("never ticks when turned off", () => {
    window.localStorage.setItem(STORAGE_KEY, "0");
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick));

    act(() => vi.advanceTimersByTime(10 * DEFAULT_INTERVAL_MS));
    expect(onTick).not.toHaveBeenCalled();
  });

  it.each([["-5"], ["\"fast\""], ["{oops"]])(
    "falls back to the default for an invalid stored value (%s)",
    (raw) => {
      window.localStorage.setItem(STORAGE_KEY, raw);
      const { result } = renderHook(() => useAutoRefresh(vi.fn()));
      expect(result.current.intervalMs).toBe(DEFAULT_INTERVAL_MS);
    },
  );

  it("pauses while the tab is hidden and refreshes once on return", () => {
    const onTick = vi.fn();
    renderHook(() => useAutoRefresh(onTick));

    act(() => setHidden(true));
    act(() => vi.advanceTimersByTime(5 * DEFAULT_INTERVAL_MS));
    expect(onTick).not.toHaveBeenCalled();

    act(() => setHidden(false));
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it("refreshNow fires immediately and flags isRefreshing briefly", () => {
    const onTick = vi.fn();
    const { result } = renderHook(() => useAutoRefresh(onTick));

    act(() => result.current.refreshNow());
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(true);

    act(() => vi.advanceTimersByTime(400));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("always calls the latest onTick callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useAutoRefresh(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    act(() => result.current.refreshNow());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
