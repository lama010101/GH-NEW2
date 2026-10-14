import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import RankLadderCard from "./RankLadderCard";

// Mock next-intl — same pattern as AuthModal.test.tsx.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

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
