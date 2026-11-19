"use client";

import { useState, type ReactNode } from "react";
import styles from "./gallery.module.css";

/** Clipboard button with transient "Copied!" state. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const flash = (next: "copied" | "failed") => {
    setState(next);
    setTimeout(() => setState("idle"), 1500);
  };

  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard API unavailable (non-secure context) — textarea fallback.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      try {
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    flash(ok ? "copied" : "failed");
  };

  return (
    <button type="button" className={styles.copyBtn} onClick={copy}>
      {state === "copied" ? "Copied!" : state === "failed" ? "Failed" : label}
    </button>
  );
}

/** Dark code panel with a copy button. */
export function Snippet({ code }: { code: string }) {
  return (
    <div className={styles.codePanel}>
      <CopyButton text={code} />
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Section wrapper with anchor id, title and description. */
export function Section({
  id,
  title,
  desc,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {desc && <p className={styles.sectionDesc}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/** One component showcase: title, live preview, copyable usage snippet. */
export function Demo({
  title,
  desc,
  code,
  full = false,
  children,
}: {
  title: string;
  desc?: string;
  code: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.demo} ${full ? styles.demoFull : ""}`}>
      <div>
        <h3 className={styles.demoTitle}>{title}</h3>
        {desc && <p className={styles.demoDesc}>{desc}</p>}
      </div>
      <div className={styles.preview}>{children}</div>
      <Snippet code={code} />
    </div>
  );
}
