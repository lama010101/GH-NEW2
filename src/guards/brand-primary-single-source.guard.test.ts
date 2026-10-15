import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND_PRIMARY_HEX } from "@/core/brand";

/**
 * GUARD TEST — brand primary single source (BRAND-BUILD-PURPLEICONS-1015-003).
 *
 * BRAND_PRIMARY_HEX in src/core/brand.ts is the single source of truth for the
 * brand purple. public/manifest.json theme_color and the --gh-primary token in
 * globals.css are hex mirrors that cannot reference the constant directly;
 * this test enforces that they stay equal. It also verifies the generated icon
 * files exist with the expected dimensions and that /manifest.json is reachable
 * pre-login via middleware PUBLIC_PATHS.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(PROJECT_ROOT, p));
const readText = (p: string) => read(p).toString("utf-8");

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(p: string): { width: number; height: number } {
  const buf = read(p);
  if (!buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error(`${p}: bad PNG signature`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("brand primary single source (BRAND-BUILD-PURPLEICONS-1015-003)", () => {
  it("BRAND_PRIMARY_HEX is a 6-digit hex literal", () => {
    expect(BRAND_PRIMARY_HEX).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("public/manifest.json theme_color equals BRAND_PRIMARY_HEX", () => {
    const manifest = JSON.parse(readText("public/manifest.json"));
    expect(manifest.theme_color.toLowerCase()).toBe(BRAND_PRIMARY_HEX.toLowerCase());
  });

  it('globals.css declares ":root" token --gh-primary equal to BRAND_PRIMARY_HEX', () => {
    const css = readText("src/app/globals.css");
    expect(css).toContain(`--gh-primary: ${BRAND_PRIMARY_HEX};`);
    expect(css).toContain(":root");
  });

  it("layout.tsx wires themeColor, brand import and apple-touch-icon", () => {
    const src = readText("src/app/layout.tsx");
    expect(src).toContain("themeColor: BRAND_PRIMARY_HEX");
    expect(src).toMatch(/import\s+\{\s*BRAND_PRIMARY_HEX\s*\}\s+from\s+['"]@\/core\/brand['"]/);
    expect(src).toContain("/icons/apple-touch-icon.png");
  });

  it('middleware.ts PUBLIC_PATHS declaration contains "/manifest.json"', () => {
    const src = readText("src/middleware.ts");
    const decl = src.split("\n").find((l) => /PUBLIC_PATHS\s*=/.test(l));
    expect(decl).toBeDefined();
    expect(decl).toContain('"/manifest.json"');
  });

  it("generated PNG icons have expected dimensions", () => {
    const expected: Record<string, [number, number]> = {
      "public/icons/icon-192.png": [192, 192],
      "public/icons/icon-512.png": [512, 512],
      "public/icons/icon-maskable-512.png": [512, 512],
      "public/icons/apple-touch-icon.png": [180, 180],
      "public/icons/badge-96.png": [96, 96],
    };
    for (const [file, [w, h]] of Object.entries(expected)) {
      const { width, height } = pngSize(file);
      expect(`${file} ${width}x${height}`).toBe(`${file} ${w}x${h}`);
    }
  });

  it("src/app/favicon.ico is a valid ICO with entries 16, 32, 48", () => {
    const buf = read("src/app/favicon.ico");
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // type ICO
    expect(buf.readUInt16LE(4)).toBe(3); // count
    const sizes = [0, 1, 2].map((i) => buf.readUInt8(6 + i * 16) || 256);
    expect(sizes).toEqual([16, 32, 48]);
  });
});
