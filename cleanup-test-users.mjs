import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

const emails = Array.from({ length: 10 }, (_, i) => `gh-test-player-${i + 1}@test.guess-history.com`);

const ids = {};
for (const email of emails) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'TestPass123!' }),
  });
  if (res.ok) {
    const data = await res.json();
    const id = data.user?.id;
    if (id) {
      ids[email] = id;
      console.log(`Found ${email} -> ${id}`);
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) console.error(`Failed to delete ${email}:`, error.message);
      else console.log(`Deleted ${email}`);
      await supabase.from('profiles').delete().eq('id', id);
    }
  } else {
    console.log(`${email} not found or wrong password:`, await res.text());
  }
}

fs.writeFileSync('.test-user-ids.json', JSON.stringify(ids, null, 2));
console.log('Wrote .test-user-ids.json');
