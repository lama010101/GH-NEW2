This implementation plan outlines the development of the **Guess-History** core game based on the provided Master Specification. The project follows a deterministic, single-player architecture with strict separation between accuracy and reward systems.

---

## Phase 1: Core Architecture & State Model
Establish the foundational "Core Docs" layer. State mutation is strictly prohibited outside of this contract.

* **State Machine Implementation**: Define the `STATE_LIFECYCLE` to manage transitions between `INIT`, `PREFLIGHT_CHECK`, `ROUND_ACTIVE`, and `SESSION_COMPLETE`.
* **Data Structures**: Create the `STATE_MODEL` to house session, round, and player objects independently.
* **Scoring Separation**: Architect the `EVALUATE_ANSWER` function to output two distinct, non-interchangeable values: **Accuracy (%)** and **XP (points)**.

---

## Phase 2: Initialization & Preflight
The system must ensure environmental readiness before the first round is triggered.

### Preflight Checklist (Blocking)
* **Connectivity & Storage**: Verify access to the backend and local storage availability.
* **Event Selection Engine**: 
    * Fetch exactly **5 events** per session.
    * Apply `REPEAT_PROTECTION_BUFFER` (last 500 events) to ensure variety.
    * Validate that no duplicates exist within the selected set.
* **Asset Pipeline**: Implement preloading for the next round's assets during the current round to prevent delay.

---

## Phase 3: Round Logic & Input Systems
This phase focuses on the interactive "Guess" loop and non-negotiable gameplay constraints.

### The Round Loop
1.  **Cinematic Reveal**: Execute the automated pan/zoom reveal (5 seconds default).
2.  **Input Window**: Enable the year slider and location map.
    * **Constraint**: No default values for the year slider or map marker.
    * **Constraint**: Map markers are placed via click/tap only—no dragging.
3.  **Submission**:
    * **Manual**: Requires both year and location inputs.
    * **Timeout**: Automatically trigger `ROUND_LOCK` when the timer hits zero; treat missing inputs as absent.

### Timer Management
* Implement a non-pausable timer ranging from 5 to 300 seconds.
* Ensure the timer remains visible but is logic-isolated from the input UI.

---

## Phase 4: Evaluation & Hint Engine
Pure logic functions process the user's input against the event metadata.

* **Accuracy Calculation**: Determine the geometric and chronological distance between the guess and the event.
* **XP Calculation**: Assign rewards based on performance, applying `HINT_TOTAL` and `MAX_HINT_PENALTY` where applicable.
* **Hint Dependency Logic**: Structure the hint system so specific hints are locked until their prerequisites are used.

---

## Phase 5: UI/UX & System Integration
Finalizing the visual shell and persistent behavior.

### Presentation Layer
* **Theming**: Support Light and Dark modes with a theme-configurable **Orange** primary color for CTAs and progress indicators.
* **Localization**: Implement independent toggles for UI Language and Content Language.
* **Viewport**: Ensure 100% width/height responsive layout with explicit scroll control.

### Persistence
* **Atomic Saves**: Store round results immediately after evaluation.
* **Session Recovery**: Implement local storage hooks to allow game resumption after an unexpected close.

---

## Phase 6: Quality Assurance (Hard Constraints)
Audit the build against the "Non-Negotiable" constraints.

| Feature | Audit Requirement |
| :--- | :--- |
| **Submission** | Verify no partial manual submissions are allowed. |
| **Automation** | Ensure user must manually advance between rounds. |
| **State** | Confirm zero state mutation occurs outside the core contract. |
| **Images** | Verify no image cropping occurs; use overflow instead. |

Which specific system layer (State, Evaluation, or UI) would you like to detail further for the first sprint?