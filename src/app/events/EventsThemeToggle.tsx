"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEME_COOKIE, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import styles from "./events.module.css";

const THEME_MAX_AGE = 60 * 60 * 24 * 365;

function readSavedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const local = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (local === "light" || local === "dark") return local;
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(THEME_COOKIE + "="))
    ?.split("=")[1]
    ?.trim();
  return cookie === "light" || cookie === "dark" ? cookie : null;
}

/**
 * Light/dark toggle for the events pages. Fixed English labels ("Light" /
 * "Dark") and defaults to light when no saved preference exists. Persists via
 * the same gh_theme cookie + localStorage keys as the global useTheme hook.
 */
export function EventsThemeToggle() {
  const tNav = useTranslations("nav");
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const resolved = readSavedTheme() ?? "light";
    setThemeState(resolved);
    document.documentElement.setAttribute("data-theme", resolved);
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; Max-Age=${THEME_MAX_AGE}; Path=/; SameSite=Lax`;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable — cookie is still authoritative */
    }
  }, []);

  return (
    <div className={styles.themeToggle} role="group" aria-label={tNav("theme")}>
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          aria-pressed={theme === t}
          disabled={!mounted}
          className={`${styles.themeOption} ${theme === t ? styles.themeOptionActive : ""}`}
        >
          {t === "light" ? <Sun size={14} /> : <Moon size={14} />}
          {tNav(t === "light" ? "light" : "dark")}
        </button>
      ))}
    </div>
  );
}
