import { Pool } from "pg";

async function listTables() {
  // Use explicit pooler URL (variable expansion doesn't work with --env-file)
  const connectionString = process.env.SUPABASE_DB_POOLER || process.env.SUPABASE_DB_CONNECTION;
  
  if (!connectionString) {
    console.error("SUPABASE_DB_POOLER environment variable is required");
    console.error("Run with: npx tsx --env-file=.env.local scripts/listTables.ts");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const result = await pool.query<{ 
      table_schema: string; 
      table_name: string; 
      table_type: string;
    }>(`
      SELECT 
        table_schema,
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    console.log("\n📋 Database Tables:\n");
    
    let currentSchema = "";
    for (const row of result.rows) {
      if (row.table_schema !== currentSchema) {
        currentSchema = row.table_schema;
        console.log(`\n[${currentSchema}]`);
      }
      console.log(`  • ${row.table_name} (${row.table_type})`);
    }
    
    console.log(`\nTotal: ${result.rows.length} tables\n`);

  } catch (err) {
    console.error("Failed to list tables:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

listTables();
