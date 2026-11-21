"use client";

import { useEffect, useState } from "react";
import { CopyButton, Section, Snippet } from "./bits";
import styles from "./gallery.module.css";

// ── Live token reading ──────────────────────────────────────────────────────
// Token *values* are read from the live DOM (getComputedStyle on <html>) so the
// gallery always shows the active theme's resolved values. A MutationObserver
// on data-theme re-reads on dark/light switches regardless of which component
// triggered the change (useTheme instances are per-component).

function useTokenValues(names: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const name of names) {
        next[name] = cs.getPropertyValue(name).trim();
      }
      setValues(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [names]);

  return values;
}

// ── Color tokens ────────────────────────────────────────────────────────────

interface ColorToken {
  varName: string;
  label: string;
}

interface ColorGroup {
  title: string;
  tokens: ColorToken[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    title: "Brand accents",
    tokens: [
      { varName: "--gh-orange", label: "Primary action / brand" },
      { varName: "--gh-blue", label: "WHERE axis" },
      { varName: "--gh-violet", label: "WHEN axis" },
      { varName: "--gh-teal", label: "Accent" },
      { varName: "--gh-gold", label: "Accent" },
      { varName: "--gh-success", label: "Success / submitted" },
      { varName: "--gh-danger", label: "Danger / penalty" },
      { varName: "--gh-where-solid", label: "WHERE button (solid)" },
      { varName: "--gh-when-solid", label: "WHEN button (solid)" },
    ],
  },
  {
    title: "Surfaces",
    tokens: [
      { varName: "--gh-bg-base", label: "Page background" },
      { varName: "--gh-bg-surface", label: "Card surface" },
      { varName: "--gh-bg-elevated", label: "Elevated surface" },
      { varName: "--gh-bg-input", label: "Input background" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { varName: "--gh-text-primary", label: "Primary" },
      { varName: "--gh-text-secondary", label: "Secondary" },
      { varName: "--gh-text-muted", label: "Muted" },
      { varName: "--gh-text-tertiary", label: "Tertiary" },
      { varName: "--gh-text-dim", label: "Dim (glass contexts)" },
      { varName: "--gh-text-tag", label: "Tag (glass contexts)" },
      { varName: "--gh-text-description", label: "Description" },
    ],
  },
  {
    title: "Borders",
    tokens: [
      { varName: "--gh-border-default", label: "Default" },
      { varName: "--gh-border-subtle", label: "Subtle" },
      { varName: "--gh-border-medium", label: "Medium" },
      { varName: "--gh-border-strong", label: "Strong" },
    ],
  },
  {
    title: "Badge metals & brand purple",
    tokens: [
      { varName: "--gh-badge-gold", label: "Gold badge" },
      { varName: "--gh-badge-silver", label: "Silver badge" },
      { varName: "--gh-badge-bronze", label: "Bronze badge" },
      { varName: "--gh-primary", label: "Brand primary (Journey purple)" },
    ],
  },
];

const ALL_COLOR_VARS = COLOR_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.varName),
);

function Swatch({ token, value }: { token: ColorToken; value: string | undefined }) {
  return (
    <div className={styles.swatch}>
      <div
        className={styles.swatchColor}
        style={{ background: `var(${token.varName})` }}
      />
      <div className={styles.swatchMeta}>
        <span className={styles.swatchName}>{token.varName}</span>
        <span className={styles.swatchLabel}>{token.label}</span>
        <span className={styles.swatchValue}>{value || "—"}</span>
      </div>
      <div className={styles.swatchActions}>
        <CopyButton text={`var(${token.varName})`} />
      </div>
    </div>
  );
}

export function ColorSection() {
  const values = useTokenValues(ALL_COLOR_VARS);

  return (
    <Section
      id="colors"
      title="Color tokens"
      desc="Semantic --gh-* tokens from src/app/globals.css. Values are resolved live from the active theme (dark by default; light via the toggle above). Each swatch copies var(--token-name) for use in CSS or inline styles."
    >
      {COLOR_GROUPS.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupLabel}>{group.title}</div>
          <div className={styles.tokenGrid}>
            {group.tokens.map((token) => (
              <Swatch
                key={token.varName}
                token={token}
                value={values[token.varName]}
              />
            ))}
          </div>
        </div>
      ))}
      <p className={styles.note}>
        RGB channel companions exist for alpha-aware effects:{" "}
        <code>--gh-orange-rgb</code>, <code>--gh-blue-rgb</code>,{" "}
        <code>--gh-violet-rgb</code>, <code>--gh-gold-rgb</code>,{" "}
        <code>--gh-teal-rgb</code>, <code>--gh-success-rgb</code>,{" "}
        <code>--gh-danger-rgb</code>, <code>--gh-where-solid-rgb</code>,{" "}
        <code>--gh-when-solid-rgb</code>, <code>--gh-amber-rgb</code> — use as{" "}
        <code>rgba(var(--gh-orange-rgb), 0.2)</code>.
      </p>
    </Section>
  );
}

