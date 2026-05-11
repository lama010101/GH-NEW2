(()=>{var e={};e.id=66,e.ids=[66],e.modules={2934:e=>{"use strict";e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{"use strict";e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{"use strict";e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},5315:e=>{"use strict";e.exports=require("path")},7360:e=>{"use strict";e.exports=require("url")},5232:(e,t,n)=>{"use strict";n.r(t),n.d(t,{GlobalError:()=>s.a,__next_app__:()=>h,originalPathname:()=>p,pages:()=>c,routeModule:()=>f,tree:()=>d}),n(903),n(2029),n(5866);var a=n(3191),i=n(8716),r=n(7922),s=n.n(r),l=n(5231),o={};for(let e in l)0>["default","tree","pages","GlobalError","originalPathname","__next_app__","routeModule"].indexOf(e)&&(o[e]=()=>l[e]);n.d(t,o);let d=["",{children:["compete",{children:["[gameId]",{children:["__PAGE__",{},{page:[()=>Promise.resolve().then(n.bind(n,903)),"D:\\GH-NEW\\src\\app\\compete\\[gameId]\\page.tsx"]}]},{}]},{metadata:{icon:[async e=>(await Promise.resolve().then(n.bind(n,3881))).default(e)],apple:[],openGraph:[],twitter:[],manifest:void 0}}]},{layout:[()=>Promise.resolve().then(n.bind(n,2029)),"D:\\GH-NEW\\src\\app\\layout.tsx"],"not-found":[()=>Promise.resolve().then(n.t.bind(n,5866,23)),"next/dist/client/components/not-found-error"],metadata:{icon:[async e=>(await Promise.resolve().then(n.bind(n,3881))).default(e)],apple:[],openGraph:[],twitter:[],manifest:void 0}}],c=["D:\\GH-NEW\\src\\app\\compete\\[gameId]\\page.tsx"],p="/compete/[gameId]/page",h={require:n,loadChunk:()=>Promise.resolve()},f=new a.AppPageRouteModule({definition:{kind:i.x.APP_PAGE,page:"/compete/[gameId]/page",pathname:"/compete/[gameId]",bundlePath:"",filename:"",appPaths:[]},userland:{loaderTree:d}})},5560:(e,t,n)=>{Promise.resolve().then(n.t.bind(n,2994,23)),Promise.resolve().then(n.t.bind(n,6114,23)),Promise.resolve().then(n.t.bind(n,9727,23)),Promise.resolve().then(n.t.bind(n,9671,23)),Promise.resolve().then(n.t.bind(n,1868,23)),Promise.resolve().then(n.t.bind(n,4759,23))},3089:(e,t,n)=>{Promise.resolve().then(n.bind(n,221))},1107:()=>{},3353:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return r}});let a=n(1174);n(326),n(7577);let i=a._(n(7028));function r(e,t){var n;let a={loading:e=>{let{error:t,isLoading:n,pastDelay:a}=e;return null}};"function"==typeof e&&(a.loader=e);let r={...a,...t};return(0,i.default)({...r,modules:null==(n=r.loadableGenerated)?void 0:n.modules})}("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),e.exports=t.default)},933:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"BailoutToCSR",{enumerable:!0,get:function(){return i}});let a=n(4129);function i(e){let{reason:t,children:n}=e;throw new a.BailoutToCSRError(t)}},7028:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return d}});let a=n(326),i=n(7577),r=n(933),s=n(6618);function l(e){return{default:e&&"default"in e?e.default:e}}let o={loader:()=>Promise.resolve(l(()=>null)),loading:null,ssr:!0},d=function(e){let t={...o,...e},n=(0,i.lazy)(()=>t.loader().then(l)),d=t.loading;function c(e){let l=d?(0,a.jsx)(d,{isLoading:!0,pastDelay:!0,error:null}):null,o=t.ssr?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(s.PreloadCss,{moduleIds:t.modules}),(0,a.jsx)(n,{...e})]}):(0,a.jsx)(r.BailoutToCSR,{reason:"next/dynamic",children:(0,a.jsx)(n,{...e})});return(0,a.jsx)(i.Suspense,{fallback:l,children:o})}return c.displayName="LoadableComponent",c}},6618:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"PreloadCss",{enumerable:!0,get:function(){return r}});let a=n(326),i=n(4580);function r(e){let{moduleIds:t}=e,n=(0,i.getExpectedRequestStore)("next/dynamic css"),r=[];if(n.reactLoadableManifest&&t){let e=n.reactLoadableManifest;for(let n of t){if(!e[n])continue;let t=e[n].files.filter(e=>e.endsWith(".css"));r.push(...t)}}return 0===r.length?null:(0,a.jsx)(a.Fragment,{children:r.map(e=>(0,a.jsx)("link",{precedence:"dynamic",rel:"stylesheet",href:n.assetPrefix+"/_next/"+encodeURI(e),as:"style"},e))})}},221:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>C});var a=n(326),i=n(7577),r=n(5047),s=n(7661);let l={1:{acc:10,xp:20},2:{acc:20,xp:40},3:{acc:30,xp:60},4:{acc:40,xp:80},5:{acc:50,xp:100}},o={calendar:'<svg viewBox="0 0 13 13" fill="none"><rect x="1.2" y="2" width="10.6" height="10" rx="1.5" stroke="#888" stroke-width="1.1"/><path d="M4.3 1v2M8.7 1v2M1.2 5.3h10.6" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>',clock:'<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M6.5 3.5v3l2 1.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>',trend:'<svg viewBox="0 0 13 13" fill="none"><path d="M2 9.5l3-4 2.5 2 4-5" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',tag:'<svg viewBox="0 0 13 13" fill="none"><path d="M2 2h5l4.5 4.5a1 1 0 010 1.4l-3.1 3.1a1 1 0 01-1.4 0L2.5 6.5V2H2z" stroke="#888" stroke-width="1.1"/><circle cx="4.5" cy="4.5" r=".8" fill="#888"/></svg>',globe:'<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M1.5 6.5h10M6.5 1.5c-2 2-2 8 0 10M6.5 1.5c2 2-2 8 0 10" stroke="#888" stroke-width="1.1"/></svg>',mountain:'<svg viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l4-7 2.5 4 1.5-2 3 5H1.5z" stroke="#888" stroke-width="1.1" stroke-linejoin="round"/></svg>',flag:'<svg viewBox="0 0 13 13" fill="none"><path d="M3 11V2M3 2h7.5L8.5 5.5 10.5 9H3" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',check:'<svg viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-5" stroke="#7ed957" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'};function d(e){return 0===e?"#2a2a2a":e<=20?"rgba(126,217,87,0.4)":e<=40?"rgba(232,192,34,0.4)":e<=60?"rgba(232,119,34,0.4)":"rgba(232,68,34,0.4)"}function c({hints:e,isOpen:t,onClose:n,purchasedIds:r}){let s,c,p,h;let[f,u]=(0,i.useState)(new Set(r)),[x,g]=(0,i.useState)("when"),m=e=>1===e?"hint-cost-g":2===e?"hint-cost-y":e<=4?"hint-cost-o":"hint-cost-r",y=e=>0===e?"zero":e<=20?"g":e<=40?"y":e<=60?"o":"r",b=(0,i.useMemo)(()=>{let t=e.filter(e=>"when"===e.type),n=e.filter(e=>"where"===e.type),a=t.reduce((e,t)=>f.has(t.id)?e+l[t.tier].acc:e,0);return{whenAcc:Math.min(a,100),whereAcc:Math.min(n.reduce((e,t)=>f.has(t.id)?e+l[t.tier].acc:e,0),100),totalAcc:Math.min(e.reduce((e,t)=>f.has(t.id)?e+l[t.tier].acc:e,0),100),totalXp:Math.min(e.reduce((e,t)=>f.has(t.id)?e+l[t.tier].xp:e,0),200)}},[e,f]),j=(0,i.useMemo)(()=>e.filter(e=>e.type===x).sort((e,t)=>e.display_order!==t.display_order?e.display_order-t.display_order:e.tier-t.tier),[e,x]),v=e=>{u(t=>new Set([...t,e]))},k=()=>{n({purchasedIds:Array.from(f),accPenalty:b.totalAcc,xpPenalty:b.totalXp,whereAccPenalty:b.whereAcc,whenAccPenalty:b.whenAcc})};return t?(0,a.jsxs)(a.Fragment,{children:[a.jsx("style",{children:`
        .hint-modal-root {
          --modal-bg: #111;
          --modal-surface: #1a1a1a;
          --modal-surface2: #141414;
          --modal-surface3: #1e1e1e;
          --modal-border: #1e1e1e;
          --modal-border-md: #252525;
          --modal-border-hi: #333;
          --modal-text: #fff;
          --modal-text-dim: #bbb;
          --modal-text-muted: #666;
          --modal-g: #7ed957;
          --modal-y: #e8c022;
          --modal-o: #E87722;
          --modal-r: #e84422;
        }
        /* TODO: light theme — add .light class overrides when theme system is implemented */
        .hint-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .hint-modal {
          width: 100%;
          max-width: 460px;
          background: var(--modal-bg);
          border-radius: 16px;
          border: 0.5px solid var(--modal-border-md);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          color: var(--modal-text);
        }
        .hint-modal-header {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 0.5px solid var(--modal-border);
        }
        .hint-modal-title {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--modal-text);
        }
        .hint-modal-close {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #2a2a2a;
          border: 0.5px solid #444;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .hint-modal-close svg {
          width: 10px;
          height: 10px;
        }
        .hint-total-strip {
          padding: 16px 18px 14px;
          border-bottom: 0.5px solid var(--modal-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .hint-total-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .hint-total-lbl {
          font-size: 10px;
          font-weight: 500;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .hint-total-big {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 800;
          font-size: 38px;
          line-height: 1;
          color: var(--modal-g);
        }
        .hint-total-big.y { color: var(--modal-y); }
        .hint-total-big.o { color: var(--modal-o); }
        .hint-total-big.r { color: var(--modal-r); }
        .hint-total-big.zero { color: #333; }
        .hint-total-right {
          display: flex;
          gap: 10px;
        }
        .hint-axis-pen {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          background: transparent;
          border: 0.5px solid transparent;
          border-radius: 10px;
          padding: 8px 12px;
        }
        .hint-axis-icon {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .hint-axis-icon svg {
          width: 10px;
          height: 10px;
          flex-shrink: 0;
        }
        .hint-axis-lbl {
          font-size: 9px;
          font-weight: 500;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }
        .hint-axis-val {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 15px;
          line-height: 1;
          color: var(--modal-text);
        }
        .hint-axis-val--zero { color: #333; }
        .hint-axis-val--g { color: #7ed957; }
        .hint-axis-val--y { color: #e8c022; }
        .hint-axis-val--o { color: #E87722; }
        .hint-axis-val--r { color: #e84422; }
        .hint-axis-track {
          width: 56px;
          height: 2px;
          background: #1e1e1e;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 3px;
        }
        .hint-axis-fill {
          height: 100%;
          border-radius: 2px;
          background: #fff;
          transition: width 0.25s ease;
        }
        .hint-tab-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin: 12px 14px 0;
          background: transparent;
          border-radius: 0;
          padding: 0;
          border: none;
          border-bottom: 0.5px solid #2a2a2a;
        }
        .hint-tab-btn {
          padding: 9px 0;
          border-radius: 0;
          border: none;
          border-bottom: 2px solid transparent;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: color 0.15s;
        }
        .hint-tab-btn.active {
          background: transparent;
          border: none;
          border-bottom: 2px solid #f97316;
          border-radius: 0;
        }
        .hint-tab-lbl {
          font-size: 13px;
          font-weight: 500;
          color: #666;
        }
        .hint-tab-btn.active .hint-tab-lbl {
          color: #f97316;
          font-weight: 600;
        }
        .hint-tab-btn svg path,
        .hint-tab-btn svg rect,
        .hint-tab-btn svg circle {
          stroke: #666;
        }
        .hint-tab-btn.active svg path,
        .hint-tab-btn.active svg rect,
        .hint-tab-btn.active svg circle {
          stroke: #f97316;
        }
        .hint-tab-badge {
          margin-left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--modal-surface);
          border: 0.5px solid var(--modal-border-md);
          font-size: 9px;
          font-weight: 700;
          color: var(--modal-text-muted);
          display: none;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        .hint-hints-panel {
          padding: 10px 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-height: 380px;
          overflow-y: auto;
        }
        .hint-hints-panel::-webkit-scrollbar {
          width: 2px;
        }
        .hint-hints-panel::-webkit-scrollbar-thumb {
          background: #222;
          border-radius: 2px;
        }
        .hint-btn {
          background: #2a2a2a;
          border: 0.5px solid #383838;
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: border-color 0.12s, background 0.12s, transform 0.08s;
          position: relative;
          overflow: hidden;
          text-align: left;
          width: 100%;
        }
        .hint-btn:hover:not(.revealed) {
          background: #333;
          border-color: #444;
          transform: translateY(-1px);
        }
        .hint-btn:active:not(.revealed) {
          transform: translateY(0);
        }
        .hint-btn.revealed {
          border-color: rgba(126, 217, 87, 0.25);
          background: rgba(126, 217, 87, 0.06);
          cursor: default;
        }
        .hint-btn.revealed::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #7ed957;
        }
        .hint-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #333;
          border: 0.5px solid #444;
          transition: background 0.12s;
        }
        .hint-icon svg {
          width: 13px;
          height: 13px;
        }
        .hint-btn:hover:not(.revealed) .hint-icon {
          background: #222;
        }
        .hint-body {
          flex: 1;
          min-width: 0;
        }
        .hint-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--modal-text);
          margin-bottom: 2px;
          line-height: 1.3;
        }
        .hint-btn.revealed .hint-name {
          color: #fff;
        }
        .hint-sub {
          font-size: 11px;
          color: #999;
          line-height: 1.4;
        }
        .hint-answer {
          font-size: 12px;
          color: var(--modal-text-dim);
          line-height: 1.45;
          font-style: italic;
          margin-top: 2px;
        }
        .hint-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
          flex-shrink: 0;
        }
        .hint-cost-pill {
          display: flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          font-weight: 700;
          font-size: 11px;
          border: 0.5px solid;
          letter-spacing: 0.02em;
          transition: opacity 0.12s;
        }
        .hint-cost-g {
          background: rgba(126, 217, 87, 0.10);
          border-color: rgba(126, 217, 87, 0.3);
          color: var(--modal-g);
        }
        .hint-cost-y {
          background: rgba(232, 192, 34, 0.10);
          border-color: rgba(232, 192, 34, 0.3);
          color: var(--modal-y);
        }
        .hint-cost-o {
          background: rgba(232, 119, 34, 0.10);
          border-color: rgba(232, 119, 34, 0.3);
          color: var(--modal-o);
        }
        .hint-cost-r {
          background: rgba(232, 68, 34, 0.10);
          border-color: rgba(232, 68, 34, 0.3);
          color: var(--modal-r);
        }
        .hint-check-dot {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(126, 217, 87, 0.15);
          border: 0.5px solid rgba(126, 217, 87, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hint-check-dot svg {
          width: 9px;
          height: 9px;
        }
      `}),a.jsx("div",{className:"hint-modal-backdrop",onClick:k,children:(0,a.jsxs)("div",{className:"hint-modal hint-modal-root",role:"dialog","aria-modal":"true",onClick:e=>e.stopPropagation(),children:[(0,a.jsxs)("div",{className:"hint-modal-header",children:[a.jsx("div",{className:"hint-modal-title",children:"Hints"}),a.jsx("button",{className:"hint-modal-close",onClick:k,"aria-label":"Close hints",children:a.jsx("svg",{viewBox:"0 0 10 10",fill:"none",children:a.jsx("path",{d:"M2 2l6 6M8 2L2 8",stroke:"#aaa"})})})]}),(0,a.jsxs)("div",{className:"hint-total-strip",children:[(0,a.jsxs)("div",{className:"hint-total-left",children:[a.jsx("div",{className:"hint-total-lbl",children:"Total penalty"}),(0,a.jsxs)("div",{className:`hint-total-big ${y(b.totalAcc)}`,children:["−",b.totalAcc,"%"]})]}),(0,a.jsxs)("div",{className:"hint-total-right",children:[(0,a.jsxs)("div",{className:"hint-axis-pen",style:{borderColor:d(b.whenAcc)},children:[(0,a.jsxs)("div",{className:"hint-axis-icon",children:[(0,a.jsxs)("svg",{viewBox:"0 0 10 10",fill:"none",children:[a.jsx("rect",{x:"1",y:"1.5",width:"8",height:"7.5",rx:"1.2",stroke:"#555",strokeWidth:"1.1"}),a.jsx("path",{d:"M3.5 1v1.5M6.5 1v1.5M1 4h8",stroke:"#555",strokeWidth:"1.1",strokeLinecap:"round"})]}),a.jsx("span",{className:"hint-axis-lbl",children:"When"})]}),(0,a.jsxs)("div",{className:`hint-axis-val hint-axis-val--${y(b.whenAcc)}`,children:["−",b.whenAcc,"%"]}),a.jsx("div",{className:"hint-axis-track",children:a.jsx("div",{className:"hint-axis-fill",style:{width:`${b.whenAcc}%`}})})]}),(0,a.jsxs)("div",{className:"hint-axis-pen",style:{borderColor:d(b.whereAcc)},children:[(0,a.jsxs)("div",{className:"hint-axis-icon",children:[a.jsx("svg",{viewBox:"0 0 10 10",fill:"none",children:a.jsx("path",{d:"M5 1C3.62 1 2.5 2.12 2.5 3.5c0 1.88 2.5 5.5 2.5 5.5s2.5-3.62 2.5-5.5C7.5 2.12 6.38 1 5 1zm0 3.33a.83.83 0 110-1.66.83.83 0 010 1.66z",fill:"#555"})}),a.jsx("span",{className:"hint-axis-lbl",children:"Where"})]}),(0,a.jsxs)("div",{className:`hint-axis-val hint-axis-val--${y(b.whereAcc)}`,children:["−",b.whereAcc,"%"]}),a.jsx("div",{className:"hint-axis-track",children:a.jsx("div",{className:"hint-axis-fill",style:{width:`${b.whereAcc}%`}})})]})]})]}),(0,a.jsxs)("div",{className:"hint-tab-row",children:[(0,a.jsxs)("button",{className:`hint-tab-btn ${"when"===x?"active":""}`,onClick:()=>g("when"),children:[(0,a.jsxs)("svg",{viewBox:"0 0 12 12",fill:"none",width:"12",height:"12",children:[a.jsx("rect",{x:"1.5",y:"2",width:"9",height:"9",rx:"1.5",strokeWidth:"1.2"}),a.jsx("path",{d:"M4 1v2M8 1v2M1.5 5h9",strokeWidth:"1.2",strokeLinecap:"round"})]}),a.jsx("span",{className:"hint-tab-lbl",children:"When"}),(s="when",e.filter(e=>e.type===s&&f.has(e.id)).length>0&&a.jsx("div",{className:"hint-tab-badge",children:(c="when",e.filter(e=>e.type===c&&f.has(e.id)).length)}))]}),(0,a.jsxs)("button",{className:`hint-tab-btn ${"where"===x?"active":""}`,onClick:()=>g("where"),children:[a.jsx("svg",{viewBox:"0 0 12 12",fill:"none",width:"12",height:"12",children:a.jsx("path",{d:"M6 1C4.34 1 3 2.34 3 4c0 2.25 3 7 3 7s3-4.75 3-7c0-1.66-1.34-3-3-3zm0 4a1 1 0 110-2 1 1 0 010 2z",strokeWidth:"1.2"})}),a.jsx("span",{className:"hint-tab-lbl",children:"Where"}),(p="where",e.filter(e=>e.type===p&&f.has(e.id)).length>0&&a.jsx("div",{className:"hint-tab-badge",children:(h="where",e.filter(e=>e.type===h&&f.has(e.id)).length)}))]})]}),a.jsx("div",{className:"hint-hints-panel",children:j.map(e=>{let t=f.has(e.id),n=l[e.tier];return(0,a.jsxs)("button",{className:`hint-btn ${t?"revealed":""}`,onClick:()=>!t&&v(e.id),disabled:t,"aria-pressed":t,children:[a.jsx("div",{className:"hint-icon",dangerouslySetInnerHTML:{__html:function(e){if("when"===e.type){if(1===e.tier)return o.clock;if(2===e.tier)return o.trend;if(3===e.tier)return o.calendar;if(4===e.tier)return o.trend;if(5===e.tier)return o.tag}if("where"===e.type){if(1===e.tier)return o.globe;if(2===e.tier)return o.mountain;if(3===e.tier)return o.flag;if(4===e.tier)return o.mountain;if(5===e.tier)return o.tag}return o.calendar}(e)}}),(0,a.jsxs)("div",{className:"hint-body",children:[a.jsx("div",{className:"hint-name",children:function(e){if("when"===e.type){if(1===e.tier)return"Century";if(2===e.tier)return"Historical Event";if(3===e.tier)return"Decade";if(4===e.tier)return"Contemporary Event";if(5===e.tier)return"Visual Clues"}if("where"===e.type){if(1===e.tier)return"Continent";if(2===e.tier)return"Remote Landmark";if(3===e.tier)return"Region";if(4===e.tier)return"Nearby Landmark";if(5===e.tier)return"Visual Clues"}return"Hint"}(e)}),t?a.jsx("div",{className:"hint-answer",children:function(e){let t=e.metadata;return"where"===e.type&&(2===e.tier||4===e.tier)&&t?.km!=null?`${e.content} — ${t.km} km away`:"when"===e.type&&(2===e.tier||4===e.tier)&&t?.years!=null?`${e.content} — ${t.years} years off`:e.content}(e)}):a.jsx("div",{className:"hint-sub",children:function(e){if("when"===e.type){if(1===e.tier)return"Broad era clue";if(2===e.tier)return"A historically nearby event";if(3===e.tier)return"A 10-year window";if(4===e.tier)return"A closely dated event";if(5===e.tier)return"Scene elements suggesting the era"}if("where"===e.type){if(1===e.tier)return"Broad region clue";if(2===e.tier){let t=e.metadata?.km;return null!=t?`A landmark ~${t} km away`:"A distant landmark"}if(3===e.tier)return"Administrative region";if(4===e.tier){let t=e.metadata?.km;return null!=t?`A landmark ~${t} km away`:"A nearby landmark"}if(5===e.tier)return"Scene elements suggesting the location"}return"Tap to reveal"}(e)})]}),a.jsx("div",{className:"hint-right",children:t?a.jsx("div",{className:"hint-check-dot",dangerouslySetInnerHTML:{__html:o.check}}):(0,a.jsxs)("div",{className:`hint-cost-pill ${m(e.tier)}`,children:["−",n.acc,"%"]})})]},e.id)})})]})})]}):null}let p=[["#93c5fd","#fb923c"],["#93c5fd","#c084fc"],["#93c5fd","#2dd4bf"],["#fb923c","#93c5fd"],["#fb923c","#c084fc"],["#fb923c","#2dd4bf"],["#c084fc","#93c5fd"],["#c084fc","#fb923c"],["#c084fc","#2dd4bf"],["#2dd4bf","#93c5fd"],["#2dd4bf","#fb923c"],["#2dd4bf","#c084fc"]];function h(e){let t=0;for(let n=0;n<e.length;n++)t=31*t+e.charCodeAt(n)>>>0;let[n,a]=p[t%p.length];return{background:`linear-gradient(90deg, ${n}, ${a})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontWeight:500,display:"inline"}}function f(e){return e.slice(0,8)}function u(e,t){let n=e.find(e=>e.playerId===t);return n&&n.displayName.trim().length>0?n.displayName:f(t)}function x(e,t,n,a){let i=Math.sin((n-e)*Math.PI/180/2)**2+Math.cos(e*Math.PI/180)*Math.cos(n*Math.PI/180)*Math.sin((a-t)*Math.PI/180/2)**2;return 12742*Math.atan2(Math.sqrt(i),Math.sqrt(1-i))}function g({badges:e,nearMisses:t,onDismiss:n}){let i={gold:"0 0 18px 4px rgba(255,215,0,0.45)",silver:"0 0 18px 4px rgba(192,192,192,0.35)",bronze:"0 0 18px 4px rgba(205,127,50,0.35)"},r={location:"WHERE",year:"WHEN",combo:"COMBO"},s={location:"\uD83D\uDCCD",year:"\uD83D\uDCC5",combo:"⚡"},l={gold:3,silver:2,bronze:1},o=null;for(let t of e){if(!o){o=t;continue}if("combo"===t.dimension){o=t;break}l[t.tier]>l[o.tier]&&(o=t)}return(0,a.jsxs)("div",{onClick:n,style:{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",animation:"badgeFadeIn 0.28s ease"},children:[a.jsx("style",{children:`
        @keyframes badgeFadeIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes badgePop {
          0%   { opacity: 0; transform: scale(0.7) translateY(12px); }
          65%  { transform: scale(1.08) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes coinRise {
          from { transform: translateY(24px) scale(0.7); opacity: 0; }
          to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        @keyframes iconDrop {
          from { transform: translateY(-20px) scale(0.7); opacity: 0; }
          to   { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        @keyframes starsDrop {
          from { transform: translateY(-28px) scale(0.6); opacity: 0; }
          to   { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        @keyframes medalSnap {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.08); }
          70%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
      `}),(0,a.jsxs)("div",{onClick:e=>e.stopPropagation(),style:{background:"#1e1e1e",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"28px 24px 22px",maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,0.6)"},children:[o&&(0,a.jsxs)("div",{style:{fontSize:13,fontWeight:700,color:{gold:"#FFD700",silver:"#C0C0C0",bronze:"#CD7F32"}[o.tier],marginBottom:18,letterSpacing:"0.5px"},children:[o.tier.toUpperCase()," \xb7 ",r[o.dimension]]}),a.jsx("div",{style:{display:"flex",justifyContent:"center",gap:10,flexWrap:"wrap",marginBottom:t.length>0?16:0},children:e.map((e,t)=>{let n=o?.dimension===e.dimension&&o?.tier===e.tier;return a.jsx("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:76,animation:`badgePop 0.45s ease ${.12*t+.1}s both`},children:(()=>{let r="year"===e.dimension?"calendar":"location"===e.dimension?"map":"combo",s="gold"===e.tier?3:"silver"===e.tier?2:1,l=.22*t;return(0,a.jsxs)("div",{style:{position:"relative",width:"100px",height:"110px",margin:"0 auto"},children:[a.jsx("div",{style:{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:"90px",height:"90px",borderRadius:"50%",boxShadow:n?i[e.tier]:"none"},children:a.jsx("img",{src:`/badges/coin_${e.tier}.webp`,alt:"",style:{width:"100%",height:"100%",objectFit:"contain",animation:`coinRise 0.28s ease ${l}s both, medalSnap 0.12s ease ${l+.3}s both`}})}),a.jsx("img",{src:`/badges/${r}_${e.tier}.webp`,alt:"",style:{position:"absolute",bottom:"8px",left:"50%",width:"50px",height:"50px",transform:"translateX(-50%)",objectFit:"contain",animation:`iconDrop 0.28s ease ${l+.05}s both, medalSnap 0.12s ease ${l+.3}s both`}}),Array.from({length:s}).map((t,n)=>a.jsx("img",{src:`/badges/star_${e.tier}.webp`,alt:"",style:{position:"absolute",top:0,left:`${{1:[50],2:[35,65],3:[25,50,75]}[s][n]}%`,width:{1:"42%",2:"30%",3:"24%"}[s],height:"auto",transform:"translateX(-50%)",objectFit:"contain",animation:`starsDrop 0.28s ease ${l+.1}s both, medalSnap 0.12s ease ${l+.3}s both`}},n))]})})()},t)})}),t.length>0&&(0,a.jsxs)(a.Fragment,{children:[a.jsx("div",{style:{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:"1.5px",marginBottom:8},children:"So Close"}),a.jsx("div",{style:{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:4},children:t.map((t,n)=>(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 12px",minWidth:64,opacity:.75,animation:`badgePop 0.4s ease ${.1*n+.12*e.length+.2}s both`},children:[a.jsx("span",{style:{fontSize:18},children:s[t.dimension]}),a.jsx("span",{style:{fontSize:10,fontWeight:700,color:"#666",textTransform:"uppercase",letterSpacing:"0.5px"},children:"CLOSE"}),a.jsx("span",{style:{fontSize:10,color:"#666",textTransform:"uppercase"},children:r[t.dimension]}),(0,a.jsxs)("span",{style:{fontSize:11,color:"#888",fontWeight:600},children:[t.accuracy,a.jsx("span",{style:{color:"#ffffff",fontSize:"2.75px"},children:"%"})]})]},n))})]}),a.jsx("button",{onClick:n,style:{marginTop:20,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,color:"#aaa",fontSize:12,padding:"8px 24px",cursor:"pointer",letterSpacing:"0.5px"},children:"TAP TO DISMISS"})]})]})}function m({value:e}){let t=2*Math.PI*80,[n,r]=(0,i.useState)(0),s=Math.max(0,Math.min(100,n)),l=`hsl(${Math.round(s/100*120)}, 100%, 50%)`;return(0,a.jsxs)("svg",{viewBox:"0 0 200 200",style:{width:170,height:170,display:"block",margin:"0 auto"},children:[a.jsx("circle",{cx:100,cy:100,r:80,fill:"none",stroke:"#2a2a2a",strokeWidth:15}),a.jsx("circle",{cx:100,cy:100,r:80,fill:"none",stroke:l,strokeWidth:15,strokeLinecap:"round",strokeDasharray:t,strokeDashoffset:t*(1-s/100),transform:"rotate(-90 100 100)"}),a.jsx("text",{x:100,y:100,textAnchor:"middle",dominantBaseline:"central",fill:"white",fontSize:52,fontWeight:"bold",children:s})]})}function y({snapshot:e,playerId:t,allRoundResults:n,setFullscreenImg:i}){let s=(0,r.useRouter)(),l=e=>{if(!n)return null;let t=n.filter(t=>t.playerId===e&&t.didSubmit);if(0===t.length)return null;let a=t.reduce((e,t)=>e+t.score,0),i=Math.round(t.reduce((e,t)=>e+((t.locationScore??0)+(t.timeScore??0))/2,0)/t.length),r=Math.round(t.reduce((e,t)=>e+(t.locationScore??0),0)/t.length),s=Math.round(t.reduce((e,t)=>e+(t.timeScore??0),0)/t.length);return{totalScore:a,avgAccuracy:i,avgLocationAccuracy:r,avgYearAccuracy:s,avgConsistency:Math.round(t.reduce((e,t)=>e+Math.min(t.locationScore??0,t.timeScore??0),0)/t.length),avgDistanceKm:t.reduce((e,t)=>e+(t.distanceKm??0),0)/t.length,avgYearDiff:t.reduce((e,t)=>e+(t.yearDiff??0),0)/t.length}},o=e=>{if(!n)return null;let t=n.filter(t=>t.roundIndex===e);if(0===t.length)return{avgAccuracy:0,avgLocationScore:0,avgTimeScore:0,avgDistanceKm:0,avgYearDiff:0,totalScore:0,bestPlayerId:null};let a=Math.round(t.reduce((e,t)=>e+((t.locationScore??0)+(t.timeScore??0))/2,0)/t.length),i=Math.round(t.reduce((e,t)=>e+(t.locationScore??0),0)/t.length),r=Math.round(t.reduce((e,t)=>e+(t.timeScore??0),0)/t.length),s=t.reduce((e,t)=>e+(t.distanceKm??0),0)/t.length,l=t.reduce((e,t)=>e+(t.yearDiff??0),0)/t.length,o=t.reduce((e,t)=>e+t.score,0),d=t.length>0?t.reduce((e,t)=>t.score>e.score?t:e,t[0]):null;return{avgAccuracy:a,avgLocationScore:i,avgTimeScore:r,avgDistanceKm:s,avgYearDiff:l,totalScore:o,bestPlayerId:d?.playerId??null}};return a.jsx("section",{className:"gh-final-section",children:(()=>{if(!t||!n)return null;let r=l(t),d=r?.avgAccuracy??0,c=r?.totalScore??0,p=r?.avgLocationAccuracy??0,f=r?.avgYearAccuracy??0,x=r?.avgDistanceKm??0,g=r?.avgYearDiff??0,y=e.players.find(e=>e.playerId===t),b=u(e.players,t),j=b?b.charAt(0).toUpperCase():"?",v=new Map;for(let t=0;t<e.config.totalRounds;t++){let e=(n??[]).filter(e=>e.roundIndex===t),a=Math.max(...e.map(e=>e.score));if(a>0){let n=e.filter(e=>e.score===a).map(e=>e.playerId);v.set(t,n)}}let k=e.players.map(t=>{let n=l(t.playerId),a=[];for(let n=0;n<e.config.totalRounds;n++){let e=v.get(n);e?.includes(t.playerId)&&a.push(n)}return{playerId:t.playerId,displayName:t.displayName,totalScore:n?.totalScore??0,avgAccuracy:n?.avgAccuracy??0,wonRounds:a}}).sort((e,t)=>t.totalScore-e.totalScore);return(0,a.jsxs)(a.Fragment,{children:[a.jsx("style",{children:`
              .gh-final-section {
                min-height: 100vh;
                width: 100%;
                overflow-x: hidden;
                background: #000000;
                padding: 0 0 96px;
                color: #ffffff;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              }
              .gh-final-section * {
                box-sizing: border-box;
              }
              .gh-final-topbar {
                width: 100%;
                min-height: 48px;
                background: rgba(17, 24, 39, 0.72);
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 14px;
              }
              .gh-final-title {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .gh-final-profile {
                position: relative;
              }
              .gh-final-profile summary {
                list-style: none;
              }
              .gh-final-profile summary::-webkit-details-marker {
                display: none;
              }
              .gh-final-avatar-button {
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 999px;
                background: #333333;
                color: #ffffff;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
              }
              .gh-final-profile-menu {
                position: absolute;
                top: 40px;
                right: 0;
                z-index: 20;
                min-width: 112px;
                border-radius: 10px;
                background: #333333;
                padding: 6px;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
              }
              .gh-final-profile-menu button {
                width: 100%;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: #ffffff;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                padding: 8px 10px;
                text-align: left;
              }
              .session-complete-content {
                width: 100%;
                max-width: 680px;
                margin: 0 auto;
                padding: 14px 12px 0;
              }
              .gh-final-score-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
                margin-bottom: 12px;
              }
              .session-complete-score-hero {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px 12px 18px;
              }
              .gh-final-xp {
                margin-top: 8px;
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-card {
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
              }
              .gh-final-stat-card {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 15px 10px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-stat-icon {
                width: 16px;
                height: 16px;
                color: #9ca3af;
                margin-bottom: 8px;
              }
              .gh-final-percent-line {
                display: inline-flex;
                align-items: baseline;
                justify-content: center;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-stat-number {
                font-size: 24px;
              }
              .gh-final-stat-symbol {
                font-size: 12px;
                margin-left: 1px;
                color: #ffffff;
              }
              .gh-final-stat-sub {
                margin-top: 7px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-panel {
                overflow: hidden;
                margin-bottom: 12px;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-panel-heading {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                padding: 13px 14px 10px;
              }
              .gh-final-rank-row {
                display: grid;
                grid-template-columns: 22px 30px minmax(0, 1fr) auto;
                align-items: center;
                gap: 9px;
                padding: 11px 12px;
                border-left: 3px solid transparent;
              }
              .gh-final-rank-row + .gh-final-rank-row {
                border-top: 1px solid #374151;
              }
              .gh-final-rank-number {
                color: #9ca3af;
                font-size: 13px;
                font-weight: 400;
              }
              .gh-final-rank-avatar {
                width: 30px;
                height: 30px;
                border-radius: 999px;
                background: #1a1a1a;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: 12px;
                font-weight: 700;
              }
              .gh-final-rank-main {
                min-width: 0;
              }
              .gh-final-rank-name-line {
                min-width: 0;
                display: flex;
                align-items: center;
                gap: 5px;
              }
              .gh-final-rank-name {
                min-width: 0;
                font-size: 13px;
                font-weight: 600;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-you-tag {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                flex: 0 0 auto;
              }
              .gh-final-progress-track {
                width: 100%;
                height: 4px;
                background: #1a1a1a;
                border-radius: 999px;
                margin-top: 6px;
                overflow: hidden;
              }
              .gh-final-progress-fill {
                height: 100%;
                border-radius: 999px;
                background: #9ca3af;
              }
              .gh-final-rank-score {
                text-align: right;
                white-space: nowrap;
              }
              .gh-final-rank-percent {
                color: #ffffff;
                font-size: 15px;
                font-weight: 700;
                line-height: 1;
                display: inline-flex;
                align-items: baseline;
              }
              .gh-final-rank-xp {
                color: #9ca3af;
                font-size: 11px;
                font-weight: 400;
                margin-top: 4px;
              }
              .gh-final-rounds {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
              }
              .gh-final-round-card {
                overflow: hidden;
                background: #333333;
                border-radius: 14px;
              }
              .gh-final-photo {
                position: relative;
                width: 100%;
                height: 112px;
                overflow: hidden;
                background: #1a1a1a;
              }
              .gh-final-photo img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                cursor: pointer;
              }
              .gh-final-round-badge {
                position: absolute;
                top: 9px;
                left: 9px;
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.72);
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                padding: 5px 8px;
              }
              .gh-final-photo-fallback {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 12px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                text-align: center;
              }
              .gh-final-round-body {
                padding: 11px 12px 12px;
              }
              .gh-final-round-title {
                color: #ffffff;
                font-size: 14px;
                font-weight: 600;
                line-height: 1.35;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                margin-bottom: 10px;
              }
              .gh-final-mini-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 6px;
              }
              .gh-final-mini-tile {
                min-width: 0;
                background: #1a1a1a;
                border-radius: 8px;
                padding: 9px 4px 8px;
                text-align: center;
              }
              .gh-final-mini-number {
                font-size: 20px;
              }
              .gh-final-mini-symbol {
                font-size: 10px;
                margin-left: 1px;
                color: #ffffff;
              }
              .gh-final-mini-label {
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.04em;
                line-height: 1;
                margin-top: 6px;
                text-transform: uppercase;
              }
              .gh-final-mini-sub {
                color: #6b7280;
                font-size: 11px;
                font-weight: 400;
                line-height: 1.15;
                margin-top: 5px;
              }
              .gh-final-best-row {
                border-top: 1px solid #374151;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-top: 10px;
                padding-top: 10px;
              }
              .gh-final-best-label {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                color: #6b7280;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                text-transform: uppercase;
              }
              .gh-final-best-name {
                min-width: 0;
                color: #9ca3af;
                font-size: 11px;
                font-weight: 600;
                overflow: hidden;
                text-align: right;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .gh-final-cta {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 30;
                display: flex;
                gap: 10px;
                width: 100%;
                background: #000000;
                padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
              }
              .gh-final-cta button {
                height: 46px;
                border-radius: 12px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
              }
              .gh-final-home {
                flex: 1;
                background: #1a1a1a;
                border: 1px solid #374151;
                color: #9ca3af;
              }
              .gh-final-play {
                flex: 1.25;
                background: #f97316;
                border: 1px solid #f97316;
                color: #ffffff;
              }
              @media (min-width: 768px) {
                .session-complete-content {
                  max-width: 720px;
                  margin: 0 auto;
                }
                .session-complete-score-hero {
                  display: grid;
                  grid-template-columns: auto 1fr;
                  gap: 24px;
                  align-items: center;
                }
                .gh-final-section {
                  padding-bottom: 48px;
                }
                .gh-final-topbar {
                  padding-left: 24px;
                  padding-right: 24px;
                }
                .gh-final-score-grid {
                  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                  align-items: stretch;
                }
                .session-complete-score-hero {
                  min-height: 230px;
                }
                .gh-final-stat-grid {
                  height: 100%;
                  align-content: stretch;
                }
                .gh-final-stat-card {
                  min-height: 109px;
                }
                .gh-final-cta {
                  position: static;
                  max-width: 680px;
                  margin: 18px auto 0;
                  padding: 0 12px;
                }
              }
            `}),(0,a.jsxs)("div",{className:"gh-final-topbar",children:[a.jsx("div",{className:"gh-final-title",children:"Guess History"}),(0,a.jsxs)("details",{className:"gh-final-profile",children:[a.jsx("summary",{"aria-label":"Open profile menu",children:a.jsx("span",{className:"gh-final-avatar-button",children:y?.avatarUrl?a.jsx("img",{src:y.avatarUrl,alt:b,style:{width:"100%",height:"100%",objectFit:"cover"}}):j})}),a.jsx("div",{className:"gh-final-profile-menu",children:a.jsx("button",{type:"button",children:"Sign Out"})})]})]}),(0,a.jsxs)("div",{className:"session-complete-content",children:[(0,a.jsxs)("div",{className:"gh-final-score-grid",children:[(0,a.jsxs)("div",{className:"session-complete-score-hero gh-final-card",children:[a.jsx(m,{value:d}),(0,a.jsxs)("div",{className:"gh-final-xp",children:[c," XP"]})]}),(0,a.jsxs)("div",{className:"gh-final-stat-grid",children:[(0,a.jsxs)("div",{className:"gh-final-stat-card",children:[(0,a.jsxs)("svg",{className:"gh-final-stat-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("path",{d:"M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"}),a.jsx("circle",{cx:12,cy:10,r:2.5})]}),(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-stat-number",style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,p))/100*120)}, 100%, 50%)`},children:p}),a.jsx("span",{className:"gh-final-stat-symbol",children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-stat-sub",children:["avg ",Math.round(x)," km away"]})]}),(0,a.jsxs)("div",{className:"gh-final-stat-card",children:[(0,a.jsxs)("svg",{className:"gh-final-stat-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("rect",{x:4,y:5,width:16,height:15,rx:2}),a.jsx("path",{d:"M8 3v4M16 3v4M4 10h16"})]}),(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-stat-number",style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,f))/100*120)}, 100%, 50%)`},children:f}),a.jsx("span",{className:"gh-final-stat-symbol",children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-stat-sub",children:["avg ",Math.round(g)," yrs off"]})]})]})]}),(0,a.jsxs)("div",{className:"gh-final-panel",children:[a.jsx("div",{className:"gh-final-panel-heading",children:"Final Rankings"}),k.map((n,i)=>{let r=n.playerId===t,s=e.players.find(e=>e.playerId===n.playerId),l=u(e.players,n.playerId),o=l?l.charAt(0).toUpperCase():"?";return(0,a.jsxs)("div",{className:"gh-final-rank-row",style:{borderLeftColor:0===i?"#f59e0b":"transparent"},children:[a.jsx("div",{className:"gh-final-rank-number",children:i+1}),a.jsx("div",{className:"gh-final-rank-avatar",children:s?.avatarUrl?a.jsx("img",{src:s.avatarUrl,alt:l,style:{width:"100%",height:"100%",objectFit:"cover"}}):o}),(0,a.jsxs)("div",{className:"gh-final-rank-main",children:[(0,a.jsxs)("div",{className:"gh-final-rank-name-line",children:[a.jsx("span",{className:"gh-final-rank-name",style:h(n.playerId),children:l}),r?a.jsx("span",{className:"gh-final-you-tag",children:"(you)"}):null]}),a.jsx("div",{className:"gh-final-progress-track",children:a.jsx("div",{className:"gh-final-progress-fill",style:{width:`${Math.max(0,Math.min(100,n.avgAccuracy))}%`,background:"#9ca3af"}})})]}),(0,a.jsxs)("div",{className:"gh-final-rank-score",children:[(0,a.jsxs)("div",{className:"gh-final-rank-percent",children:[a.jsx("span",{style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,n.avgAccuracy))/100*120)}, 100%, 50%)`},children:n.avgAccuracy}),a.jsx("span",{style:{color:"#ffffff",fontSize:"3.75px"},children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-rank-xp",children:[n.totalScore," XP"]})]})]},n.playerId)})]}),a.jsx("div",{className:"gh-final-panel-heading",style:{paddingLeft:2},children:"Round Breakdown"}),a.jsx("div",{className:"gh-final-rounds",children:e.rounds.map((n,r)=>{let s=o(r)??{avgAccuracy:0,avgLocationScore:0,avgTimeScore:0,avgDistanceKm:0,avgYearDiff:0,totalScore:0,bestPlayerId:null},l=s.bestPlayerId?u(e.players,s.bestPlayerId):null,d=null!==s.bestPlayerId&&s.bestPlayerId===t;return(0,a.jsxs)("div",{className:"gh-final-round-card",children:[(0,a.jsxs)("div",{className:"gh-final-photo",children:[n.imageUrl?a.jsx("img",{src:n.imageUrl,alt:n.title,onClick:()=>i(n.imageUrl)}):(0,a.jsxs)("div",{className:"gh-final-photo-fallback",children:[n.locationName||`${n.latitude.toFixed(2)}, ${n.longitude.toFixed(2)}`," \xb7 ",n.year]}),(0,a.jsxs)("div",{className:"gh-final-round-badge",children:["ROUND ",r+1]})]}),(0,a.jsxs)("div",{className:"gh-final-round-body",children:[a.jsx("div",{className:"gh-final-round-title",children:n.title}),(0,a.jsxs)("div",{className:"gh-final-mini-grid",children:[(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,s.avgAccuracy))/100*120)}, 100%, 50%)`},children:s.avgAccuracy}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"Total"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:[s.totalScore," pts"]})]}),(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,s.avgLocationScore))/100*120)}, 100%, 50%)`},children:s.avgLocationScore}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"Where"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:["avg ",Math.round(s.avgDistanceKm)," km"]})]}),(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",style:{color:`hsl(${Math.round(Math.max(0,Math.min(100,s.avgTimeScore))/100*120)}, 100%, 50%)`},children:s.avgTimeScore}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"When"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:["avg ",Math.round(s.avgYearDiff)," yrs"]})]})]}),l&&(0,a.jsxs)("div",{className:"gh-final-best-row",children:[(0,a.jsxs)("div",{className:"gh-final-best-label",children:[(0,a.jsxs)("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("path",{d:"M8 21h8"}),a.jsx("path",{d:"M12 17v4"}),a.jsx("path",{d:"M7 4h10v4a5 5 0 0 1-10 0V4z"}),a.jsx("path",{d:"M5 6H3a3 3 0 0 0 3 3h1"}),a.jsx("path",{d:"M19 6h2a3 3 0 0 1-3 3h-1"})]}),"Best Player"]}),a.jsx("div",{className:"gh-final-best-name",style:{color:d?"#f97316":"#9ca3af"},children:l})]})]})]},r)})}),(0,a.jsxs)("div",{className:"gh-final-cta",children:[a.jsx("button",{type:"button",className:"gh-final-home",onClick:()=>s.push("/"),children:"Home"}),a.jsx("button",{type:"button",className:"gh-final-play",onClick:()=>s.push("/compete"),children:"Play Again"})]})]})]})})()})}function b({avatarUrl:e,displayName:t,size:n=26}){let i=(t||"?")[0].toUpperCase(),r={width:n,height:n,borderRadius:"50%",overflow:"hidden",flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",background:"#2a2a3a",border:"1.5px solid rgba(255,255,255,0.18)",fontSize:.42*n,fontWeight:600,color:"rgba(255,255,255,0.75)",verticalAlign:"middle"};return e?a.jsx("span",{style:r,children:a.jsx("img",{src:e,alt:t,style:{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"},onError:e=>{e.currentTarget.style.display="none"}})}):a.jsx("span",{style:r,children:i})}var j=n(3353),v=n.n(j);let k=v()(async()=>{},{loadableGenerated:{modules:["components\\compete\\WhereCard.tsx -> @/components/StaticResultMap"]},ssr:!1});function w({roundResults:e,playerId:t,correctLat:n,correctLng:i,correctName:r,whereAccPenalty:s,guessLat:l,guessLng:o,myDistanceKm:d,whereLbExpanded:c,setWhereLbExpanded:p,whereCluesExpanded:f,setWhereCluesExpanded:u,roundHints:g,snapshotPlayers:m,currentRoundIndex:y}){let b=e?.find(e=>e.playerId===t);return(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[(0,a.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8},children:[(0,a.jsxs)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"#ffffff",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("path",{d:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"}),a.jsx("circle",{cx:"12",cy:"10",r:"3"})]}),a.jsx("span",{style:{fontSize:18,fontWeight:700,color:"#f97316"},children:"Where"})]}),(()=>{if(null==b||!b.didSubmit)return a.jsx("div",{style:{display:"flex",alignItems:"center",gap:4},children:a.jsx("span",{style:{fontSize:19,fontWeight:700,color:"#666"},children:"—"})});let e=Math.round(b.locationScore),t=`hsl(${Math.round(Math.max(0,Math.min(100,e))/100*120)}, 100%, 50%)`;return a.jsx("div",{style:{display:"flex",alignItems:"center",gap:4},children:(0,a.jsxs)("div",{style:{display:"flex",alignItems:"baseline",gap:2},children:[a.jsx("span",{style:{fontSize:19,fontWeight:700,color:t},children:e}),a.jsx("span",{style:{fontSize:7,fontWeight:600,color:"#ffffff"},children:"%"})]})})})()]}),s>0&&a.jsx("div",{style:{marginBottom:6},children:(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",fontSize:10,color:"#fca5a5",fontWeight:600,background:"#7f1d1d",borderRadius:999,padding:"2px 8px"},children:["−",Math.round(s/2),a.jsx("span",{style:{fontSize:"50%",color:"#ffffff"},children:"%"})," hints"]})}),(0,a.jsxs)("div",{style:{fontSize:15,color:"#fff",marginBottom:8,display:"flex",justifyContent:"space-between"},children:[a.jsx("span",{children:"Correct:"}),a.jsx("span",{style:{color:"#f97316"},children:r})]}),null!=b&&b.didSubmit?null!=d?a.jsx("div",{style:{marginBottom:8},children:(0,a.jsxs)("span",{style:{fontSize:15,color:"#fff"},children:[Math.round(d)," km away"]})}):null:a.jsx("div",{style:{marginBottom:8},children:a.jsx("span",{style:{fontSize:15,color:"#666"},children:"No guess"})}),a.jsx("div",{style:{borderRadius:8,overflow:"hidden",height:200},children:null!=n&&null!=i&&a.jsx(k,{correctLat:n,correctLng:i,guessLat:l,guessLng:o,playerGuesses:e?.filter(e=>e.didSubmit&&null!=e.guessLat&&null!=e.guessLng&&e.playerId!==t).map(e=>{let n=m.find(t=>t.playerId===e.playerId);return{playerId:e.playerId,lat:e.guessLat,lng:e.guessLng,label:n?.displayName??e.playerId.slice(0,8),color:e.playerId===t?"#f97316":void 0,avatarUrl:n?.avatarUrl??null}})??void 0},`result-map-${y}`)}),(0,a.jsxs)("div",{style:{marginTop:10,background:"rgba(255,255,255,0.04)",borderRadius:8},children:[(0,a.jsxs)("div",{onClick:()=>p(!c),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",cursor:"pointer",userSelect:"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[a.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"#9ca3af",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:c?a.jsx("path",{d:"M6 9l6 6 6-6"}):a.jsx("path",{d:"M9 6l6 6-6 6"})}),a.jsx("span",{style:{fontSize:11,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em"},children:"Leaderboard"})]}),(()=>{let n=e?.find(e=>e.playerId===t)?.rank??null;return null!=n?(0,a.jsxs)("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:600},children:["#",n]}):null})()]}),c&&a.jsx("div",{style:{padding:"0 4px 8px"},children:(e??[]).slice().sort((e,t)=>e.rank-t.rank).map((r,s)=>{let l=null!=r.guessLat&&null!=r.guessLng&&null!=n&&null!=i?x(r.guessLat,r.guessLng,n,i):null,o=r.locationScore,d=null!=o?Math.round(o/100*120):null,c=null!=d?`hsl(${d}, 100%, 50%)`:"#888";return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",gap:6,borderRadius:6,background:r.playerId===t?"rgba(255,255,255,0.06)":"transparent",borderBottom:s<(e?.length??0)-1?"1px solid #333":"none"},children:[a.jsx("span",{style:{minWidth:20,color:"#888",fontSize:13,fontWeight:600},children:r.rank??"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:15},children:[a.jsx("span",{style:{...h(r.playerId),fontWeight:r.playerId===t?600:400},children:m.find(e=>e.playerId===r.playerId)?.displayName||r.playerId.slice(0,8)}),r.playerId===t&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),a.jsx("span",{style:{color:"#bbb",fontSize:13,fontWeight:600},children:null!=l?`${Math.round(l)} km away`:"—"}),null!=o&&(0,a.jsxs)("span",{style:{background:"#2a2a2a",color:c,borderRadius:999,padding:"2px 8px",fontSize:13,fontWeight:600},children:[a.jsx("span",{style:{color:"#ffffff",fontSize:"var(--font-base)"},children:o}),a.jsx("span",{style:{color:"rgba(255,255,255,0.65)",fontSize:"var(--font-xs)"},children:"%"})]})]},r.playerId)})})]}),(0,a.jsxs)("div",{style:{marginTop:6,background:"rgba(255,255,255,0.04)",borderRadius:8},children:[(0,a.jsxs)("div",{onClick:()=>u(!f),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",cursor:"pointer",userSelect:"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[a.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"#a78bfa",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:f?a.jsx("path",{d:"M6 9l6 6 6-6"}):a.jsx("path",{d:"M9 6l6 6-6 6"})}),a.jsx("span",{style:{fontSize:11,fontWeight:600,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.08em"},children:"Clues"})]}),(()=>{let n=e?.find(e=>e.playerId===t),i=n?.locationScore??null;return null!=i?(0,a.jsxs)("span",{style:{fontSize:11,color:"#a78bfa",fontWeight:600},children:[i," XP"]}):null})()]}),f&&a.jsx("div",{style:{padding:"0 12px 12px"},children:(()=>{let e=(g??[]).filter(e=>"where"===e.type).sort((e,t)=>e.tier-t.tier);if(0===e.length)return a.jsx("div",{style:{fontSize:12,color:"#555",fontStyle:"italic"},children:"No location clues available for this event."});let t={1:"Continent",2:"Remote Landmark",3:"Region",4:"Nearby Landmark",5:"Visual Clues"};return e.map((n,i)=>(0,a.jsxs)("div",{style:{padding:"8px 0",borderBottom:i<e.length-1?"1px solid rgba(255,255,255,0.06)":"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3},children:[a.jsx("span",{style:{fontSize:11,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.06em"},children:t[n.tier]??`Tier ${n.tier}`}),(0,a.jsxs)("span",{style:{fontSize:10,color:"#e84422",fontWeight:600},children:["-",[0,10,20,30,40,50][n.tier]??0,"%"]})]}),a.jsx("div",{style:{fontSize:13,color:"#ccc",lineHeight:1.4},children:n.content})]},n.id))})()})]})]})}function S({roundResults:e,playerId:t,correctYear:n,whenAccPenalty:i,whenLbExpanded:r,setWhenLbExpanded:s,whenCluesExpanded:l,setWhenCluesExpanded:o,roundHints:d,snapshotPlayers:c}){let p=c.map(a=>{let i=e?.find(e=>e.playerId===a.playerId),r=i?.guessYear??null,s=i?.timeScore??null,l=null!=r&&null!=n?Math.abs(r-n):null;return{playerId:a.playerId,displayName:a.displayName||a.playerId.slice(0,8),guessYear:r,acc:s,diff:l,isMe:a.playerId===t}}).sort((e,t)=>null==e.acc&&null==t.acc?0:null==e.acc?1:null==t.acc?-1:t.acc-e.acc);return(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[(0,a.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8},children:[(0,a.jsxs)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"#ffffff",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2",ry:"2"}),a.jsx("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),a.jsx("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),a.jsx("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]}),a.jsx("span",{style:{fontSize:18,fontWeight:700,color:"#f97316"},children:"When"})]}),(()=>{let n=p.find(e=>e.isMe),i=n?.acc??null,r=e?.find(e=>e.playerId===t);return null!=r&&r.didSubmit?null!=i?(()=>{let e=Math.round(i),t=`hsl(${Math.round(Math.max(0,Math.min(100,e))/100*120)}, 100%, 50%)`;return a.jsx("div",{style:{display:"flex",alignItems:"center",gap:4},children:(0,a.jsxs)("div",{style:{display:"flex",alignItems:"baseline",gap:2},children:[a.jsx("span",{style:{fontSize:19,fontWeight:700,color:t},children:e}),a.jsx("span",{style:{fontSize:7,fontWeight:600,color:"#ffffff"},children:"%"})]})})})():null:a.jsx("div",{style:{display:"flex",alignItems:"center",gap:4},children:a.jsx("span",{style:{fontSize:19,fontWeight:700,color:"#666"},children:"—"})})})()]}),i>0&&a.jsx("div",{style:{marginBottom:6},children:(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",fontSize:10,color:"#fca5a5",fontWeight:600,background:"#7f1d1d",borderRadius:999,padding:"2px 8px"},children:["−",Math.round(i),a.jsx("span",{style:{fontSize:"50%",color:"#ffffff"},children:"%"})," hints"]})}),(0,a.jsxs)("div",{style:{fontSize:13,color:"#fff",marginBottom:10,display:"flex",justifyContent:"space-between"},children:[a.jsx("span",{children:"Correct:"}),a.jsx("span",{style:{color:"#f97316"},children:n})]}),(0,a.jsxs)("div",{style:{width:"100%",height:96,position:"relative",margin:"12px 0",background:"#1a1a2a",borderRadius:8,padding:"0 16px",boxSizing:"border-box"},children:[a.jsx("div",{style:{position:"absolute",top:"50%",height:4,left:16,right:16,background:"#555555",borderRadius:3,transform:"translateY(-50%)"}}),(0,a.jsxs)("div",{style:{position:"absolute",top:"50%",transform:"translate(-50%, -50%)",width:4,height:32,background:"#f97316",borderRadius:2,left:"50%"},children:[a.jsx("div",{style:{position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",fontSize:9,color:"#888",whiteSpace:"nowrap",textAlign:"center"},children:"Correct"}),a.jsx("div",{style:{position:"absolute",top:32,left:"50%",transform:"translateX(-50%)",fontSize:10,color:"#f97316",whiteSpace:"nowrap",textAlign:"center"},children:n})]}),(()=>{let e=[n,...p.map(e=>e.guessYear).filter(e=>null!=e)],t=e.reduce((e,t)=>Math.max(e,Math.abs(t-n)),0),i=0===t?20:t,r=Math.max(10,10*Math.ceil(i/10)-i+10),s=10*Math.floor((Math.min(...e)-r)/10),l=10*Math.ceil((Math.max(...e)+r)/10),o=l-s,d=new Map,c=[];for(let e=s;e<=l;e+=10){let t=(e-s)/o*100;c.push({year:e,isMajor:e%50==0,xPercent:t})}return p.forEach(e=>{null!=e.guessYear&&d.set(e.guessYear,(d.get(e.guessYear)||0)+1)}),(0,a.jsxs)(a.Fragment,{children:[c.map(e=>{let t=8>Math.abs(e.xPercent-50);return a.jsx("div",{style:{position:"absolute",top:"50%",left:`${e.xPercent}%`,width:2,height:e.isMajor?14:8,background:"#aaa",transform:"translateY(-50%)"},children:e.isMajor&&!t&&a.jsx("div",{style:{position:"absolute",top:18,left:"50%",transform:"translateX(-50%)",fontSize:8,color:"#999",whiteSpace:"nowrap"},children:e.year})},e.year)}),p.map(e=>{if(null==e.guessYear||e.isMe)return null;let t=(e.guessYear-s)/o*100,n=p.filter(t=>t.guessYear===e.guessYear).findIndex(t=>t.playerId===e.playerId);return(0,a.jsxs)("div",{style:{position:"absolute",top:"50%",transform:`translate(-50%, calc(-50% - ${22*n}px))`,left:`${Math.max(0,Math.min(100,t))}%`},children:[a.jsx("div",{style:{width:14,height:14,borderRadius:"50%",background:e.isMe?"#f97316":"#60a5fa",border:"2px solid #fff"}}),a.jsx("div",{style:{position:"absolute",top:18,left:"50%",transform:"translateX(-50%)",fontSize:10,color:e.isMe?"#f97316":"#60a5fa",whiteSpace:"nowrap",textAlign:"center"},children:e.guessYear})]},e.playerId)})]})})()]}),(0,a.jsxs)("div",{style:{marginTop:10,background:"rgba(255,255,255,0.04)",borderRadius:8},children:[(0,a.jsxs)("div",{onClick:()=>s(!r),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",cursor:"pointer",userSelect:"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[a.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"#9ca3af",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:r?a.jsx("path",{d:"M6 9l6 6 6-6"}):a.jsx("path",{d:"M9 6l6 6-6 6"})}),a.jsx("span",{style:{fontSize:11,fontWeight:600,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em"},children:"Leaderboard"})]}),(()=>{let n=e?.find(e=>e.playerId===t)?.rank??null;return null!=n?(0,a.jsxs)("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:600},children:["#",n]}):null})()]}),r&&a.jsx("div",{style:{padding:"0 4px 8px"},children:p.map((t,n)=>{let i=null!=t.acc?Math.round(t.acc/100*120):null,r=null!=i?`hsl(${i}, 100%, 50%)`:"#888",s=e?.find(e=>e.playerId===t.playerId),l=s?.rank??null,o=c.find(e=>e.playerId===t.playerId)?.avatarUrl??null;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",gap:6,borderRadius:6,background:t.isMe?"rgba(255,255,255,0.06)":"transparent",borderBottom:n<p.length-1?"1px solid #333":"none"},children:[a.jsx("span",{style:{minWidth:20,color:"#888",fontSize:13,fontWeight:600},children:l??"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:15},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(b,{avatarUrl:o,displayName:t.displayName}),a.jsx("span",{style:{...h(t.playerId),fontWeight:t.isMe?700:500},children:t.displayName})]}),t.isMe&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),a.jsx("span",{style:{color:"#bbb",fontSize:11,fontWeight:600},children:null!=t.diff?`${t.diff} yrs off`:"—"}),a.jsx("span",{style:{background:"#2a2a2a",color:r,borderRadius:999,padding:"2px 8px",fontSize:13,fontWeight:600},children:null!=t.acc?(0,a.jsxs)(a.Fragment,{children:[a.jsx("span",{style:{color:"#ffffff",fontSize:"var(--font-base)"},children:t.acc}),a.jsx("span",{style:{color:"rgba(255,255,255,0.65)",fontSize:"var(--font-xs)"},children:"%"})]}):"—"})]},t.playerId)})})]}),(0,a.jsxs)("div",{style:{marginTop:6,background:"rgba(255,255,255,0.04)",borderRadius:8},children:[(0,a.jsxs)("div",{onClick:()=>o(!l),style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",cursor:"pointer",userSelect:"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6},children:[a.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"#a78bfa",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:l?a.jsx("path",{d:"M6 9l6 6 6-6"}):a.jsx("path",{d:"M9 6l6 6-6 6"})}),a.jsx("span",{style:{fontSize:11,fontWeight:600,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.08em"},children:"Clues"})]}),(()=>{let n=e?.find(e=>e.playerId===t),i=n?.timeScore??null;return null!=i?(0,a.jsxs)("span",{style:{fontSize:11,color:"#a78bfa",fontWeight:600},children:[i," XP"]}):null})()]}),l&&a.jsx("div",{style:{padding:"0 12px 12px"},children:(()=>{let e=(d??[]).filter(e=>"when"===e.type).sort((e,t)=>e.tier-t.tier);if(0===e.length)return a.jsx("div",{style:{fontSize:12,color:"#555",fontStyle:"italic"},children:"No time clues available for this event."});let t={1:"Century",2:"Historical Event",3:"Decade",4:"Contemporary Event",5:"Visual Clues"};return e.map((n,i)=>(0,a.jsxs)("div",{style:{padding:"8px 0",borderBottom:i<e.length-1?"1px solid rgba(255,255,255,0.06)":"none"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3},children:[a.jsx("span",{style:{fontSize:11,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:"0.06em"},children:t[n.tier]??`Tier ${n.tier}`}),(0,a.jsxs)("span",{style:{fontSize:10,color:"#e84422",fontWeight:600},children:["-",[0,10,20,30,40,50][n.tier]??0,"%"]})]}),a.jsx("div",{style:{fontSize:13,color:"#ccc",lineHeight:1.4},children:n.content})]},n.id))})()})]})]})}function N({snapshot:e,roundResults:t,playerId:n,guessLat:i,guessLng:s,submittedHintPenaltyRef:l,descriptionExpanded:o,setDescriptionExpanded:d,whereLbExpanded:c,setWhereLbExpanded:p,whenLbExpanded:f,setWhenLbExpanded:u,whereCluesExpanded:g,setWhereCluesExpanded:y,whenCluesExpanded:j,setWhenCluesExpanded:v,resultSecsLeft:k,onAdvanceRound:N}){let I=(0,r.useRouter)();return(0,a.jsxs)("div",{style:{padding:"0 12px",paddingBottom:"72px",maxWidth:"720px",margin:"0 auto",width:"100%"},children:[a.jsx("style",{children:`
        @media (min-width: 768px) {
          .round-complete-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .round-complete-desktop-bottom {
            position: static !important;
            display: flex;
            justify-content: flex-end;
            padding: 16px 0;
            background: transparent;
            border: none;
            height: auto;
          }
          .round-complete-event-image {
            height: 240px !important;
          }
        }
      `}),(()=>{let r=e.rounds[e.currentRoundIndex];if(!r)return null;let M=t?.find(e=>e.playerId===n),z=M?.accuracy??0,C=r.latitude,R=r.longitude,P=r.locationName,W=r.year,L=null!=i&&null!=s?x(i,s,C,R):null,A=(t??[]).slice().sort((e,t)=>t.score-e.score).map((t,a)=>({playerId:t.playerId,rank:a+1,displayName:e.players.find(e=>e.playerId===t.playerId)?.displayName||t.playerId.slice(0,8),accuracy:t.accuracy,isMe:t.playerId===n}));return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,overflow:"hidden",marginBottom:"10px",minHeight:"50vh"},children:[a.jsx("div",{style:{fontSize:16,fontWeight:600,color:"#fff",textAlign:"center",padding:"14px 16px 10px"},children:r.title}),r.imageUrl?a.jsx("img",{src:r.imageUrl,alt:r.title,style:{width:"100%",height:"180px",objectFit:"cover",display:"block"},className:"round-complete-event-image"}):a.jsx("div",{style:{width:"100%",height:"180px",background:"#2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:12},children:"No image available"}),(0,a.jsxs)("div",{style:{fontSize:14,fontWeight:600,color:"#f97316",textAlign:"center",padding:"8px 16px"},children:[W," \xb7 ",P]}),(0,a.jsxs)("div",{style:{padding:"0 16px 8px"},children:[a.jsx("div",{style:{fontSize:15,color:"#d1d5db",lineHeight:1.6,display:o?"block":"-webkit-box",WebkitLineClamp:o?void 0:3,WebkitBoxOrient:"vertical",overflow:"hidden"},children:r.description??"No description available"}),!o&&(r.description?.length??0)>0&&a.jsx("button",{onClick:()=>d(!0),style:{background:"none",border:"none",color:"#9ca3af",fontSize:13,textDecoration:"underline",cursor:"pointer",padding:0,marginTop:4,display:"block"},children:"more"})]}),r.sourceUrl&&a.jsx("div",{style:{padding:"0 16px 16px"},children:a.jsx("button",{onClick:()=>window.open(r.sourceUrl,"_blank"),style:{background:"transparent",border:"1px solid #6b7280",color:"#9ca3af",fontSize:12,borderRadius:6,padding:"5px 12px",cursor:"pointer"},children:"Source ↗"})})]}),(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center"},children:a.jsx(m,{value:z})}),a.jsx("div",{style:{textAlign:"center",marginTop:12},children:(0,a.jsxs)("span",{style:{fontSize:15,color:"#9ca3af"},children:[M?.score??0," XP"]})}),l.current.xpPenalty>0&&a.jsx("div",{style:{textAlign:"center",marginTop:4},children:a.jsx("span",{style:{display:"inline-flex",alignItems:"center",gap:3,background:"#7f1d1d",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#fca5a5",fontWeight:600},children:"Hint penalties deducted"})})]}),(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{fontSize:16,fontWeight:700,color:"#fff",marginBottom:10},children:"Round leaderboard"}),A.map(t=>{let n=Math.round(Math.max(0,Math.min(100,t.accuracy))/100*120),i=`hsl(${n}, 100%, 50%)`,r=e.players.find(e=>e.playerId===t.playerId)?.avatarUrl??null;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",borderRadius:8,marginBottom:3,gap:6,background:t.isMe?"#2e2e2e":"transparent"},children:[a.jsx("span",{style:{fontSize:11,color:"#777",minWidth:14},children:t.rank}),(0,a.jsxs)("span",{style:{flex:1,fontSize:15},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(b,{avatarUrl:r,displayName:t.displayName}),a.jsx("span",{style:{...h(t.playerId),fontWeight:t.isMe?700:500},children:t.displayName})]}),t.isMe&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),(0,a.jsxs)("span",{style:{background:"#2a2a2a",color:i,borderRadius:999,padding:"2px 9px",fontSize:13,fontWeight:600},children:[a.jsx("span",{style:{color:"#ffffff",fontSize:"var(--font-base)"},children:Math.round(t.accuracy)}),a.jsx("span",{style:{color:"rgba(255,255,255,0.65)",fontSize:"var(--font-xs)"},children:"%"})]})]},t.rank)}),0===A.length&&e.players.map(e=>{let t=e.playerId===n;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",borderRadius:8,marginBottom:3,gap:6,background:t?"#2e2e2e":"transparent"},children:[a.jsx("span",{style:{fontSize:11,color:"#777",minWidth:14},children:"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:15},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(b,{avatarUrl:e.avatarUrl,displayName:e.displayName||e.playerId.slice(0,8)}),a.jsx("span",{style:{...h(e.playerId),fontWeight:t?700:500},children:e.displayName||e.playerId.slice(0,8)})]}),t&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"}),a.jsx("span",{style:{color:"#555",fontSize:11,fontStyle:"italic",marginLeft:4},children:"No guess"})]}),a.jsx("span",{style:{background:"#2a2a2a",color:"#888",borderRadius:999,padding:"2px 9px",fontSize:13,fontWeight:600},children:"—"})]},e.playerId)})]}),(0,a.jsxs)("div",{className:"round-complete-grid",children:[a.jsx(w,{roundResults:t,playerId:n,correctLat:C,correctLng:R,correctName:P,whereAccPenalty:l.current.accPenalty,guessLat:i,guessLng:s,myDistanceKm:L,whereLbExpanded:c,setWhereLbExpanded:p,whereCluesExpanded:g,setWhereCluesExpanded:y,roundHints:e?.rounds?.[e.currentRoundIndex]?.hints??[],snapshotPlayers:e.players,currentRoundIndex:e.currentRoundIndex}),a.jsx(S,{roundResults:t,playerId:n,correctYear:W,whenAccPenalty:l.current.whenAccPenalty,whenLbExpanded:f,setWhenLbExpanded:u,whenCluesExpanded:j,setWhenCluesExpanded:v,roundHints:e?.rounds?.[e.currentRoundIndex]?.hints??[],snapshotPlayers:e.players})]}),l.current.purchasedIds.length>0&&(()=>{let t=(e?.rounds?.[e.currentRoundIndex]?.hints??[]).filter(e=>l.current.purchasedIds.includes(e.id)).sort((e,t)=>e.tier-t.tier);return 0===t.length?null:(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{fontSize:12,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10},children:"Hints used"}),t.map((e,n)=>{let i=[0,10,20,30,40,50][e.tier]??0,r=e.metadata,s=e.content;"where"===e.type&&(2===e.tier||4===e.tier)&&r?.km!=null?s=`${e.content} — ${r.km} km away`:"when"===e.type&&(2===e.tier||4===e.tier)&&r?.years!=null&&(s=`${e.content} — ${r.years} years off`);let l={when:{1:"Century",2:"Historical Event",3:"Decade",4:"Contemporary Event",5:"Visual Clues"},where:{1:"Continent",2:"Remote Landmark",3:"Region",4:"Nearby Landmark",5:"Visual Clues"}}[e.type]?.[e.tier]??"Hint";return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:n<t.length-1?"1px solid #3a3a3a":"none"},children:[(0,a.jsxs)("div",{style:{flex:1,minWidth:0},children:[a.jsx("div",{style:{fontSize:12,fontWeight:500,color:"#ccc"},children:l}),a.jsx("div",{style:{fontSize:11,color:"#aaa",fontStyle:"italic",marginTop:1},children:s})]}),(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",background:"rgba(232,68,34,0.12)",border:"0.5px solid rgba(232,68,34,0.35)",borderRadius:999,padding:"2px 7px",fontSize:10,color:"#e84422",fontWeight:600,flexShrink:0},children:["−",i,a.jsx("span",{style:{fontSize:"50%",color:"#ffffff"},children:"%"})]})]},e.id)})]})})(),null!==k&&k>0&&(0,a.jsxs)("div",{style:{textAlign:"center",padding:"12px 0 4px",fontSize:13,color:"#6b7280"},children:["Auto-advancing in ",k,"s"]}),e.readyForNext&&e.readyForNext.length>0&&a.jsx("div",{style:{textAlign:"center",fontSize:13,color:"#9ca3af",paddingBottom:8},children:e.readyForNext.map(t=>{let n=e.players.find(e=>e.playerId===t)?.displayName??t.slice(0,8);return(0,a.jsxs)("span",{style:{marginRight:6},children:[a.jsx("span",{style:h(t),children:n})," ✓"]},t)})}),(0,a.jsxs)("div",{className:"round-complete-desktop-bottom",style:{position:"fixed",bottom:0,left:0,right:0,background:"#111111",borderTop:"1px solid #222222",height:"56px",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",paddingBottom:"env(safe-area-inset-bottom, 0px)",zIndex:1e3},children:[a.jsx("button",{onClick:()=>I.push("/"),style:{background:"transparent",border:"none",cursor:"pointer",padding:8},children:(0,a.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#6b7280",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("path",{d:"M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"}),a.jsx("polyline",{points:"9 21 9 12 15 12 15 21"})]})}),(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8},children:[Array.from({length:e.rounds.length}).map((t,n)=>{let i=n<e.currentRoundIndex,r=n===e.currentRoundIndex;return a.jsx("div",{style:{height:4,width:28,borderRadius:2,background:i?"#f97316":r?"#fb923c":"#374151",opacity:r?.7:1}},n)}),(0,a.jsxs)("span",{style:{fontSize:12,color:"#9ca3af",whiteSpace:"nowrap"},children:["Round ",e.currentRoundIndex+1,"/",e.rounds.length]})]}),a.jsx("button",{onClick:N,disabled:e.readyForNext?.includes(n??""),style:{background:"#f97316",color:"#fff",fontWeight:700,fontSize:14,border:"none",borderRadius:8,padding:"10px 18px",cursor:e.readyForNext?.includes(n??"")?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:e.readyForNext?.includes(n??"")?.5:1},children:"Next →"})]})]})})()]})}function I({snapshot:e,viewer:t,busy:n,error:i,onToggleReady:r,onStartGame:s}){let l=i?a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:i}):null;return(0,a.jsxs)("section",{className:"card stack",children:[a.jsx("h2",{children:"Lobby"}),a.jsx("div",{className:"stack",children:0===e.players.length?a.jsx("p",{className:"small",children:"No players yet."}):e.players.map(e=>(0,a.jsxs)("div",{className:"row",children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(b,{avatarUrl:e.avatarUrl,displayName:e.displayName||f(e.playerId)}),a.jsx("span",{style:h(e.playerId),children:e.displayName||f(e.playerId)})]}),e.isHost?a.jsx("span",{className:"badge",children:"Host"}):null,a.jsx("span",{className:"small",children:e.ready?"Ready":"Not ready"})]},e.playerId))}),(0,a.jsxs)("p",{style:{fontSize:13,color:"var(--color-text-secondary)"},children:["Round timer:"," ",a.jsx("strong",{children:e.config.roundTimerSec>=60?`${Math.floor(e.config.roundTimerSec/60)}m${e.config.roundTimerSec%60>0?` ${e.config.roundTimerSec%60}s`:""}`:`${e.config.roundTimerSec}s`})]}),(0,a.jsxs)("div",{className:"row",children:[a.jsx("button",{type:"button",className:"button secondary",onClick:r,disabled:n||!!t?.ready,children:t?.ready?"Ready ✓":"Ready"}),t?.isHost?a.jsx("button",{type:"button",className:"button",onClick:s,disabled:n||!e.allPlayersReady,children:"Start Game"}):a.jsx("span",{className:"small",children:"Waiting for host to start…"})]}),l]})}let M=v()(async()=>{},{loadableGenerated:{modules:["components\\compete\\RoundActiveSection.tsx -> @/components/GameMap"]},ssr:!1});function z({snapshot:e,timeRemaining:t,guessYear:n,guessLat:i,guessLng:r,hasSubmitted:s,localSubmitted:l,busy:o,onSetLocation:d,onSetYear:c,onSubmit:p,onOpenHints:h,guessYearRef:f,viewer:u}){let x=e.rounds?.[e.currentRoundIndex],g=null!==i&&null!==r?{lat:i,lng:r}:null;return(0,a.jsxs)("section",{className:"card stack",children:[x?(0,a.jsxs)("div",{style:{marginBottom:16},children:[a.jsx("p",{style:{fontWeight:500,fontSize:15,marginBottom:8},children:x.title}),x.imageUrl?a.jsx("div",{children:a.jsx("img",{src:x.imageUrl,alt:x.title,style:{width:"100%",maxHeight:300,objectFit:"cover",borderRadius:8,display:"block"}})}):a.jsx("div",{style:{width:"100%",height:200,background:"var(--color-background-secondary)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-secondary)",fontSize:14},children:"No image available"})]}):null,(0,a.jsxs)("h2",{children:["Round ",e.currentRoundIndex+1]}),(0,a.jsxs)("p",{children:["Time remaining: ",a.jsx("strong",{children:null===t?"—":`${Math.max(0,Math.floor(t))}s`}),(0,a.jsxs)("span",{style:{fontSize:12,color:"var(--color-text-secondary)",marginLeft:6},children:["/ ",e.config.roundTimerSec,"s"]})]}),a.jsx("div",{className:"row",children:(0,a.jsxs)("div",{className:"metric",children:[a.jsx("span",{className:"small",children:"Submitted"}),(0,a.jsxs)("strong",{children:[e.players.filter(e=>e.hasSubmitted&&null===e.leftAt).length," / ",e.players.filter(e=>null===e.leftAt).length]})]})}),(0,a.jsxs)("div",{className:"stack",children:[(0,a.jsxs)("div",{className:"field",children:[a.jsx("label",{htmlFor:"guess-year",children:"Year"}),a.jsx("input",{id:"guess-year",className:"input",type:"number",placeholder:null===n?"— not set —":void 0,value:n??"",onChange:e=>{let t=e.target.value;if(""===t)f.current=null,c(null);else{let e=Number(t);Number.isNaN(e)||(f.current=e,c(e))}},disabled:o||s}),a.jsx("input",{type:"range",min:-3e3,max:new Date().getFullYear(),value:n??Math.floor((-3e3+new Date().getFullYear())/2),onChange:e=>{f.current=Number(e.target.value),c(Number(e.target.value))},disabled:o||s,style:{width:"100%"}})]}),a.jsx("div",{style:{width:"100%",height:"320px",borderRadius:"20px",overflow:"hidden",pointerEvents:s||l?"none":"auto"},children:a.jsx(M,{guessLocation:g,onSetLocation:e=>{d(e)},localPlayerAvatarUrl:u?.avatarUrl??null,localPlayerDisplayName:u?.displayName})}),a.jsx("button",{type:"button",className:"button",onClick:p,disabled:o||s||l||null===n||null===g,children:o?"Submitting…":"Submit Guess"}),a.jsx("button",{type:"button",className:"button secondary",onClick:h,disabled:o||s||l,children:"Hints"})]})]})}function C(){let e=(0,r.useParams)(),t="string"==typeof e?.gameId?e.gameId:"",[n,l]=(0,i.useState)(null),[o,d]=(0,i.useState)(null),[p,h]=(0,i.useState)(null),[u,x]=(0,i.useState)(null),[m,b]=(0,i.useState)(null),[j,v]=(0,i.useState)(null),[k,w]=(0,i.useState)(null),[S,M]=(0,i.useState)(!1),[C,R]=(0,i.useState)(!1),[P,W]=(0,i.useState)([]),[L,A]=(0,i.useState)(!1),[B,E]=(0,i.useState)(!1),[T,$]=(0,i.useState)({purchasedIds:[],accPenalty:0,xpPenalty:0,whereAccPenalty:0,whenAccPenalty:0}),[_,D]=(0,i.useState)(null),[U,O]=(0,i.useState)(!1),[F,Y]=(0,i.useState)(!1),[H,G]=(0,i.useState)(!1),[X,V]=(0,i.useState)(!1),[q,K]=(0,i.useState)(!1),[J,Q]=(0,i.useState)(!1),Z=(0,i.useRef)({accPenalty:0,xpPenalty:0,purchasedIds:[],whereAccPenalty:0,whenAccPenalty:0});(0,i.useRef)(-1);let{playerId:ee,isLoading:et,error:en}=(0,s.j)(),ea=(0,i.useRef)(null),ei=(0,i.useRef)(null),er=(0,i.useRef)(null),{wsRef:es,toggleReady:el,startGame:eo,submitGuess:ed,readyNext:ec}=function({gameId:e,playerId:t,snapshot:n,roundResults:a,onStateUpdate:r,onPlayerSubmitted:s,onTimerClamped:l,onError:o,onRoundResults:d,onSetBusy:c,onSetLocalSubmitted:p,onClearSubmissionToasts:h}){let f=(0,i.useRef)(null);return{wsRef:f,displayNameRef:(0,i.useRef)(""),toggleReady:()=>{t&&f.current&&(c(!0),f.current.toggleReady(!0))},startGame:()=>{t&&f.current&&(c(!0),f.current.startGame())},submitGuess:(e,n,a,i,r,s,l)=>{t&&f.current&&f.current.submitGuess(e,n,a,i,r,s,l)},readyNext:e=>{t&&f.current&&(c(!0),f.current.readyNext(e))}}}({gameId:t,playerId:ee,snapshot:n,roundResults:o,onStateUpdate:l,onPlayerSubmitted:(e,t)=>{let n=e===ee?"You made a guess":`${t} made a guess`;W(e=>[...e,n]),e!==ee&&(A(!0),setTimeout(()=>A(!1),600))},onTimerClamped:e=>{l(t=>t?{...t,roundEndsAt:e}:t),A(!0),setTimeout(()=>A(!1),600)},onError:e=>{w(e)},onRoundResults:d,onSetBusy:M,onSetLocalSubmitted:R,onClearSubmissionToasts:()=>W([])}),ep=(0,i.useCallback)(()=>{n&&"ROUND_COMPLETE"===n.status&&ee&&(M(!0),w(null),ec(n.currentRoundIndex),setTimeout(()=>M(!1),5e3))},[n,ee,ec]),{timeRemaining:eh,resultSecsLeft:ef}=function({snapshot:e,playerId:t,localSubmitted:n,guessYearRef:a,guessLatRef:r,guessLngRef:s,hintResult:l,wsRef:o,submittedHintPenaltyRef:d,onAdvanceRound:c,setLocalSubmitted:p,setBusy:h}){let[f,u]=(0,i.useState)(null),[x,g]=(0,i.useState)(null);return{timeRemaining:f,resultSecsLeft:x}}({snapshot:n,playerId:ee,localSubmitted:C,guessYearRef:ea,guessLatRef:ei,guessLngRef:er,hintResult:T,wsRef:es,submittedHintPenaltyRef:Z,onAdvanceRound:ep,setLocalSubmitted:R,setBusy:M}),eu=(0,i.useMemo)(()=>n&&ee?n.players.find(e=>e.playerId===ee)??null:null,[n,ee]),ex=eu?.hasSubmitted??!1,eg=(0,i.useCallback)(e=>{ei.current=e.lat,er.current=e.lng,b(e.lat),v(e.lng)},[]),em=(0,i.useCallback)(e=>{ea.current=e,x(e)},[]),ey=(0,i.useCallback)(()=>{ee&&(M(!0),w(null),el())},[ee,el]),eb=(0,i.useCallback)(()=>{ee&&(M(!0),w(null),eo())},[ee,eo]),ej=(0,i.useCallback)(()=>{n&&"ROUND_ACTIVE"===n.status&&ee&&null!==u&&null!==m&&null!==j&&(C||(Z.current={accPenalty:T.accPenalty,xpPenalty:T.xpPenalty,purchasedIds:T.purchasedIds,whereAccPenalty:T.whereAccPenalty,whenAccPenalty:T.whenAccPenalty},R(!0),M(!0),w(null),ed(n.currentRoundIndex,u,m,j,T.purchasedIds,T.accPenalty,T.xpPenalty)))},[n,ee,u,m,j,C,T,ed]);return t?et?a.jsx("main",{className:"app-shell",children:a.jsx("div",{className:"shell-grid",children:(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Establishing identity…"}),(0,a.jsxs)("p",{className:"small",children:["Game ID: ",t]})]})})}):en?a.jsx("main",{className:"app-shell",children:a.jsx("div",{className:"shell-grid",children:(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Identity error"}),a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:en})]})})}):n?(0,a.jsxs)("main",{className:"app-shell",style:{background:n?.status==="SESSION_COMPLETE"?"#000":void 0},children:[(0,a.jsxs)("div",{className:"shell-grid",children:["ROUND_COMPLETE"!==n.status&&a.jsx("div",{style:{position:"absolute",top:"1rem",left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:"0.5rem",zIndex:50,pointerEvents:"none"},children:P.map((e,t)=>a.jsx("div",{style:{backgroundColor:"rgba(0,0,0,0.7)",color:"white",fontSize:"0.875rem",padding:"0.5rem 1rem",borderRadius:"9999px",whiteSpace:"nowrap"},children:e},t))}),L&&a.jsx("div",{style:{position:"absolute",inset:0,zIndex:40,pointerEvents:"none",backgroundColor:"rgba(220, 38, 38, 0.35)"}}),"ROUND_COMPLETE"!==n.status&&"SESSION_COMPLETE"!==n.status&&(0,a.jsxs)("section",{className:"hero",children:[(0,a.jsxs)("span",{className:"badge",children:["Compete \xb7 ",n.status]}),"LOBBY"!==n.status?(0,a.jsxs)("h1",{children:["Round ",Math.min(n.currentRoundIndex+1,n.config.totalRounds)," of"," ",n.config.totalRounds]}):a.jsx("h1",{children:"Lobby"}),(0,a.jsxs)("p",{className:"small",children:[a.jsx("span",{style:{fontSize:13,color:"rgba(255,255,255,0.6)"},children:"Room code: "}),a.jsx("code",{style:{fontSize:16,fontWeight:800,letterSpacing:"3px",color:"#fff",background:"rgba(255,255,255,0.1)",padding:"3px 10px",borderRadius:6},children:n.roomCode}),eu?.isHost?a.jsx("button",{type:"button",className:"button secondary",style:{marginLeft:8,padding:"2px 8px",fontSize:"0.8em"},onClick:()=>{navigator.clipboard.writeText(n.roomCode)},children:"Copy"}):null,eu?(0,a.jsxs)(a.Fragment,{children:[" \xb7 You: ",eu.displayName||f(eu.playerId)]}):null]})]}),"LOBBY"===n.status?a.jsx(I,{snapshot:n,viewer:eu,busy:S,error:k,onToggleReady:ey,onStartGame:eb}):null,"ROUND_ACTIVE"===n.status?a.jsx(z,{snapshot:n,playerId:ee,timeRemaining:eh,guessYear:u,guessLat:m,guessLng:j,hasSubmitted:ex,localSubmitted:C,busy:S,onSetLocation:eg,onSetYear:em,onSubmit:ej,onOpenHints:()=>E(!0),guessYearRef:ea,viewer:eu}):null,"ROUND_COMPLETE"===n.status?a.jsx(N,{snapshot:n,roundResults:o,playerId:ee,guessLat:m,guessLng:j,submittedHintPenaltyRef:Z,descriptionExpanded:U,setDescriptionExpanded:O,whereLbExpanded:F,setWhereLbExpanded:Y,whenLbExpanded:H,setWhenLbExpanded:G,whereCluesExpanded:X,setWhereCluesExpanded:V,whenCluesExpanded:q,setWhenCluesExpanded:K,resultSecsLeft:ef,onAdvanceRound:ep}):null,"SESSION_COMPLETE"===n.status?a.jsx(y,{snapshot:n,playerId:ee,allRoundResults:p,setFullscreenImg:D}):null]}),a.jsx(c,{hints:n?.rounds?.[n.currentRoundIndex]?.hints??[],isOpen:B,purchasedIds:T.purchasedIds,onClose:e=>{$(e),E(!1)}}),_&&a.jsx("div",{onClick:()=>D(null),style:{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},children:a.jsx("img",{src:_,alt:"Fullscreen",style:{maxWidth:"100vw",maxHeight:"100vh",objectFit:"contain"},onClick:e=>e.stopPropagation()})}),J&&(()=>{let e=o?.find(e=>e.playerId===ee),t=e?.badges??[],n=e?.nearMisses??[];return a.jsx(g,{badges:t,nearMisses:n,onDismiss:()=>Q(!1)})})()]}):a.jsx("main",{className:"app-shell",children:(0,a.jsxs)("div",{className:"shell-grid",children:[(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Loading session…"}),(0,a.jsxs)("p",{className:"small",children:["Game ID: ",t]})]}),k?a.jsx("section",{className:"card",children:a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:k})}):null]})}):null}},4798:(e,t,n)=>{"use strict";n.d(t,{w7:()=>i});var a=n(3710);new Promise(e=>{});async function i(){await a.V.auth.signOut()}},3710:(e,t,n)=>{"use strict";let a;n.d(t,{V:()=>r});var i=n(6867);let r=new Proxy({},{get:(e,t)=>(function(){if(a)return a;let e="https://gzvixlvkwjsrtmtybtkf.supabase.co",t="sb_publishable_xyAVhfMbjsXKsWL7MJpdsg_L8D92J5O";if(!e)throw Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_URL is not set. Identity bootstrap cannot proceed.");if(!t)throw Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Identity bootstrap cannot proceed.");return a=(0,i.eI)(e,t)})()[t]})},7661:(e,t,n)=>{"use strict";n.d(t,{j:()=>i});var a=n(7577);function i(){let[e,t]=(0,a.useState)({status:"loading"});(0,a.useRef)(!1);let n="ready"===e.status?e.playerId:null,i="ready"===e.status,r="loading"===e.status,s="error"===e.status?e.error:null;return{state:e,playerId:n,isReady:i,isLoading:r,error:s}}n(4798)},903:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>a});let a=(0,n(8570).createProxy)(String.raw`D:\GH-NEW\src\app\compete\[gameId]\page.tsx#default`)},2029:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>r,metadata:()=>i});var a=n(9510);n(5023);let i={title:"Guess-History Practice",description:"Deterministic historical guessing game"};function r({children:e}){return a.jsx("html",{lang:"en",suppressHydrationWarning:!0,children:a.jsx("body",{suppressHydrationWarning:!0,children:e})})}},3881:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>i});var a=n(6621);let i=e=>[{type:"image/x-icon",sizes:"32x32",url:(0,a.fillMetadataSegment)(".",e.params,"favicon.ico")+""}]},5023:()=>{}};var t=require("../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),a=t.X(0,[948,471,621,454],()=>n(5232));module.exports=a})();