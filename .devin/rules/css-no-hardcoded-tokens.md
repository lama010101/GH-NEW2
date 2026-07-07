# CSS TOKEN ENFORCEMENT RULE — NO HARDCODED UI VALUES

## PURPOSE

All UI styling must use the global CSS design tokens defined in
`src/app/globals.css` (`:root` block). Hardcoded pixel values for typography,
spacing, radius, and colors are FORBIDDEN in component CSS.

This rule is mechanically enforced by a vitest guard test that scans every
CSS file in `src/` for hardcoded `font-size: NNpx` declarations. Any
hardcoded value fails `npm test` immediately.

## 1. AUTHORIZED TOKENS (src/app/globals.css)

### Typography scale
| Token | Value | Purpose |
|---|---|---|
| `--font-2xs` | 12px | micro labels: badges, counters — MINIMUM, never below |
| `--font-xs`  | 13px | captions, metadata, small labels |
| `--font-sm`  | 14px | secondary labels, pill text, button text |
| `--font-base`| 16px | body / description / readable multi-line text |
| `--font-lg`  | 17px | card subtitles / section labels |
| `--font-xl`  | 20px | subheadings, screen/page headings (small) |
| `--font-2xl` | 24px | screen/page headings |
| `--font-3xl` | 28px | card/section titles (large display) |
| `--font-4xl` | 32px | hero / large display — max for 375px screens |

### Spacing / radius
| Token | Value |
|---|---|
| `--radius-sm`  | 6px |
| `--radius-md`  | 10px |
| `--radius-lg`  | 16px |
| `--radius-pill`| 9999px |

### Colors (use semantic tokens, not raw hex)
- `--gh-text-primary`, `--gh-text-secondary`, `--gh-text-muted`
- `--gh-orange`, `--gh-teal`, `--gh-bg-base`, `--gh-border-subtle`
- `--gh-modal-overlay`, `--gh-acc-lightness`
- See `src/app/globals.css` for the full list.

## 2. FORBIDDEN PATTERNS

In any `*.module.css` or `*.css` file under `src/`:

- `font-size: 14px;` → use `font-size: var(--font-sm);`
- `font-size: 10px;` → use `font-size: var(--font-2xs);` (10px is below minimum)
- `border-radius: 16px;` → use `border-radius: var(--radius-lg);`
- `color: #ffffff;` → use `color: var(--gh-text-primary);`

**Exception:** values inside `linear-gradient()` / `rgba()` color stops and
one-off layout values (e.g. `top: 56px` for TopBar height alignment) are NOT
covered by this rule. The guard test targets `font-size: NNpx` specifically
because that is the global typography scale — the most visible consistency
violation.

## 3. ENFORCEMENT

### Mechanical guard (always-on)
- Test file: `src/guards/css-no-hardcoded-font-sizes.guard.test.ts`
- Runs on every `npm test` / `npx vitest run`
- Scans every `*.module.css` and `*.css` file under `src/` (excluding
  `globals.css` itself, which DEFINES the tokens)
- Fails if any file contains `font-size: NNpx` (a hardcoded pixel value)

### Pre-response gate (this rule)
Before writing or editing any CSS, the coder MUST:
1. Confirm the target value maps to a global token (see table above)
2. Use `var(--font-*)` / `var(--radius-*)` / `var(--gh-*)` — never raw px/hex
3. If no suitable token exists → BLOCKED: NO TOKEN (escalate to add one to
   `globals.css` first, do not hardcode)

## 4. MIGRATION POLICY

When touching a CSS file that contains hardcoded values:
- If the file is the target of your task → migrate ALL hardcoded font-sizes
  in that file to tokens (single cohesive behavior change: "align file to
  global scale")
- If the file is NOT your target → do NOT touch it (scope discipline). The
  guard test will flag it for a future dedicated migration task.

## 5. FAILURE PROTOCOL

If a hardcoded `font-size: NNpx` is introduced:
→ The guard test fails on the next `npm test`
→ The commit is blocked (husky pre-commit runs `npx vitest run`)
→ Output: `FAILED: hardcoded font-size NNpx in <file>:<line>`

## 6. TASK REF

Established: 2026-07-07 (ENFORCE-CSS-NO-HARDCODED-TOKENS-001)
Guard test: `src/guards/css-no-hardcoded-font-sizes.guard.test.ts`
