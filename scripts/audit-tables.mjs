import { dbPool } from '../src/server/db.js';

async function auditTables() {
  try {
    // Get all public tables
    const tablesResult = await dbPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('=== ALL PUBLIC TABLES ===');
    console.log(tablesResult.rows.map(r => r.table_name).join('\n'));
    
    // Check for core multiplayer tables
    const coreTables = ['sessions', 'session_players', 'round_commits', 'round_results', 'round_events'];
    console.log('\n=== CORE MULTIPLAYER TABLES ===');
    for (const table of coreTables) {
      const exists = tablesResult.rows.some(r => r.table_name === table);
      console.log(`${table}: ${exists ? 'EXISTS' : 'MISSING'}`);
      
      if (exists) {
        const columnsResult = await dbPool.query(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        
        console.log(`  Columns:`);
        columnsResult.rows.forEach(col => {
          console.log(`    - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });
        
        // Check RLS status
        const rlsResult = await dbPool.query(`
          SELECT relrowsecurity 
          FROM pg_class 
          WHERE relname = $1
        `, [table]);
        
        const rlsEnabled = rlsResult.rows[0]?.relrowsecurity;
        console.log(`  RLS: ${rlsEnabled ? 'ENABLED' : 'DISABLED'}`);
      }
    }
    
    // Check for legacy tables
    const legacyTables = ['sync_room_players', 'room_rounds', 'sync_round_scores', 'sync_guess_events', 'partykit_logs', 'compete_host_diagnostics'];
    console.log('\n=== LEGACY TABLES ===');
    for (const table of legacyTables) {
      const exists = tablesResult.rows.some(r => r.table_name === table);
      console.log(`${table}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
    
    // Check for content tables
    const contentTables = ['events', 'locations', 'images', 'hints', 'questions'];
    console.log('\n=== CONTENT TABLES ===');
    for (const table of contentTables) {
      const exists = tablesResult.rows.some(r => r.table_name === table);
      console.log(`${table}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await dbPool.end();
  }
}

auditTables();
