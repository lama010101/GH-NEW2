import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * GUARD TEST — prevents accidental revert of the home-v2 four-card layout.
 *
 * The home page was ported from /prototype/home-v2 (MP-UIX-PORT-C-HOME-001)
 * to a FOUR-CARD GRID layout:
 *   .hv2-wrap > tagline + .hv2-grid > JourneyCard / ChallengeCard /
 *   DailyCard / PracticeCard (each in src/components/home/ with its own
 *   module CSS). The old VERTICAL_CARD_ORDER / ModeCard / StageCard /
 *   DailyPanel / CompetePanel stack was removed — CompetePanel survives
 *   only via /home/compete/all, sharing its data layer with ChallengeCard
 *   through useCompeteLists.ts.
 * The standalone inline RankCard stays removed (HOME-BUILD-PURPLESTAGE-
 * RANKMODAL-003) — rank display lives in the TopBar rank pill modal.
 *
 * Past layouts were reverted multiple times in the working tree by AI agent
 * sessions; this test asserts the v2 markers are present and the old
 * horizontal/vertical markers are absent, so any revert fails `npm test`
 * immediately.
 */

const PAGE_PATH = resolve(__dirname, "page.tsx");
const CSS_PATH = resolve(__dirname, "home.module.css");
const CHALLENGE_TSX_PATH = resolve(__dirname, "../../components/home/ChallengeCard.tsx");
const CHALLENGE_CSS_PATH = resolve(__dirname, "../../components/home/ChallengeCard.module.css");

const pageSrc = readFileSync(PAGE_PATH, "utf-8");
const cssSrc = readFileSync(CSS_PATH, "utf-8");
const challengeTsxSrc = readFileSync(CHALLENGE_TSX_PATH, "utf-8");
const challengeCssSrc = readFileSync(CHALLENGE_CSS_PATH, "utf-8");

