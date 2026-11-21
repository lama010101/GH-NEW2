"use client";

import { useState } from "react";
import btnStyles from "@/components/ui/Button.module.css";
import modalStyles from "@/components/ui/Modal.module.css";
import { Toggle } from "@/components/home/Toggle";
import WhereIcon from "@/components/icons/WhereIcon";
import WhenIcon from "@/components/icons/WhenIcon";
import BrandMark from "@/components/brand/BrandMark";
import PlayerAvatar from "@/components/compete/PlayerAvatar";
import RankCard from "@/components/RankCard";
import ExperienceAccuracy, {
  type ExperienceAccuracyData,
} from "@/components/ExperienceAccuracy";
import { YearPicker } from "@/components/YearPicker";
import { Demo, Section, Snippet } from "./bits";
import styles from "./gallery.module.css";

// ── Mock data for data-driven components ────────────────────────────────────

const EXPERIENCE_DATA: ExperienceAccuracyData = {
  eventsSeenCount: 342,
  countriesCount: 28,
  roundsPlayed: 138,
  byWhen: [
    { label: "1900s", avgAccuracy: 88, totalXp: 45200, roundCount: 41 },
    { label: "1800s", avgAccuracy: 74, totalXp: 31800, roundCount: 33 },
    { label: "1700s", avgAccuracy: 61, totalXp: 12900, roundCount: 22 },
  ],
  byWhere: [
    { label: "Europe", avgAccuracy: 91, totalXp: 52100, roundCount: 48 },
    { label: "Asia", avgAccuracy: 76, totalXp: 27400, roundCount: 29 },
    { label: "Africa", avgAccuracy: 58, totalXp: 9800, roundCount: 17 },
  ],
};

// ── Stateful demo wrappers ──────────────────────────────────────────────────

