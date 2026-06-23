import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import WebSocket from 'ws';

// Load env from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export const TEST_USERS: TestUser[] = [
  { id: '', email: 'gh-test-player-1@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer1' },
  { id: '', email: 'gh-test-player-2@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer2' },
  { id: '', email: 'gh-test-player-3@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer3' },
  { id: '', email: 'gh-test-player-4@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer4' },
  { id: '', email: 'gh-test-player-5@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer5' },
  { id: '', email: 'gh-test-player-6@test.guess-history.com', password: 'TestPass123!', displayName: 'TestPlayer6' },
];

let createdUserIds: string[] = [];

/**
 * Global setup: Create 6 test users via Supabase Admin API
 * Tests that require auth should log in via the AuthModal UI helper or implement their own flow.
 */
async function globalSetup() {
  console.log('[PLAYWRIGHT SETUP] Creating test users...');

  for (let i = 0; i < TEST_USERS.length; i++) {
    const user = TEST_USERS[i];

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === user.email);

    if (existingUser) {
      console.log(`[PLAYWRIGHT SETUP] User ${user.email} already exists, deleting...`);
      await supabase.auth.admin.deleteUser(existingUser.id);
      // Also clean up profile
      await supabase.from('profiles').delete().eq('id', existingUser.id);
    }

    // Create new user
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        display_name: user.displayName,
      },
    });

    if (error) {
      console.error(`[PLAYWRIGHT SETUP] Failed to create user ${user.email}:`, error.message);
      throw error;
    }

    if (data?.user) {
      TEST_USERS[i].id = data.user.id;
      createdUserIds.push(data.user.id);
      console.log(`[PLAYWRIGHT SETUP] Created user ${user.email} with ID ${data.user.id}`);

      // Create profile entry
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: user.displayName,
        avatar_url: null,
      });

      if (profileError) {
        console.error(`[PLAYWRIGHT SETUP] Failed to create profile for ${user.email}:`, profileError.message);
      }
    }
  }

  console.log('[PLAYWRIGHT SETUP] All test users created successfully');
  console.log('[PLAYWRIGHT SETUP] Note: UI-based storageState auth skipped due to selector timing issues');
}

/**
 * Global teardown: Delete all test users and their data
 */
async function globalTeardown() {
  console.log('[PLAYWRIGHT TEARDOWN] Cleaning up test users...');

  for (const userId of createdUserIds) {
    // Clean up game sessions where this user was a player
    await supabase.from('game_players').delete().eq('player_id', userId);
    await supabase.from('guesses').delete().eq('player_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);

    // Delete auth user
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`[PLAYWRIGHT TEARDOWN] Failed to delete user ${userId}:`, error.message);
    } else {
      console.log(`[PLAYWRIGHT TEARDOWN] Deleted user ${userId}`);
    }
  }

  // Also clean up any orphaned test users (in case of previous failed runs)
  const { data: allUsers } = await supabase.auth.admin.listUsers();
  const testUserEmails = TEST_USERS.map(u => u.email);
  const orphanedUsers = allUsers?.users.filter(u =>
    testUserEmails.includes(u.email || '') ||
    u.email?.startsWith('gh-test-') ||
    u.email?.includes('@test.guess-history.com')
  ) || [];

  for (const orphaned of orphanedUsers) {
    if (!createdUserIds.includes(orphaned.id)) {
      await supabase.from('game_players').delete().eq('player_id', orphaned.id);
      await supabase.from('guesses').delete().eq('player_id', orphaned.id);
      await supabase.from('profiles').delete().eq('id', orphaned.id);
      await supabase.auth.admin.deleteUser(orphaned.id);
      console.log(`[PLAYWRIGHT TEARDOWN] Cleaned up orphaned user ${orphaned.email}`);
    }
  }

  console.log('[PLAYWRIGHT TEARDOWN] Cleanup complete');
}

export { globalSetup, globalTeardown };
export default globalSetup;