describe("home page — v2 four-card layout guard (MP-UIX-PORT-C-HOME-001)", () => {
  describe("page.tsx", () => {
    it("does NOT import RankCard or RankProgressBar (rank moved to TopBar pill modal)", () => {
      expect(pageSrc).not.toContain("import RankCard");
      expect(pageSrc).not.toContain("import RankProgressBar");
    });

    it("does NOT import useRankOpen (rank card is always-open, not toggled)", () => {
      expect(pageSrc).not.toContain("useRankOpen");
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

    it("renders the four v2 cards inside the hv2 grid", () => {
      expect(pageSrc).toContain("hv2-wrap");
      expect(pageSrc).toContain("hv2-grid");
      expect(pageSrc).toContain("<JourneyCard");
      expect(pageSrc).toContain("<ChallengeCard");
      expect(pageSrc).toContain("<DailyCard");
      expect(pageSrc).toContain("<PracticeCard");
    });

    it("imports the four v2 card components from src/components/home", () => {
      expect(pageSrc).toContain("@/components/home/JourneyCard");
      expect(pageSrc).toContain("@/components/home/ChallengeCard");
      expect(pageSrc).toContain("@/components/home/DailyCard");
      expect(pageSrc).toContain("@/components/home/PracticeCard");
    });

    it("does NOT use the retired card-stack components (ModeCard / StageCard / DailyPanel / VERTICAL_CARD_ORDER)", () => {
      expect(pageSrc).not.toContain("ModeCard");
      expect(pageSrc).not.toContain("StageCard");
      expect(pageSrc).not.toContain("DailyPanel");
      expect(pageSrc).not.toContain("VERTICAL_CARD_ORDER");
      expect(pageSrc).not.toContain("MODE_CARD_GRADIENT");
    });

    it("does NOT render CompetePanel directly (it lives inside /home/compete/all; home uses ChallengeCard)", () => {
      expect(pageSrc).not.toContain("<CompetePanel");
      expect(pageSrc).not.toContain("components/home/CompetePanel");
    });

    it("does NOT use old horizontal card classes (moved to per-card module CSS)", () => {
      expect(pageSrc).not.toContain("cardInnerHorizontal");
      expect(pageSrc).not.toContain("cardIconThumb");
      expect(pageSrc).not.toContain("cardTextCol");
      expect(pageSrc).not.toContain("playPill");
      expect(pageSrc).not.toContain("cards-stack");
      expect(pageSrc).not.toContain("mode-card");
    });

    it("does NOT use old vertical layout markers (card-inner, card-icon-wrap, rankWrap)", () => {
      expect(pageSrc).not.toContain("styles['card-inner']");
      expect(pageSrc).not.toContain("styles['card-icon-wrap']");
      expect(pageSrc).not.toContain("styles.rankWrap");
      expect(pageSrc).not.toContain("<RankProgressBar");
    });

    it("keeps identity bootstrap, kicked toast, TopBar, NavModal and practice modals", () => {
      expect(pageSrc).toContain("bootstrapIdentity");
      expect(pageSrc).toContain("kicked");
      expect(pageSrc).toContain("<TopBar");
      expect(pageSrc).toContain("<NavModal");
      expect(pageSrc).toContain("PracticeSettingsModal");
      expect(pageSrc).toContain("PracticeResumeModal");
      expect(pageSrc).toContain("handlePracticeTileClick");
    });
  });

  describe("home.module.css", () => {
    it("defines the v2 grid layout classes", () => {
      expect(cssSrc).toContain(".hv2-wrap");
      expect(cssSrc).toContain(".hv2-grid");
      expect(cssSrc).toContain("minmax(0, 7fr) minmax(0, 5fr)");
      expect(cssSrc).toContain("max-width: 1200px");
    });

    it("keeps the page shell classes", () => {
      expect(cssSrc).toContain(".pageRoot");
      expect(cssSrc).toContain(".bgImage");
      expect(cssSrc).toContain(".bgOverlay");
      expect(cssSrc).toContain(".page-scroll");
      expect(cssSrc).toContain(".tagline");
      expect(cssSrc).toContain(".loadingIndicator");
    });

    it("does NOT define retired card classes (dead with the removed card stack)", () => {
      expect(cssSrc).not.toContain(".cards-stack");
      expect(cssSrc).not.toContain(".mode-card");
      expect(cssSrc).not.toContain(".cardInnerHorizontal");
      expect(cssSrc).not.toContain(".cardIconThumb");
      expect(cssSrc).not.toContain(".cardTextCol");
      expect(cssSrc).not.toContain(".cardTitleLeft");
      expect(cssSrc).not.toContain(".cardDescLeft");
      expect(cssSrc).not.toContain(".playPill");
      expect(cssSrc).not.toContain(".cardBgJourney");
      expect(cssSrc).not.toContain(".competePanelWrap");
    });

    it("does NOT define pageScrollRankOpen (dead with the removed rank card)", () => {
      expect(cssSrc).not.toContain(".pageScrollRankOpen");
    });

    it("header comment references HOME V2 (not HORIZONTAL or NEW VERTICAL)", () => {
      expect(cssSrc).toMatch(/HOME V2/);
      expect(cssSrc).not.toMatch(/HORIZONTAL CARD LAYOUT/);
      expect(cssSrc).not.toMatch(/NEW VERTICAL CARD LAYOUT/);
    });
  });

  describe("ChallengeCard row cap (HOME-FIX-CHALLENGECARD-ROWCAP-1015-001)", () => {
    it("caps all three open sections at 5 measured rows via CappedRows, no px max-height in .tabBody", () => {
      expect(challengeTsxSrc).toContain("import { CappedRows } from './CappedRows'");
      expect(challengeTsxSrc.match(/<CappedRows\b[^>]*maxRows=\{5\}/g) ?? []).toHaveLength(3);
      expect(challengeTsxSrc.match(/data-cap-row/g) ?? []).toHaveLength(3);
      const tabBodyRule = challengeCssSrc.match(/\.tabBody\s*\{[^}]*\}/);
      expect(tabBodyRule).not.toBeNull();
      expect(tabBodyRule ? tabBodyRule[0] : "").not.toMatch(/max-height\s*:\s*\d+px/);
    });
  });
});
