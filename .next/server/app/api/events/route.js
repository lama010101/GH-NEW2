"use strict";(()=>{var e={};e.id=873,e.ids=[873],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},8678:e=>{e.exports=import("pg")},5882:(e,t,i)=>{i.a(e,async(e,n)=>{try{i.r(t),i.d(t,{originalPathname:()=>m,patchFetch:()=>d,requestAsyncStorage:()=>c,routeModule:()=>u,serverHooks:()=>y,staticGenerationAsyncStorage:()=>p});var a=i(9303),r=i(8716),s=i(670),o=i(3588),l=e([o]);o=(l.then?(await l)():l)[0];let u=new a.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/events/route",pathname:"/api/events",filename:"route",bundlePath:"app/api/events/route"},resolvedPagePath:"D:\\GH-NEW\\src\\app\\api\\events\\route.ts",nextConfigOutput:"",userland:o}),{requestAsyncStorage:c,staticGenerationAsyncStorage:p,serverHooks:y}=u,m="/api/events/route";function d(){return(0,s.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:p})}n()}catch(e){n(e)}})},3588:(e,t,i)=>{i.a(e,async(e,n)=>{try{i.r(t),i.d(t,{GET:()=>l,dynamic:()=>u,runtime:()=>d});var a=i(7070),r=i(575),s=i(8413),o=e([r]);r=(o.then?(await o)():o)[0];let d="nodejs",u="force-dynamic";async function l(e){try{let{searchParams:t}=new URL(e.url),i=Math.min(parseInt(t.get("count")||String(s.q3),10),20),n=t.get("exclude")?.split(",").filter(Boolean)||[],o=t.has("minYear")?parseInt(t.get("minYear"),10):void 0,l=t.has("maxYear")?parseInt(t.get("maxYear"),10):void 0,d=t.get("regions")?.split(",").filter(Boolean)||void 0,u=await (0,r.N2)(i,{excludeEventIds:n,minYear:o,maxYear:l,regions:d});if(0===u.length)return a.NextResponse.json({error:"No events found matching criteria"},{status:404});return a.NextResponse.json({events:u,count:u.length,filters:{minYear:o,maxYear:l,regions:d}})}catch(t){let e=t instanceof Error?t.message:"Unable to fetch events";return console.error("Failed to fetch events:",t),a.NextResponse.json({error:e},{status:500})}}n()}catch(e){n(e)}})},8413:(e,t,i)=>{i.d(t,{Ze:()=>r,fF:()=>s,mb:()=>a,q3:()=>n});let n=5,a=5,r=300,s=1},575:(e,t,i)=>{i.a(e,async(e,n)=>{try{i.d(t,{HW:()=>l,N2:()=>d,OV:()=>c,nM:()=>u});var a=i(6081),r=i(6341),s=e([r]);async function o(e={},t=r.U){let{limit:i=10,excludeIds:n=[],minYear:s,maxYear:o,regions:l}=e,d=["e.status = 'validated'","l.latitude IS NOT NULL","l.longitude IS NOT NULL"],u=[],c=1;n.length>0&&(d.push(`e.id != ALL($${c}::uuid[])`),u.push(n),c++),void 0!==s&&(d.push(`e.event_year >= $${c}`),u.push(s),c++),void 0!==o&&(d.push(`e.event_year <= $${c}`),u.push(o),c++),l&&l.length>0&&(d.push(`l.continent = ANY($${c}::text[])`),u.push(l),c++);let p=d.join(" AND "),y=`
    SELECT e.id
    FROM events e
    JOIN locations l ON l.event_id = e.id
    WHERE ${p}
    ORDER BY RANDOM()
    LIMIT $${c}
  `;u.push(i);let m=await t.query(y,u);if(0===m.rows.length)return[];let h=m.rows.map(e=>e.id),g=`
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
  `;return(await t.query(g,[h])).rows.map(e=>(0,a.p)(e))}async function l(e,t=r.U){let i=`
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
  `,n=await t.query(i,[e]);if(0===n.rows.length)return null;let s=`
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
  `,o=await t.query(s,[e]),l=n.rows[0],d=o.rows[0]?.hints??"[]";return(0,a.p)({...l,hints:d})}async function d(e,t={}){return o({limit:e,excludeIds:t.excludeEventIds,minYear:t.minYear,maxYear:t.maxYear,regions:t.regions})}async function u(){return(await r.U.query(`
    SELECT DISTINCT continent
    FROM locations
    WHERE continent IS NOT NULL
    ORDER BY continent
  `)).rows.map(e=>e.continent)}async function c(){let e=await r.U.query(`
    SELECT MIN(event_year) as min_year, MAX(event_year) as max_year
    FROM events
    WHERE event_year IS NOT NULL
  `);return{min:e.rows[0]?.min_year??1800,max:e.rows[0]?.max_year??2024}}r=(s.then?(await s)():s)[0],n()}catch(e){n(e)}})},6081:(e,t,i)=>{i.d(t,{p:()=>n});function n(e){let t=e.images??[],i=t.find(e=>e.isPrimary)||t[0]||null,n=e.hints??[];return{id:e.id,title:e.title,description:e.description??"",year:e.event_year,location:{id:e.id,name:e.display_name??"Unknown location",lat:e.latitude,lng:e.longitude},region:e.region??"Unknown",imageUrl:i?.imageUrl??null,thumbUrl:i?.thumbUrl??null,hints:n,category:e.category??void 0}}}};var t=require("../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),n=t.X(0,[948,972,341],()=>i(5882));module.exports=n})();