# Historian's Journey — Product & Architecture Spec (v1)

**Mode name:** Historian's Journey (formerly "Level Up" working title — renamed, locked)
**Status:** DECIDED — v1 scope and all open architecture questions locked by CTO. Ready for coder prompts.
**Owner:** Lolo (product) / Claude (CTO, technical)
**Target environment:** Dev Supabase (`jfggdhsducvjydnejypg`) — reserved, per standing rule. Not PROD until v1 is validated and a promotion decision is made explicitly.
**Depends on:** existing scoring engine, XP engine, badge system, events table. Does NOT introduce a second scoring or XP system (per §7 architecture rule — one source of truth).

---

## 0. Decisions locked this revision (2026-08-11)

Lolo ruled on the five open questions from the prior revision. Four were delegated to CTO judgment; answers below, with reasoning, since these are expensive to reverse:

1. **Session architecture → Practice-mode-shaped, confirmed.** Journey reuses Practice mode's single-player session infra (no PartyKit, no realtime). This was already the CTO recommendation in the prior revision; nothing surfaced to change it. See §4.

2. **Content review mechanism → Admin UI.** You're already building `/admin/openrouter` for AI-model administration — Journey's stage-content review becomes a second panel in that same admin surface rather than a bespoke tool. Concretely: `/admin/journey` (or a tab within the existing admin shell), listing candidate pools per stage with approve/reject/reorder actions writing directly to `journey_stage_events`. This is now a v1 build item, not deferred — the pipeline in §3 doesn't function without it.