// ── Typography tokens ───────────────────────────────────────────────────────

interface TypeToken {
  varName: string;
  note: string;
}

const TYPE_TOKENS: TypeToken[] = [
  { varName: "--font-2xs", note: "micro labels, badges, counters" },
  { varName: "--font-xs", note: "captions, metadata" },
  { varName: "--font-sm", note: "labels, pill text, buttons" },
  { varName: "--font-base", note: "body — ≥16px avoids iOS focus zoom" },
  { varName: "--font-lg", note: "card subtitles, section labels" },
  { varName: "--font-xl", note: "subheadings, small screen titles" },
  { varName: "--font-2xl", note: "screen / page headings" },
  { varName: "--font-3xl", note: "card & section titles" },
  { varName: "--font-4xl", note: "hero / large display" },
];

const TYPE_VARS = TYPE_TOKENS.map((token) => token.varName);

const FONT_FAMILIES = [
  {
    varName: "--font-dm-sans",
    name: "DM Sans",
    role: "Body font — variable weight 100–1000, self-hosted via next/font/local",
    specimen: "The quick brown fox jumps over the lazy dog 0123456789",
    snippet: "font-family: var(--font-dm-sans), system-ui, sans-serif;",
  },
  {
    varName: "--font-bebas",
    name: "Bebas Neue",
    role: "Display font — use .font-bebas / .font-display utility classes",
    specimen: "DIG THE PAST",
    snippet: 'className="font-bebas"',
  },
  {
    varName: "--font-sora",
    name: "Sora",
    role: "Accent font — weight 700",
    specimen: "Historian",
    snippet: "font-family: var(--font-sora), sans-serif;",
  },
] as const;

const FONT_VARS = FONT_FAMILIES.map((font) => font.varName);

// Stable module-level list (the hook effect depends on array identity).
const TYPE_AND_FONT_VARS = [...TYPE_VARS, ...FONT_VARS];

// Tailwind fontSize scale from tailwind.config.ts (kept in sync manually —
// the config is the source of truth; values below mirror theme.extend.fontSize).
const TAILWIND_SCALE = [
  { cls: "text-xs", px: "12px", lh: "1.4" },
  { cls: "text-sm", px: "14px", lh: "1.5" },
  { cls: "text-base", px: "16px", lh: "1.6" },
  { cls: "text-lg", px: "18px", lh: "1.5" },
  { cls: "text-xl", px: "20px", lh: "1.4" },
  { cls: "text-2xl", px: "24px", lh: "1.3" },
  { cls: "text-3xl", px: "28px", lh: "1.25" },
  { cls: "text-4xl", px: "38px", lh: "1.2" },
] as const;

