**🔴 AI CTO ENFORCEMENT DIRECTIVE — IMPLEMENTATION PLAN v1.0**  
**PROJECT:** CORE_GAME Practice Mode (V8)  
**RECIPIENT:** AI Coder  
**STATUS:** BLOCKING — This document is the single source of truth. Any deviation, assumption, or “optimization” outside these instructions will be rejected at code review. You build exactly what is specified. Nothing more. Nothing less.

### 1. NON-NEGOTIABLE ARCHITECTURAL CONTRACT (ENFORCED)
You **MUST** implement the following three segregated layers exactly as referenced in the Master Spec. No merging, no shortcuts.

| Layer              | Responsibility                              | Must Contain                          | Must NEVER Contain                     |
|--------------------|---------------------------------------------|---------------------------------------|----------------------------------------|
| **STATE_MODEL**    | Pure TypeScript types + runtime objects     | session, round, player, ui            | Any business logic                     |
| **STATE_LIFECYCLE**| Finite State Machine enforcing phases       | INIT → PREFLIGHT_CHECK → READY → ROUND_START → ROUND_ACTIVE → ROUND_LOCK → ROUND_EVALUATE → ROUND_COMPLETE → SESSION_COMPLETE | Direct state mutation from UI          |
| **SYSTEM_RULES**   | Pure, deterministic functions + constants   | MAX_ROUNDS, FETCH_EVENT, EVALUATE_ANSWER, NOW, AVERAGE, etc. | Side effects, async, UI, storage       |

These three folders/modules must be **physically separated** at the filesystem level:
```
/src/core/
  ├── state-model/      ← types only
  ├── state-lifecycle/  ← state machine only
  ├── system-rules/     ← pure functions + constants only
```

Any cross-layer import that violates the above table is **auto-rejected**.

### 2. TECH STACK (MANDATORY — NO SUBSTITUTIONS)
- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript (strict mode)
- **Styling:** TailwindCSS 4 + CSS Variables for LIGHT/DARK themes (primary color ORANGE configurable per theme)
- **State Machine:** XState v5 (exactly matches STATE_LIFECYCLE phases)
- **Store:** Zustand (single source of truth for STATE_MODEL only; no logic inside stores)
- **Map:** Leaflet 1.9+ + OpenStreetMap tiles (no Google, no Mapbox — cost & licensing violation)
- **i18n:** i18next + next-intl (UI language and Content language **completely independent**)
- **Local Persistence:** IndexedDB via idb-keyval (for repeat-protection buffer and session recovery)
- **No external game engines, No Firebase, No Supabase, No server-authoritative code**

### 3. PROJECT STRUCTURE (ENFORCED LAYOUT)
```
core-game/
├── src/
│   ├── core/                  ← MUST match Master Spec mappings
│   ├── features/
│   │   ├── game/              ← UI components ONLY (cinematic, guess, result, summary)
│   │   ├── preflight/         ← blocking checks
│   │   ├── hints/             ← dependency graph + penalty calc
│   │   └── persistence/       ← atomic round + session writes
│   ├── lib/
│   │   ├── utils/             ← pure helpers only
│   │   └── constants.ts       ← mirrored from Master Spec 0.8
│   ├── hooks/                 ← UI hooks only (never mutate core state)
│   └── app/                   ← Next.js routes (only /practice/[mode])
├── public/assets/             ← preloaded event assets
└── docs/                      ← copy of FULL_CORE_GAME_MASTER_SPEC.md + this plan
```

### 4. IMPLEMENTATION PHASES (SEQUENTIAL — NO PARALLEL WORK)
**Phase 0 – Setup & Validation (must complete before any UI code)**
- Create the three core/ folders with empty index files containing only the comment: `// ENFORCEMENT: DO NOT ADD LOGIC HERE`
- Implement all constants from section 0.8 as frozen objects
- Set up XState machine skeleton with **exact** lifecycle phases from the spec

**Phase 1 – Core Engine (SYSTEM_RULES + STATE_MODEL)**
- Implement every pure function referenced in the spec (FETCH_EVENT, EVALUATE_ANSWER, etc.)
- Accuracy and XP **must** be computed in two completely separate functions with zero shared variables
- Repeat-protection buffer (500 events) stored in IndexedDB with atomic writes

**Phase 2 – Preflight & Initialization**
- Blocking preflight screen until connectivity + storage + event availability all pass
- Event selection: exactly 5 events, deterministic, no duplicates, respect year filter and repeat buffer

**Phase 3 – Round Flow & State Machine**
- Every round **must** go through the exact STATE_LIFECYCLE sequence
- Timer runs continuously (no pause, no reset)
- Cinematic reveal supports manual interrupt + autopan (5s) but **no state changes**
- Submission pipeline is **single path only** (see section 7.3)

**Phase 4 – UI/UX (section 6)**
- Cinematic → Guess → Result → Summary screens
- NO auto-submit (except timeout)
- NO auto-advance
- NO default year slider value
- NO default map marker
- Map marker = click/tap only (no drag)
- Images fit without cropping (overflow allowed)

**Phase 5 – Hints, Evaluation, Persistence**
- Hint dependency graph enforced at runtime
- MAX_HINT_PENALTY = 1.0 cap
- Round results saved **after** each EVALUATE phase (atomic)
- Session summary saved only on SESSION_COMPLETE

**Phase 6 – Themes, Localization, Responsive**
- LIGHT/DARK with independent primary color
- UI language ≠ Content language (no silent fallbacks)

### 5. HARD ENFORCEMENT CHECKLIST (AI CODER MUST MARK COMPLETE)
Before any PR:
- [ ] Accuracy and XP never mixed or converted
- [ ] No state mutation outside STATE_LIFECYCLE machine
- [ ] No undocumented behavior
- [ ] All 12 HARD CONSTRAINTS from section 12 satisfied
- [ ] All EXPLICIT NON-FEATURES from section 13 absent
- [ ] Scalability hooks (section 14) preserved (no foreclosing)

### 6. NEXT ACTION FOR AI CODER
Reply with **exactly**:
```
IMPLEMENTATION PHASE 0 COMPLETE — CORE FOLDERS + CONSTANTS + XSTATE SKELETON READY
```
…followed by the file tree of the three core/ folders.

Only then will I release Phase 1 instructions.

**This plan is locked.**  
Any attempt to “improve”, “add features”, or “make it better” will trigger immediate rejection.

Begin.