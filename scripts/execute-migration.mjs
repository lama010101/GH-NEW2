import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.gzvixlvkwjsrtmtybtkf:50xPrbjkT3r2Wy@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to NEW database\n');
    
    // Read and execute SQL
    const sql = fs.readFileSync('./scripts/create_missing_tables.sql', 'utf8');
    
    console.log('Executing migration...\n');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!\n');
    
    // Verify tables were created
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('hints', 'wiki', 'wiki_images', 'round_results')
      ORDER BY table_name
    `);
    
    console.log('=== VERIFICATION ===');
    for (const row of tablesRes.rows) {
      const countRes = await client.query(`SELECT COUNT(*) as count FROM "${row.table_name}"`);
      console.log(`✓ ${row.table_name}: created (${countRes.rows[0].count} rows)`);
    }
    
    // Verify columns in round_results
    const colsRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'round_results'
        AND column_name IN ('actual_year', 'actual_event_date')
    `);
    
    console.log('\n=== ROUND_RESULTS COLUMNS ADDED ===');
    for (const col of colsRes.rows) {
      console.log(`✓ ${col.column_name} column added`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
