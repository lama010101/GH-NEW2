"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Design System Gallery
// Route: /prototype/gallery   (direct access, fully self-contained)
//
// Showcases the GH-NEW2 design system:
// - Color tokens (--gh-* custom properties, live-resolved per theme)
// - Typography tokens (CSS var scale + Tailwind fontSize scale + font families)
// - Surface tokens (radii, shadows, blur, glass, modal)
// - Real components with variants and copyable usage examples
//
// All component demos use mock data. No Supabase, no auth, no network.
// Does NOT touch or import any existing app files (imports components only).
// ============================================================================

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ColorSection, TypographySection, SurfaceSection } from "./tokens";
import { ComponentDemos } from "./demos";
import styles from "./gallery.module.css";

const NAV = [
  { href: "#colors", label: "Colors" },
  { href: "#typography", label: "Typography" },
  { href: "#surface", label: "Surface" },
  { href: "#components", label: "Components" },
] as const;

export default function GalleryPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Design System Gallery</h1>
          <p className={styles.subtitle}>
            Tokens and components from GH-NEW2. Color and surface values are read
            live from the active theme — toggle dark/light to compare. Every
            example ships with a copyable usage snippet.
          </p>
          <nav className={styles.nav} aria-label="Gallery sections">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={styles.navChip}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <ThemeToggle />
      </header>

      <ColorSection />
      <TypographySection />
      <SurfaceSection />
      <ComponentDemos />
    </div>
  );
}
