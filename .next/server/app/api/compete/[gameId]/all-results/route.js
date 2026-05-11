"use strict";(()=>{var e={};e.id=87,e.ids=[87],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},8678:e=>{e.exports=import("pg")},9659:(e,r,t)=>{t.a(e,async(e,a)=>{try{t.r(r),t.d(r,{originalPathname:()=>_,patchFetch:()=>c,requestAsyncStorage:()=>l,routeModule:()=>u,serverHooks:()=>m,staticGenerationAsyncStorage:()=>p});var o=t(9303),n=t(8716),s=t(670),i=t(4150),d=e([i]);i=(d.then?(await d)():d)[0];let u=new o.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/compete/[gameId]/all-results/route",pathname:"/api/compete/[gameId]/all-results",filename:"route",bundlePath:"app/api/compete/[gameId]/all-results/route"},resolvedPagePath:"D:\\GH-NEW\\src\\app\\api\\compete\\[gameId]\\all-results\\route.ts",nextConfigOutput:"",userland:i}),{requestAsyncStorage:l,staticGenerationAsyncStorage:p,serverHooks:m}=u,_="/api/compete/[gameId]/all-results/route";function c(){return(0,s.patchFetch)({serverHooks:m,staticGenerationAsyncStorage:p})}a()}catch(e){a(e)}})},4150:(e,r,t)=>{t.a(e,async(e,a)=>{try{t.r(r),t.d(r,{GET:()=>i,dynamic:()=>c,runtime:()=>d});var o=t(7070),n=t(6341),s=e([n]);n=(s.then?(await s)():s)[0];let d="nodejs",c="force-dynamic";async function i(e,{params:r}){try{let e=r.gameId.trim();if(0===e.length)return o.NextResponse.json({error:"gameId is required"},{status:400});let t=(await n.U.query(`SELECT
        rr.player_id,
        rr.round_index,
        rr.score,
        rr.rank,
        rr.distance_km,
        rr.year_diff,
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
      WHERE rr.game_id = $1
      ORDER BY rr.round_index ASC, rr.rank ASC`,[e])).rows.map(e=>({playerId:e.player_id,roundIndex:e.round_index,score:e.score??0,rank:e.rank??0,distanceKm:e.distance_km,yearDiff:e.year_diff,locationScore:e.location_score,timeScore:e.time_score,didSubmit:null!==e.year_guess}));return o.NextResponse.json({results:t})}catch(r){let e=r instanceof Error?r.message:"Unable to get all round results";return o.NextResponse.json({error:e},{status:500})}}a()}catch(e){a(e)}})}};var r=require("../../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),a=r.X(0,[948,972,341],()=>t(9659));module.exports=a})();