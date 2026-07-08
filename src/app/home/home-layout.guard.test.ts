import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GUARD TEST — prevents accidental revert of the prototype-merged home page.
 *
 * The home page was merged from the prototype (commit 3630f25,
 * FEAT-HOME-UI-PROTO-MERGE) to use a HORIZONTAL card layout:
 *   icon-left + text-middle + playPill (non-compete cards)
 *   icon-left + text-middle + CompetePanel (compete card)
 * plus an inline, scrolling RankCard at the top of the page-scroll content
 * (not fixed — scrolls with the rest of the page).
 *
 * This layout has been reverted multiple times in the working tree by
 * AI agent sessions that restored the OLD vertical card layout. This test
 * asserts the horizontal-layout markers are present and the old vertical
 * markers are absent, so any revert fails `npm test` immediately.
 *
 * Task ref: FEAT-HOME-UI-PROTO-MERGE-RESTORE-001
 */

const PAGE_PATH = resolve(__dirname, "page.tsx");
const CSS_PATH = resolve(__dirname, "home.module.css");

const pageSrc = readFileSync(PAGE_PATH, "utf-8");
const cssSrc = readFileSync(CSS_PATH, "utf-8");

describe("home page — horizontal card layout guard (FEAT-HOME-UI-PROTO-MERGE)", () => {
  describe("page.tsx", () => {
    it("imports RankCard (not RankProgressBar)", () => {
      expect(pageSrc).toContain("import RankCard from '@/components/RankCard'");
      expect(pageSrc).not.toContain("import RankProgressBar");
    });

    it("does NOT import useRankOpen (rank card is always-open, not toggled)", () => {
      expect(pageSrc).not.toContain("useRankOpen");
    });

    it("imports MODE_CARD_TITLE and MODE_CARD_SUBTITLE from home/types", () => {
      expect(pageSrc).toContain("MODE_CARD_TITLE");
      expect(pageSrc).toContain("MODE_CARD_SUBTITLE");
    });

    it("renders RankCard inline (scrolls with page, not fixed)", () => {
      expect(pageSrc).toContain("<RankCard");
      expect(pageSrc).toContain("open");
      expect(pageSrc).toContain("inline");
      expect(pageSrc).not.toContain("open={rankOpen}");
    });

    it("does NOT pass rankOpen / onToggleRank to TopBar", () => {
      expect(pageSrc).not.toContain("rankOpen={rankOpen}");
      expect(pageSrc).not.toContain("onToggleRank");
    });

    it("uses pageScrollRankOpen class (always-open padding)", () => {
      expect(pageSrc).toContain("pageScrollRankOpen");
    });

    it("uses horizontal card layout classes (cardInnerHorizontal, cardIconThumb, cardTextCol, playPill)", () => {
      expect(pageSrc).toContain("cardInnerHorizontal");
      expect(pageSrc).toContain("cardIconThumb");
      expect(pageSrc).toContain("cardTextCol");
      expect(pageSrc).toContain("playPill");
    });

    it("does NOT use old vertical layout markers (card-inner, card-icon-wrap, rankWrap)", () => {
      expect(pageSrc).not.toContain("styles['card-inner']");
      expect(pageSrc).not.toContain("styles['card-icon-wrap']");
      expect(pageSrc).not.toContain("styles.rankWrap");
      expect(pageSrc).not.toContain("<RankProgressBar");
    });
  });

  describe("home.module.css", () => {
    it("defines horizontal layout classes", () => {
      expect(cssSrc).toContain(".cardInnerHorizontal");
      expect(cssSrc).toContain(".cardIconThumb");
      expect(cssSrc).toContain(".cardTextCol");
      expect(cssSrc).toContain(".cardTitleLeft");
      expect(cssSrc).toContain(".cardDescLeft");
      expect(cssSrc).toContain(".playPill");
    });

    it("defines pageScrollRankOpen", () => {
      expect(cssSrc).toContain(".pageScrollRankOpen");
    });

    it("header comment references HORIZONTAL CARD LAYOUT (not NEW VERTICAL)", () => {
      expect(cssSrc).toMatch(/HORIZONTAL CARD LAYOUT/);
      expect(cssSrc).not.toMatch(/NEW VERTICAL CARD LAYOUT/);
    });
  });
});
