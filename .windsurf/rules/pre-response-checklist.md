---
trigger: always_on
---

AI CODER — PRE-RESPONSE EXECUTION GATE (MANDATORY)
PURPOSE

Prevent:

fake validation
partial implementations
scope drift
silent violations

This runs BEFORE the coder outputs anything.

If ANY check fails → response MUST be BLOCKED / FAILED.

1. TASK UNDERSTANDING CHECK

You must confirm:

Target file is explicitly defined
Target function is explicitly defined
Behavior change is singular and clear

If ANY ambiguity exists →
→ BLOCKED: TASK NOT DETERMINISTIC

2. CODE VISIBILITY CHECK

You must have:

opened the target file
located the exact function
identified exact lines to modify

If not →
→ BLOCKED: CODE NOT VERIFIED

3. ATOMICITY CHECK

Confirm:

Only ONE file will be modified
Only ONE function will be modified
Only ONE behavior is changed

If not →
→ BLOCKED: NOT ATOMIC

4. ARCHITECTURE SAFETY CHECK

You must verify:

single source of truth is respected
no new state source introduced
no memory-only logic introduced
no cross-layer coupling introduced

If uncertain →
→ BLOCKED: ARCHITECTURE RISK

5. MIGRATION CHECK

You must identify:

existing logic handling same behavior
whether it will be removed or bypassed

If old + new logic coexist →
→ BLOCKED: DUAL LOGIC

6. DETERMINISM CHECK

You must confirm:

behavior depends only on DB + inputs
no hidden runtime dependency

If not →
→ BLOCKED: NON-DETERMINISTIC

7. SCOPE CONTROL CHECK

You must confirm you will NOT:

refactor
rename
optimize
fix unrelated issues

If tempted → ignore

If required →
→ BLOCKED: SCOPE VIOLATION

8. VALIDATION READINESS CHECK

Before coding, confirm you CAN prove:

grep for duplicate logic
one file modified
one function modified
old logic removed/unreachable

If proof cannot be produced →
→ BLOCKED: VALIDATION IMPOSSIBLE

9. OUTPUT COMPLIANCE CHECK

You must confirm you will provide:

grep command
file:line references
BEFORE / AFTER code
non-empty patch
validation results

If any missing →
→ BLOCKED: OUTPUT NON-COMPLIANT

10. FINAL GO / NO-GO

If ALL checks pass →
→ proceed with implementation

If ANY check fails →
→ DO NOT CODE

Output:

BLOCKED
<exact reason>
CRITICAL EFFECT (WHY THIS MATTERS)

This changes behavior drastically:

BEFORE (your current system)

Coder:

writes code
then tries to justify it
→ leads to fake validation and drift
AFTER (with this gate)

Coder:

must prove feasibility first
must prove safety first
→ bad tasks never execute
HARD TRUTH

Without this gate:
→ your system depends on coder discipline → fragile

With this gate:
→ your system enforces correctness before execution

What to expect after adding this

Immediate effects:

more “BLOCKED” responses (this is GOOD)
slower start
much higher correctness

If you don’t see more BLOCKED:
→ coder is still bypassing rules