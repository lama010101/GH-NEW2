"use strict";exports.id=971,exports.ids=[971],exports.modules={9054:(e,t,r)=>{r.d(t,{Vs:()=>i,WB:()=>o,p2:()=>s});var a=r(8413);function n(e,t,r){return Math.min(r,Math.max(t,e))}function i(e){let t=e=>100===e?"gold":e>=95?"silver":e>=90?"bronze":null,r=[],a=t(e.locationAccuracy),n=t(e.yearAccuracy),i=t(e.comboAccuracy);return a&&r.push({dimension:"location",tier:a,accuracy:e.locationAccuracy}),n&&r.push({dimension:"year",tier:n,accuracy:e.yearAccuracy}),i&&r.push({dimension:"combo",tier:i,accuracy:e.comboAccuracy}),r}function o(e,t,r,a){let n,i,o;let s=e=>a.some(t=>t.dimension===e),l=[];return!s("year")&&(n=e)>=88&&n<=89&&l.push({dimension:"year",accuracy:e}),!s("location")&&(i=t)>=88&&i<=89&&l.push({dimension:"location",accuracy:t}),!s("combo")&&(o=r)>=88&&o<=89&&l.push({dimension:"combo",accuracy:r}),l}function s(e,t,r,o=!1,s={accuracy:0,xp:0},l=0,d=2025){let u={year:t.year,location:t.location};if(null===u.year&&null===u.location)return{roundIndex:r,event:e,guess:u,distanceKm:0,yearDiff:0,yearAccuracy:0,locationAccuracy:0,comboAccuracy:0,roundAccuracy:0,roundXp:0,badges:[],didTimeout:o};let _=function(e){let{lat:t,lng:r}=e.location;if(!Number.isFinite(t)||!Number.isFinite(r))throw Error("[GEO_HARD_FAIL] Invalid geo coordinates from API - location.lat or location.lng is not finite");return{lat:t,lng:r}}(e),E=null===u.year?200:u.year-e.year,c=null===u.location?2e4:function(e,t){let r=(t.lat-e.lat)*Math.PI/180,a=(t.lng-e.lng)*Math.PI/180;return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(r/2)*Math.sin(r/2)+Math.sin(a/2)*Math.sin(a/2)*Math.cos(e.lat*Math.PI/180)*Math.cos(t.lat*Math.PI/180))))}(u.location,_),y=null===u.year?0:function(e,t,r){let a;let i=Math.abs(e);return i<=(a=r>=1950?0:r>=1800?1:r>=1400?5:r>=500?15:50)?100:Math.round(n(100*Math.exp(-(i-a)/(Math.max(1,r-t)/8)),0,100))}(E,l,d),m=Math.round(n(100*Math.exp(-c/1500),0,100)),S=Math.floor((y+m)/2),p=Math.round(y+m),I={roundIndex:r,event:e,guess:u,distanceKm:c,yearDiff:Math.abs(E),yearAccuracy:y,locationAccuracy:m,comboAccuracy:Math.floor((y+m)/2),roundAccuracy:Math.max(0,S-Math.round(n(s.accuracy,0,100*a.fF))),roundXp:Math.max(0,p-Math.round(n(s.xp,0,Number.MAX_SAFE_INTEGER))),badges:[],didTimeout:o};return I.badges=i(I),I}},348:(e,t,r)=>{r.d(t,{Lh:()=>o,j2:()=>n,xd:()=>i,zt:()=>a});let a={PLAYER:"player",TIMEOUT:"timeout",INTERNAL:"internal"};function n(e){return e===a.PLAYER||e===a.TIMEOUT||e===a.INTERNAL}let i=[a.PLAYER,a.TIMEOUT,a.INTERNAL],o=["ROUND_STARTED","SESSION_COMPLETE"]},8413:(e,t,r)=>{r.d(t,{Ze:()=>i,fF:()=>o,mb:()=>n,q3:()=>a});let a=5,n=5,i=300,o=1},5502:(e,t,r)=>{r.d(t,{e:()=>a});function a(e,t){switch(t.type){case"SUBMIT_GUESS":return function(e,t){let r=[];if(t.hasExistingCommit)return{events:r};r.push({type:"GUESS_SUBMITTED",payload:{playerId:t.playerId,yearGuess:t.yearGuess,score:t.score,verificationToken:t.commitToken},roundIndex:t.roundIndex});let a=t.currentRoundCommitCountBefore+1;return e.activePlayerCount>0&&a>=e.activePlayerCount&&r.push({type:"ROUND_COMPLETE",payload:{commitCount:a},roundIndex:t.roundIndex}),{events:r}}(e,t.context);case"ADVANCE_ROUND":return function(e,t){let r=[],a=t.roundIndex+1;return a<e.totalRounds?r.push({type:"ROUND_STARTED",payload:{roundIndex:a,eventId:t.nextRoundEventId,startedAt:t.startedAt,phaseEndsAt:t.phaseEndsAt,cause:t.cause,...t.playerId?{playerId:t.playerId}:{}},roundIndex:a}):r.push({type:"SESSION_COMPLETE",payload:{totalRounds:e.totalRounds,cause:t.cause,...t.playerId?{playerId:t.playerId}:{}},roundIndex:t.roundIndex}),{events:r}}(e,t.context);default:throw Error(`Unknown intent type: ${JSON.stringify(t)}`)}}},7419:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.d(t,{IV:()=>d,Px:()=>s});var n=r(753),i=r(348),o=e([n]);async function s(e,t){let r=await e.query(`
    SELECT id, event_type, round_index
    FROM round_events
    WHERE game_id = $1
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
    `,[t]);return 0===r.rows.length?null:{id:r.rows[0].id,eventType:r.rows[0].event_type,roundIndex:r.rows[0].round_index}}async function l(e,t,r,a,n){await e.query(`
    INSERT INTO round_events (game_id, round_index, event_type, payload)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT DO NOTHING
    `,[t,r,a,JSON.stringify(n)])}async function d(e,t,r,a,o){let d=await s(e,t);if(function(e,t){if(!e){if("SESSION_CREATED"!==t)throw Error(`FIRST_EVENT_MUST_BE_SESSION_CREATED: Got "${t}"`);return}let r=n.Sv[e];if(!r||!r.has(t)){let a=r?Array.from(r).join(", "):"(none — terminal state)";throw Error(`INVALID_TRANSITION: ${e} → ${t}. Allowed: [${a}]`)}}(d?.eventType??null,r),function(e,t,r){switch(r){case"ROUND_STARTED":if(t!==(e??-1)+1)throw Error(`INVALID_ROUND_INCREMENT: ${r} requires round ${(e??-1)+1}, got ${t}`);break;case"GUESS_SUBMITTED":case"ROUND_COMPLETE":case"PRESSURE_APPLIED":if(t!==e)throw Error(`ROUND_MISMATCH: ${r} must be in round ${e}, got ${t}`);break;case"SESSION_CREATED":case"SESSION_COMPLETE":break;default:throw Error(`UNKNOWN_EVENT_TYPE: ${r}`)}}(d?.roundIndex??null,o,r),i.Lh.includes(r)&&!(0,i.j2)(a.cause))throw Error(`INVALID_CAUSE: ${r} requires payload.cause to be a valid TransitionCause, got: ${JSON.stringify(a.cause)}. Valid values: player, timeout, internal`);await l(e,t,o,r,a)}n=(o.then?(await o)():o)[0],a()}catch(e){a(e)}})},32:(e,t,r)=>{r.d(t,{S:()=>a,x:()=>n});let a={SESSION_CREATED:new Set(["ROUND_STARTED","SESSION_COMPLETE"]),ROUND_STARTED:new Set(["GUESS_SUBMITTED","ROUND_COMPLETE"]),GUESS_SUBMITTED:new Set(["GUESS_SUBMITTED","ROUND_COMPLETE"]),ROUND_COMPLETE:new Set(["ROUND_STARTED","SESSION_COMPLETE"]),SESSION_COMPLETE:new Set([])};function n(e){let t=[...e];if(Object.freeze(t),0===t.length)return{currentRound:0,currentPhase:null};for(let e=1;e<t.length;e++){let r=t[e-1],a=t[e],n=new Date(r.createdAt).getTime(),i=new Date(a.createdAt).getTime();if(i<n)throw Error(`EVENT_ORDER_VIOLATION: Event ${a.id} (created_at=${a.createdAt}) comes before event ${r.id} (created_at=${r.createdAt})`);if(i===n&&a.id<r.id)throw Error(`EVENT_ORDER_VIOLATION: Event ${a.id} has same timestamp as ${r.id} but lower id (id tie-break violated)`)}let r=0,n=-1;for(let e=0;e<t.length;e++){let a=t[e];if(void 0===a.roundIndex)throw Error(`INVALID_ROUND_INDEX: Event ${a.id} (type=${a.eventType}) has undefined roundIndex. All round-based events require explicit roundIndex.`);if(null===a.roundIndex){if(["ROUND_STARTED","GUESS_SUBMITTED","ROUND_COMPLETE","PRESSURE_APPLIED"].includes(a.eventType))throw Error(`INVALID_ROUND_INDEX: Event ${a.id} (type=${a.eventType}) has null roundIndex. Gameplay events require valid roundIndex >= 0.`);continue}if(Number.isNaN(a.roundIndex))throw Error(`INVALID_ROUND_INDEX: Event ${a.id} (type=${a.eventType}) has NaN roundIndex.`);if(a.roundIndex<0)throw Error(`INVALID_ROUND_INDEX: Event ${a.id} (type=${a.eventType}) has negative roundIndex (${a.roundIndex}). Round indices must be >= 0.`);if(!Number.isInteger(a.roundIndex))throw Error(`INVALID_ROUND_INDEX: Event ${a.id} (type=${a.eventType}) has non-integer roundIndex (${a.roundIndex}).`);let i=a.roundIndex;if(i<n)throw Error(`ROUND_CONTINUITY_ERROR: Event ${a.id} (type=${a.eventType}) has roundIndex=${i} which is less than previously seen max=${n}. Round regression is not allowed.`);if(i>r)throw Error(`ROUND_CONTINUITY_ERROR: Event ${a.id} (type=${a.eventType}) has roundIndex=${i} but expected round ${r}. Round skips are not allowed. Rounds must be continuous (0, 1, 2, ...).`);i===r&&"ROUND_STARTED"===a.eventType&&n<r&&r++,n=Math.max(n,i)}let i=new Set;for(let e of t)null!==e.roundIndex&&void 0!==e.roundIndex&&i.add(e.roundIndex);if(i.size>0){let e=Array.from(i).sort((e,t)=>e-t);for(let t=0;t<e.length;t++)if(e[t]!==t)throw Error(`ROUND_CONTINUITY_ERROR: Expected round ${t} but found ${e[t]}. Rounds must be continuous with no skips (0, 1, 2, ...).`)}let o=t[0],s=new Set(["SESSION_CREATED"]);if(!s.has(o.eventType))throw Error(`INVALID_PHASE_TRANSITION: First event (id=${o.id}) has phase "${o.eventType}" but must be one of: ${Array.from(s).join(", ")}. Event stream must start with SESSION_CREATED.`);for(let e=1;e<t.length;e++){let r=t[e-1],n=t[e],i=a[r.eventType];if(void 0===i)throw Error(`INVALID_PHASE_TRANSITION: Event ${r.id} has unknown phase "${r.eventType}". Phase not defined in VALID_PHASE_TRANSITIONS FSM.`);if(!i.has(n.eventType))throw Error(`INVALID_PHASE_TRANSITION: Cannot transition from "${r.eventType}" (event ${r.id}) to "${n.eventType}" (event ${n.id}). Allowed transitions from "${r.eventType}": [${Array.from(i).join(", ")||"(none — terminal state)"}]`)}let l=t[t.length-1];if(!l.eventType)throw Error(`MISSING_PHASE_EVENT: Last event (id=${l.id}) has no eventType. Phase must be explicitly derived from event stream.`);return{currentRound:l.roundIndex??0,currentPhase:l.eventType}}},575:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.d(t,{HW:()=>l,N2:()=>d,OV:()=>_,nM:()=>u});var n=r(6081),i=r(6341),o=e([i]);async function s(e={},t=i.U){let{limit:r=10,excludeIds:a=[],minYear:o,maxYear:s,regions:l}=e,d=["e.status = 'validated'","l.latitude IS NOT NULL","l.longitude IS NOT NULL"],u=[],_=1;a.length>0&&(d.push(`e.id != ALL($${_}::uuid[])`),u.push(a),_++),void 0!==o&&(d.push(`e.event_year >= $${_}`),u.push(o),_++),void 0!==s&&(d.push(`e.event_year <= $${_}`),u.push(s),_++),l&&l.length>0&&(d.push(`l.continent = ANY($${_}::text[])`),u.push(l),_++);let E=d.join(" AND "),c=`
    SELECT e.id
    FROM events e
    JOIN locations l ON l.event_id = e.id
    WHERE ${E}
    ORDER BY RANDOM()
    LIMIT $${_}
  `;u.push(r);let y=await t.query(c,u);if(0===y.rows.length)return[];let m=y.rows.map(e=>e.id),S=`
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
      ) as images,
      (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id',            h.id,
              'event_id',      h.event_id,
              'tier',          h.tier,
              'type',          h.type,
              'content',       h.content,
              'metadata',      h.metadata,
              'display_order', h.display_order
            ) ORDER BY h.display_order, h.tier, h.type
          ),
          '[]'::jsonb
        )
        FROM hints h
        WHERE h.event_id = e.id
      ) AS hints
    FROM events e
    JOIN locations l ON l.event_id = e.id
    LEFT JOIN images i ON i.event_id = e.id
    WHERE e.id = ANY($1::uuid[])
    GROUP BY e.id, e.title, e.description, e.event_year, l.latitude, l.longitude, l.display_name, l.country
    ORDER BY e.id
  `;return(await t.query(S,[m])).rows.map(e=>(0,n.p)(e))}async function l(e,t=i.U){let r=`
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
  `,a=await t.query(r,[e]);if(0===a.rows.length)return null;let o=`
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
  `,s=await t.query(o,[e]),l=a.rows[0],d=s.rows[0]?.hints??"[]";return(0,n.p)({...l,hints:d})}async function d(e,t={}){return s({limit:e,excludeIds:t.excludeEventIds,minYear:t.minYear,maxYear:t.maxYear,regions:t.regions})}async function u(){return(await i.U.query(`
    SELECT DISTINCT continent
    FROM locations
    WHERE continent IS NOT NULL
    ORDER BY continent
  `)).rows.map(e=>e.continent)}async function _(){let e=await i.U.query(`
    SELECT MIN(event_year) as min_year, MAX(event_year) as max_year
    FROM events
    WHERE event_year IS NOT NULL
  `);return{min:e.rows[0]?.min_year??1800,max:e.rows[0]?.max_year??2024}}i=(o.then?(await o)():o)[0],a()}catch(e){a(e)}})},753:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.d(t,{Sv:()=>i.S,ky:()=>s,xA:()=>i.x});var n=r(6341),i=r(32),o=e([n]);async function s(e){let t=await n.U.query(`WITH
      session_data AS (
        SELECT game_id, mode, round_timer_sec, total_rounds, year_min, year_max,
               session_deadline, created_at, seed, room_code
        FROM sessions
        WHERE game_id = $1
      ),
      players_data AS (
        SELECT player_id, display_name, joined_at, left_at, ready, is_host, avatar_url
        FROM session_players
        WHERE game_id = $1
        ORDER BY joined_at ASC, player_id ASC
      ),
      commits_data AS (
        SELECT round_index, player_id, submitted_at, year_guess,
               location_lat, location_lng, hints_used, score
        FROM round_commits
        WHERE game_id = $1
        ORDER BY round_index ASC, submitted_at ASC, player_id ASC
      ),
      results_data AS (
        SELECT round_index, player_id, score, rank,
               distance_km, year_diff, location_score, time_score
        FROM round_results
        WHERE game_id = $1
        ORDER BY round_index ASC, rank ASC, player_id ASC
      ),
      events_data AS (
        SELECT id, round_index, event_type, payload, created_at
        FROM round_events
        WHERE game_id = $1
        ORDER BY created_at ASC, id ASC
      )
    SELECT
      (SELECT row_to_json(s) FROM session_data s) AS session,
      (SELECT json_agg(p ORDER BY p.joined_at ASC, p.player_id ASC) FROM players_data p) AS players,
      (SELECT json_agg(c ORDER BY c.round_index ASC, c.submitted_at ASC, c.player_id ASC) FROM commits_data c) AS commits,
      (SELECT json_agg(r ORDER BY r.round_index ASC, r.rank ASC, r.player_id ASC) FROM results_data r) AS results,
      (SELECT json_agg(e ORDER BY e.created_at ASC, e.id ASC) FROM events_data e) AS events`,[e]);if(0===t.rows.length||!t.rows[0].session)throw Error(`[getGameState] Session not found: ${e}`);let r=t.rows[0],a=r.session,o=r.players??[],s=r.commits??[],l=r.results??[],d=r.events??[],u={gameId:a.game_id,mode:a.mode,roundTimerSec:a.round_timer_sec,totalRounds:a.total_rounds,yearMin:a.year_min,yearMax:a.year_max,sessionDeadline:a.session_deadline?new Date(a.session_deadline).toISOString():null,createdAt:new Date(a.created_at).toISOString(),roomCode:a.room_code},_=o.map(e=>({playerId:e.player_id,displayName:e.display_name??"",joinedAt:new Date(e.joined_at).toISOString(),leftAt:e.left_at?new Date(e.left_at).toISOString():null,ready:e.ready,isHost:e.is_host,avatarUrl:e.avatar_url??null})),E=new Map;for(let e of s){let t={playerId:e.player_id,submittedAt:new Date(e.submitted_at).toISOString(),yearGuess:e.year_guess,locationLat:e.location_lat,locationLng:e.location_lng,hintsUsed:e.hints_used??0,score:e.score},r=e.round_index;E.has(r)||E.set(r,[]),E.get(r).push(t)}let c=new Map;for(let e of l){let t={playerId:e.player_id,score:e.score,rank:e.rank,distanceKm:e.distance_km,yearDiff:e.year_diff,locationScore:e.location_score,timeScore:e.time_score},r=e.round_index;c.has(r)||c.set(r,[]),c.get(r).push(t)}let y=d.map(e=>({id:e.id,roundIndex:e.round_index,eventType:e.event_type,payload:e.payload,createdAt:new Date(e.created_at).toISOString()})),m=new Set;for(let e of y)null!==e.roundIndex&&m.add(e.roundIndex);let{currentRound:S,currentPhase:p}=(0,i.x)(y),I=function(e,t,r){let a=new Set([...e,...t.keys(),...r.keys()]);return Array.from(a).sort((e,t)=>e-t).map(e=>({roundIndex:e,submissions:t.get(e)??[],results:r.get(e)??[]}))}(m,E,c),R=y.find(e=>"SESSION_CREATED"===e.eventType),h=R?.payload?.eventIds??[],T=[];if(h.length>0){let e=await n.U.query(`SELECT
        e.id AS event_id,
        e.title,
        e.description,
        e.event_year,
        l.latitude,
        l.longitude,
        l.display_name,
        (
          SELECT i.url
          FROM images i
          WHERE i.event_id = e.id
          ORDER BY i.display_order ASC NULLS LAST
          LIMIT 1
        ) AS image_url
      FROM events e
      LEFT JOIN locations l ON l.event_id = e.id
      WHERE e.id = ANY($1::uuid[])`,[h]),t=await n.U.query(`SELECT
        h.event_id,
        h.id,
        h.tier,
        h.type,
        h.content,
        h.metadata,
        h.display_order
      FROM hints h
      WHERE h.event_id = ANY($1::uuid[])
      ORDER BY h.display_order, h.tier`,[h]),r=new Map;for(let e of t.rows){let t={id:e.id,event_id:e.event_id,tier:e.tier,type:e.type,content:e.content,metadata:e.metadata,display_order:e.display_order},a=r.get(e.event_id)??[];r.set(e.event_id,[...a,t])}let a=new Map(e.rows.map(e=>[e.event_id,e]));T=h.map((e,t)=>{let n=a.get(e),i=y.filter(e=>e.roundIndex===t).reduce((e,t)=>null===e||t.id>e.id?t:e,null),o=i?.eventType==="ROUND_COMPLETE"||i?.eventType==="SESSION_COMPLETE";return{eventId:e,title:n?.title??"",year:o?n?.event_year??0:null,latitude:o?n?.latitude??0:null,longitude:o?n?.longitude??0:null,locationName:o?n?.display_name??null:null,imageUrl:n?.image_url??null,description:n?.description??null,hints:r.get(e)??[]}})}return{session:u,players:_,currentRound:S,phase:p,rounds:I,events:y,roundEventContent:T}}n=(o.then?(await o)():o)[0],a()}catch(e){a(e)}})},6081:(e,t,r)=>{r.d(t,{p:()=>a});function a(e){let t=e.images??[],r=t.find(e=>e.isPrimary)||t[0]||null,a=e.hints??[];return{id:e.id,title:e.title,description:e.description??"",year:e.event_year,location:{id:e.id,name:e.display_name??"Unknown location",lat:e.latitude,lng:e.longitude},region:e.region??"Unknown",imageUrl:r?.imageUrl??null,thumbUrl:r?.thumbUrl??null,hints:a,category:e.category??void 0}}},971:(e,t,r)=>{r.a(e,async(e,a)=>{try{r.r(t),r.d(t,{PRACTICE_PLAYER_ID:()=>q,PRACTICE_PLAYER_NAME:()=>H,PRESSURE_CLAMP_SECONDS:()=>B,REQUIRED_MULTIPLAYER_TABLES:()=>W,RESULTS_COUNTDOWN_SECONDS:()=>Y,advanceRound:()=>U,completeRound:()=>M,createCompeteSession:()=>g,getRoundResults:()=>b,getTransactionClient:()=>f,joinCompeteSession:()=>A,loadCompeteSessionSnapshot:()=>w,loadSessionPlayerRows:()=>N,loadSessionRow:()=>O,mapSessionPlayerRowToPlayer:()=>T,mapSessionRowToConfig:()=>h,setCompetePlayerReady:()=>C,startCompeteSession:()=>L,submitGuess:()=>$,verifySchemaIntegrity:()=>I});var n=r(4770),i=r(8413),o=r(9054),s=r(6341),l=r(575),d=r(753),u=r(7419),_=r(348),E=r(5502),c=e([s,l,d,u]);function y(e,t,r){JSON.stringify(t)!==JSON.stringify(r)&&console.error(`[TRANSITION MISMATCH] ${e}
  existing:  ${JSON.stringify(t)}
  expected:  ${JSON.stringify(r)}`)}[s,l,d,u]=c.then?(await c)():c;let q="00000000-0000-0000-0000-000000000000",H="Practice Player",B=20,Y=30;function m(e,t,r){if(void 0===e)return t;if(!Number.isInteger(e)||!Number.isFinite(e))throw Error(`${r} must be a finite integer`);return e}function S(e){let t=e.trim();if(0===t.length)throw Error("displayName is required");if(t.length>40)throw Error("displayName must be 40 characters or fewer");return t}function p(e,t,r,a){let n=new Date().toISOString(),i=a?`[VERIFY] ${e} ${t} ${r} — ${a}`:`[VERIFY] ${e} ${t} ${r}`;"FAIL"===r?console.error(`[${n}] ${i}`):console.log(`[${n}] ${i}`)}let W=["sessions","session_players","round_commits","round_results","round_events"];async function I(e=s.U){p("SCHEMA_CHECK","information_schema","OK","starting");let t=await e.query(`SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,[W]),r=new Set(t.rows.map(e=>e.table_name)),a=W.filter(e=>!r.has(e));if(a.length>0)throw p("SCHEMA_CHECK","information_schema","FAIL",`missing tables: ${a.join(", ")}`),Error(`[VERIFY FAIL] Schema integrity check failed — missing tables: ${a.join(", ")}`);p("SCHEMA_CHECK","information_schema","OK",`all ${W.length} required tables present`)}function R(e){return e?e.toISOString():null}function h(e){return{mode:e.mode,roundTimerSec:e.round_timer_sec,totalRounds:e.total_rounds,yearMin:e.year_min,yearMax:e.year_max,hostPlayerId:null,sessionDeadline:R(e.session_deadline),startedAt:null,completedAt:null}}function T(e,t){if(null===e.joined_at)throw Error(`[DB_INTEGRITY] session_players.joined_at is NULL for player_id=${e.player_id} game_id=${e.game_id}`);return{playerId:e.player_id,displayName:e.display_name||e.player_id.slice(0,8),joinedAt:e.joined_at.toISOString(),leftAt:R(e.left_at),ready:e.ready,isHost:e.is_host,avatarUrl:e.avatar_url??null,hasSubmitted:t}}async function f(){return s.U.connect()}async function O(e,t=s.U){return(await t.query(`
      SELECT
        game_id,
        mode,
        round_timer_sec,
        total_rounds,
        year_min,
        year_max,
        session_deadline,
        created_at,
        seed,
        room_code
      FROM sessions
      WHERE game_id = $1
      LIMIT 1
    `,[e])).rows[0]??null}async function N(e,t=s.U){return(await t.query(`
      SELECT game_id, player_id, display_name, joined_at, left_at, ready, is_host, avatar_url
      FROM session_players
      WHERE game_id = $1
      ORDER BY joined_at ASC, player_id ASC
    `,[e])).rows}async function w(e,t){let r=await (0,d.ky)(e),{currentRound:a,currentPhase:n}=(0,d.xA)(r.events),i=function(e){switch(e){case"SESSION_CREATED":default:return"LOBBY";case"ROUND_STARTED":case"GUESS_SUBMITTED":return"ROUND_ACTIVE";case"ROUND_COMPLETE":return"ROUND_COMPLETE";case"SESSION_COMPLETE":return"SESSION_COMPLETE"}}(n),o=r.rounds.find(e=>e.roundIndex===a)?.submissions??[],s=new Set(o.map(e=>e.playerId)),l=r.players.map(e=>({playerId:e.playerId,displayName:e.displayName||e.playerId.slice(0,8),joinedAt:e.joinedAt,leftAt:e.leftAt,ready:e.ready,isHost:e.isHost,avatarUrl:e.avatarUrl??null,hasSubmitted:s.has(e.playerId)})),u=l.filter(e=>null===e.leftAt),_=l.find(e=>e.isHost&&null===e.leftAt)??null,E=r.events.filter(e=>"ROUND_STARTED"===e.eventType&&e.roundIndex===a).pop(),c=E?E.payload?.startedAt??null:null,y=E?E.payload?.phaseEndsAt??null:null,m={gameId:r.session.gameId,status:i,config:{mode:r.session.mode,roundTimerSec:r.session.roundTimerSec,totalRounds:r.session.totalRounds,yearMin:r.session.yearMin,yearMax:r.session.yearMax,hostPlayerId:_?_.playerId:null,sessionDeadline:r.session.sessionDeadline,startedAt:null,completedAt:null},players:l,currentRoundIndex:a,allPlayersReady:u.length>=2&&u.every(e=>e.ready),roundStartsAt:c,roundEndsAt:y,viewerPlayerId:t??null,timeRemaining:null,rounds:r.roundEventContent,readyForNext:[],resultPhaseEndsAt:void 0,roomCode:r.session.roomCode},S=(r.rounds.find(e=>e.roundIndex===a)?.submissions??[]).length;if(r.events.length>0){let e=r.events[r.events.length-1];if("ROUND_COMPLETE"===e.eventType&&"ROUND_COMPLETE"!==i)throw Error(`[REPLAY_MISMATCH] Phase derivation mismatch: lastEvent=ROUND_COMPLETE but derivedStatus=${i}. Phase must be derived EXCLUSIVELY from round_events.`);if("SESSION_COMPLETE"===e.eventType&&"SESSION_COMPLETE"!==i)throw Error(`[REPLAY_MISMATCH] Phase derivation mismatch: lastEvent=SESSION_COMPLETE but derivedStatus=${i}. Phase must be derived EXCLUSIVELY from round_events.`)}return console.log(`[REPLAY_VALIDATION][PASS] gameId=${e} phase=${i} round=${a} commits=${S}`),m}async function g(e){let t=e.mode??"sync",r=function(e){if(void 0===e)return 120;if(!Number.isInteger(e)||!Number.isFinite(e))throw Error("roundTimerSec must be a finite integer");return Math.max(i.mb,Math.min(i.Ze,e))}(e.roundTimerSec),a=function(e){if(void 0===e)return i.q3;if(!Number.isInteger(e)||e<1||e>i.q3)throw Error(`totalRounds must be an integer between 1 and ${i.q3}`);return e}(e.totalRounds),o=m(e.yearMin,-100,"yearMin"),d=m(e.yearMax,2026,"yearMax");if(o>d)throw Error("yearMin must be less than or equal to yearMax");console.time("[PERF] createCompeteSession:fetchEvents");let _=await (0,l.N2)(a,{minYear:o,maxYear:d});if(console.timeEnd("[PERF] createCompeteSession:fetchEvents"),_.length!==a)throw Error(`Expected ${a} real events from the database, received ${_.length}`);let E=(0,n.randomUUID)(),c=e.playerId,y=BigInt("0x"+(0,n.randomBytes)(8).toString("hex"))&BigInt("0x7FFFFFFFFFFFFFFF"),I=function(){let e="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",t="";for(let r=0;r<6;r++)t+=e[Math.floor(Math.random()*e.length)];return t}(),R=await f();try{console.time("[PERF] createCompeteSession:transaction"),await R.query("BEGIN"),p("INSERT","sessions","OK",`game_id=${E} — executing`),await R.query(`INSERT INTO sessions (game_id, mode, round_timer_sec, total_rounds, year_min, year_max, seed, room_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,[E,t,r,a,o,d,y,I]),p("INSERT","session_players","OK",`host player_id=${c} — executing`);let n=await R.query("SELECT display_name, avatar_url FROM public.profiles WHERE id = $1",[c]),i=n.rows[0]?.display_name??null,s=i&&i.trim().length>0?i.trim():e.displayName&&e.displayName.trim().length>0?e.displayName.trim():`Player-${c.slice(0,6)}`;S(s);let l=n.rows[0]?.avatar_url??null;if(!l){let e=await R.query(`SELECT COALESCE(image_url, firebase_url) AS avatar_url
         FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`);l=e.rows[0]?.avatar_url??null}await R.query(`INSERT INTO session_players (game_id, player_id, display_name, joined_at, ready, is_host, avatar_url)
       VALUES ($1, $2, $3, now(), false, true, $4)`,[E,c,s,l]),await (0,u.IV)(R,E,"SESSION_CREATED",{mode:t,totalRounds:a,hostPlayerId:c,seed:y.toString(),eventIds:_.map(e=>e.id)},null),await R.query("COMMIT"),p("COMMIT","sessions+session_players","OK",`game_id=${E}`),console.timeEnd("[PERF] createCompeteSession:transaction")}catch(e){throw await R.query("ROLLBACK"),e}finally{R.release()}console.time("[PERF] createCompeteSession:verify"),await (0,s.TZ)("sessions","game_id = $1",[E],"createCompeteSession",{game_id:E}),await (0,s.TZ)("session_players","game_id = $1 AND player_id = $2",[E,c],"createCompeteSession",{game_id:E,player_id:c}),console.timeEnd("[PERF] createCompeteSession:verify"),console.time("[PERF] createCompeteSession:snapshot");let h=await w(E,c);if(console.timeEnd("[PERF] createCompeteSession:snapshot"),!h)throw Error("Unable to load the newly created compete session");return h}async function A(e){let t=e.gameId.trim(),r=e.playerId;if(0===t.length)throw Error("gameId is required");let a=await O(t);if(!a)throw Error("Session not found");if("practice"===a.mode)throw Error("Practice sessions cannot be joined");let n=await w(t,null);if(n&&"LOBBY"!==n.status){let e=await s.U.query("SELECT COUNT(*) as count FROM session_players WHERE game_id = $1 AND player_id = $2",[t,r]),a=parseInt(e.rows[0]?.count||"0",10);if(0===a)throw Error("Game already in progress")}p("INSERT","session_players","OK",`joining player_id=${r} game_id=${t} — executing`);let i=await s.U.query("SELECT display_name, avatar_url FROM public.profiles WHERE id = $1",[r]),o=i.rows[0]?.display_name??null,l=o&&o.trim().length>0?o.trim():e.displayName&&e.displayName.trim().length>0?e.displayName.trim():`Player-${r.slice(0,6)}`;S(l);let d=i.rows[0]?.avatar_url??null;if(!d){let e=await s.U.query(`SELECT COALESCE(image_url, firebase_url) AS avatar_url
       FROM public.avatars WHERE ready = true ORDER BY random() LIMIT 1`);d=e.rows[0]?.avatar_url??null}await s.U.query(`INSERT INTO session_players (game_id, player_id, display_name, joined_at, left_at, ready, is_host, avatar_url)
     VALUES ($1, $2, $3, now(), NULL, false, false, $4)
     ON CONFLICT (game_id, player_id) DO UPDATE
       SET left_at = NULL,
           display_name = CASE
             WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name
             ELSE session_players.display_name
           END,
           avatar_url = EXCLUDED.avatar_url`,[t,r,l,d]),await s.U.query(`UPDATE session_players
     SET is_host = true
     WHERE game_id = $1
       AND player_id = $2
       AND left_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM session_players
         WHERE game_id = $1 AND is_host = true AND left_at IS NULL
       )`,[t,r]),await (0,s.TZ)("session_players","game_id = $1 AND player_id = $2",[t,r],"joinCompeteSession",{game_id:t,player_id:r});let u=await w(t,r);if(!u)throw Error("Session not found");return u}async function C(e){let t=e.gameId.trim(),r=e.playerId.trim();if(0===t.length)throw Error("gameId is required");if(0===r.length)throw Error("playerId is required");let a=await s.U.query(`UPDATE session_players
     SET ready = $3
     WHERE game_id = $1 AND player_id = $2
     RETURNING player_id`,[t,r,e.ready]);if(0===a.rows.length)throw Error("Player not found in session");let n=await w(t,r);if(!n)throw Error("Session not found");return n}async function L(e){let t=e.gameId.trim(),r=e.playerId.trim(),a=e.cause,n=await f();try{await n.query("BEGIN");let e=await O(t,n);if(!e)throw Error("Session not found");if("practice"===e.mode)throw Error("Practice sessions use the dedicated practice flow");let i=(await N(t,n)).filter(e=>null===e.left_at);if(i.length<2)throw Error("At least 2 players required to start");let o=i.find(e=>e.is_host);if(!o)throw Error("Session has no host");if(o.player_id!==r)throw Error("Only the host can start the game");let s=i.filter(e=>!e.ready);if(s.length>0)throw Error(`Not all players are ready (${s.length} pending)`);let l=await n.query(`SELECT payload FROM round_events
       WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
       ORDER BY id ASC LIMIT 1`,[t]);if(0===l.rows.length)throw Error("Session event not found");let d=l.rows[0].payload?.eventIds;if(!Array.isArray(d)||0===d.length)throw Error("Event ID not found for round 0");let _=new Date,E=_.toISOString(),c=new Date(_.getTime()+1e3*e.round_timer_sec).toISOString();await (0,u.IV)(n,t,"ROUND_STARTED",{roundIndex:0,eventId:d[0],startedAt:E,phaseEndsAt:c,cause:a},0),await n.query("COMMIT")}catch(e){throw await n.query("ROLLBACK"),e}finally{n.release()}let i=await w(t,r);if(!i)throw Error("Session not found");return i}function v(e){if("partykit"!==e._executionContext&&"api"!==e._executionContext)throw Error("Direct mutation not allowed - use PartyKit WebSocket or API routes for state mutations")}async function $(e){v(e);let{gameId:t,playerId:r,roundIndex:a,yearGuess:n,locationGuess:d,hintsUsed:_}=e;if(!Number.isInteger(a)||a<0||a>=i.q3)throw Error("roundIndex must be an integer between 0 and 4");if(null!==n&&(!Number.isInteger(n)||!Number.isFinite(n)))throw Error("yearGuess must be null or a finite integer");if(null!==d&&("number"!=typeof d.lat||!Number.isFinite(d.lat)||"number"!=typeof d.lng||!Number.isFinite(d.lng)))throw Error("locationGuess must be null or a valid lat/lng pair");let c=await f(),m=!1,S=null,I=[],R=(0,s.cl)(),h=!1,T=[],g=0;try{console.time("[PERF] submitGuess:transaction"),await c.query("BEGIN");let i=await O(t,c);if(!i)throw Error("Session not found");if("practice"===i.mode)throw Error("Use practice session endpoints for practice mode");let s=(await c.query(`WITH
        round_started AS (
          SELECT 1 FROM round_events
          WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_STARTED'
          LIMIT 1
        ),
        round_complete AS (
          SELECT 1 FROM round_events
          WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_COMPLETE'
          LIMIT 1
        ),
        existing_commit AS (
          SELECT 1 FROM round_commits
          WHERE game_id = $1 AND player_id = $3 AND round_index = $2
          LIMIT 1
        ),
        session_created AS (
          SELECT payload FROM round_events
          WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
          ORDER BY id ASC LIMIT 1
        )
      SELECT
        EXISTS(SELECT 1 FROM round_started)     AS round_started,
        EXISTS(SELECT 1 FROM round_complete)    AS round_complete,
        EXISTS(SELECT 1 FROM existing_commit)   AS has_existing_commit,
        (SELECT payload->'eventIds' FROM session_created)::jsonb AS session_event_ids`,[t,a,r])).rows[0];if(!s.round_started)throw Error("Round has not started");if(s.round_complete){await c.query("COMMIT");let e=await w(t,r);if(!e)throw Error("Session not found");return e}if(s.has_existing_commit){await c.query("COMMIT");let e=(0,E.e)({totalRounds:i.total_rounds,activePlayerCount:0},{type:"SUBMIT_GUESS",context:{gameId:t,playerId:r,roundIndex:a,yearGuess:n,locationGuess:d,hintsUsed:_,hasExistingCommit:!0,score:0,commitToken:"",currentRoundCommitCountBefore:0}});y("submitGuess-existingCommit",I,e.events);let o=await w(t,r);if(!o)throw Error("Session not found");return o}let m=s.session_event_ids;if(!Array.isArray(m)||a>=m.length)throw Error("Event ID not found for round index");if(!(S=await (0,l.HW)(m[a])))throw Error("Could not load event");let f="number"==typeof e.accPenalty?Math.max(0,Math.min(100,e.accPenalty)):0,A="number"==typeof e.xpPenalty?Math.max(0,Math.min(200,e.xpPenalty)):0,C=(0,o.p2)(S,{year:n,location:d},a,!1,{accuracy:f,xp:A},i.year_min??0,i.year_max??2025).roundXp,L=_.length;p("INSERT","round_commits","OK",`player_id=${r} round=${a} score=${C} token=${R.slice(0,8)}... — executing`);let v=await c.query(`INSERT INTO round_commits
         (game_id, player_id, round_index, submitted_at, year_guess,
          location_lat, location_lng, hints_used, score, acc_penalty, verification_token)
       VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,[t,r,a,n,d?.lat??null,d?.lng??null,L,C,f,R]);if(console.timeLog("[PERF] submitGuess:transaction","after INSERT round_commits"),0===v.rowCount){await c.query("COMMIT");let e=await w(t,r);if(!e)throw Error("Session not found");return e}await (0,u.IV)(c,t,"GUESS_SUBMITTED",{playerId:r,yearGuess:n,score:C,verificationToken:R},a),console.timeLog("[PERF] submitGuess:transaction","after appendEvent GUESS_SUBMITTED"),I.push({type:"GUESS_SUBMITTED",payload:{playerId:r,yearGuess:n,score:C,verificationToken:R},roundIndex:a}),T=(await N(t,c)).filter(e=>null===e.left_at),0===T.length||(h=(g=await P(t,a,c))>=T.length);let $=(0,E.e)({totalRounds:i.total_rounds,activePlayerCount:T.length},{type:"SUBMIT_GUESS",context:{gameId:t,playerId:r,roundIndex:a,yearGuess:n,locationGuess:d,hintsUsed:_,hasExistingCommit:!1,score:C,commitToken:R,currentRoundCommitCountBefore:g>=1?g-1:0}});y("submitGuess",I,$.events),await c.query("COMMIT"),console.timeEnd("[PERF] submitGuess:transaction")}catch(e){throw await c.query("ROLLBACK"),e}finally{c.release()}if(h){p("INSERT","round_results","OK",`round=${a} all ${T.length} active players submitted — computing`);let e=await f();try{await e.query("BEGIN"),await F(t,a,e),m=!0,p("INSERT","round_results","OK",`${g} rows written for round=${a}`),await (0,u.IV)(e,t,"ROUND_COMPLETE",{commitCount:g},a),await e.query("COMMIT")}catch(t){throw await e.query("ROLLBACK"),t}finally{e.release()}}if("true"===process.env.ENABLE_ZERO_TRUST&&await (0,s.mN)("submitGuess",[{table:"round_commits",count:1,where:{game_id:t,player_id:r,round_index:a}}],R),"true"===process.env.ENABLE_ZERO_TRUST&&await (0,s.eT)("round_commits",{game_id:t,player_id:r,round_index:a,year_guess:n,location_lat:d?.lat??null,location_lng:d?.lng??null,hints_used:_.length,verification_token:R},"game_id = $1 AND player_id = $2 AND round_index = $3",[t,r,a],"submitGuess",R),"true"===process.env.ENABLE_ZERO_TRUST&&await (0,s.Xo)("round_commits",["game_id","player_id","round_index"],"game_id = $1 AND player_id = $2 AND round_index = $3",[t,r,a],"submitGuess",R),m&&S){let e=(await N(t)).filter(e=>null===e.left_at);"true"===process.env.ENABLE_ZERO_TRUST&&await (0,s.mN)("submitGuess-results",[{table:"round_results",count:e.length||1,where:{game_id:t,round_index:a}}],R),process.env.ENABLE_ZERO_TRUST}console.time("[PERF] submitGuess:snapshot");let A=await w(t,r);if(console.timeEnd("[PERF] submitGuess:snapshot"),!A)throw Error("Session not found");return A}async function D(e,t,r){let a=await e.query("SELECT player_id FROM session_players WHERE game_id = $1 AND left_at IS NULL",[t]),n=await e.query("SELECT player_id FROM round_commits WHERE game_id = $1 AND round_index = $2",[t,r]),i=new Set(n.rows.map(e=>e.player_id));for(let n of a.rows)i.has(n.player_id)||await e.query(`INSERT INTO round_commits
           (game_id, player_id, round_index, submitted_at, year_guess, location_lat, location_lng, hints_used, score)
         VALUES ($1, $2, $3, now(), NULL, NULL, NULL, 0, 0)
         ON CONFLICT (game_id, player_id, round_index) DO NOTHING`,[t,n.player_id,r])}async function M(e){v(e);let{gameId:t,roundIndex:r}=e,a=await f();try{await a.query("BEGIN"),await a.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2::text))",[t,r]);let e=await a.query(`SELECT 1 FROM round_events
       WHERE game_id = $1 AND round_index = $2 AND event_type = 'ROUND_COMPLETE'
       LIMIT 1`,[t,r]);if(0===e.rows.length){let e=await P(t,r,a);await (0,u.IV)(a,t,"ROUND_COMPLETE",{commitCount:e},r),await D(a,t,r),await F(t,r,a)}await a.query("COMMIT")}catch(e){throw await a.query("ROLLBACK"),e}finally{a.release()}let n=await w(t,void 0);if(!n)throw Error("Session not found");return n}async function x(e,t){if("practice"!==t)try{let t=await s.U.query(`SELECT player_id, location_score, time_score
       FROM round_results
       WHERE game_id = $1`,[e]),r=new Map;for(let e of t.rows){let t=e.player_id,a=e.location_score+e.time_score,n=(e.location_score+e.time_score)/2;r.has(t)||r.set(t,{rounds_in_session:0,session_total_xp:0,session_accuracy_per_round:[]});let i=r.get(t);i.rounds_in_session+=1,i.session_total_xp+=a,i.session_accuracy_per_round.push(n)}for(let[e,t]of r.entries()){let r=await s.U.query(`SELECT rounds_played, avg_accuracy
         FROM player_global_stats
         WHERE player_id = $1`,[e]),a=r.rows[0]?.rounds_played??0,n=r.rows[0]?.avg_accuracy??0,i=a;for(let e of t.session_accuracy_per_round)n=(n*i+e)/(i+1),i+=1;await s.U.query(`INSERT INTO player_global_stats (player_id, rounds_played, avg_accuracy, total_xp, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (player_id) DO UPDATE SET
           avg_accuracy = $3,
           total_xp = player_global_stats.total_xp + $4,
           rounds_played = $2,
           updated_at = now()`,[e,i,n,t.session_total_xp])}}catch(e){console.error("[updatePlayerGlobalStats]",e)}}async function U(e){let t;v(e);let{gameId:r,cause:a,roundIndex:n}=e;if(a===_.zt.PLAYER){if(!e.playerId||"string"!=typeof e.playerId||0===e.playerId.length)throw Error(`playerId is required when cause is '${_.zt.PLAYER}'`)}else if(a===_.zt.TIMEOUT||a===_.zt.INTERNAL){if(void 0!==e.playerId&&null!==e.playerId)throw Error(`playerId must not be provided when cause is '${a}'`)}else throw Error(`Invalid cause: '${a}'. Must be one of: ${Object.values(_.zt).join(", ")}`);let i=a===_.zt.PLAYER?e.playerId:void 0,o=await w(r,i??void 0);if(!o)throw Error("Session not found");if("SESSION_COMPLETE"===o.status)return o;let s=await f(),l=[],d=null;try{let e;await s.query("BEGIN");let o=await (0,u.Px)(s,r),_=o?.eventType??null;if("SESSION_COMPLETE"===_)throw await s.query("ROLLBACK"),Error("SESSION_COMPLETE");if("ROUND_COMPLETE"!==_)throw await s.query("ROLLBACK"),Error("INVALID_ADVANCE_SOURCE_PHASE");if(!(d=await O(r,s)))throw Error("Session not found");if("practice"===d.mode)throw Error("Practice sessions use the dedicated practice flow");t=n+1;let c="",m="";if(t<d.total_rounds){let n=await s.query(`SELECT payload FROM round_events
         WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
         ORDER BY id ASC LIMIT 1`,[r]);if(0===n.rows.length)throw Error("Session event not found");if(e=n.rows[0].payload?.eventIds,!Array.isArray(e)||t>=e.length)throw Error(`Event ID not found for round ${t}`);let o=new Date;c=o.toISOString(),m=new Date(o.getTime()+1e3*d.round_timer_sec).toISOString();let _={roundIndex:t,eventId:e[t],startedAt:c,phaseEndsAt:m,cause:a,...i?{playerId:i}:{}};await (0,u.IV)(s,r,"ROUND_STARTED",_,t),l.push({type:"ROUND_STARTED",payload:_,roundIndex:t})}else{let e={totalRounds:d.total_rounds,cause:a,...i?{playerId:i}:{}};await (0,u.IV)(s,r,"SESSION_COMPLETE",e,n),l.push({type:"SESSION_COMPLETE",payload:e,roundIndex:n})}let S=(0,E.e)({totalRounds:d.total_rounds,activePlayerCount:0},{type:"ADVANCE_ROUND",context:{gameId:r,cause:a,playerId:i,roundIndex:n,nextRoundEventId:t<d.total_rounds?e?.[t]??null:null,startedAt:c??"",phaseEndsAt:m??""}});y("advanceRound",l,S.events),await s.query("COMMIT")}catch(e){throw await s.query("ROLLBACK"),e}finally{s.release()}t>=d.total_rounds&&x(r,d.mode).catch(e=>console.error("[advanceRound] updatePlayerGlobalStats fire-and-forget error:",e));let c=await w(r,i??void 0);if(!c)throw Error("Session not found");return c}async function b(e,t){return(await s.U.query(`SELECT
      rr.player_id,
      rr.score,
      rr.rank,
      rr.location_score,
      rr.time_score,
      rc.year_guess,
      rc.location_lat,
      rc.location_lng
    FROM round_results rr
    LEFT JOIN round_commits rc
      ON rc.game_id = rr.game_id
      AND rc.round_index = rr.round_index
      AND rc.player_id = rr.player_id
    WHERE rr.game_id = $1 AND rr.round_index = $2
    ORDER BY rr.rank ASC`,[e,t])).rows.map(e=>{let t=Math.round(e.location_score??0),r=Math.round(e.time_score??0),a=Math.min(t,r),n=(0,o.Vs)({yearAccuracy:r,locationAccuracy:t,comboAccuracy:a}),i=(0,o.WB)(r,t,a,n);return{playerId:e.player_id,score:e.score??0,rank:e.rank??0,accuracy:Math.round(((e.location_score??0)+(e.time_score??0))/2),locationScore:e.location_score??0,didSubmit:null!==e.year_guess,guessYear:e.year_guess??null,guessLat:e.location_lat,guessLng:e.location_lng,timeScore:e.time_score??0,badges:n,nearMisses:i}})}async function P(e,t,r){let a=await r.query("SELECT COUNT(*) AS count FROM round_commits WHERE game_id = $1 AND round_index = $2",[e,t]);return parseInt(a.rows[0]?.count??"0",10)}async function F(e,t,r){let a=await r.query("SELECT year_min, year_max FROM sessions WHERE game_id = $1 LIMIT 1",[e]),n=a.rows[0]?.year_min??0,i=a.rows[0]?.year_max??2025,d=await r.query(`SELECT player_id, score, year_guess, location_lat, location_lng, acc_penalty
     FROM round_commits
     WHERE game_id = $1 AND round_index = $2
     ORDER BY score DESC NULLS LAST`,[e,t]),u=(0,s.cl)(),_=await r.query(`SELECT payload FROM round_events
     WHERE game_id = $1 AND event_type = 'SESSION_CREATED'
     ORDER BY id ASC LIMIT 1`,[e]);if(0===_.rows.length)return;let E=_.rows[0].payload?.eventIds;if(Array.isArray(E)&&!(t>=E.length))for(let a=0;a<d.rows.length;a++){let s=d.rows[a],_=await (0,l.HW)(E[t],r);if(!_)continue;let c={year:s.year_guess,location:null!==s.location_lat&&null!==s.location_lng?{lat:s.location_lat,lng:s.location_lng}:null},y=(0,o.p2)(_,c,t,!1,{accuracy:s.acc_penalty??0,xp:0},n,i),m=y.locationAccuracy,S=y.yearAccuracy,p=Math.round((s.acc_penalty??0)/2),I=Math.max(0,m-p),R=Math.max(0,S-p);await r.query(`INSERT INTO round_results
         (game_id, round_index, player_id, score, rank, distance_km, year_diff, location_score, time_score, verification_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (game_id, round_index, player_id) DO NOTHING`,[e,t,s.player_id,s.score??0,a+1,y.distanceKm,y.yearDiff,I,R,u])}}a()}catch(e){a(e)}})}};