import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * UX-FIX-CONSENTBANNER-PROVIDER-1126-901 — next-intl provider guard.
 * Any component rendered by the root layout whose source uses useTranslations
 * must render inside NextIntlClientProvider.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const readText = (p: string) => readFileSync(resolve(PROJECT_ROOT, p), "utf-8");

const layoutSource = readText("src/app/layout.tsx");
const providerOpenIndex = layoutSource.indexOf("<NextIntlClientProvider");
const providerCloseIndex = layoutSource.indexOf("</NextIntlClientProvider>");

function expectInsideProvider(componentName: string): void {
  const tagIndex = layoutSource.indexOf(`<${componentName}`);
  expect(providerOpenIndex).toBeGreaterThanOrEqual(0);
  expect(providerCloseIndex).toBeGreaterThan(providerOpenIndex);
  expect(tagIndex).toBeGreaterThanOrEqual(0);
  expect(tagIndex).toBeGreaterThan(providerOpenIndex);
  expect(tagIndex).toBeLessThan(providerCloseIndex);
}

function resolveImportedFile(importPath: string): string | null {
  const base = importPath.startsWith("@/")
    ? resolve(PROJECT_ROOT, "src", importPath.slice(2))
    : resolve(PROJECT_ROOT, "src/app", importPath);
  const candidates = [
    `${base}.tsx`,
    `${base}.ts`,
    resolve(base, "index.tsx"),
    resolve(base, "index.ts"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function importedLocalComponents(): Array<{ name: string; importPath: string }> {
  const components: Array<{ name: string; importPath: string }> = [];
  const seen = new Set<string>();
  const importRe = /^\s*import\s+(?!type\b)([^;]+?)\s+from\s+["']([^"']+)["'];/gm;

  for (const match of layoutSource.matchAll(importRe)) {
    const clause = match[1].trim();
    const importPath = match[2];
    if (!importPath.startsWith("@/") && !importPath.startsWith(".")) continue;

    const names: string[] = [];
    const namedMatch = clause.match(/\{([\s\S]*)\}/);
    const defaultPart = namedMatch
      ? clause.slice(0, namedMatch.index).replace(/,\s*$/, "").trim()
      : clause.trim();

    if (/^[A-Z]/.test(defaultPart)) names.push(defaultPart);

    if (namedMatch) {
      for (const item of namedMatch[1].split(",")) {
        const trimmed = item.trim().replace(/^type\s+/, "");
        if (!trimmed) continue;
        const localName = trimmed.split(/\s+as\s+/).pop()?.trim() ?? "";
        if (/^[A-Z]/.test(localName)) names.push(localName);
      }
    }

    for (const name of names) {
      const key = `${name}:${importPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        components.push({ name, importPath });
      }
    }
  }

  return components;
}

describe("consent banner next-intl provider (UX-FIX-CONSENTBANNER-PROVIDER-1126-901)", () => {
  it("renders ConsentBanner inside NextIntlClientProvider", () => {
    expectInsideProvider("ConsentBanner");
  });

  it("renders every imported useTranslations component inside NextIntlClientProvider", () => {
    for (const component of importedLocalComponents()) {
      const file = resolveImportedFile(component.importPath);
      expect(file).not.toBeNull();
      if (file && readText(file).includes("useTranslations")) {
        expectInsideProvider(component.name);
      }
    }
  });
});
