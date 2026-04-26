"use strict";exports.id=874,exports.ids=[874],exports.modules={993:(e,t,n)=>{n.d(t,{TI:()=>r});function r(e,t){return function(e,t=globalThis.crypto.randomUUID()){return{gameId:t,phase:"INIT",preflightIssues:[],currentRoundIndex:0,timeRemaining:null,events:e,currentGuess:{year:null,location:null},roundResults:[],penalty:{accuracy:0,xp:0}}}(e,t)}},874:(e,t,n)=>{n.a(e,async(e,r)=>{try{n.d(t,{E$:()=>p,Fs:()=>I,Op:()=>T,l1:()=>R});var a=n(4770),i=n(993),o=n(9054),s=n(8413),u=n(6341),d=n(575),l=n(971),_=e([u,d,l]);function w(e,t){let n=Math.floor((t.getTime()-e.getTime())/1e3);return Math.max(0,30-n)}function E(e){for(let t=0;t<e.length;t+=1)if(e[t]!==t)throw Error("Round data is not contiguous")}async function y(e,t){let n=t??u.U;return(await n.query(`
      SELECT round_index, (payload->>'eventId')::text as event_id
      FROM round_events
      WHERE game_id = $1 AND event_type = 'ROUND_STARTED'
      ORDER BY round_index ASC
    `,[e])).rows}async function c(e,t){let n=t??u.U;return(await n.query(`
      SELECT round_index, started_at
      FROM round_timing
      WHERE game_id = $1
      ORDER BY round_index ASC
    `,[e])).rows}async function m(e,t){let n=t??u.U;return(await n.query(`
      SELECT player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload
      FROM round_commits
      WHERE game_id = $1 AND player_id = $2
      ORDER BY round_index ASC
    `,[e,l.PRACTICE_PLAYER_ID])).rows}async function g(e,t,n=u.U){let r=await y(e,n);if(E(r.map(e=>e.round_index)),r.length!==t)throw Error("Session does not contain the required number of events");let a=await Promise.all(r.map(e=>(0,d.HW)(e.event_id,n)));if(a.some(e=>null===e))throw Error("Session contains an event that can no longer be loaded");return a}function h(e){if(!Number.isInteger(e)||e<0||e>=s.q3)throw Error("roundIndex must be an integer between 0 and 4")}async function f(e){let t=await (0,l.getTransactionClient)();try{await t.query("BEGIN");let n=await m(e,t);if(E(n.map(e=>e.round_index)),n.length>=s.q3){await t.query("COMMIT");return}let r=n.length,a=(await t.query(`
        SELECT round_index, started_at
        FROM round_timing
        WHERE game_id = $1 AND round_index = $2
        LIMIT 1
        FOR UPDATE
      `,[e,r])).rows[0];if(!a||w(new Date(a.started_at),new Date)>0){await t.query("COMMIT");return}let i=await y(e,t),u=i.find(e=>e.round_index===r)?.event_id;if(!u)throw Error("Canonical session event mapping is missing for the active round");let _=await (0,d.HW)(u,t);if(!_)throw Error("Canonical session event could not be loaded");let c=(0,o.p2)(_,{year:null,location:null},r,!0,{accuracy:0,xp:0});await t.query(`
        INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload)
        VALUES ($1, $2, $3, now(), $4, $5::jsonb, $6::jsonb, $7::jsonb)
        ON CONFLICT (game_id, player_id, round_index) DO NOTHING
      `,[e,l.PRACTICE_PLAYER_ID,r,null,null,JSON.stringify([]),JSON.stringify(c)]),await t.query("COMMIT")}catch(e){throw await t.query("ROLLBACK"),e}finally{t.release()}}async function I(e){await f(e);let t=await (0,l.loadSessionRow)(e);if(!t)return null;let[n,r,a,o]=await Promise.all([g(e,t.total_rounds),c(e),m(e),(0,l.loadSessionPlayerRows)(e)]),s=a.length,u=o.map(e=>{let t=a.some(t=>t.player_id===e.player_id&&t.round_index===s);return(0,l.mapSessionPlayerRowToPlayer)(e,t)});return function({gameId:e,events:t,timings:n,commits:r,totalRounds:a,sessionConfig:o,sessionPlayers:s,now:u}){E(r.map(e=>e.round_index));let d=(0,i.TI)(t,e),_=r.map(e=>(function(e,t,n){if(!("object"==typeof e&&null!==e&&"number"==typeof e.roundIndex&&Number.isFinite(e.roundIndex)))throw Error("Stored round result is invalid");if(e.roundIndex!==n||e.event.id!==t.id)throw Error("Stored round result does not match the canonical session event mapping");return e})(e.result_payload,t[e.round_index],e.round_index)),y=Math.min(_.length,Math.max(a-1,0)),c=n.find(e=>e.round_index===_.length)??null;return _.length>=a?{...d,phase:"SESSION_COMPLETE",currentRoundIndex:Math.max(a-1,0),timeRemaining:null,roundResults:_,sessionConfig:o,sessionPlayers:s,viewerPlayerId:l.PRACTICE_PLAYER_ID}:c?{...d,phase:"ROUND_ACTIVE",currentRoundIndex:_.length,timeRemaining:w(new Date(c.started_at),u),roundResults:_,sessionConfig:o,sessionPlayers:s,viewerPlayerId:l.PRACTICE_PLAYER_ID}:_.length>0?{...d,phase:"ROUND_COMPLETE",currentRoundIndex:y-1,timeRemaining:null,roundResults:_,sessionConfig:o,sessionPlayers:s,viewerPlayerId:l.PRACTICE_PLAYER_ID}:{...d,phase:"INIT",currentRoundIndex:0,timeRemaining:null,roundResults:_,sessionConfig:o,sessionPlayers:s,viewerPlayerId:l.PRACTICE_PLAYER_ID}}({gameId:t.game_id,events:n,timings:r,commits:a,totalRounds:t.total_rounds,sessionConfig:(0,l.mapSessionRowToConfig)(t),sessionPlayers:u,now:new Date})}async function R(){let e=await (0,d.N2)(s.q3);if(e.length!==s.q3)throw Error(`Expected ${s.q3} real events from the database, received ${e.length}`);let t=(0,a.randomUUID)(),n=BigInt(Date.now())^BigInt(Math.floor(4294967295*Math.random())),r=await (0,l.getTransactionClient)();try{await r.query("BEGIN"),await r.query(`
        INSERT INTO sessions (
          game_id,
          mode,
          round_timer_sec,
          total_rounds,
          year_min,
          year_max,
          created_at,
          seed
        )
        VALUES ($1, 'practice', $2, $3, $4, $5, now(), $6)
      `,[t,30,s.q3,-100,2026,n]),await r.query(`
        INSERT INTO session_players (game_id, player_id, joined_at)
        VALUES ($1, $2, now())
      `,[t,l.PRACTICE_PLAYER_ID]);for(let n=0;n<e.length;n+=1)await r.query("INSERT INTO round_events (game_id, round_index, event_type, payload) VALUES ($1, $2, 'ROUND_STARTED', $3::jsonb)",[t,n,JSON.stringify({eventId:e[n].id})]);await r.query("COMMIT")}catch(e){throw await r.query("ROLLBACK"),e}finally{r.release()}let i=await I(t);if(!i)throw Error("Unable to load the newly created practice session");return i}async function T(e,t){h(t),await f(e);let n=await (0,l.getTransactionClient)();try{if(await n.query("BEGIN"),!await (0,l.loadSessionRow)(e,n))throw Error("Session not found");let r=await m(e,n);E(r.map(e=>e.round_index));let a=r.length;if(t!==a)throw Error(`Round ${t} is not the next expected round`);let i=await n.query("SELECT round_index, started_at FROM round_timing WHERE game_id = $1 AND round_index = $2 LIMIT 1 FOR UPDATE",[e,t]);0===i.rows.length&&(await n.query("INSERT INTO round_timing (game_id, round_index, started_at) VALUES ($1, $2, now())",[e,t]),await n.query(`
          UPDATE sessions
          SET started_at = COALESCE(started_at, now())
          WHERE game_id = $1
        `,[e])),await n.query("COMMIT")}catch(e){throw await n.query("ROLLBACK"),e}finally{n.release()}let r=await I(e);if(!r)throw Error("Session not found");return r}async function p(e){let{gameId:t,roundIndex:n,yearGuess:r,locationGuess:a,hintsUsed:i}=e;if(h(n),null!==r&&(!Number.isInteger(r)||!Number.isFinite(r)))throw Error("yearGuess must be null or a finite integer");if(null!==a&&!("object"==typeof a&&null!==a&&"number"==typeof a.lat&&Number.isFinite(a.lat)&&"number"==typeof a.lng&&Number.isFinite(a.lng)))throw Error("locationGuess must be null or a finite latitude/longitude pair");if(!(Array.isArray(i)&&i.every(e=>"string"==typeof e&&e.trim().length>0)))throw Error("hintsUsed must be an array of non-empty strings");if(i.length>0)throw Error("Hints are not yet enabled for secure server commits");await f(t);let s=await (0,l.getTransactionClient)();try{await s.query("BEGIN");let e=await (0,l.loadSessionRow)(t,s);if(!e)throw Error("Session not found");if((await s.query(`
        SELECT player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload
        FROM round_commits
        WHERE game_id = $1 AND player_id = $2 AND round_index = $3
        LIMIT 1
        FOR UPDATE
      `,[t,l.PRACTICE_PLAYER_ID,n])).rows.length>0){await s.query("COMMIT");let e=await I(t);if(!e)throw Error("Session not found");return e}let u=await m(t,s);E(u.map(e=>e.round_index));let _=u.length;if(n!==_)throw Error(`Round ${n} is not the next expected round`);let c=(await s.query("SELECT round_index, started_at FROM round_timing WHERE game_id = $1 AND round_index = $2 LIMIT 1 FOR UPDATE",[t,n])).rows[0];if(!c)throw Error("Round has not been started");let g=await y(t,s),h=g.find(e=>e.round_index===n)?.event_id;if(!h)throw Error("Canonical session event mapping is missing for this round");let f=await (0,d.HW)(h,s);if(!f)throw Error("Canonical session event could not be loaded");let R=0===w(new Date(c.started_at),new Date);if(!R&&(null===r||null===a))throw Error("Manual submissions require both yearGuess and locationGuess");let T=R?{year:null,location:null}:{year:r,location:a},p=(0,o.p2)(f,T,n,R,{accuracy:0,xp:0});await s.query(`
        INSERT INTO round_commits (game_id, player_id, round_index, submitted_at, year_guess, location_guess, hints_used, result_payload)
        VALUES ($1, $2, $3, now(), $4, $5::jsonb, $6::jsonb, $7::jsonb)
      `,[t,l.PRACTICE_PLAYER_ID,n,T.year,null===T.location?null:JSON.stringify(T.location),JSON.stringify(i),JSON.stringify(p)]),n===e.total_rounds-1&&await s.query(`
          UPDATE sessions
          SET completed_at = now()
          WHERE game_id = $1
        `,[t]),await s.query("COMMIT")}catch(e){throw await s.query("ROLLBACK"),e}finally{s.release()}let u=await I(t);if(!u)throw Error("Session not found");return u}[u,d,l]=_.then?(await _)():_,r()}catch(e){r(e)}})}};