export function TypographySection() {
  const values = useTokenValues(TYPE_AND_FONT_VARS);

  return (
    <Section
      id="typography"
      title="Typography tokens"
      desc="Two scales coexist: the CSS custom properties (--font-2xs…--font-4xl, authoritative per globals.css) and the Tailwind fontSize classes (text-xs…text-4xl). Note they differ (e.g. --font-xs is 13px while text-xs is 12px) — prefer the CSS vars for app code."
    >
      <div className={styles.group}>
        <div className={styles.groupLabel}>CSS custom properties (px, mobile-first)</div>
        <div className={styles.tokenRows}>
          {TYPE_TOKENS.map((token) => (
            <div key={token.varName} className={styles.typeRow}>
              <span className={styles.typeName}>
                {token.varName}
                <span className={styles.typeNote}>{token.note}</span>
              </span>
              <span
                className={styles.typeSpecimen}
                style={{ fontSize: `var(${token.varName})` }}
              >
                Dig the Past — 1815
              </span>
              <span className={styles.typeValue}>{values[token.varName] || "—"}</span>
            </div>
          ))}
        </div>
        <div>
          <CopyButton text="font-size: var(--font-2xl); /* 24px */" />
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>Font families</div>
        <div className={styles.fontGrid}>
          {FONT_FAMILIES.map((font) => (
            <div key={font.varName} className={styles.fontCard}>
              <div
                className={styles.fontSpecimen}
                style={{
                  fontFamily: `var(${font.varName}), sans-serif`,
                  fontSize: font.name === "Bebas Neue" ? 44 : 22,
                }}
              >
                {font.specimen}
              </div>
              <div className={styles.fontMeta}>
                <span className={styles.fontName}>{font.name}</span>
                <span className={styles.fontRole}>{font.role}</span>
                <span className={styles.fontVar}>{font.varName}</span>
              </div>
              <div className={styles.fontActions}>
                <CopyButton text={font.snippet} label="Copy usage" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>Tailwind fontSize classes</div>
        <div className={styles.tokenRows}>
          {TAILWIND_SCALE.map((step) => (
            <div key={step.cls} className={styles.typeRow}>
              <span className={styles.typeName}>
                {step.cls}
                <span className={styles.typeNote}>
                  {step.px} / {step.lh}
                </span>
              </span>
              <span className={`${styles.typeSpecimen} ${step.cls}`}>
                Dig the Past — 1815
              </span>
              <span className={styles.typeValue}>
                {step.px} / {step.lh}
              </span>
            </div>
          ))}
        </div>
        <div>
          <CopyButton text='className="text-2xl"' label="Copy class" />
        </div>
      </div>
      <p className={styles.note}>
        At ≤480px viewports, <code>--font-3xl</code> (28→22px) and{" "}
        <code>--font-4xl</code> (32→26px) step down for narrow screens.
      </p>
    </Section>
  );
}

// ── Surface tokens (radius, shadow, blur, glass, modal) ─────────────────────

interface SurfaceToken {
  varName: string;
  label: string;
  copy: string;
  preview: "radius" | "shadow" | "none";
}

interface SurfaceGroup {
  title: string;
  tokens: SurfaceToken[];
}

const SURFACE_GROUPS: SurfaceGroup[] = [
  {
    title: "Corner radii",
    tokens: [
      { varName: "--gh-radius-sm", label: "Small (14px)", copy: "border-radius: var(--gh-radius-sm);", preview: "radius" },
      { varName: "--gh-radius-md", label: "Medium (18px)", copy: "border-radius: var(--gh-radius-md);", preview: "radius" },
      { varName: "--gh-radius-pill", label: "Pill (999px)", copy: "border-radius: var(--gh-radius-pill);", preview: "radius" },
      { varName: "--radius-sm", label: "Legacy small (6px)", copy: "border-radius: var(--radius-sm);", preview: "radius" },
      { varName: "--radius-md", label: "Legacy medium (10px)", copy: "border-radius: var(--radius-md);", preview: "radius" },
      { varName: "--radius-lg", label: "Legacy large (16px)", copy: "border-radius: var(--radius-lg);", preview: "radius" },
    ],
  },
  {
    title: "Elevation — shadows",
    tokens: [
      { varName: "--gh-shadow-sm", label: "Small", copy: "box-shadow: var(--gh-shadow-sm);", preview: "shadow" },
      { varName: "--gh-shadow-md", label: "Medium", copy: "box-shadow: var(--gh-shadow-md);", preview: "shadow" },
      { varName: "--gh-shadow-lg", label: "Large", copy: "box-shadow: var(--gh-shadow-lg);", preview: "shadow" },
      { varName: "--gh-shadow-xl", label: "Extra large (bottom sheet)", copy: "box-shadow: var(--gh-shadow-xl);", preview: "shadow" },
      { varName: "--shadow", label: "Legacy card shadow", copy: "box-shadow: var(--shadow);", preview: "shadow" },
    ],
  },
  {
    title: "Glass surfaces",
    tokens: [
      { varName: "--gh-glass-bg", label: "Glass background", copy: "background: var(--gh-glass-bg);", preview: "none" },
      { varName: "--gh-glass-border", label: "Glass border", copy: "border: 1px solid var(--gh-glass-border);", preview: "none" },
      { varName: "--gh-glass-shadow", label: "Glass shadow", copy: "box-shadow: var(--gh-glass-shadow);", preview: "none" },
      { varName: "--gh-glass-blur", label: "Glass blur", copy: "backdrop-filter: var(--gh-glass-blur);", preview: "none" },
      { varName: "--gh-glass-radius", label: "Glass radius", copy: "border-radius: var(--gh-glass-radius);", preview: "none" },
    ],
  },
  {
    title: "Backdrop blur",
    tokens: [
      { varName: "--gh-blur-sm", label: "Small (6px)", copy: "backdrop-filter: var(--gh-blur-sm);", preview: "none" },
      { varName: "--gh-blur-md", label: "Medium (8px)", copy: "backdrop-filter: var(--gh-blur-md);", preview: "none" },
      { varName: "--gh-blur-lg", label: "Large (12px)", copy: "backdrop-filter: var(--gh-blur-lg);", preview: "none" },
    ],
  },
  {
    title: "Modal tokens",
    tokens: [
      { varName: "--gh-modal-overlay", label: "Overlay", copy: "background: var(--gh-modal-overlay);", preview: "none" },
      { varName: "--gh-modal-bg", label: "Modal background", copy: "background: var(--gh-modal-bg);", preview: "none" },
      { varName: "--gh-modal-border", label: "Modal border", copy: "border: var(--gh-modal-border);", preview: "none" },
      { varName: "--gh-modal-radius", label: "Modal radius", copy: "border-radius: var(--gh-modal-radius);", preview: "none" },
      { varName: "--gh-modal-shadow", label: "Modal shadow", copy: "box-shadow: var(--gh-modal-shadow);", preview: "none" },
      { varName: "--gh-modal-blur", label: "Modal backdrop blur", copy: "backdrop-filter: var(--gh-modal-blur);", preview: "none" },
    ],
  },
];

const ALL_SURFACE_VARS = SURFACE_GROUPS.flatMap((group) =>
  group.tokens.map((token) => token.varName),
);

function SurfacePreview({ kind, varName }: { kind: SurfaceToken["preview"]; varName: string }) {
  if (kind === "radius") {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          background: "var(--gh-orange)",
          borderRadius: `var(${varName})`,
        }}
      />
    );
  }
  if (kind === "shadow") {
    return (
      <div
        style={{
          width: 36,
          height: 36,
          background: "var(--gh-bg-surface)",
          border: "1px solid var(--gh-border-default)",
          borderRadius: "var(--gh-radius-sm)",
          boxShadow: `var(${varName})`,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: 36,
        height: 36,
        background: "var(--gh-bg-elevated)",
        border: "1px solid var(--gh-border-default)",
        borderRadius: "var(--gh-radius-sm)",
      }}
    />
  );
}

export function SurfaceSection() {
  const values = useTokenValues(ALL_SURFACE_VARS);

  return (
    <Section
      id="surface"
      title="Surface tokens"
      desc="Radii, shadows, blur and the glass/modal token families from globals.css. Radius and shadow rows render a live preview; every row copies a ready-to-paste declaration."
    >
      {SURFACE_GROUPS.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupLabel}>{group.title}</div>
          <div className={styles.tokenRows}>
            {group.tokens.map((token) => (
              <div key={token.varName} className={styles.tokenRow}>
                <div className={styles.tokenRowPreview}>
                  <SurfacePreview kind={token.preview} varName={token.varName} />
                </div>
                <div className={styles.tokenRowMeta}>
                  <span className={styles.swatchName}>{token.varName}</span>
                  <span className={styles.swatchLabel}>{token.label}</span>
                  <span className={styles.swatchValue}>{values[token.varName] || "—"}</span>
                </div>
                <CopyButton text={token.copy} />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className={styles.group}>
        <div className={styles.groupLabel}>Glass card example</div>
        <div
          style={{
            borderRadius: "var(--gh-glass-radius)",
            border: "1px solid var(--gh-glass-border)",
            background: "var(--gh-glass-bg)",
            backdropFilter: "var(--gh-glass-blur)",
            WebkitBackdropFilter: "var(--gh-glass-blur)",
            boxShadow: "var(--gh-glass-shadow)",
            padding: "18px 20px",
            color: "var(--gh-text-primary)",
            fontSize: "var(--font-sm)",
            maxWidth: 420,
          }}
        >
          Glass surface combining <code>--gh-glass-bg</code>,{" "}
          <code>--gh-glass-border</code>, <code>--gh-glass-blur</code> and{" "}
          <code>--gh-glass-shadow</code>.
        </div>
        <Snippet
          code={
            'style={{\n' +
            '  borderRadius: "var(--gh-glass-radius)",\n' +
            '  border: "1px solid var(--gh-glass-border)",\n' +
            '  background: "var(--gh-glass-bg)",\n' +
            '  backdropFilter: "var(--gh-glass-blur)",\n' +
            '  boxShadow: "var(--gh-glass-shadow)",\n' +
            '}}'
          }
        />
      </div>
    </Section>
  );
}
