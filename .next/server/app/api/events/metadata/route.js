"use strict";(()=>{var e={};e.id=54,e.ids=[54],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},8678:e=>{e.exports=import("pg")},4927:(e,t,i)=>{i.a(e,async(e,a)=>{try{i.r(t),i.d(t,{originalPathname:()=>m,patchFetch:()=>d,requestAsyncStorage:()=>c,routeModule:()=>u,serverHooks:()=>y,staticGenerationAsyncStorage:()=>p});var n=i(9303),r=i(8716),o=i(670),s=i(4643),l=e([s]);s=(l.then?(await l)():l)[0];let u=new n.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/events/metadata/route",pathname:"/api/events/metadata",filename:"route",bundlePath:"app/api/events/metadata/route"},resolvedPagePath:"D:\\GH-NEW\\src\\app\\api\\events\\metadata\\route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:c,staticGenerationAsyncStorage:p,serverHooks:y}=u,m="/api/events/metadata/route";function d(){return(0,o.patchFetch)({serverHooks:y,staticGenerationAsyncStorage:p})}a()}catch(e){a(e)}})},4643:(e,t,i)=>{i.a(e,async(e,a)=>{try{i.r(t),i.d(t,{GET:()=>s,dynamic:()=>d,runtime:()=>l});var n=i(7070),r=i(575),o=e([r]);r=(o.then?(await o)():o)[0];let l="nodejs",d="force-dynamic";async function s(){try{let[e,t]=await Promise.all([(0,r.nM)(),(0,r.OV)()]);return n.NextResponse.json({regions:e,yearRange:t})}catch(t){let e=t instanceof Error?t.message:"Unable to fetch metadata";return console.error("Failed to fetch events metadata:",t),n.NextResponse.json({error:e},{status:500})}}a()}catch(e){a(e)}})},575:(e,t,i)=>{i.a(e,async(e,a)=>{try{i.d(t,{HW:()=>l,N2:()=>d,OV:()=>c,nM:()=>u});var n=i(6081),r=i(6341),o=e([r]);async function s(e={},t=r.U){let{limit:i=10,excludeIds:a=[],minYear:o,maxYear:s,regions:l}=e,d=["e.status = 'validated'","l.latitude IS NOT NULL","l.longitude IS NOT NULL"],u=[],c=1;a.length>0&&(d.push(`e.id != ALL($${c}::uuid[])`),u.push(a),c++),void 0!==o&&(d.push(`e.event_year >= $${c}`),u.push(o),c++),void 0!==s&&(d.push(`e.event_year <= $${c}`),u.push(s),c++),l&&l.length>0&&(d.push(`l.continent = ANY($${c}::text[])`),u.push(l),c++);let p=d.join(" AND "),y=`
    SELECT e.id
    FROM events e
    JOIN locations l ON l.event_id = e.id
    WHERE ${p}
    ORDER BY RANDOM()
    LIMIT $${c}
  `;u.push(i);let m=await t.query(y,u);if(0===m.rows.length)return[];let E=m.rows.map(e=>e.id),h=`
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
  `;return(await t.query(h,[E])).rows.map(e=>(0,n.p)(e))}async function l(e,t=r.U){let i=`
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
  `,a=await t.query(i,[e]);if(0===a.rows.length)return null;let o=`
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
  `,s=await t.query(o,[e]),l=a.rows[0],d=s.rows[0]?.hints??"[]";return(0,n.p)({...l,hints:d})}async function d(e,t={}){return s({limit:e,excludeIds:t.excludeEventIds,minYear:t.minYear,maxYear:t.maxYear,regions:t.regions})}async function u(){return(await r.U.query(`
    SELECT DISTINCT continent
    FROM locations
    WHERE continent IS NOT NULL
    ORDER BY continent
  `)).rows.map(e=>e.continent)}async function c(){let e=await r.U.query(`
    SELECT MIN(event_year) as min_year, MAX(event_year) as max_year
    FROM events
    WHERE event_year IS NOT NULL
  `);return{min:e.rows[0]?.min_year??1800,max:e.rows[0]?.max_year??2024}}r=(o.then?(await o)():o)[0],a()}catch(e){a(e)}})},6081:(e,t,i)=>{i.d(t,{p:()=>a});function a(e){let t=e.images??[],i=t.find(e=>e.isPrimary)||t[0]||null,a=e.hints??[];return{id:e.id,title:e.title,description:e.description??"",year:e.event_year,location:{id:e.id,name:e.display_name??"Unknown location",lat:e.latitude,lng:e.longitude},region:e.region??"Unknown",imageUrl:i?.imageUrl??null,thumbUrl:i?.thumbUrl??null,hints:a,category:e.category??void 0}}}};var t=require("../../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),a=t.X(0,[948,972,341],()=>i(4927));module.exports=a})();