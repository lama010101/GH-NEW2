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
 * The standalone inline RankCard was removed from the card stack in
 * HOME-BUILD-PURPLESTAGE-RANKMODAL-003 — rank display now lives in the
 * TopBar rank pill modal (RankModal), so this guard asserts its absence.
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
    it("does NOT import RankCard or RankProgressBar (rank moved to TopBar pill modal)", () => {
      expect(pageSrc).not.toContain("import RankCard");
      expect(pageSrc).not.toContain("import RankProgressBar");
    });

    it("does NOT import useRankOpen (rank card is always-open, not toggled)", () => {
      expect(pageSrc).not.toContain("useRankOpen");
    });

    it("uses i18n for mode card titles and descriptions (not hardcoded constants)", () => {
      expect(pageSrc).toContain("t(`home.${mode}_name`)");
      expect(pageSrc).toContain("t(`home.${mode}_desc`)");
      expect(pageSrc).not.toContain("MODE_CARD_TITLE");
      expect(pageSrc).not.toContain("MODE_CARD_SUBTITLE");
    });

    it("does NOT render the standalone RankCard (removed — rank shows via TopBar pill modal)", () => {
      expect(pageSrc).not.toContain("<RankCard");
      expect(pageSrc).not.toContain("rankCardInline");
      expect(pageSrc).not.toContain("open={rankOpen}");
    });

    it("does NOT pass rankOpen / onToggleRank to TopBar", () => {
      expect(pageSrc).not.toContain("rankOpen={rankOpen}");
      expect(pageSrc).not.toContain("onToggleRank");
    });

    it("does NOT use pageScrollRankOpen class (rank card removed; plain page-scroll)", () => {
      expect(pageSrc).not.toContain("pageScrollRankOpen");
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

    it("does NOT define pageScrollRankOpen (dead with the removed rank card)", () => {
      expect(cssSrc).not.toContain(".pageScrollRankOpen");
    });

    it("header comment references HORIZONTAL CARD LAYOUT (not NEW VERTICAL)", () => {
      expect(cssSrc).toMatch(/HORIZONTAL CARD LAYOUT/);
      expect(cssSrc).not.toMatch(/NEW VERTICAL CARD LAYOUT/);
    });
  });
});