function ToggleDemo() {
  const [on, setOn] = useState(false);
  return <Toggle on={on} onClick={() => setOn((value) => !value)} />;
}

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={() => setOpen(true)}
        style={{ padding: "8px 16px", fontSize: "var(--font-sm)" }}
      >
        Open modal
      </button>
      {open && (
        <div className={modalStyles.overlay} onClick={() => setOpen(false)}>
          <div
            className={modalStyles.modal}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 8px", color: "var(--gh-modal-text-primary)" }}>
              Modal title
            </h3>
            <p style={{ margin: "0 0 16px", color: "var(--gh-modal-text-secondary)", fontSize: "var(--font-sm)" }}>
              Modal surface built from the --gh-modal-* token family.
            </p>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function YearPickerDemo() {
  const [year, setYear] = useState(1969);
  return (
    <div style={{ width: "100%" }}>
      <YearPicker value={year} onChange={setYear} valueIsCommitted />
    </div>
  );
}

// ── Gallery section ─────────────────────────────────────────────────────────

export function ComponentDemos() {
  return (
    <Section
      id="components"
      title="Components"
      desc="Real components from src/components rendered with mock data. Each block pairs a live preview with a copyable usage example."
    >
      <div className={styles.demoGrid}>
        <Demo
          title="Button"
          desc="src/components/ui/Button.module.css — primary / secondary / disabled. Used by the compete pages."
          code={
            'import btnStyles from "@/components/ui/Button.module.css";\n\n' +
            '<button className={\`\${btnStyles.btn} \${btnStyles.primary}\`}>Play</button>\n' +
            '<button className={\`\${btnStyles.btn} \${btnStyles.secondary}\`}>Cancel</button>\n' +
            '<button className={\`\${btnStyles.btn} \${btnStyles.primary}\`} disabled>Disabled</button>'
          }
        >
          <button type="button" className={`${btnStyles.btn} ${btnStyles.primary}`}>
            Play
          </button>
          <button type="button" className={`${btnStyles.btn} ${btnStyles.secondary}`}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btnStyles.btn} ${btnStyles.primary}`}
            disabled
          >
            Disabled
          </button>
        </Demo>

        <Demo
          title="Toggle"
          desc="src/components/home/Toggle.tsx — binary on/off switch."
          code={
            '"use client";\n' +
            'import { useState } from "react";\n' +
            'import { Toggle } from "@/components/home/Toggle";\n\n' +
            'const [on, setOn] = useState(false);\n' +
            "<Toggle on={on} onClick={() => setOn((v) => !v)} />"
          }
        >
          <ToggleDemo />
        </Demo>

        <Demo
          title="Icons — Where / When"
          desc="src/components/icons — inline SVG, currentColor, configurable size and stroke."
          code={
            'import WhereIcon from "@/components/icons/WhereIcon";\n' +
            'import WhenIcon from "@/components/icons/WhenIcon";\n\n' +
            "<WhereIcon size={24} />\n" +
            "<WhenIcon size={24} />"
          }
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--gh-blue)" }}>
            <WhereIcon size={28} />
            <span style={{ fontSize: "var(--font-sm)" }}>WHERE</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--gh-violet)" }}>
            <WhenIcon size={28} />
            <span style={{ fontSize: "var(--font-sm)" }}>WHEN</span>
          </span>
        </Demo>

        <Demo
          title="BrandMark"
          desc="src/components/brand/BrandMark.tsx — flat vector symbol; full and micro variants."
          code={
            'import BrandMark from "@/components/brand/BrandMark";\n\n' +
            '<BrandMark size={48} />\n' +
            '<BrandMark size={24} variant="micro" />'
          }
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
            <BrandMark size={24} />
            <BrandMark size={48} />
            <BrandMark size={96} />
          </span>
        </Demo>

        <Demo
          title="PlayerAvatar"
          desc="src/components/compete/PlayerAvatar.tsx — initials fallback, deterministic frame color from playerId."
          code={
            'import PlayerAvatar from "@/components/compete/PlayerAvatar";\n\n' +
            "<PlayerAvatar\n" +
            '  avatarUrl={null}\n' +
            '  displayName="Ada Lovelace"\n' +
            '  playerId="player-123"\n' +
            "  size={56}\n" +
            "  disableProfileNavigation\n" +
            "/>"
          }
        >
          <PlayerAvatar
            avatarUrl={null}
            displayName="Ada Lovelace"
            playerId="gallery-demo"
            size={56}
            disableProfileNavigation
          />
          <PlayerAvatar
            avatarUrl={null}
            displayName="Grace Hopper"
            playerId="gallery-demo-2"
            size={40}
            disableProfileNavigation
          />
        </Demo>

        <Demo
          title="RankCard"
          desc="src/components/RankCard.tsx — medallion, title, XP, next-rank line and progress; derives everything from totalXp via rankForXp."
          code={
            'import RankCard from "@/components/RankCard";\n\n' +
            "<RankCard totalXp={124800} open inline />"
          }
        >
          <div style={{ width: "100%" }}>
            <RankCard totalXp={124800} open inline />
          </div>
        </Demo>

        <Demo
          title="ExperienceAccuracy"
          desc="src/components/ExperienceAccuracy.tsx — experience + accuracy breakdown cards with WHEN/WHERE tabs and XP bars."
          code={
            'import ExperienceAccuracy, {\n' +
            "  type ExperienceAccuracyData,\n" +
            '} from "@/components/ExperienceAccuracy";\n\n' +
            "const data: ExperienceAccuracyData = {\n" +
            "  eventsSeenCount: 342,\n" +
            "  countriesCount: 28,\n" +
            "  roundsPlayed: 138,\n" +
            "  byWhen: [\n" +
            '    { label: "1900s", avgAccuracy: 88, totalXp: 45200, roundCount: 41 },\n' +
            "  ],\n" +
            "  byWhere: [\n" +
            '    { label: "Europe", avgAccuracy: 91, totalXp: 52100, roundCount: 48 },\n' +
            "  ],\n" +
            "};\n\n" +
            "<ExperienceAccuracy data={data} />"
          }
          full
        >
          <div style={{ width: "100%" }}>
            <ExperienceAccuracy data={EXPERIENCE_DATA} />
          </div>
        </Demo>

        <Demo
          title="YearPicker"
          desc="src/components/YearPicker.tsx — three-tier century/decade/year scroller."
          code={
            '"use client";\n' +
            'import { useState } from "react";\n' +
            'import { YearPicker } from "@/components/YearPicker";\n\n' +
            "const [year, setYear] = useState(1969);\n" +
            "<YearPicker value={year} onChange={setYear} valueIsCommitted />"
          }
          full
        >
          <YearPickerDemo />
        </Demo>

        <Demo
          title="Modal shell"
          desc="src/components/ui/Modal.module.css — overlay + modal surface from the --gh-modal-* tokens."
          code={
            'import modalStyles from "@/components/ui/Modal.module.css";\n\n' +
            "{open && (\n" +
            "  <div className={modalStyles.overlay} onClick={onClose}>\n" +
            "    <div className={modalStyles.modal}>\n" +
            "      {/* modal content */}\n" +
            "    </div>\n" +
            "  </div>\n" +
            ")}"
          }
        >
          <ModalDemo />
        </Demo>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>Global utility classes (src/app/globals.css)</div>
        <div className={styles.demoGrid}>
          <Demo
            title="Card & badge"
            desc=".card / .hero surfaces and the .badge pill from globals.css."
            code={
              '<div className="card">\n' +
              "  <h2>Card title</h2>\n" +
              "  <p>Card body on --gh-bg-surface.</p>\n" +
              "</div>\n\n" +
              '<span className="badge">Badge</span>'
            }
          >
            <div
              className="card"
              style={{ width: "100%", maxWidth: 320 }}
            >
              <h2 style={{ fontSize: "var(--font-lg)" }}>Card title</h2>
              <p style={{ fontSize: "var(--font-sm)" }}>
                Card body on --gh-bg-surface with --gh-border-default.
              </p>
            </div>
            <span className="badge">Badge</span>
          </Demo>

          <Demo
            title="Metric & progress"
            desc=".metric stat block and .progress bar from globals.css."
            code={
              '<div className="metric">\n' +
              "  <span>Accuracy</span>\n" +
              "  <strong>87%</strong>\n" +
              "</div>\n\n" +
              '<div className="progress">\n' +
              '  <span style={{ width: "62%" }} />\n' +
              "</div>"
            }
          >
            <div style={{ width: "100%", maxWidth: 320 }}>
              <div className="metric">
                <span style={{ fontSize: "var(--font-xs)" }}>Accuracy</span>
                <strong>87%</strong>
              </div>
            </div>
            <div style={{ width: "100%", maxWidth: 320 }}>
              <div className="progress">
                <span style={{ width: "62%" }} />
              </div>
            </div>
          </Demo>

          <Demo
            title="Field & input"
            desc=".field label wrapper and .input control from globals.css."
            code={
              '<div className="field">\n' +
              "  <label htmlFor=\"name\">Display name</label>\n" +
              '  <input id="name" className="input" placeholder="Historian" />\n' +
              "</div>"
            }
          >
            <div className="field" style={{ width: "100%", maxWidth: 320 }}>
              <label htmlFor="gallery-name">Display name</label>
              <input
                id="gallery-name"
                className="input"
                placeholder="Historian"
                defaultValue="Ada Lovelace"
              />
            </div>
          </Demo>
        </div>
      </div>

      <Snippet
        code={
          "// Accuracy-driven color scale — src/core/accuracyColor.ts\n" +
          "getAccuracyColor(88) // >=85 → var(--gh-success)\n" +
          "getAccuracyColor(74) // >=60 → var(--gh-gold)\n" +
          "getAccuracyColor(45) // >=40 → var(--gh-orange)\n" +
          "getAccuracyColor(10) // else  → var(--gh-danger)"
        }
      />
    </Section>
  );
}
