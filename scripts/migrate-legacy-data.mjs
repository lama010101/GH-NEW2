#!/usr/bin/env node
/**
 * Migration Script: Import legacy data to new events schema
 *
 * This script migrates data from the legacy database:
 * - prompts → events (event metadata)
 * - images (legacy) → event_images (game images)
 * - prompts hints columns → hints
 *
 * Usage:
 *   node scripts/migrate-legacy-data.mjs
 *
 * Environment variables required:
 *   - LEGACY_SUPABASE_DB_CONNECTION: Connection string for legacy DB
 *   - SUPABASE_DB_CONNECTION: Connection string for new DB
 */

import pg from 'pg';
const { Pool } = pg;

// Configuration from environment
const LEGACY_CONNECTION = process.env.LEGACY_SUPABASE_DB_CONNECTION;
const NEW_CONNECTION = process.env.SUPABASE_DB_CONNECTION;

if (!LEGACY_CONNECTION || !NEW_CONNECTION) {
  console.error('Missing required environment variables:');
  console.error('  LEGACY_SUPABASE_DB_CONNECTION - Legacy database connection');
  console.error('  SUPABASE_DB_CONNECTION - New database connection');
  process.exit(1);
}

// Create database pools
const legacyPool = new Pool({
  connectionString: LEGACY_CONNECTION,
  ssl: { rejectUnauthorized: false }
});

const newPool = new Pool({
  connectionString: NEW_CONNECTION,
  ssl: { rejectUnauthorized: false }
});

/**
 * Fetch prompts from legacy database
 */
async function fetchLegacyPrompts() {
  console.log('Fetching prompts from legacy database...');

  const result = await legacyPool.query(`
    SELECT
      id,
      title,
      description,
      what,
      year,
      date,
      location,
      location_name,
      region,
      country,
      city,
      geolocation,
      image_url,
      firebase_image_url,
      -- Hint columns (assuming they exist in prompts table)
      hint_1_where,
      hint_1_when,
      hint_1_what,
      hint_2_where,
      hint_2_when,
      hint_2_what,
      hint_3_where,
      hint_3_when,
      hint_3_what,
      difficulty,
      created_at
    FROM prompts
    WHERE year IS NOT NULL
      AND geolocation IS NOT NULL
    ORDER BY created_at DESC
  `);

  console.log(`Found ${result.rows.length} prompts to migrate`);
  return result.rows;
}

/**
 * Fetch images for a prompt from legacy database
 */
async function fetchLegacyImages(promptId) {
  const result = await legacyPool.query(`
    SELECT
      id,
      source,
      model_id,
      version,
      identifier,
      firebase_url,
      image_url,
      created_at
    FROM images
    WHERE prompt_id = $1
       OR identifier = $1
    ORDER BY created_at DESC
  `, [promptId]);

  return result.rows;
}

/**
 * Parse geolocation from various formats
 * Handles: {"lat": 1.2, "lng": 3.4}, [1.2, 3.4], "1.2,3.4"
 */
function parseGeolocation(geo) {
  if (!geo) return null;

  try {
    // If it's already an object with lat/lng
    if (typeof geo === 'object' && geo.lat !== undefined && geo.lng !== undefined) {
      return { lat: parseFloat(geo.lat), lng: parseFloat(geo.lng) };
    }

    // If it's a string, try to parse
    if (typeof geo === 'string') {
      // Try JSON first
      try {
        const parsed = JSON.parse(geo);
        if (parsed.lat !== undefined && parsed.lng !== undefined) {
          return { lat: parseFloat(parsed.lat), lng: parseFloat(parsed.lng) };
        }
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return { lat: parseFloat(parsed[0]), lng: parseFloat(parsed[1]) };
        }
      } catch {
        // Not JSON, try "lat,lng" format
        const parts = geo.split(',').map(s => s.trim());
        if (parts.length === 2) {
          return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
        }
      }
    }

    // If it's an array
    if (Array.isArray(geo) && geo.length >= 2) {
      return { lat: parseFloat(geo[0]), lng: parseFloat(geo[1]) };
    }
  } catch (error) {
    console.warn(`Failed to parse geolocation: ${geo}`, error.message);
  }

  return null;
}

/**
 * Extract year from various date formats
 */
function extractYear(dateValue, yearValue) {
  // If explicit year is provided and valid, use it
  if (yearValue && !isNaN(parseInt(yearValue))) {
    return parseInt(yearValue);
  }

  // Try to extract from date string
  if (dateValue) {
    const dateStr = dateValue.toString();
    // Match 4-digit year patterns
    const yearMatch = dateStr.match(/\b(1[8-9]\d{2}|20\d{2})\b/);
    if (yearMatch) {
      return parseInt(yearMatch[1]);
    }
  }

  return null;
}

/**
 * Build location name from components
 */
function buildLocationName(locationName, city, country, region) {
  const parts = [];
  if (city) parts.push(city);
  if (locationName && !parts.includes(locationName)) parts.push(locationName);
  if (country) parts.push(country);
  if (region && parts.length === 0) parts.push(region);

  return parts.join(', ') || 'Unknown';
}

