---
name: lobby-ai-favorites
description: How to end-to-end test AI player favoriting (star buttons) and the "View All" player-search modal in a Compete lobby.
Devin Secrets Needed:
  - SUPABASE_DB_CONNECTION (optional, for verifying player_follows persistence)
---

# Lobby AI Favorites and View All Modal

## Goal
Verify the lobby invite rail and "View All" modal render star/follow buttons for AI players and that the modal is rendered as a `ReactDOM.createPortal` to `document.body`.

## Preconditions
- Local Next.js dev server on `http://localhost:3000` and PartyKit on `ws://localhost:1999` are running (repo blueprint `dev`).
- A signed-in test user with `welcome_completed: true` in `profiles`.

## Path to the lobby
1. Go to `http://localhost:3000/home`.
2. Click the **CREATE** pill on the **CHALLENGE** card.
3. Wait for navigation to `/compete/{gameId}` with the "Create Game" header and the test user shown as **Host** in the roster.

## What to verify
- In the **Invite Players** panel, click the **AI** filter button.
- Each AI player card should show a disabled **AI** pill and a star button (`☆` when not followed, `★` when followed).
- Toggle the star on an AI card: it should switch `☆` ↔ `★`, the `aria-label` should switch `"Add to favorites"` ↔ `"Remove from favorites"`, and the color should switch between muted and gold.
- Click **View all (N)** to open the modal.
- Search for an AI player (e.g. "Gemma"). Results should appear and also have toggleable star buttons.
- The modal overlay should be a direct child of `document.body`, have `role="dialog"` `aria-modal="true"`, `position: fixed; inset: 0`, and `z-index: 1000`, and should be centered in the viewport (not clipped or offset by the lobby card).

## Working with tiny star buttons
The star buttons use CSS-modules class names (hashed), so coordinate clicking is brittle. Prefer one of:
1. Query by visible player name and `aria-label*="favorites"`, then call `.click()` in the browser console.
2. Compute the element center from `getBoundingClientRect()` and use that mapped coordinate.

## DB persistence check (optional)
To prove the toggle reaches the backend, query `player_follows` for the test user's `id`:
```sql
SELECT count(*) FROM player_follows WHERE follower_id = '<test_user_id>';
```
The count should increase by 1 when following and decrease by 1 when unfollowing.
