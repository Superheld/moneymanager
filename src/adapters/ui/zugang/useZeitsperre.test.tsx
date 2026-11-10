/** @vitest-environment jsdom */
// Die Zeitsperre — vor allem der Fall, den ein Countdown nicht kann: der Rechner schlief.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useZeitsperre } from "./useZeitsperre";

const MINUTE = 60_000;

describe("useZeitsperre", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sperrt nach Ablauf der Frist", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(15, sperren));

    vi.advanceTimersByTime(15 * MINUTE - 1);
    expect(sperren).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sperren).toHaveBeenCalledTimes(1);
  });

  it("ist bei 0 abgeschaltet", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(0, sperren));
    vi.advanceTimersByTime(24 * 60 * MINUTE);
    expect(sperren).not.toHaveBeenCalled();
  });

  it("stellt die Frist bei Bedienung neu", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(15, sperren));

    vi.advanceTimersByTime(14 * MINUTE);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(14 * MINUTE);
    expect(sperren).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE);
    expect(sperren).toHaveBeenCalledTimes(1);
  });

  // Der Fall, um dessentwillen die Frist eine Uhrzeit ist. Im Schlaf vergeht die Uhr,
  // der Timer aber nicht — nachgestellt, indem NUR die Systemzeit springt.
  it("sperrt bei der Rueckkehr ins Fenster, wenn die Uhr inzwischen abgelaufen ist", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(15, sperren));

    vi.advanceTimersByTime(14 * MINUTE);
    vi.setSystemTime(new Date("2026-03-03T07:00:00Z")); // Deckel zu, naechster Morgen
    expect(sperren).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(sperren).toHaveBeenCalledTimes(1);
  });

  it("laesst sich von der ersten Taste nach dem Aufwachen nicht wiederbeleben", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(15, sperren));

    vi.advanceTimersByTime(14 * MINUTE);
    vi.setSystemTime(new Date("2026-03-03T07:00:00Z"));
    window.dispatchEvent(new Event("keydown"));

    expect(sperren).toHaveBeenCalledTimes(1);
  });

  it("verlaengert die Frist NICHT durch blosses Zurueckkehren", () => {
    const sperren = vi.fn();
    renderHook(() => useZeitsperre(15, sperren));

    vi.advanceTimersByTime(14 * MINUTE);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(MINUTE);

    expect(sperren).toHaveBeenCalledTimes(1);
  });

  it("sperrt nur einmal und raeumt beim Abbau auf", () => {
    const sperren = vi.fn();
    const { unmount } = renderHook(() => useZeitsperre(1, sperren));
    vi.advanceTimersByTime(MINUTE);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("keydown"));
    expect(sperren).toHaveBeenCalledTimes(1);

    const zweite = vi.fn();
    const hook = renderHook(() => useZeitsperre(1, zweite));
    hook.unmount();
    unmount();
    vi.advanceTimersByTime(10 * MINUTE);
    expect(zweite).not.toHaveBeenCalled();
  });
});