/**
 * Migrate a single prompt to events
 */
async function migratePromptToEvent(prompt) {
  const coords = parseGeolocation(prompt.geolocation);
  if (!coords) {
    console.warn(`Skipping prompt ${prompt.id}: invalid geolocation`);
    return null;
  }

  const year = extractYear(prompt.date, prompt.year);
  if (!year) {
    console.warn(`Skipping prompt ${prompt.id}: could not extract year`);
    return null;
  }

  const locationName = buildLocationName(
    prompt.location_name,
    prompt.city,
    prompt.country,
    prompt.region
  );

  const client = await newPool.connect();
  try {
    await client.query('BEGIN');

    // Insert event
    const eventResult = await client.query(`
      INSERT INTO events (
        legacy_prompt_id,
        title,
        description,
        year,
        location_lat,
        location_lng,
        location_name,
        region,
        category,
        difficulty,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      prompt.id,
      prompt.title || 'Untitled Event',
      prompt.description || prompt.what || null,
      year,
      coords.lat,
      coords.lng,
      locationName,
      prompt.region || null,
      null, // category
      prompt.difficulty || 3,
      prompt.created_at
    ]);

    if (eventResult.rows.length === 0) {
      // Event already exists, fetch it
      const existingResult = await client.query(
        'SELECT id FROM events WHERE legacy_prompt_id = $1',
        [prompt.id]
      );
      if (existingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      eventResult.rows = existingResult.rows;
    }

    const eventId = eventResult.rows[0].id;

    // Insert event image (use firebase_image_url or image_url)
    const imageUrl = prompt.firebase_image_url || prompt.image_url;
    if (imageUrl) {
      await client.query(`
        INSERT INTO event_images (
          event_id,
          image_url,
          source,
          is_primary,
          created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [eventId, imageUrl, 'legacy', true, prompt.created_at]);
    }

    // Migrate legacy images if any
    const legacyImages = await fetchLegacyImages(prompt.id);
    for (const img of legacyImages) {
      const imgUrl = img.firebase_url || img.image_url;
      if (imgUrl) {
        await client.query(`
          INSERT INTO event_images (
            event_id,
            image_url,
            source,
            is_primary,
            content_hash,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `, [
          eventId,
          imgUrl,
          img.source || 'legacy',
          false, // Not primary since we already have one
          img.identifier || null,
          img.created_at
        ]);
      }
    }

    // Migrate hints from prompt columns
    const hints = [];
    if (prompt.hint_1_where) hints.push({ level: 1, type: 'where', text: prompt.hint_1_where });
    if (prompt.hint_1_when) hints.push({ level: 1, type: 'when', text: prompt.hint_1_when });
    if (prompt.hint_1_what) hints.push({ level: 1, type: 'what', text: prompt.hint_1_what });
    if (prompt.hint_2_where) hints.push({ level: 2, type: 'where', text: prompt.hint_2_where });
    if (prompt.hint_2_when) hints.push({ level: 2, type: 'when', text: prompt.hint_2_when });
    if (prompt.hint_2_what) hints.push({ level: 2, type: 'what', text: prompt.hint_2_what });
    if (prompt.hint_3_where) hints.push({ level: 3, type: 'where', text: prompt.hint_3_where });
    if (prompt.hint_3_when) hints.push({ level: 3, type: 'when', text: prompt.hint_3_when });
    if (prompt.hint_3_what) hints.push({ level: 3, type: 'what', text: prompt.hint_3_what });

    for (const hint of hints) {
      await client.query(`
        INSERT INTO hints (
          event_id,
          level,
          type,
          text,
          penalty_bp,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [
        eventId,
        hint.level,
        hint.type,
        hint.text,
        hint.level * 500, // Basis points: 500 = 5%, 1000 = 10%, 1500 = 15%
        prompt.created_at
      ]);
    }

    await client.query('COMMIT');
    return eventId;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Failed to migrate prompt ${prompt.id}:`, error.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('='.repeat(60));
  console.log('Legacy Data Migration');
  console.log('='.repeat(60));

  let migrated = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const prompts = await fetchLegacyPrompts();

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      process.stdout.write(`[${i + 1}/${prompts.length}] Migrating ${prompt.id}... `);

      const eventId = await migratePromptToEvent(prompt);

      if (eventId) {
        console.log(`✓ → ${eventId}`);
        migrated++;
      } else {
        // Check if already existed
        const existing = await newPool.query(
          'SELECT id FROM events WHERE legacy_prompt_id = $1',
          [prompt.id]
        );
        if (existing.rows.length > 0) {
          console.log('⚠ (already exists)');
          skipped++;
        } else {
          console.log('✗ (failed)');
          failed++;
        }
      }
    }

    console.log('='.repeat(60));
    console.log('Migration complete!');
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Failed:   ${failed}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await legacyPool.end();
    await newPool.end();
  }
}

// Run migration
runMigration();
