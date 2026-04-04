import pg from 'pg';
const { Pool } = pg;

const NEW_DB = process.env.SUPABASE_DB_CONNECTION || 
  'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

const LEGACY_FORMATS = [
  // Try different legacy connection formats
  'postgresql://postgres:N7wmBdgHPGrEeiuT@db.jghesmrwhegaotbztrhr.supabase.co:5432/postgres',
  'postgresql://postgres.jghesmrwhegaotbztrhr:N7wmBdgHPGrEeiuT@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  'postgresql://postgres.jghesmrwhegaotbztrhr:N7wmBdgHPGrEeiuT@db.jghesmrwhegaotbztrhr.supabase.co:5432/postgres',
];

async function checkNewDB() {
  console.log('\n=== Checking NEW Database ===');
  const pool = new Pool({
    connectionString: NEW_DB,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const events = await pool.query('SELECT COUNT(*) as count FROM events');
    const images = await pool.query('SELECT COUNT(*) as count FROM event_images');
    const hints = await pool.query('SELECT COUNT(*) as count FROM hints');
    
    console.log('✓ events:', events.rows[0].count);
    console.log('✓ event_images:', images.rows[0].count);
    console.log('✓ hints:', hints.rows[0].count);
    
    if (parseInt(events.rows[0].count) > 0) {
      console.log('\n✅ EVENT DATA ALREADY EXISTS - no migration needed');
      return true;
    } else {
      console.log('\n⚠️  NO EVENT DATA - migration required');
      return false;
    }
  } catch (err) {
    console.error('Error checking new DB:', err.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function tryLegacyConnections() {
  console.log('\n=== Trying Legacy Database Connections ===');
  
  for (const conn of LEGACY_FORMATS) {
    const pool = new Pool({
      connectionString: conn,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM prompts');
      console.log('✓ Legacy accessible via:', conn.substring(0, 50) + '...');
      console.log('  Prompts count:', result.rows[0].count);
      await pool.end();
      return conn;
    } catch (err) {
      console.log('✗ Failed:', conn.substring(0, 50) + '...');
      console.log('  Error:', err.message.substring(0, 100));
    } finally {
      await pool.end().catch(() => {});
    }
  }
  
  return null;
}

async function main() {
  const hasData = await checkNewDB();
  
  if (!hasData) {
    const workingLegacy = await tryLegacyConnections();
    
    if (!workingLegacy) {
      console.log('\n❌ LEGACY DATABASE NOT ACCESSIBLE');
      console.log('\nOptions:');
      console.log('1. Provide updated legacy DB connection string');
      console.log('2. Use Supabase REST API to access legacy data');
      console.log('3. Import from SQL dump file');
      console.log('4. Create sample events manually for testing');
    } else {
      console.log('\n✅ Legacy DB accessible - can run migration');
      console.log('Run: LEGACY_SUPABASE_DB_CONNECTION="' + workingLegacy + '" SUPABASE_DB_CONNECTION="' + NEW_DB + '" node scripts/migrate-legacy-data.mjs');
    }
  }
  
  process.exit(0);
}

main();