3. **Accuracy threshold curve → calculated, not guessed.** Requirement: monotonically increasing, generous early (per original doc's "generous scoring" principle for stage 1), converging toward a stricter-but-still-passable ceiling by stage 10 (not 100%, since a hard ceiling produces a wall rather than a curve). A non-linear (e.g. logistic) curve would need a product-chosen inflection point with no principled default — that's inventing precision, not calculating it. The defensible version: a **linear ramp between two product-judgment anchors** (floor and ceiling), stated plainly as a judgment call rather than dressed up as more rigorous than it is. Formula: `min_accuracy_pct(n) = 50 + 25 × (n-1)/9` for n = 1..10 — linear from 50% to 75%, see table below.

   | Stage | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
   |---|---|---|---|---|---|---|---|---|---|---|
   | min_accuracy_pct | 50% | 52.8% | 55.6% | 58.3% | 61.1% | 63.9% | 66.7% | 69.4% | 72.2% | 75% |

   Floor (50%) and ceiling (75%) are product judgment, not derived — flagging this honestly rather than presenting them as more rigorous than they are. If these anchors feel wrong once stage 1 is actually played, they're a one-column data change, not a re-architecture (thresholds live in `journey_stages.min_accuracy_pct`, not code).

4. **Player identity pattern → standard FK, NOT the AIP UNION pattern.** Checked the AIP precedent directly: UNION-at-read-time exists *specifically* because AI players have no `auth.users` row and `profiles.id` has a live FK to `auth.users(id)` that can't be faked with synthetic rows — so AI identity has to be assembled at read time instead. Journey players are real authenticated humans with real `profiles` rows. Applying the AIP pattern here would be solving a problem that doesn't exist and adding an unnecessary indirection layer. **Decision: `journey_player_progress.player_id` is a standard FK to `auth.users(id)` (or whatever the existing Practice-mode session player FK target is — must match exactly, confirmed at build time), same as every other single-player mode.** §4 data model updated accordingly.

5. **Dev→Prod promotion path → defined below.** Promotion is gated on the v1 "definition of done" in §2 being met *and* a content-quality bar, not just a technical-passing bar:
   - All 10 stages have approved (not just proposed) pools in `journey_stage_events`, reviewed through the admin UI in decision #2.
   - Full playthrough (stage 1→10, including at least one deliberate below-threshold failure and retry) verified on dev by CTO or Lolo, not just by the coder.
   - Standard protected-baseline / gate checks only apply if Journey touches any protected-baseline file (unlikely — it shouldn't touch `compete/**` at all, being Practice-shaped) — otherwise normal migration + `tsc`/`lint` gate.
   - Promotion itself = new migration replaying the approved schema + content onto prod (`gzvixlvkwjsrtmtybtkf`), following the same "target: PROD" standing-rule discipline as every other prod-touching prompt. Not a data copy from dev — a fresh migration, since dev is a working/review environment and its data shouldn't be assumed clean enough to copy wholesale.
   - No fixed calendar trigger — promotion happens when the above checklist is actually true, decided explicitly by Lolo, not automatically once v1 code merges.

---

## 0.1 What changed from the original draft, and why

The original document is a strong vision doc but is not buildable as-is: it specifies a 100-stage system, a skill-based alternate taxonomy, adaptive difficulty, collections, and a full progression/gating/badge system all at once, with no data model, no v1 cut, and no answer to how 100 stages of curated content actually get made. Shipping that as one task guarantees a multi-month build with no validation checkpoint — the opposite of how this project works (one task, verify, iterate).

This version:
- Locks a **v1 scope** (10 stages, 1 era) that proves the core loop — curation pipeline, gating, scoring reuse, badges, recap screen — before committing to 100 stages of content or any of the "future" features (adaptive difficulty, skill-taxonomy chapters, collections).
- Defines the **data model** explicitly, because none existed. Everything else — coder prompts, migrations, gating logic — depends on this being right first.
- Cuts scope that has no v1 justification: collections, skill-based chapter taxonomy, adaptive difficulty, personalized paths. These are noted as **Phase 2+**, not deleted — the vision doc's ideas are preserved below, just sequenced.
- Specifies the **content pipeline** (hybrid algorithmic-propose / human-approve) as an actual workflow with a review step, since "curated" alone isn't an implementable instruction.

If you disagree with any locked decision below, say so before this goes to a coder prompt — architecture decisions here (especially the data model) are expensive to reverse once stages exist in the DB.

---

## 1. Vision (unchanged from original)

The player is not "leveling up." The player is becoming a historian.

Rather than random historical events, Journey guides players through a curated expedition across history, teaching them to recognize historical clues, build intuition, and master increasingly difficult eras — rewarding observation, not memorization.

**Position in the product:** recommended first experience for new players.
Suggested order: **Historian's Journey → Daily Challenge → Practice → Compete (Rush/Relax)**.

**Success metrics** (unchanged, tracked from v1 launch):
- New-player completion of stage 1
- D1 / D7 return rate
- Transition rate into Daily Challenge and Compete
- Replay rate of completed stages
- Average historical accuracy over time, per player

---

## 2. v1 Scope (LOCKED)

**In scope for v1:**
- 10 sequential stages, single era arc: **Modern World** (1900–present). Chosen because it has the deepest pool of well-photographed, well-attributed, unambiguous events already in the events table — minimizes content-pipeline risk for a first cut.
- Linear unlock: complete stage N at the minimum threshold to unlock N+1. No skipping.
- Each stage: a curated pool of events (pool size TBD by content audit, §5), a subset drawn per playthrough.
- Scoring: 100% reuse of existing scoring engine. No Journey-specific scoring.
- XP: 100% reuse of existing XP engine. No Journey-specific XP rules.
- Badges: Gold/Silver/Bronze/Completion per stage, per the original thresholds (below), reusing the existing badge system's award/display plumbing, extended with a stage reference.
- Progression gate: minimum accuracy threshold per stage (single gate type only for v1 — no hint-usage cap yet, see §6).
- Recap/educational screen per event: reuses existing round-result UI (map, year, summary) — this already exists for other modes, so it's not new build, just reachable from this mode.
- Replay: completed stages replayable, random draw from the stage's pool each time.
- Journey progress UI: current stage, overall progress, completed stages list.

**Explicitly out of scope for v1** (deferred to Phase 2+, see §9):
- Stages 11–100 and all non-Modern-World eras.
- Collections (Ancient Egypt, Great Explorers, etc.)
- Skill-based chapter taxonomy ("Recognizing Architecture," etc.) as an organizing structure — may inform how events are *tagged*, but not a v1 navigation concept.
- Adaptive difficulty / personalized paths / weak-theme recommendations.
- Hint-usage caps as a gating dimension.
- Separate Titles or ranks — Journey contributes to existing global Titles only, no new rank system (this was already correctly scoped as "no" in the original doc; kept).

**Definition of done for v1:** a new player can play stages 1 through 10 in order, get gated on accuracy, see badges, see the recap screen, and replay a completed stage — end to end, on the dev Supabase project, with real curated content for all 10 stages (not placeholder events).

---

## 3. Content Pipeline (hybrid: algorithm proposes, human approves)

This is the part the original doc left completely unspecified. Locking the workflow:

1. **Tagging pass (algorithmic):** existing `events` table rows get scored/tagged against stage-relevant metadata — era bucket, geographic region, "iconicity" proxy (existing fame/difficulty signals if present in the eval-dataset work, or a simple heuristic if not), image ambiguity proxy. Output: a candidate pool per stage, oversized (e.g. 3–5x the target pool size).
2. **Human review (Lolo):** reviews each stage's candidate pool, approves/rejects/reorders. This is a UI or spreadsheet export — not yet decided, flagged as an open question in §10.
3. **Approved pool → `journey_stage_events` table** (see data model). This is the actual pool a stage draws from at play time.
4. **Re-review trigger:** if the underlying `events` table changes (new events added, existing ones edited/removed), the affected stage pools need a re-check — not automatic, but must be a documented manual step, not silently stale.

This pipeline itself is a v1 build item (a script + a review mechanism), not a one-time manual curation exercise — because Phase 2 (stages 11–100) will run this same pipeline repeatedly.

---

## 4. Data Model (NEW — did not exist in original doc)

All new tables, additive, on the **dev Supabase project**. Naming follows existing snake_case convention. Exact column types to be confirmed against existing `events`/`ai_answer_bank`-style conventions before migration is written — this is the intended shape, not final DDL.

```
journey_stages
  id                  uuid PK
  stage_number        int, unique, 1-indexed, sequential, no gaps (v1: 1-10)
  title               text
  theme               text
  learning_objective  text
  difficulty_rating   int (1-10 or similar scale — TBD)
  min_accuracy_pct    numeric   -- progression gate threshold
  pool_size           int       -- how many events drawn per playthrough
  status              text      -- draft | approved | live (supports the pipeline in §3)
  created_at, updated_at

journey_stage_events
  id                  uuid PK
  stage_id            uuid FK -> journey_stages
  event_id            uuid FK -> events (existing table)
  approved_by         text/uuid  -- who approved this event for this stage
  approved_at         timestamptz
  UNIQUE (stage_id, event_id)

journey_player_progress
  id                  uuid PK
  player_id           uuid FK -> auth.users(id)   -- standard FK, NOT the AIP UNION pattern (see §0.4: Journey players are real auth users, AIP's pattern solves a different problem)
  stage_id            uuid FK -> journey_stages
  status              text      -- locked | unlocked | completed
  best_accuracy_pct   numeric   -- best attempt, for badge display
  best_badge          text      -- gold | silver | bronze | completion | null
  attempts_count      int
  first_completed_at  timestamptz
  last_played_at      timestamptz
  UNIQUE (player_id, stage_id)

journey_playthroughs
  id                  uuid PK
  player_id           uuid FK
  stage_id            uuid FK
  session_id          uuid      -- if journey play reuses existing session/round infra, FK to that; TBD in §6
  accuracy_pct         numeric
  badge_awarded        text
  xp_awarded           int       -- denormalized for audit; source of truth is still the XP engine's own ledger
  completed_at          timestamptz
```

**Locked (§0.1):** Journey reuses Practice mode's existing `sessions`/`round_results` infrastructure — single-player, no PartyKit/realtime. `journey_playthroughs.session_id` FKs into that existing session table rather than Journey maintaining a parallel result store. This keeps scoring/XP/round-result plumbing fully shared, per the single-source-of-truth principle applied everywhere else in this project (§7 architecture rule). Exact FK target table name to be confirmed against current schema at build time (investigation-phase task, not a design decision).

---

## 5. Difficulty Progression (v1: within Modern World only)

The original doc's dimensions still apply, scoped down to what's achievable within one era for 10 stages:

- **Image ambiguity:** early stages favor iconic, unambiguous photos; later stages (7–10) can include less globally famous but still well-attributed Modern World events.
- **Time pressure:** generous timers early, tightening by stage 10, within whatever timer bounds already exist for Practice mode (reuse `TIMER_MIN_SEC` and existing constants — do not introduce a new timer constant, per §7 architecture rule).
- **Accuracy threshold:** `min_accuracy_pct` increases stage-over-stage per the locked curve in §0.4 (linear, 50% → 75% across stages 1–10).
- Geography and cultural-similarity dimensions are **not meaningfully exercisable within a single era** — deferred to Phase 2 when additional eras exist.

## 6. Progression Gates (v1)

Each stage defines:
- `min_accuracy_pct` — required to mark the stage completed and unlock the next.
- Completion requirement — finish all events in the playthrough's drawn set.

**Not in v1:** max-hint-usage as a gate. The original doc listed this as "(optional)" — treating it as deferred rather than ambiguous.

**Failure handling** (per original doc, kept as-is — this is good UX thinking and cheap to build since it reuses the recap screen):
- Below-threshold attempts still show the recap/educational screen per event (correct answers, key clues, map).
- Player can retry immediately.
- No punitive lockout, no XP penalty beyond simply not unlocking the next stage.

## 7. Badges (v1 — thresholds kept from original doc)

| Badge | Threshold |
|---|---|
| Gold | ≥100% (or defined perfect threshold) |
| Silver | 95–99% |
| Bronze | 90–94% |
| Completion | below Bronze, but meets `min_accuracy_pct` |

Reuses the existing badge system (per `BADGE_SYSTEM.md`) — Journey badges are a new badge *category* referencing `stage_id`, not a new badge engine. Exact integration point TBD against current `BADGE_SYSTEM.md` schema — flagged for the coder's investigation phase, not decided here.

## 8. XP and Titles (unchanged from original, correctly scoped)

- XP: existing XP engine only. Higher stages naturally yield more XP through difficulty, not through a Journey-specific multiplier.
- Titles: Journey completions feed into existing global Titles. No Journey-specific rank system.

---

## 9. Phase 2+ (explicitly deferred, not deleted)

Preserved from the original vision doc for future planning — none of this is scoped or estimated yet:

- Stages 11–100, remaining era arcs (Cold War → Early Human History, per original's illustrative Journey Map).
- **Skill-based chapter taxonomy** ("Recognizing Architecture," "Reading Military Uniforms," "Following Trade Routes," "Understanding Empires," "Identifying Industrialization") as an organizing layer over the mostly-chronological spine — the original doc's own recommended compromise (mostly chronological, occasional skill-focused chapters). This is a good idea; it's deferred because it multiplies the tagging/content-pipeline complexity and shouldn't be designed until the v1 pipeline is proven.
- Collections spanning modes (Ancient Egypt, Great Explorers, Revolutions, Scientific Discoveries).
- Adaptive difficulty: weak-theme replay recommendations, mistake-pattern identification, personalized paths.
- Naming decision: original doc's shortlist (Historian's Journey, Chronicles, Path of History, History Expedition, Journey Through Time, Master Historian, The Archive, Historical Odyssey) — not decided here, product-owner call, non-blocking for technical build.

---

## 10. Remaining Build-Time Investigation Items (not open product decisions — confirm-at-build only)

These are not undecided; they're facts to verify against current schema before writing migrations, per the standing rule "never trust a remembered/spec'd value — grep and confirm":

1. Exact FK target for Practice-mode's session/round-result tables (§4) — confirm current table names.
2. Exact column shape of `BADGE_SYSTEM.md`'s existing badge tables, to confirm how a `stage_id`-referencing badge category integrates (§7).
3. Whether `/admin/openrouter`'s existing shell/auth pattern can be extended directly for the `/admin/journey` review panel (§0.2), or needs its own route group.

---

*This spec supersedes the original "Historian's Journey" vision doc for build purposes. The original remains the reference for Phase 2+ ideas and overall product philosophy. All architecture decisions in §0 are locked — next step is an investigation-phase coder prompt (Devin Cloud, low-to-medium thinking) to confirm the items in §10 against live schema before the first migration is written.*
