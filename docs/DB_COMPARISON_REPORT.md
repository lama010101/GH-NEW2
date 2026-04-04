# Database Comparison Report

## Legacy Database (jghesmrwhegaotbztrhr) → New Database (gzvixlvkwjsrtmtybtkf)

### CORE GAME TABLES

| Table | Legacy | New | Status | Issues |
|-------|--------|-----|--------|--------|
| **games** | ✅ Exists | ✅ Exists | ✓ SYNCED | None - matches well |
| **round_results** | ✅ Exists | ✅ Exists | ⚠️ PARTIAL | Missing `actual_year` column |
| **images** | ✅ Exists | ✅ Exists | ⚠️ PARTIAL | Missing `model_id`, `version`, `identifier` from legacy; NEW has `prompt_id`, `content_hash` |
| **hints** | ✅ Exists | ❌ MISSING | ✗ NEEDS CREATION | Critical for game hints |
| **wiki** | ✅ Exists | ❌ MISSING | ✗ NEEDS CREATION | Source of historical events |
| **wiki_images** | ✅ Exists | ❌ MISSING | ✗ NEEDS CREATION | Links wiki to images |
| **guesses** | ❌ N/A | ✅ Exists (NEW) | ✓ EXTRA | Not in legacy but exists in new |
| **game_rounds** | ❌ N/A | ✅ Exists (NEW) | ✓ EXTRA | New table linking games to rounds |

### PROMPT GENERATION & VERIFICATION TABLES

| Table | Legacy | New | Status |
|-------|--------|-----|--------|
| **prompts** | ❌ N/A | ✅ Exists | ✓ NEW - full verification schema |
| **auth_model_results** | ✅ Exists | ✅ Exists | ✓ SYNCED |
| **auth_reports** | ❌ N/A | ✅ Exists | ✓ NEW |
| **prompt_verifications** | ❌ N/A | ✅ Exists | ✓ NEW |
| **promotion_audit_log** | ❌ N/A | ✅ Exists | ✓ NEW |
| **verification_audit_log** | ❌ N/A | ✅ Exists | ✓ NEW |
| **verification_metrics** | ❌ N/A | ✅ Exists | ✓ NEW |
| **ai_guess** | ✅ Exists | ❌ MISSING | ✗ Optional for AI analysis |

### MULTIPLAYER/SYNC TABLES

| Table | Legacy | New | Status |
|-------|--------|-----|--------|
| **session_players** | ❌ N/A | ✅ Exists | ✓ NEW - replaces session_progress |
| **invites** | ⚠️ room_invites (different) | ✅ Exists | ⚠️ Different structure |
| **session_progress** | ✅ Exists | ❌ MISSING | ✗ May need for compatibility |
| **sync_round_scores** | ✅ Exists | ❌ MISSING | ✗ For sync mode |
| **sync_guess_events** | ✅ Exists | ❌ MISSING | ✗ For sync mode |
| **room_event_log** | ✅ Exists | ❌ MISSING | ✗ For audit trail |

### USER/AUTH TABLES

| Table | Legacy | New | Status |
|-------|--------|-----|--------|
| **profiles** | ❌ N/A | ✅ Exists | ✓ NEW |
| **user_metrics** | ❌ N/A | ✅ Exists | ✓ NEW |

## DETAILED COLUMN COMPARISONS

### 1. round_results - DISCREPANCIES FOUND

**Legacy has (29 columns):**
- id, user_id, game_id, round_index, image_id, score, accuracy, xp_where, xp_when, hints_used, distance_km, guess_year, guess_lat, guess_lng, actual_lat, actual_lng, created_at, updated_at, room_id, xp_total, xp_debt, acc_debt, time_accuracy, location_accuracy, year_difference, location_raw, location_normalized, location_canonical_id, location_distance_meters, location_match

**New has (30 columns):** - Good, but check:
- ✓ Has most columns
- ❌ MISSING: `actual_year` (for actual event year)
- ✓ Has `xp_debt`, `acc_debt` correctly
- ⚠️ `round_index` in NEW vs `round_index` in Legacy - same

### 2. images - SIGNIFICANT DIFFERENCES

**Legacy has:**
- id, source, model_id, version, identifier, created_at, user_id

**New has:**
- id, prompt_id, storage_path, original_url, image_url, firebase_url, mobile_image_url, desktop_image_url, content_hash, metadata, generation_model, width, height, ready, created_at, updated_at

**Analysis:**
- ❌ NEW images table is designed for AI-generated images (prompt_id, generation_model)
- ❌ Missing `source`, `model_id`, `version`, `identifier` from legacy
- ❌ Legacy `images` was for reference/historical images
- **NEED:** Separate table for historical reference images OR add columns

### 3. games - WELL MATCHED

**Legacy:** id, created_by, created_at, mode, current_round, round_count, completed, user_id, guest_id, score
**New:** id, user_id, guest_id, mode, status, round_count, current_round, score, settings, created_at, updated_at, completed_at

**Analysis:**
- ⚠️ `status` in NEW vs `completed` boolean in Legacy - more granular
- ⚠️ `settings` JSONB in NEW - flexible
- ⚠️ Missing `created_by` in NEW (has `user_id` only)
- ✓ Overall well aligned

## MISSING TABLES THAT NEED CREATION

### HIGH PRIORITY (for Practice Mode)

1. **hints** - Game hints for images
2. **wiki** - Historical event data  
3. **wiki_images** - Link wiki entries to images

### MEDIUM PRIORITY (for full sync)

4. **session_progress** - Real-time session state
5. **sync_round_scores** - Synchronized scoring
6. **sync_guess_events** - Guess event sync
7. **room_event_log** - Audit logging

### LOW PRIORITY (nice to have)

8. **ai_guess** - AI analysis results
9. **quotes_clean** - Quote data
10. **collection_runs** - Data collection tracking

## RECOMMENDATION

The new database has a **strong Prompt Generation & Verification schema** but is **missing core game tables** needed for Practice Mode:

### Immediate Actions Needed:
1. ✅ **hints** - Create table
2. ✅ **wiki** + **wiki_images** - Create tables  
3. ⚠️ **images** - May need columns added OR separate table for historical images
4. ⚠️ **round_results** - Add `actual_year` column
5. ⚠️ **games** - Add `created_by` column (if needed)

### For Practice Mode MVP:
- Can use existing: games, round_results (with minor fixes), profiles
- Need to create: hints, wiki, wiki_images
- Need to verify: images table compatibility
