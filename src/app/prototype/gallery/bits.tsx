"use client";

import { useState, type ReactNode } from "react";
import styles from "./gallery.module.css";

/** Clipboard button with transient "Copied!" state. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (non-secure context) — textarea fallback.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button type="button" className={styles.copyBtn} onClick={copy}>
      {copied ? "Copied!" : label}
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
