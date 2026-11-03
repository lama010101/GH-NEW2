import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import RankLadderCard from "./RankLadderCard";

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
}));

// The hook under test reads auth via readSession() only.
vi.mock("@/core/supabaseBrowser", () => ({
  readSession: mocks.readSession,
  supabaseBrowser: {},
}));

// Mock next-intl — same pattern as AuthModal.test.tsx.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const FLAG = "NEXT_PUBLIC_RANK_ACCURACY_GATE";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Flag ON: reset modules so usePlayerRank's module-level cache starts empty,
// then drive the real hook with a mocked session + fetch.
async function renderFlagOn(body: unknown, totalXp = 6_000) {
  vi.resetModules();
  vi.stubEnv(FLAG, "true");
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", fetchSpy);
  mocks.readSession.mockResolvedValue({ user: { id: "p-1" } });
  const { default: Card } = await import("./RankLadderCard");
  const utils = render(<Card totalXp={totalXp} />);
  const cells = () =>
    Array.from(utils.container.querySelector("[data-cur='1']")!.parentElement!.children) as HTMLElement[];
  return { ...utils, fetchSpy, cells };
}

const rect = (left: number, width: number) =>
  ({
    left,
    width,
    right: left + width,
    top: 0,
    bottom: 0,
    height: 0,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

describe("RankLadderCard", () => {
  it("re-centres the rail when the current tier changes after mount", () => {
    const { container, rerender } = render(<RankLadderCard totalXp={0} />);
    const curCell = container.querySelector("[data-cur='1']")!;
    const rail = curCell.parentElement as HTMLElement;
    const cells = Array.from(rail.children) as HTMLElement[];
    expect(cells).toHaveLength(10);
    expect(curCell).toBe(cells[0]); // tier 1 while XP is still 0

    // jsdom has no layout: stub a 390px viewport and 100px cells at 110px pitch.
    let scroll = 0;
    Object.defineProperty(rail, "scrollLeft", {
      get: () => scroll,
      set: (v: number) => {
        scroll = v;
      },
      configurable: true,
    });
    Object.defineProperty(rail, "clientWidth", { value: 390, configurable: true });
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue(rect(0, 390));
    cells.forEach((c, i) =>
      vi.spyOn(c, "getBoundingClientRect").mockReturnValue(rect(i * 110, 100)),
    );

    rerender(<RankLadderCard totalXp={1_000_148} />); // async XP lands → tier 8

    expect(container.querySelector("[data-cur='1']")).toBe(cells[7]);
    // cell centre 770+50=820 minus rail centre 195 → instant scroll to 625
    expect(scroll).toBe(625);
  });

  it("variant='card' renders the results-grid card shell; default stays glass", () => {
    const { container, rerender } = render(<RankLadderCard totalXp={0} />);
    expect(container.querySelector("section")!.className).toContain("rankL");
    expect(container.querySelector("section")!.className).not.toContain("rankLCard");
    expect(container.querySelector("[class*='accentBar']")).toBeNull();

    rerender(<RankLadderCard totalXp={0} variant="card" />);
    const sec = container.querySelector("section")!;
    expect(sec.className).toContain("rankLCard");
    expect(sec.querySelector("h3")!.className).toContain("lcTitleCard");
    expect(sec.querySelector("[class*='accentBar']")).not.toBeNull();
  });
});

describe("RankLadderCard — accuracy gate flag (RANK-BUILD-ACCGATE-1103-003)", () => {
  it("flag OFF: identical render — no gate markup, no fetch, no session read", async () => {
    vi.stubEnv(FLAG, "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    // SVG gradient ids embed React useId() counters (':ru:', ':rv:', …) which
    // legitimately differ per mount — normalize before comparing.
    const norm = (html: string) => html.replace(/:r[0-9a-z]+:/gi, "::");

    const a = render(<RankLadderCard totalXp={6_000} />);
    const htmlA = norm(a.container.querySelector("section")!.innerHTML);
    a.unmount();
    const b = render(<RankLadderCard totalXp={6_000} />);
    const htmlB = norm(b.container.querySelector("section")!.innerHTML);

    // Deterministic identical DOM across mounts, XP-derived tier 3 current.
    expect(htmlB).toBe(htmlA);
    const cells = Array.from(b.container.querySelectorAll("[class*='lcCell']"));
    expect(cells).toHaveLength(10);
    expect(b.container.querySelector("[data-cur='1']")).toBe(cells[2]);
    expect(b.container.querySelector("[data-lock]")).toBeNull();
    expect(b.container.innerHTML).not.toContain("gate_");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.readSession).not.toHaveBeenCalled();
  });

  it("flag ON + ready: current tier is the gated tier; next-tier cell shows the lock", async () => {
    // XP 6_000 is tier 3 ungated; the gate holds tier 2 (acc 20 < 25).
    const { container, cells, fetchSpy } = await renderFlagOn({
      gateEnabled: true,
      tier: 2,
      maxRankTier: 2,
      gate: {
        nextTier: 3,
        xpMet: true,
        accuracyFloor: 25,
        rollingAccPct: 20,
        accuracyMet: false,
        roundsSampled: 120,
        minRounds: 50,
        sampleMet: true,
      },
    });

    await waitFor(() => expect(container.querySelector("[data-lock='1']")).not.toBeNull());
    expect(cells().indexOf(container.querySelector("[data-cur='1']") as HTMLElement)).toBe(1);
    const locked = container.querySelector("[data-lock='1']") as HTMLElement;
    expect(cells().indexOf(locked)).toBe(2);
    expect(locked.textContent).toContain("gate_xp_ready");
    expect(locked.textContent).toContain("gate_your_accuracy");
    expect(locked.textContent).toContain("gate_accuracy_needed");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/player/rank-status", { method: "POST" });
  });

  it("flag ON + XP met but sample short: shows rounds-needed", async () => {
    const { container } = await renderFlagOn({
      gateEnabled: true,
      tier: 2,
      maxRankTier: 2,
      gate: {
        nextTier: 3,
        xpMet: true,
        accuracyFloor: 25,
        rollingAccPct: 40,
        accuracyMet: true,
        roundsSampled: 30,
        minRounds: 50,
        sampleMet: false,
      },
    });

    await waitFor(() => expect(container.querySelector("[data-lock='1']")).not.toBeNull());
    const locked = container.querySelector("[data-lock='1']") as HTMLElement;
    expect(locked.textContent).toContain("gate_rounds_needed");
    expect(locked.textContent).not.toContain("gate_your_accuracy");
    expect(locked.textContent).not.toContain("gate_xp_ready");
  });

  it("flag ON + XP not met for next tier: no lock, normal XP progress line", async () => {
    const { container, cells } = await renderFlagOn(
      {
        gateEnabled: true,
        tier: 3,
        maxRankTier: 3,
        gate: {
          nextTier: 4,
          xpMet: false,
          accuracyFloor: 28,
          rollingAccPct: 40,
          accuracyMet: true,
          roundsSampled: 90,
          minRounds: 50,
          sampleMet: true,
        },
      },
      6_000
    );

    await waitFor(() =>
      expect(cells().indexOf(container.querySelector("[data-cur='1']") as HTMLElement)).toBe(2)
    );
    expect(container.querySelector("[data-lock]")).toBeNull();
    expect(container.innerHTML).not.toContain("gate_");
  });

  it("flag ON: two mounted cards share one single-flight POST", async () => {
    vi.resetModules();
    vi.stubEnv(FLAG, "true");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        gateEnabled: true,
        tier: 2,
        maxRankTier: 2,
        gate: {
          nextTier: 3,
          xpMet: true,
          accuracyFloor: 25,
          rollingAccPct: 20,
          accuracyMet: false,
          roundsSampled: 60,
          minRounds: 50,
          sampleMet: true,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    mocks.readSession.mockResolvedValue({ user: { id: "p-1" } });
    const { default: Card } = await import("./RankLadderCard");

    const { container } = render(
      <>
        <Card totalXp={6_000} />
        <Card totalXp={6_000} />
      </>
    );

    await waitFor(() => expect(container.querySelectorAll("[data-lock='1']")).toHaveLength(2));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("flag ON + no session: falls back to XP-derived render, no POST", async () => {
    vi.resetModules();
    vi.stubEnv(FLAG, "true");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    mocks.readSession.mockResolvedValue(null);
    const { default: Card } = await import("./RankLadderCard");

    const { container } = render(<Card totalXp={6_000} />);

    await waitFor(() => expect(mocks.readSession).toHaveBeenCalled());
    expect(fetchSpy).not.toHaveBeenCalled();
    const cells = Array.from(container.querySelectorAll("[class*='lcCell']"));
    expect(container.querySelector("[data-cur='1']")).toBe(cells[2]);
    expect(container.querySelector("[data-lock]")).toBeNull();
  });
});
