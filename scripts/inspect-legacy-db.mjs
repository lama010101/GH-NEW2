import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:N7wmBdgHPGrEeiuT@db.jghesmrwhegaotbztrhr.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log('Connected to legacy database\n');
    
    // List all tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('=== TABLES IN PUBLIC SCHEMA ===');
    for (const row of tablesRes.rows) {
      console.log(`\n📋 ${row.table_name} (${row.column_count} columns)`);
      
      // Get columns for each table
      const colsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [row.table_name]);
      
      for (const col of colsRes.rows) {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`   • ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      }
      
      // Get row count
      const countRes = await client.query(`SELECT COUNT(*) as count FROM "${row.table_name}"`);
      console.log(`   → ${countRes.rows[0].count} rows`);
    }
    
    // Also list foreign keys
    console.log('\n\n=== FOREIGN KEY RELATIONSHIPS ===');
    const fkRes = await client.query(`
      SELECT
        tc.table_name as from_table,
        kcu.column_name as from_column,
        ccu.table_name as to_table,
        ccu.column_name as to_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `);
    
    for (const fk of fkRes.rows) {
      console.log(`${fk.from_table}.${fk.from_column} → ${fk.to_table}.${fk.to_column}`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
