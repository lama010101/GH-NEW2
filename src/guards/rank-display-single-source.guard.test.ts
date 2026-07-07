import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

/**
 * GUARD TEST — single rank display component (RankCard) everywhere.
 *
 * Task ref: UNIFY-RANK-DISPLAY-001
 *
 * The home page RankCard (image medallion + title + XP + next-rank line +
 * progress bar) is the ONE rank display used on every surface:
 *   - home (src/app/home/page.tsx)
 *   - session-complete (src/components/compete/SessionComplete.tsx)
 *   - round-complete (src/components/compete/RoundCompleteSection.tsx)
 *   - profile (src/app/profile/page.tsx)
 *
 * The OLD rank display (RankProgressBar + RankIcon — inline SVG icon) was
 * removed entirely. These files were deleted:
 *   - src/components/RankProgressBar.tsx
 *   - src/components/RankProgressBar.module.css
 *   - src/components/RankIcon.tsx
 *
 * This test FAILS if any source file re-introduces the old components by
 * importing RankProgressBar or RankIcon, so the old version can never
 * show again anywhere on the app.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const SRC_DIR = resolve(PROJECT_ROOT, "src");

/** Recursively collect all .ts/.tsx file paths under dir, relative to PROJECT_ROOT. */
function collectTsFiles(dir: string, acc: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectTsFiles(full, acc);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      acc.push(relative(PROJECT_ROOT, full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

describe("rank display — single source (RankCard only, no RankProgressBar/RankIcon) (UNIFY-RANK-DISPLAY-001)", () => {
  const tsFiles = collectTsFiles(SRC_DIR);

  it("no source file imports RankProgressBar", () => {
    const offenders: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      if (/from\s+['"][^'"]*RankProgressBar['"]/.test(content)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      offenders.length
        ? "RankProgressBar was re-introduced. Use RankCard instead (single rank display):\n" +
          offenders.join("\n")
        : ""
    ).toHaveLength(0);
  });

  it("no source file imports RankIcon", () => {
    const offenders: string[] = [];
    for (const file of tsFiles) {
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      if (/from\s+['"][^'"]*\/RankIcon['"]/.test(content)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      offenders.length
        ? "RankIcon was re-introduced. RankCard uses rank title images, not SVG icons:\n" +
          offenders.join("\n")
        : ""
    ).toHaveLength(0);
  });

  it("RankProgressBar and RankIcon component files do not exist", () => {
    const deleted = [
      "src/components/RankProgressBar.tsx",
      "src/components/RankProgressBar.module.css",
      "src/components/RankIcon.tsx",
    ];
    const present: string[] = [];
    for (const f of deleted) {
      try {
        statSync(resolve(PROJECT_ROOT, f));
        present.push(f);
      } catch {
        // expected — file should not exist
      }
    }
    expect(
      present,
      present.length
        ? "Old rank component files still present (should be deleted):\n" +
          present.join("\n")
        : ""
    ).toHaveLength(0);
  });

  it("all rank surfaces render RankCard", () => {
    const surfaces: Record<string, string> = {
      "src/app/home/page.tsx": "<RankCard",
      "src/components/compete/SessionComplete.tsx": "<RankCard",
      "src/components/compete/RoundCompleteSection.tsx": "<RankCard",
      "src/app/profile/page.tsx": "<RankCard",
    };
    const missing: string[] = [];
    for (const [file, marker] of Object.entries(surfaces)) {
      const content = readFileSync(resolve(PROJECT_ROOT, file), "utf-8");
      if (!content.includes(marker)) {
        missing.push(file);
      }
    }
    expect(
      missing,
      missing.length
        ? "Surface(s) no longer render RankCard:\n" + missing.join("\n")
        : ""
    ).toHaveLength(0);
  });
});
