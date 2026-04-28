"use strict";exports.id=575,exports.ids=[575],exports.modules={6341:(e,t,r)=>{r.a(e,async(e,n)=>{try{let y;r.d(t,{TZ:()=>_,U:()=>p,Xo:()=>S,cl:()=>u,eT:()=>E,mN:()=>f});var o=r(8678),i=r(4770),a=e([o]);function s(){return y||(globalThis.__guessHistoryDbPool__?y=globalThis.__guessHistoryDbPool__:(y=function(){let e=process.env.SUPABASE_DB_CONNECTION;if(!e)throw console.error("[FATAL][DB] SUPABASE_DB_CONNECTION environment variable is REQUIRED"),console.error("[FATAL][DB] System cannot start without real Supabase PostgreSQL connection"),Error("[HARNESS][FATAL] SUPABASE_DB_CONNECTION is required. Real DB execution proof requires Supabase PostgreSQL.");if(!e.includes("supabase")&&!e.includes("postgres"))throw console.error("[FATAL][DB] Connection must be Supabase PostgreSQL"),Error("[HARNESS][FATAL] Connection must be Supabase PostgreSQL");let t=new o.Pool({connectionString:e,ssl:{rejectUnauthorized:!1},max:10,min:2,connectionTimeoutMillis:5e3,idleTimeoutMillis:3e4,allowExitOnIdle:!1,keepAlive:!0,keepAliveInitialDelayMillis:1e4});return t.query("SELECT 1 AS db_alive, current_database() AS db_name, version() AS version").then(e=>{let t=e.rows[0];console.log(`[DB][ENFORCEMENT] ✅ Connected to ${t.db_name}`),console.log(`[DB][ENFORCEMENT] PostgreSQL ${t.version.split(" ")[0]}`),globalThis.__dbConnectionVerified__=!0}).catch(e=>{console.error("[FATAL][DB] Immediate connection test FAILED:",e.message),console.error("[FATAL][DB] System HALTING — no DB = no operation"),process.exit(1)}),t}(),globalThis.__guessHistoryDbPool__=y,y))}o=(a.then?(await a)():a)[0];let p=new Proxy({},{get:(e,t)=>s()[t]});async function l(){let e=await s().connect(),t=(await e.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,r=`B-${t}-${Date.now()}`;return console.log(`[CONN][B] Acquired backend_pid=${t}`),{client:e,backendPid:t,connectionId:r}}async function c(){return(await l()).client}function u(){return(0,i.randomUUID)()}let g=[];function d(e){g.push(e);let t="PASS"===e.result?"[VERIFY][PASS]":"[VERIFY][FAIL]",r=e.verification_token?` token=${e.verification_token.slice(0,8)}...`:"";if("FAIL"===e.result){if(console.error(`${t} ${e.operation} ${e.table}${r} — ${e.error||"Verification failed"}`),e.diff&&e.diff.length>0)for(let t of e.diff)console.error(`  [DIFF] ${t.field}: expected=${JSON.stringify(t.expected)}, actual=${JSON.stringify(t.actual)}`)}else console.log(`${t} ${e.operation} ${e.table}${r} — ${e.latency_ms}ms`)}async function E(e,t,r,n,o,i){let a=Date.now(),s={success:!1,table:e,diffs:[],token:i},l=null;try{if("true"!==process.env.ENABLE_ZERO_TRUST)return{success:!0,table:e,diffs:[],token:i};l=await c();let u=Object.keys(t),E=u.map((e,t)=>`${e} AS field_${t}`).join(", "),f=`SELECT ${E} FROM ${e} WHERE ${r} LIMIT 1`,S=await l.query(f,n);if(0===S.rows.length)throw s.error=`Row not found in ${e}`,d({timestamp:new Date().toISOString(),operation:o,table:e,verification_token:i||null,expected:t,actual:null,result:"FAIL",error:s.error,latency_ms:Date.now()-a,connections_used:1}),Error(`[VERIFY][ROW_INTEGRITY][FAIL] ${o}: ${s.error}`);let _=S.rows[0];for(let e=0;e<u.length;e++){let r=u[e],n=t[r],o=_[`field_${e}`];!function e(t,r){if(typeof t!=typeof r)return t instanceof Date&&"string"==typeof r?t.toISOString()===r:"string"==typeof t&&r instanceof Date?t===r.toISOString():null==t&&null==r;if(null==t)return null==r;if(t instanceof Date&&r instanceof Date)return t.getTime()===r.getTime();if(Array.isArray(t)&&Array.isArray(r)){if(t.length!==r.length)return!1;for(let n=0;n<t.length;n++)if(!e(t[n],r[n]))return!1;return!0}if("object"==typeof t&&"object"==typeof r){let n=Object.keys(t),o=Object.keys(r);if(n.length!==o.length)return!1;for(let i of n)if(!o.includes(i)||!e(t[i],r[i]))return!1;return!0}return t===r}(n,o)&&s.diffs.push({field:r,expected:n,actual:o})}if(s.diffs.length>0)throw s.error=`Field mismatch: ${s.diffs.map(e=>e.field).join(", ")}`,d({timestamp:new Date().toISOString(),operation:o,table:e,verification_token:i||null,expected:t,actual:_,result:"FAIL",diff:s.diffs,error:s.error,latency_ms:Date.now()-a,connections_used:1}),Error(`[VERIFY][ROW_INTEGRITY][FAIL] ${o}: ${s.error}
`+s.diffs.map(e=>`  ${e.field}: expected=${JSON.stringify(e.expected)}, actual=${JSON.stringify(e.actual)}`).join("\n"));return s.success=!0,d({timestamp:new Date().toISOString(),operation:o,table:e,verification_token:i||null,expected:t,actual:_,result:"PASS",latency_ms:Date.now()-a,connections_used:1}),s}catch(e){throw s.error||(s.error=e instanceof Error?e.message:String(e)),Error(`[VERIFY][ROW_INTEGRITY][FAIL] ${o}: ${s.error}`)}finally{l&&l.release()}}async function f(e,t,r){let n=Date.now(),o={success:!1,operation:e,expectations:[]},i=null;try{if("true"!==process.env.ENABLE_ZERO_TRUST)return{success:!0,operation:e,expectations:[]};for(let a of(i=await c(),t)){let t=Object.keys(a.where),s=t.map((e,t)=>`${e} = $${t+1}`).join(" AND "),l=t.map(e=>a.where[e]),c=await i.query(`SELECT COUNT(*) AS count FROM ${a.table} WHERE ${s}`,l),u=parseInt(c.rows[0]?.count??"0",10),E=u===a.count;if(o.expectations.push({table:a.table,expectedCount:a.count,actualCount:u,matched:E}),!E){let t=u<a.count?"MISSING":"DUPLICATE";throw o.error=`${t}: ${a.table} expected=${a.count}, actual=${u}`,d({timestamp:new Date().toISOString(),operation:`${e}-writeSet`,table:a.table,verification_token:r||null,expected:{count:a.count},actual:{count:u},result:"FAIL",error:o.error,latency_ms:Date.now()-n,connections_used:1}),Error(`[VERIFY][WRITE_SET][FAIL] ${e}: ${o.error}`)}}for(let t of(o.success=!0,o.expectations))d({timestamp:new Date().toISOString(),operation:`${e}-writeSet`,table:t.table,verification_token:r||null,expected:{count:t.expectedCount},actual:{count:t.actualCount},result:"PASS",latency_ms:Date.now()-n,connections_used:1});return o}catch(t){throw o.error||(o.error=t instanceof Error?t.message:String(t)),Error(`[VERIFY][WRITE_SET][FAIL] ${e}: ${o.error}`)}finally{i&&i.release()}}async function S(e,t,r,n,o,i){let a=Date.now(),s={success:!1,table:e,constraint:t.join(", "),count:0,expectedCount:1},l=null;try{if("true"!==process.env.ENABLE_ZERO_TRUST)return{success:!0,table:e,constraint:t.join(", "),count:1,expectedCount:1};l=await c();let u=await l.query(`SELECT COUNT(*) AS count FROM ${e} WHERE ${r}`,n);if(s.count=parseInt(u.rows[0]?.count??"0",10),0===s.count?s.error="UNIQUENESS_VIOLATION: No rows found (expected 1)":s.count>1?s.error=`DUPLICATE_VIOLATION: Found ${s.count} rows (expected 1)`:s.success=!0,d({timestamp:new Date().toISOString(),operation:`${o}-uniqueness`,table:e,verification_token:i||null,expected:{count:1},actual:{count:s.count},result:s.success?"PASS":"FAIL",error:s.error,latency_ms:Date.now()-a,connections_used:1}),!s.success)throw Error(`[VERIFY][UNIQUENESS][FAIL] ${o}: ${s.error}`);return s}catch(e){throw s.error||(s.error=e instanceof Error?e.message:String(e)),Error(`[VERIFY][UNIQUENESS][FAIL] ${o}: ${s.error}`)}finally{l&&l.release()}}async function _(e,t,r,n,o,i){if("true"!==process.env.ENABLE_ZERO_TRUST)return{success:!0,table:e,keys:o,token:i};let a=Date.now(),s={success:!1,table:e,keys:o,token:i},l=null;try{l=await c();let u=`SELECT 1 FROM ${e} WHERE ${t} LIMIT 1`,d=await l.query(u,r);if(0===d.rows.length){let t=Date.now()-a;throw s.error=`[VERIFY][CROSS_CONN][FAIL] ${n}: Row not found in ${e} after ${t}ms — keys=${JSON.stringify(o)}${i?` token=${i}`:""}`,console.error(s.error),Error(s.error)}let E=Date.now()-a;return s.success=!0,console.log(`[VERIFY][CROSS_CONN][PASS] ${n} ${e} — ${E}ms${i?` token=${i.slice(0,8)}...`:""}`),s}catch(e){throw s.success=!1,s.error||(s.error=`[VERIFY][CROSS_CONN][FAIL] ${n}: ${e instanceof Error?e.message:String(e)}`),Error(s.error)}finally{l&&l.release()}}n()}catch(e){n(e)}})},575:(e,t,r)=>{r.a(e,async(e,n)=>{try{r.d(t,{HW:()=>l,N2:()=>c,OV:()=>d,nM:()=>u});var o=r(6081),i=r(6341),a=e([i]);async function s(e={},t=i.U){let{limit:r=10,excludeIds:n=[],minYear:a,maxYear:s,regions:l}=e,c=["e.status = 'validated'","l.latitude IS NOT NULL","l.longitude IS NOT NULL"],u=[],d=1;n.length>0&&(c.push(`e.id != ALL($${d}::uuid[])`),u.push(n),d++),void 0!==a&&(c.push(`e.event_year >= $${d}`),u.push(a),d++),void 0!==s&&(c.push(`e.event_year <= $${d}`),u.push(s),d++),l&&l.length>0&&(c.push(`l.continent = ANY($${d}::text[])`),u.push(l),d++);let E=c.join(" AND "),f=`
    SELECT e.id
    FROM events e
    JOIN locations l ON l.event_id = e.id
    WHERE ${E}
    ORDER BY RANDOM()
    LIMIT $${d}
  `;u.push(r);let S=await t.query(f,u);if(0===S.rows.length)return[];let _=S.rows.map(e=>e.id),y=`
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name,
      l.country as region,
      e.category,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'imageUrl', i.url,
            'thumbUrl', i.url,
            'isPrimary', true
          ) ORDER BY i.display_order, i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      ) as images
    FROM events e
    JOIN locations l ON l.event_id = e.id
    LEFT JOIN images i ON i.event_id = e.id
    WHERE e.id = ANY($1::uuid[])
    GROUP BY e.id, e.title, e.description, e.event_year, l.latitude, l.longitude, l.display_name, l.country
    ORDER BY e.id
  `;return(await t.query(y,[_])).rows.map(e=>(0,o.p)(e))}async function l(e,t=i.U){let r=`
    SELECT
      e.id,
      e.title,
      e.description,
      e.event_year,
      l.latitude,
      l.longitude,
      l.display_name,
      l.country as region,
      e.category,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'imageUrl', i.url,
            'thumbUrl', i.url,
            'isPrimary', true
          ) ORDER BY i.display_order, i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      ) as images
    FROM events e
    JOIN locations l ON l.event_id = e.id
    LEFT JOIN images i ON i.event_id = e.id
    WHERE e.id = $1
      AND e.status = 'validated'
      AND l.latitude IS NOT NULL
      AND l.longitude IS NOT NULL
    GROUP BY e.id, e.title, e.description, e.event_year, l.latitude, l.longitude, l.display_name, l.country
  `,n=await t.query(r,[e]);if(0===n.rows.length)return null;let a=`
    SELECT
      jsonb_agg(
        jsonb_build_object(
          'tier', tier,
          'type', type,
          'content', content,
          'metadata', metadata
        ) ORDER BY tier, type
      ) as hints
    FROM hints
    WHERE event_id = $1
  `,s=await t.query(a,[e]),l=n.rows[0],c=s.rows[0]?.hints??"[]";return(0,o.p)({...l,hints:c})}async function c(e,t={}){return s({limit:e,excludeIds:t.excludeEventIds,minYear:t.minYear,maxYear:t.maxYear,regions:t.regions})}async function u(){return(await i.U.query(`
    SELECT DISTINCT continent
    FROM locations
    WHERE continent IS NOT NULL
    ORDER BY continent
  `)).rows.map(e=>e.continent)}async function d(){let e=await i.U.query(`
    SELECT MIN(event_year) as min_year, MAX(event_year) as max_year
    FROM events
    WHERE event_year IS NOT NULL
  `);return{min:e.rows[0]?.min_year??1800,max:e.rows[0]?.max_year??2024}}i=(a.then?(await a)():a)[0],n()}catch(e){n(e)}})},6081:(e,t,r)=>{r.d(t,{p:()=>n});function n(e){let t=e.images??[],r=t.find(e=>e.isPrimary)||t[0]||null,n=e.hints??[];return{id:e.id,title:e.title,description:e.description??"",year:e.event_year,location:{id:e.id,name:e.display_name??"Unknown location",lat:e.latitude,lng:e.longitude},region:e.region??"Unknown",imageUrl:r?.imageUrl??null,thumbUrl:r?.thumbUrl??null,hints:n,category:e.category??void 0}}}};