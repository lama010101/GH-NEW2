(()=>{var e={};e.id=66,e.ids=[66],e.modules={2934:e=>{"use strict";e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{"use strict";e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{"use strict";e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},5315:e=>{"use strict";e.exports=require("path")},7360:e=>{"use strict";e.exports=require("url")},5232:(e,t,n)=>{"use strict";n.r(t),n.d(t,{GlobalError:()=>l.a,__next_app__:()=>p,originalPathname:()=>h,pages:()=>c,routeModule:()=>g,tree:()=>d}),n(903),n(2029),n(5866);var a=n(3191),i=n(8716),r=n(7922),l=n.n(r),s=n(5231),o={};for(let e in s)0>["default","tree","pages","GlobalError","originalPathname","__next_app__","routeModule"].indexOf(e)&&(o[e]=()=>s[e]);n.d(t,o);let d=["",{children:["compete",{children:["[gameId]",{children:["__PAGE__",{},{page:[()=>Promise.resolve().then(n.bind(n,903)),"D:\\GH-NEW\\src\\app\\compete\\[gameId]\\page.tsx"]}]},{}]},{metadata:{icon:[async e=>(await Promise.resolve().then(n.bind(n,3881))).default(e)],apple:[],openGraph:[],twitter:[],manifest:void 0}}]},{layout:[()=>Promise.resolve().then(n.bind(n,2029)),"D:\\GH-NEW\\src\\app\\layout.tsx"],"not-found":[()=>Promise.resolve().then(n.t.bind(n,5866,23)),"next/dist/client/components/not-found-error"],metadata:{icon:[async e=>(await Promise.resolve().then(n.bind(n,3881))).default(e)],apple:[],openGraph:[],twitter:[],manifest:void 0}}],c=["D:\\GH-NEW\\src\\app\\compete\\[gameId]\\page.tsx"],h="/compete/[gameId]/page",p={require:n,loadChunk:()=>Promise.resolve()},g=new a.AppPageRouteModule({definition:{kind:i.x.APP_PAGE,page:"/compete/[gameId]/page",pathname:"/compete/[gameId]",bundlePath:"",filename:"",appPaths:[]},userland:{loaderTree:d}})},5560:(e,t,n)=>{Promise.resolve().then(n.t.bind(n,2994,23)),Promise.resolve().then(n.t.bind(n,6114,23)),Promise.resolve().then(n.t.bind(n,9727,23)),Promise.resolve().then(n.t.bind(n,9671,23)),Promise.resolve().then(n.t.bind(n,1868,23)),Promise.resolve().then(n.t.bind(n,4759,23))},3089:(e,t,n)=>{Promise.resolve().then(n.bind(n,9619))},1107:()=>{},3353:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return r}});let a=n(1174);n(326),n(7577);let i=a._(n(7028));function r(e,t){var n;let a={loading:e=>{let{error:t,isLoading:n,pastDelay:a}=e;return null}};"function"==typeof e&&(a.loader=e);let r={...a,...t};return(0,i.default)({...r,modules:null==(n=r.loadableGenerated)?void 0:n.modules})}("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),e.exports=t.default)},933:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"BailoutToCSR",{enumerable:!0,get:function(){return i}});let a=n(4129);function i(e){let{reason:t,children:n}=e;throw new a.BailoutToCSRError(t)}},7028:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"default",{enumerable:!0,get:function(){return d}});let a=n(326),i=n(7577),r=n(933),l=n(6618);function s(e){return{default:e&&"default"in e?e.default:e}}let o={loader:()=>Promise.resolve(s(()=>null)),loading:null,ssr:!0},d=function(e){let t={...o,...e},n=(0,i.lazy)(()=>t.loader().then(s)),d=t.loading;function c(e){let s=d?(0,a.jsx)(d,{isLoading:!0,pastDelay:!0,error:null}):null,o=t.ssr?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(l.PreloadCss,{moduleIds:t.modules}),(0,a.jsx)(n,{...e})]}):(0,a.jsx)(r.BailoutToCSR,{reason:"next/dynamic",children:(0,a.jsx)(n,{...e})});return(0,a.jsx)(i.Suspense,{fallback:s,children:o})}return c.displayName="LoadableComponent",c}},6618:(e,t,n)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"PreloadCss",{enumerable:!0,get:function(){return r}});let a=n(326),i=n(4580);function r(e){let{moduleIds:t}=e,n=(0,i.getExpectedRequestStore)("next/dynamic css"),r=[];if(n.reactLoadableManifest&&t){let e=n.reactLoadableManifest;for(let n of t){if(!e[n])continue;let t=e[n].files.filter(e=>e.endsWith(".css"));r.push(...t)}}return 0===r.length?null:(0,a.jsx)(a.Fragment,{children:r.map(e=>(0,a.jsx)("link",{precedence:"dynamic",rel:"stylesheet",href:n.assetPrefix+"/_next/"+encodeURI(e),as:"style"},e))})}},9619:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>k});var a=n(326),i=n(7577),r=n(5047),l=n(3353),s=n.n(l),o=n(7661);let d={1:{acc:10,xp:20},2:{acc:20,xp:40},3:{acc:30,xp:60},4:{acc:40,xp:80},5:{acc:50,xp:100}},c={calendar:'<svg viewBox="0 0 13 13" fill="none"><rect x="1.2" y="2" width="10.6" height="10" rx="1.5" stroke="#888" stroke-width="1.1"/><path d="M4.3 1v2M8.7 1v2M1.2 5.3h10.6" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>',clock:'<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M6.5 3.5v3l2 1.5" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>',trend:'<svg viewBox="0 0 13 13" fill="none"><path d="M2 9.5l3-4 2.5 2 4-5" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',tag:'<svg viewBox="0 0 13 13" fill="none"><path d="M2 2h5l4.5 4.5a1 1 0 010 1.4l-3.1 3.1a1 1 0 01-1.4 0L2.5 6.5V2H2z" stroke="#888" stroke-width="1.1"/><circle cx="4.5" cy="4.5" r=".8" fill="#888"/></svg>',globe:'<svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" stroke-width="1.1"/><path d="M1.5 6.5h10M6.5 1.5c-2 2-2 8 0 10M6.5 1.5c2 2-2 8 0 10" stroke="#888" stroke-width="1.1"/></svg>',mountain:'<svg viewBox="0 0 13 13" fill="none"><path d="M1.5 10.5l4-7 2.5 4 1.5-2 3 5H1.5z" stroke="#888" stroke-width="1.1" stroke-linejoin="round"/></svg>',flag:'<svg viewBox="0 0 13 13" fill="none"><path d="M3 11V2M3 2h7.5L8.5 5.5 10.5 9H3" stroke="#888" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',check:'<svg viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-5" stroke="#7ed957" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'};function h(e){return 0===e?"#2a2a2a":e<=20?"rgba(126,217,87,0.4)":e<=40?"rgba(232,192,34,0.4)":e<=60?"rgba(232,119,34,0.4)":"rgba(232,68,34,0.4)"}function p({hints:e,isOpen:t,onClose:n}){let r,l,s,o;let[p,g]=(0,i.useState)(new Set),[f,x]=(0,i.useState)("when"),u=e=>1===e?"hint-cost-g":2===e?"hint-cost-y":e<=4?"hint-cost-o":"hint-cost-r",m=e=>0===e?"zero":e<=20?"g":e<=40?"y":e<=60?"o":"r",y=(0,i.useMemo)(()=>{let t=e.filter(e=>"when"===e.type),n=e.filter(e=>"where"===e.type),a=t.reduce((e,t)=>p.has(t.id)?e+d[t.tier].acc:e,0);return{whenAcc:Math.min(a,100),whereAcc:Math.min(n.reduce((e,t)=>p.has(t.id)?e+d[t.tier].acc:e,0),100),totalAcc:Math.min(e.reduce((e,t)=>p.has(t.id)?e+d[t.tier].acc:e,0),100),totalXp:Math.min(e.reduce((e,t)=>p.has(t.id)?e+d[t.tier].xp:e,0),200)}},[e,p]),b=(0,i.useMemo)(()=>e.filter(e=>e.type===f).sort((e,t)=>e.display_order!==t.display_order?e.display_order-t.display_order:e.tier-t.tier),[e,f]),j=e=>{g(t=>new Set([...t,e]))},v=()=>{n({purchasedIds:Array.from(p),accPenalty:y.totalAcc,xpPenalty:y.totalXp})};return t?(0,a.jsxs)(a.Fragment,{children:[a.jsx("style",{children:`
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
      `}),a.jsx("div",{className:"hint-modal-backdrop",onClick:v,children:(0,a.jsxs)("div",{className:"hint-modal hint-modal-root",role:"dialog","aria-modal":"true",onClick:e=>e.stopPropagation(),children:[(0,a.jsxs)("div",{className:"hint-modal-header",children:[a.jsx("div",{className:"hint-modal-title",children:"Hints"}),a.jsx("button",{className:"hint-modal-close",onClick:v,"aria-label":"Close hints",children:a.jsx("svg",{viewBox:"0 0 10 10",fill:"none",children:a.jsx("path",{d:"M2 2l6 6M8 2L2 8",stroke:"#aaa"})})})]}),(0,a.jsxs)("div",{className:"hint-total-strip",children:[(0,a.jsxs)("div",{className:"hint-total-left",children:[a.jsx("div",{className:"hint-total-lbl",children:"Total penalty"}),(0,a.jsxs)("div",{className:`hint-total-big ${m(y.totalAcc)}`,children:["−",y.totalAcc,"%"]})]}),(0,a.jsxs)("div",{className:"hint-total-right",children:[(0,a.jsxs)("div",{className:"hint-axis-pen",style:{borderColor:h(y.whenAcc)},children:[(0,a.jsxs)("div",{className:"hint-axis-icon",children:[(0,a.jsxs)("svg",{viewBox:"0 0 10 10",fill:"none",children:[a.jsx("rect",{x:"1",y:"1.5",width:"8",height:"7.5",rx:"1.2",stroke:"#555",strokeWidth:"1.1"}),a.jsx("path",{d:"M3.5 1v1.5M6.5 1v1.5M1 4h8",stroke:"#555",strokeWidth:"1.1",strokeLinecap:"round"})]}),a.jsx("span",{className:"hint-axis-lbl",children:"When"})]}),(0,a.jsxs)("div",{className:`hint-axis-val hint-axis-val--${m(y.whenAcc)}`,children:["−",y.whenAcc,"%"]}),a.jsx("div",{className:"hint-axis-track",children:a.jsx("div",{className:"hint-axis-fill",style:{width:`${y.whenAcc}%`}})})]}),(0,a.jsxs)("div",{className:"hint-axis-pen",style:{borderColor:h(y.whereAcc)},children:[(0,a.jsxs)("div",{className:"hint-axis-icon",children:[a.jsx("svg",{viewBox:"0 0 10 10",fill:"none",children:a.jsx("path",{d:"M5 1C3.62 1 2.5 2.12 2.5 3.5c0 1.88 2.5 5.5 2.5 5.5s2.5-3.62 2.5-5.5C7.5 2.12 6.38 1 5 1zm0 3.33a.83.83 0 110-1.66.83.83 0 010 1.66z",fill:"#555"})}),a.jsx("span",{className:"hint-axis-lbl",children:"Where"})]}),(0,a.jsxs)("div",{className:`hint-axis-val hint-axis-val--${m(y.whereAcc)}`,children:["−",y.whereAcc,"%"]}),a.jsx("div",{className:"hint-axis-track",children:a.jsx("div",{className:"hint-axis-fill",style:{width:`${y.whereAcc}%`}})})]})]})]}),(0,a.jsxs)("div",{className:"hint-tab-row",children:[(0,a.jsxs)("button",{className:`hint-tab-btn ${"when"===f?"active":""}`,onClick:()=>x("when"),children:[(0,a.jsxs)("svg",{viewBox:"0 0 12 12",fill:"none",width:"12",height:"12",children:[a.jsx("rect",{x:"1.5",y:"2",width:"9",height:"9",rx:"1.5",strokeWidth:"1.2"}),a.jsx("path",{d:"M4 1v2M8 1v2M1.5 5h9",strokeWidth:"1.2",strokeLinecap:"round"})]}),a.jsx("span",{className:"hint-tab-lbl",children:"When"}),(r="when",e.filter(e=>e.type===r&&p.has(e.id)).length>0&&a.jsx("div",{className:"hint-tab-badge",children:(l="when",e.filter(e=>e.type===l&&p.has(e.id)).length)}))]}),(0,a.jsxs)("button",{className:`hint-tab-btn ${"where"===f?"active":""}`,onClick:()=>x("where"),children:[a.jsx("svg",{viewBox:"0 0 12 12",fill:"none",width:"12",height:"12",children:a.jsx("path",{d:"M6 1C4.34 1 3 2.34 3 4c0 2.25 3 7 3 7s3-4.75 3-7c0-1.66-1.34-3-3-3zm0 4a1 1 0 110-2 1 1 0 010 2z",strokeWidth:"1.2"})}),a.jsx("span",{className:"hint-tab-lbl",children:"Where"}),(s="where",e.filter(e=>e.type===s&&p.has(e.id)).length>0&&a.jsx("div",{className:"hint-tab-badge",children:(o="where",e.filter(e=>e.type===o&&p.has(e.id)).length)}))]})]}),a.jsx("div",{className:"hint-hints-panel",children:b.map(e=>{let t=p.has(e.id),n=d[e.tier];return(0,a.jsxs)("button",{className:`hint-btn ${t?"revealed":""}`,onClick:()=>!t&&j(e.id),disabled:t,"aria-pressed":t,children:[a.jsx("div",{className:"hint-icon",dangerouslySetInnerHTML:{__html:function(e){if("when"===e.type){if(1===e.tier)return c.clock;if(2===e.tier)return c.trend;if(3===e.tier)return c.calendar;if(4===e.tier)return c.trend;if(5===e.tier)return c.tag}if("where"===e.type){if(1===e.tier)return c.globe;if(2===e.tier)return c.mountain;if(3===e.tier)return c.flag;if(4===e.tier)return c.mountain;if(5===e.tier)return c.tag}return c.calendar}(e)}}),(0,a.jsxs)("div",{className:"hint-body",children:[a.jsx("div",{className:"hint-name",children:function(e){if("when"===e.type){if(1===e.tier)return"Century";if(2===e.tier)return"Historical Event";if(3===e.tier)return"Decade";if(4===e.tier)return"Contemporary Event";if(5===e.tier)return"Visual Clues"}if("where"===e.type){if(1===e.tier)return"Continent";if(2===e.tier)return"Remote Landmark";if(3===e.tier)return"Region";if(4===e.tier)return"Nearby Landmark";if(5===e.tier)return"Visual Clues"}return"Hint"}(e)}),t?a.jsx("div",{className:"hint-answer",children:function(e){let t=e.metadata;return"where"===e.type&&(2===e.tier||4===e.tier)&&t?.km!=null?`${e.content} — ${t.km} km away`:"when"===e.type&&(2===e.tier||4===e.tier)&&t?.years!=null?`${e.content} — ${t.years} years off`:e.content}(e)}):a.jsx("div",{className:"hint-sub",children:function(e){if("when"===e.type){if(1===e.tier)return"Broad era clue";if(2===e.tier)return"A historically nearby event";if(3===e.tier)return"A 10-year window";if(4===e.tier)return"A closely dated event";if(5===e.tier)return"Scene elements suggesting the era"}if("where"===e.type){if(1===e.tier)return"Broad region clue";if(2===e.tier){let t=e.metadata?.km;return null!=t?`A landmark ~${t} km away`:"A distant landmark"}if(3===e.tier)return"Administrative region";if(4===e.tier){let t=e.metadata?.km;return null!=t?`A landmark ~${t} km away`:"A nearby landmark"}if(5===e.tier)return"Scene elements suggesting the location"}return"Tap to reveal"}(e)})]}),a.jsx("div",{className:"hint-right",children:t?a.jsx("div",{className:"hint-check-dot",dangerouslySetInnerHTML:{__html:c.check}}):(0,a.jsxs)("div",{className:`hint-cost-pill ${u(e.tier)}`,children:["−",n.acc,"%"]})})]},e.id)})})]})})]}):null}let g=s()(async()=>{},{loadableGenerated:{modules:["app\\compete\\[gameId]\\page.tsx -> @/components/GameMap"]},ssr:!1}),f=s()(async()=>{},{loadableGenerated:{modules:["app\\compete\\[gameId]\\page.tsx -> @/components/StaticResultMap"]},ssr:!1}),x=[["#93c5fd","#fb923c"],["#93c5fd","#c084fc"],["#93c5fd","#2dd4bf"],["#fb923c","#93c5fd"],["#fb923c","#c084fc"],["#fb923c","#2dd4bf"],["#c084fc","#93c5fd"],["#c084fc","#fb923c"],["#c084fc","#2dd4bf"],["#2dd4bf","#93c5fd"],["#2dd4bf","#fb923c"],["#2dd4bf","#c084fc"]];function u(e){let t=0;for(let n=0;n<e.length;n++)t=31*t+e.charCodeAt(n)>>>0;let[n,a]=x[t%x.length];return{background:`linear-gradient(90deg, ${n}, ${a})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontWeight:500,display:"inline"}}function m({avatarUrl:e,displayName:t,size:n=26}){let i=(t||"?")[0].toUpperCase(),r={width:n,height:n,borderRadius:"50%",overflow:"hidden",flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",background:"#2a2a3a",border:"1.5px solid rgba(255,255,255,0.18)",fontSize:.42*n,fontWeight:600,color:"rgba(255,255,255,0.75)",verticalAlign:"middle"};return e?a.jsx("span",{style:r,children:a.jsx("img",{src:e,alt:t,style:{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"},onError:e=>{e.currentTarget.style.display="none"}})}):a.jsx("span",{style:r,children:i})}function y(e){return e.slice(0,8)}function b(e,t){let n=e.find(e=>e.playerId===t);return n&&n.displayName.trim().length>0?n.displayName:y(t)}function j(e,t,n,a){let i=Math.sin((n-e)*Math.PI/180/2)**2+Math.cos(e*Math.PI/180)*Math.cos(n*Math.PI/180)*Math.sin((a-t)*Math.PI/180/2)**2;return 12742*Math.atan2(Math.sqrt(i),Math.sqrt(1-i))}function v({value:e}){let t=2*Math.PI*80,[n,r]=(0,i.useState)(0),l=Math.max(0,Math.min(100,n)),s=`hsl(${Math.round(l/100*120)}, 100%, 50%)`;return(0,a.jsxs)("svg",{viewBox:"0 0 200 200",style:{width:170,height:170,display:"block",margin:"0 auto"},children:[a.jsx("circle",{cx:100,cy:100,r:80,fill:"none",stroke:"#2a2a2a",strokeWidth:15}),a.jsx("circle",{cx:100,cy:100,r:80,fill:"none",stroke:s,strokeWidth:15,strokeLinecap:"round",strokeDasharray:t,strokeDashoffset:t*(1-l/100),transform:"rotate(-90 100 100)"}),a.jsx("text",{x:100,y:100,textAnchor:"middle",dominantBaseline:"central",fill:"white",fontSize:52,fontWeight:"bold",children:l})]})}function k(){let e=(0,r.useParams)(),t="string"==typeof e?.gameId?e.gameId:"",n=(0,r.useRouter)(),[l,s]=(0,i.useState)(null),[d,c]=(0,i.useState)(null),[h,x]=(0,i.useState)(null),[k,w]=(0,i.useState)(null),[N,S]=(0,i.useState)(null),[I,M]=(0,i.useState)(null),[z,C]=(0,i.useState)(null),[R,P]=(0,i.useState)(null),[W,L]=(0,i.useState)(!1),[B,A]=(0,i.useState)(!1),[_,D]=(0,i.useState)([]),[T,E]=(0,i.useState)(!1),[U,$]=(0,i.useState)(!1),[O,F]=(0,i.useState)({purchasedIds:[],accPenalty:0,xpPenalty:0}),[H,Y]=(0,i.useState)(null),[G,V]=(0,i.useState)(null),[X,q]=(0,i.useState)(!1),K=(0,i.useRef)({accPenalty:0,xpPenalty:0,purchasedIds:[]}),{playerId:J,isReady:Q,isLoading:Z,error:ee}=(0,o.j)(),et=(0,i.useRef)(null);(0,i.useRef)(""),(0,i.useRef)(null),(0,i.useRef)(null),(0,i.useRef)(null);let en=(0,i.useCallback)(e=>{if(!k)return null;let t=k.filter(t=>t.playerId===e&&t.didSubmit);if(0===t.length)return null;let n=t.reduce((e,t)=>e+t.score,0),a=Math.round(t.reduce((e,t)=>e+((t.locationScore??0)+(t.timeScore??0))/2,0)/t.length),i=Math.round(t.reduce((e,t)=>e+(t.locationScore??0),0)/t.length),r=Math.round(t.reduce((e,t)=>e+(t.timeScore??0),0)/t.length);return{totalScore:n,avgAccuracy:a,avgLocationAccuracy:i,avgYearAccuracy:r,avgConsistency:Math.round(t.reduce((e,t)=>e+Math.min(t.locationScore??0,t.timeScore??0),0)/t.length),avgDistanceKm:t.reduce((e,t)=>e+(t.distanceKm??0),0)/t.length,avgYearDiff:t.reduce((e,t)=>e+(t.yearDiff??0),0)/t.length}},[k]),ea=(0,i.useCallback)(e=>{if(!k)return null;let t=k.filter(t=>t.roundIndex===e&&t.didSubmit);if(0===t.length)return null;let n=Math.round(t.reduce((e,t)=>e+((t.locationScore??0)+(t.timeScore??0))/2,0)/t.length),a=Math.round(t.reduce((e,t)=>e+(t.locationScore??0),0)/t.length),i=Math.round(t.reduce((e,t)=>e+(t.timeScore??0),0)/t.length),r=t.reduce((e,t)=>e+(t.distanceKm??0),0)/t.length;return{avgAccuracy:n,avgLocationScore:a,avgTimeScore:i,avgDistanceKm:r,avgYearDiff:t.reduce((e,t)=>e+(t.yearDiff??0),0)/t.length,totalScore:t.reduce((e,t)=>e+t.score,0),bestPlayerId:t.reduce((e,t)=>t.score>e.score?t:e,t[0]).playerId}},[k]),ei=(0,i.useMemo)(()=>l&&J?l.players.find(e=>e.playerId===J)??null:null,[l,J]),er=ei?.hasSubmitted??!1,el=null!==I&&null!==z?{lat:I,lng:z}:null,es=(0,i.useCallback)(e=>{M(e.lat),C(e.lng)},[]),eo=(0,i.useCallback)(()=>{J&&et.current&&(L(!0),P(null),et.current.toggleReady(!0))},[J]),ed=(0,i.useCallback)(()=>{J&&et.current&&(L(!0),P(null),et.current.startGame())},[J]),ec=(0,i.useCallback)(()=>{l&&J&&et.current&&null!==N&&null!==I&&null!==z&&(B||(K.current={accPenalty:O.accPenalty,xpPenalty:O.xpPenalty,purchasedIds:O.purchasedIds},A(!0),L(!0),P(null),et.current.submitGuess(l.currentRoundIndex,N,I,z,O.purchasedIds,O.accPenalty,O.xpPenalty)))},[l,J,N,I,z,B,O]),eh=(0,i.useCallback)(()=>{l&&J&&et.current&&(L(!0),P(null),et.current.readyNext(l.currentRoundIndex),setTimeout(()=>L(!1),5e3))},[l,J]);if(!t)return null;if(Z)return a.jsx("main",{className:"app-shell",children:a.jsx("div",{className:"shell-grid",children:(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Establishing identity…"}),(0,a.jsxs)("p",{className:"small",children:["Game ID: ",t]})]})})});if(ee)return a.jsx("main",{className:"app-shell",children:a.jsx("div",{className:"shell-grid",children:(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Identity error"}),a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:ee})]})})});if(!l)return a.jsx("main",{className:"app-shell",children:(0,a.jsxs)("div",{className:"shell-grid",children:[(0,a.jsxs)("section",{className:"hero",children:[a.jsx("span",{className:"badge",children:"Compete"}),a.jsx("h1",{children:"Loading session…"}),(0,a.jsxs)("p",{className:"small",children:["Game ID: ",t]})]}),R?a.jsx("section",{className:"card",children:a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:R})}):null]})});let ep=R?a.jsx("p",{style:{color:"#ff6b6b",margin:0},children:R}):null;return(0,a.jsxs)("main",{className:"app-shell",style:{background:l?.status==="ROUND_COMPLETE"?"#000":void 0},children:[(0,a.jsxs)("div",{className:"shell-grid",children:["ROUND_COMPLETE"!==l.status&&a.jsx("div",{style:{position:"absolute",top:"1rem",left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",gap:"0.5rem",zIndex:50,pointerEvents:"none"},children:_.map((e,t)=>a.jsx("div",{style:{backgroundColor:"rgba(0,0,0,0.7)",color:"white",fontSize:"0.875rem",padding:"0.5rem 1rem",borderRadius:"9999px",whiteSpace:"nowrap"},children:e},t))}),T&&a.jsx("div",{style:{position:"absolute",inset:0,zIndex:40,pointerEvents:"none",backgroundColor:"rgba(220, 38, 38, 0.35)"}}),"ROUND_COMPLETE"!==l.status&&(0,a.jsxs)("section",{className:"hero",children:[(0,a.jsxs)("span",{className:"badge",children:["Compete \xb7 ",l.status]}),"LOBBY"!==l.status?(0,a.jsxs)("h1",{children:["Round ",Math.min(l.currentRoundIndex+1,l.config.totalRounds)," of"," ",l.config.totalRounds]}):a.jsx("h1",{children:"Lobby"}),(0,a.jsxs)("p",{className:"small",children:["Game ID: ",a.jsx("code",{children:l.gameId}),ei?.isHost?a.jsx("button",{type:"button",className:"button secondary",style:{marginLeft:8,padding:"2px 8px",fontSize:"0.8em"},onClick:()=>{navigator.clipboard.writeText(l.gameId)},children:"Copy"}):null,ei?(0,a.jsxs)(a.Fragment,{children:[" \xb7 You: ",ei.displayName||y(ei.playerId)]}):null]})]}),"LOBBY"===l.status?(0,a.jsxs)("section",{className:"card stack",children:[a.jsx("h2",{children:"Lobby"}),a.jsx("div",{className:"stack",children:0===l.players.length?a.jsx("p",{className:"small",children:"No players yet."}):l.players.map(e=>(0,a.jsxs)("div",{className:"row",children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(m,{avatarUrl:e.avatarUrl,displayName:e.displayName||y(e.playerId)}),a.jsx("span",{style:u(e.playerId),children:e.displayName||y(e.playerId)})]}),e.isHost?a.jsx("span",{className:"badge",children:"Host"}):null,a.jsx("span",{className:"small",children:e.ready?"Ready":"Not ready"})]},e.playerId))}),(0,a.jsxs)("p",{style:{fontSize:13,color:"var(--color-text-secondary)"},children:["Round timer:"," ",a.jsx("strong",{children:l.config.roundTimerSec>=60?`${Math.floor(l.config.roundTimerSec/60)}m${l.config.roundTimerSec%60>0?` ${l.config.roundTimerSec%60}s`:""}`:`${l.config.roundTimerSec}s`})]}),(0,a.jsxs)("div",{className:"row",children:[a.jsx("button",{type:"button",className:"button secondary",onClick:eo,disabled:W||!!ei?.ready,children:ei?.ready?"Ready ✓":"Ready"}),ei?.isHost?a.jsx("button",{type:"button",className:"button",onClick:ed,disabled:W||!l.allPlayersReady,children:"Start Game"}):a.jsx("span",{className:"small",children:"Waiting for host to start…"})]}),ep]}):null,"ROUND_ACTIVE"===l.status?(0,a.jsxs)("section",{className:"card stack",children:[(()=>{let e=l.rounds?.[l.currentRoundIndex];return e?(0,a.jsxs)("div",{style:{marginBottom:16},children:[a.jsx("p",{style:{fontWeight:500,fontSize:15,marginBottom:8},children:e.title}),e.imageUrl?a.jsx("div",{children:a.jsx("img",{src:e.imageUrl,alt:e.title,style:{width:"100%",maxHeight:300,objectFit:"cover",borderRadius:8,display:"block"}})}):a.jsx("div",{style:{width:"100%",height:200,background:"var(--color-background-secondary)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-secondary)",fontSize:14},children:"No image available"})]}):null})(),(0,a.jsxs)("h2",{children:["Round ",l.currentRoundIndex+1]}),(0,a.jsxs)("p",{children:["Time remaining: ",a.jsx("strong",{children:null===d?"—":`${Math.max(0,Math.floor(d))}s`}),(0,a.jsxs)("span",{style:{fontSize:12,color:"var(--color-text-secondary)",marginLeft:6},children:["/ ",l.config.roundTimerSec,"s"]})]}),a.jsx("div",{className:"row",children:(0,a.jsxs)("div",{className:"metric",children:[a.jsx("span",{className:"small",children:"Submitted"}),(0,a.jsxs)("strong",{children:[l.players.filter(e=>e.hasSubmitted&&null===e.leftAt).length," / ",l.players.filter(e=>null===e.leftAt).length]})]})}),(0,a.jsxs)("div",{className:"stack",children:[(0,a.jsxs)("div",{className:"field",children:[a.jsx("label",{htmlFor:"guess-year",children:"Year"}),a.jsx("input",{id:"guess-year",className:"input",type:"number",placeholder:null===N?"— not set —":void 0,value:N??"",onChange:e=>{let t=e.target.value;if(""===t)S(null);else{let e=Number(t);Number.isNaN(e)||S(e)}},disabled:W||er}),a.jsx("input",{type:"range",min:-3e3,max:new Date().getFullYear(),value:N??Math.floor((-3e3+new Date().getFullYear())/2),onChange:e=>{S(Number(e.target.value))},disabled:W||er,style:{width:"100%"}})]}),a.jsx("div",{style:{width:"100%",height:"320px",borderRadius:"20px",overflow:"hidden",pointerEvents:er||B?"none":"auto"},children:a.jsx(g,{guessLocation:el,onSetLocation:es,localPlayerAvatarUrl:ei?.avatarUrl??null,localPlayerDisplayName:ei?.displayName})}),a.jsx("button",{type:"button",className:"button",onClick:ec,disabled:W||er||B||null===N||null===el,children:W?"Submitting…":"Submit Guess"}),a.jsx("button",{type:"button",className:"button secondary",onClick:()=>$(!0),disabled:W||er||B,children:"Hints"})]}),ep]}):null,"ROUND_COMPLETE"===l.status?(0,a.jsxs)("div",{style:{padding:"0 12px",paddingBottom:"72px",maxWidth:"720px",margin:"0 auto",width:"100%"},children:[a.jsx("style",{children:`
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
            `}),(()=>{let e=l.rounds[l.currentRoundIndex];if(!e)return null;let t=h?.find(e=>e.playerId===J),i=t?.accuracy??0,r=e.latitude,s=e.longitude,o=e.locationName,d=e.year,c=null!=I&&null!=z?j(I,z,r,s):null,p=(h??[]).slice().sort((e,t)=>t.score-e.score).map((e,t)=>({playerId:e.playerId,rank:t+1,displayName:l.players.find(t=>t.playerId===e.playerId)?.displayName||e.playerId.slice(0,8),accuracy:e.accuracy,isMe:e.playerId===J})),g=l.players.map(e=>{let t=h?.find(t=>t.playerId===e.playerId),n=t?.guessYear??null,a=t?.timeScore??null,i=null!=n&&null!=d?Math.abs(n-d):null;return{playerId:e.playerId,displayName:e.displayName||e.playerId.slice(0,8),guessYear:n,acc:a,diff:i,isMe:e.playerId===J}}).sort((e,t)=>null==e.acc&&null==t.acc?0:null==e.acc?1:null==t.acc?-1:t.acc-e.acc);return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,overflow:"hidden",marginBottom:"10px",minHeight:"50vh"},children:[a.jsx("div",{style:{fontSize:16,fontWeight:600,color:"#fff",textAlign:"center",padding:"14px 16px 10px"},children:e.title}),e.imageUrl?a.jsx("img",{src:e.imageUrl,alt:e.title,style:{width:"100%",height:"180px",objectFit:"cover",display:"block"},className:"round-complete-event-image"}):a.jsx("div",{style:{width:"100%",height:"180px",background:"#2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",color:"#555",fontSize:12},children:"No image available"}),(0,a.jsxs)("div",{style:{fontSize:14,fontWeight:600,color:"#f97316",textAlign:"center",padding:"8px 16px"},children:[d," \xb7 ",o]}),(0,a.jsxs)("div",{style:{padding:"0 16px 16px"},children:[a.jsx("div",{style:{fontSize:13,color:"#d1d5db",lineHeight:1.5,display:X?"block":"-webkit-box",WebkitLineClamp:X?"unset":3,WebkitBoxOrient:"vertical",overflow:"hidden"},children:e.description??"No description available"}),!X&&(e.description?.length??0)>0&&a.jsx("button",{onClick:()=>q(!0),style:{background:"none",border:"none",color:"#9ca3af",fontSize:13,textDecoration:"underline",cursor:"pointer",padding:0,marginTop:4},children:"more"}),e.sourceUrl&&a.jsx("button",{onClick:()=>window.open(e.sourceUrl,"_blank"),style:{background:"transparent",border:"1px solid #6b7280",color:"#6b7280",fontSize:11,borderRadius:6,padding:"4px 10px",cursor:"pointer",marginTop:8},children:"Source"})]})]}),(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{display:"flex",alignItems:"center",justifyContent:"center"},children:(0,a.jsxs)("div",{style:{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"},children:[a.jsx(v,{value:i}),a.jsx("span",{style:{position:"absolute",right:"-28px",top:"50%",transform:"translateY(-50%)",fontSize:26,fontWeight:700,color:"#fff",lineHeight:1},children:"%"})]})}),a.jsx("div",{style:{textAlign:"center",marginTop:12},children:(0,a.jsxs)("span",{style:{fontSize:13,color:"#9ca3af"},children:[t?.score??0," XP"]})}),K.current.xpPenalty>0&&a.jsx("div",{style:{textAlign:"center",marginTop:4},children:(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:3,background:"#7f1d1d",borderRadius:999,padding:"2px 8px",fontSize:10,color:"#fca5a5",fontWeight:600},children:["−",K.current.xpPenalty," XP hints"]})})]}),(()=>{let e=t?.badges??[],n=t?.nearMisses??[];if(0===e.length&&0===n.length)return null;let i={gold:"#FFD700",silver:"#C0C0C0",bronze:"#CD7F32"},r={gold:"rgba(255,215,0,0.12)",silver:"rgba(192,192,192,0.12)",bronze:"rgba(205,127,50,0.12)"},l={location:"WHERE",year:"WHEN",combo:"COMBO"},s={location:"\uD83D\uDCCD",year:"\uD83D\uDCC5",combo:"⚡"};return(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{fontSize:10,color:"#999",textTransform:"uppercase",letterSpacing:"1.5px",textAlign:"center",marginBottom:10},children:"Badges"}),(0,a.jsxs)("div",{style:{display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap"},children:[e.map((e,t)=>(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:r[e.tier],border:`1px solid ${i[e.tier]}44`,borderRadius:10,padding:"8px 12px",minWidth:64},children:[a.jsx("span",{style:{fontSize:18},children:s[e.dimension]}),a.jsx("span",{style:{fontSize:10,fontWeight:700,color:i[e.tier],textTransform:"uppercase",letterSpacing:"1px"},children:e.tier}),a.jsx("span",{style:{fontSize:10,color:"#aaa",textTransform:"uppercase"},children:l[e.dimension]}),(0,a.jsxs)("span",{style:{fontSize:11,color:"#fff",fontWeight:600},children:[e.accuracy,"%"]})]},t)),n.map((e,t)=>(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"8px 12px",minWidth:64,opacity:.7},children:[a.jsx("span",{style:{fontSize:18},children:s[e.dimension]}),a.jsx("span",{style:{fontSize:10,fontWeight:700,color:"#888",textTransform:"uppercase",letterSpacing:"1px"},children:"CLOSE"}),a.jsx("span",{style:{fontSize:10,color:"#aaa",textTransform:"uppercase"},children:l[e.dimension]}),(0,a.jsxs)("span",{style:{fontSize:11,color:"#aaa",fontWeight:600},children:[e.accuracy,"%"]})]},`nm-${t}`))]})]})})(),(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{fontSize:13,fontWeight:600,color:"#fff",marginBottom:10},children:"Round leaderboard"}),p.map(e=>{let t=Math.round(Math.max(0,Math.min(100,e.accuracy))/100*120),n=`hsl(${t}, 100%, 50%)`,i=e.accuracy>=60?"#1a2e1a":e.accuracy>=30?"#2e2a1a":"#2e1a1a",r=l.players.find(t=>t.playerId===e.playerId)?.avatarUrl??null;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",borderRadius:8,marginBottom:3,gap:6,background:e.isMe?"#2e2e2e":"transparent"},children:[a.jsx("span",{style:{fontSize:11,color:"#777",minWidth:14},children:e.rank}),(0,a.jsxs)("span",{style:{flex:1,fontSize:13},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(m,{avatarUrl:r,displayName:e.displayName}),a.jsx("span",{style:{...u(e.playerId),fontWeight:e.isMe?700:500},children:e.displayName})]}),e.isMe&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),(0,a.jsxs)("span",{style:{background:i,color:n,borderRadius:999,padding:"2px 9px",fontSize:11,fontWeight:600},children:[Math.round(e.accuracy),"%"]})]},e.rank)}),0===p.length&&l.players.map(e=>{let t=e.playerId===J;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",borderRadius:8,marginBottom:3,gap:6,background:t?"#2e2e2e":"transparent"},children:[a.jsx("span",{style:{fontSize:11,color:"#777",minWidth:14},children:"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:13},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(m,{avatarUrl:e.avatarUrl,displayName:e.displayName||e.playerId.slice(0,8)}),a.jsx("span",{style:{...u(e.playerId),fontWeight:t?700:500},children:e.displayName||e.playerId.slice(0,8)})]}),t&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"}),a.jsx("span",{style:{color:"#555",fontSize:11,fontStyle:"italic",marginLeft:4},children:"No guess"})]}),a.jsx("span",{style:{background:"#2a2a2a",color:"#888",borderRadius:999,padding:"2px 9px",fontSize:11,fontWeight:600},children:"—"})]},e.playerId)})]}),(0,a.jsxs)("div",{className:"round-complete-grid",children:[(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[(0,a.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8},children:[(0,a.jsxs)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"#e5e7eb",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("path",{d:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"}),a.jsx("circle",{cx:"12",cy:"10",r:"3"})]}),a.jsx("span",{style:{fontSize:16,fontWeight:600,color:"#e5e7eb"},children:"Where"})]}),null!=t&&(()=>{let e=Math.round(t.locationScore),n=`hsl(${Math.round(Math.max(0,Math.min(100,e))/100*120)}, 100%, 50%)`;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"baseline",gap:2},children:[a.jsx("span",{style:{fontSize:22,fontWeight:700,color:n},children:e}),a.jsx("span",{style:{fontSize:11,color:n},children:"%"})]})})()]}),K.current.accPenalty>0&&a.jsx("div",{style:{marginBottom:6},children:(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",fontSize:10,color:"#fca5a5",fontWeight:600,background:"#7f1d1d",borderRadius:999,padding:"2px 8px"},children:["−",Math.round(K.current.accPenalty/2),"% hints"]})}),(0,a.jsxs)("div",{style:{fontSize:13,color:"#fff",marginBottom:8,display:"flex",justifyContent:"space-between"},children:[a.jsx("span",{children:"Correct:"}),a.jsx("span",{style:{color:"#f97316"},children:o})]}),null!=c&&a.jsx("div",{style:{marginBottom:8},children:(0,a.jsxs)("span",{style:{fontSize:13,color:"#fff"},children:[Math.round(c)," km away"]})}),null!=I&&null!=z?(0,a.jsxs)(a.Fragment,{children:[a.jsx("div",{style:{borderRadius:8,overflow:"hidden",height:200},children:a.jsx(f,{correctLat:r,correctLng:s,guessLat:I,guessLng:z,playerGuesses:h?.filter(e=>e.didSubmit&&null!=e.guessLat&&null!=e.guessLng).map(e=>{let t=l.players.find(t=>t.playerId===e.playerId);return{playerId:e.playerId,lat:e.guessLat,lng:e.guessLng,label:t?.displayName??e.playerId.slice(0,8),color:e.playerId===J?"#f97316":void 0,avatarUrl:t?.avatarUrl??null}})??void 0},`result-map-${l.currentRoundIndex}`)}),a.jsx("div",{style:{marginTop:12},children:(h??[]).slice().sort((e,t)=>e.rank-t.rank).map((e,t)=>{let n=null!=e.guessLat&&null!=e.guessLng?j(e.guessLat,e.guessLng,r,s):null,i=e.locationScore,o=null!=i?Math.round(i/100*120):null,d=null!=o?`hsl(${o}, 100%, 50%)`:"#888";return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",gap:6,borderRadius:6,background:e.playerId===J?"rgba(255,255,255,0.06)":"transparent",borderBottom:t<(h?.length??0)-1?"1px solid #333":"none"},children:[a.jsx("span",{style:{minWidth:20,color:"#888",fontSize:13,fontWeight:600},children:e.rank??"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:13},children:[a.jsx("span",{style:{...u(e.playerId),fontWeight:e.playerId===J?600:400},children:l.players.find(t=>t.playerId===e.playerId)?.displayName||e.playerId.slice(0,8)}),e.playerId===J&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),a.jsx("span",{style:{color:"#bbb",fontSize:11,fontWeight:600},children:null!=n?`${Math.round(n)} km away`:"—"}),null!=i&&(0,a.jsxs)("span",{style:{background:null!=i?i>=60?"#1a2e1a":i>=30?"#2e2a1a":"#2e1a1a":"#2a2a2a",color:d,borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:600},children:[i,"%"]})]},e.playerId)})})]}):a.jsx("p",{style:{color:"#888",fontSize:13,margin:0},children:"No location submitted"})]}),(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[(0,a.jsxs)("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8},children:[(0,a.jsxs)("svg",{width:"16",height:"16",viewBox:"0 0 24 24",fill:"none",stroke:"#e5e7eb",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("rect",{x:"3",y:"4",width:"18",height:"18",rx:"2",ry:"2"}),a.jsx("line",{x1:"16",y1:"2",x2:"16",y2:"6"}),a.jsx("line",{x1:"8",y1:"2",x2:"8",y2:"6"}),a.jsx("line",{x1:"3",y1:"10",x2:"21",y2:"10"})]}),a.jsx("span",{style:{fontSize:16,fontWeight:600,color:"#e5e7eb"},children:"When"})]}),(()=>{let e=g.find(e=>e.isMe),t=e?.acc??null;return null!=t?(()=>{let e=Math.round(t),n=`hsl(${Math.round(Math.max(0,Math.min(100,e))/100*120)}, 100%, 50%)`;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"baseline",gap:2},children:[a.jsx("span",{style:{fontSize:22,fontWeight:700,color:n},children:e}),a.jsx("span",{style:{fontSize:11,color:n},children:"%"})]})})():null})()]}),K.current.accPenalty>0&&a.jsx("div",{style:{marginBottom:6},children:(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",fontSize:10,color:"#fca5a5",fontWeight:600,background:"#7f1d1d",borderRadius:999,padding:"2px 8px"},children:["−",Math.round(K.current.accPenalty/2),"% hints"]})}),(0,a.jsxs)("div",{style:{fontSize:13,color:"#fff",marginBottom:10,display:"flex",justifyContent:"space-between"},children:[a.jsx("span",{children:"Correct:"}),a.jsx("span",{style:{color:"#f97316"},children:d})]}),(0,a.jsxs)("div",{style:{width:"100%",height:96,position:"relative",margin:"12px 0",background:"#1a1a2a",borderRadius:8,padding:"0 16px",boxSizing:"border-box"},children:[a.jsx("div",{style:{position:"absolute",top:"50%",height:4,left:16,right:16,background:"#555555",borderRadius:3,transform:"translateY(-50%)"}}),(0,a.jsxs)("div",{style:{position:"absolute",top:"50%",transform:"translate(-50%, -50%)",width:4,height:32,background:"#f97316",borderRadius:2,left:"50%"},children:[a.jsx("div",{style:{position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",fontSize:9,color:"#888",whiteSpace:"nowrap",textAlign:"center"},children:"Correct"}),a.jsx("div",{style:{position:"absolute",top:32,left:"50%",transform:"translateX(-50%)",fontSize:10,color:"#f97316",whiteSpace:"nowrap",textAlign:"center"},children:d})]}),(()=>{let e=Math.max(0,d-150),t=d+150-e,n=new Map;return g.forEach(e=>{null!=e.guessYear&&n.set(e.guessYear,(n.get(e.guessYear)||0)+1)}),g.map(n=>{if(null==n.guessYear)return null;let i=(n.guessYear-e)/t*100,r=g.filter(e=>e.guessYear===n.guessYear).findIndex(e=>e.playerId===n.playerId);return(0,a.jsxs)("div",{style:{position:"absolute",top:"50%",transform:`translate(-50%, calc(-50% + ${18*r}px))`,left:`${Math.max(0,Math.min(100,i))}%`},children:[a.jsx("div",{style:{width:14,height:14,borderRadius:"50%",background:n.isMe?"#f97316":"#60a5fa",border:"2px solid #fff"}}),a.jsx("div",{style:{position:"absolute",top:18,left:"50%",transform:"translateX(-50%)",fontSize:10,color:n.isMe?"#f97316":"#60a5fa",whiteSpace:"nowrap",textAlign:"center"},children:n.guessYear})]},n.playerId)})})()]}),g.map((e,t)=>{let n=null!=e.acc?Math.round(e.acc/100*120):null,i=null!=n?`hsl(${n}, 100%, 50%)`:"#888",r=null!=e.acc?e.acc>=60?"#1a2e1a":e.acc>=30?"#2e2a1a":"#2e1a1a":"#2a2a2a",s=h?.find(t=>t.playerId===e.playerId),o=s?.rank??null,d=l.players.find(t=>t.playerId===e.playerId)?.avatarUrl??null;return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",padding:"7px 8px",gap:6,borderRadius:6,background:e.isMe?"rgba(255,255,255,0.06)":"transparent",borderBottom:t<g.length-1?"1px solid #333":"none"},children:[a.jsx("span",{style:{minWidth:20,color:"#888",fontSize:13,fontWeight:600},children:o??"—"}),(0,a.jsxs)("span",{style:{flex:1,fontSize:13},children:[(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",gap:7},children:[a.jsx(m,{avatarUrl:d,displayName:e.displayName}),a.jsx("span",{style:{...u(e.playerId),fontWeight:e.isMe?700:500},children:e.displayName})]}),e.isMe&&a.jsx("span",{style:{color:"#555",fontSize:11,marginLeft:4},children:"(you)"})]}),a.jsx("span",{style:{color:"#bbb",fontSize:11,fontWeight:600},children:null!=e.diff?`${e.diff} yrs off`:"—"}),a.jsx("span",{style:{background:r,color:i,borderRadius:999,padding:"2px 8px",fontSize:11,fontWeight:600},children:null!=e.acc?`${e.acc}%`:"—"})]},e.playerId)})]})]}),K.current.purchasedIds.length>0&&(()=>{let e=(l?.rounds?.[l.currentRoundIndex]?.hints??[]).filter(e=>K.current.purchasedIds.includes(e.id)).sort((e,t)=>e.tier-t.tier);return 0===e.length?null:(0,a.jsxs)("div",{style:{background:"#333",borderRadius:12,padding:16,marginBottom:"10px"},children:[a.jsx("div",{style:{fontSize:12,fontWeight:600,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10},children:"Hints used"}),e.map((t,n)=>{let i=[0,10,20,30,40,50][t.tier]??0,r=t.metadata,l=t.content;"where"===t.type&&(2===t.tier||4===t.tier)&&r?.km!=null?l=`${t.content} — ${r.km} km away`:"when"===t.type&&(2===t.tier||4===t.tier)&&r?.years!=null&&(l=`${t.content} — ${r.years} years off`);let s={when:{1:"Century",2:"Historical Event",3:"Decade",4:"Contemporary Event",5:"Visual Clues"},where:{1:"Continent",2:"Remote Landmark",3:"Region",4:"Nearby Landmark",5:"Visual Clues"}}[t.type]?.[t.tier]??"Hint";return(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:n<e.length-1?"1px solid #3a3a3a":"none"},children:[(0,a.jsxs)("div",{style:{flex:1,minWidth:0},children:[a.jsx("div",{style:{fontSize:12,fontWeight:500,color:"#ccc"},children:s}),a.jsx("div",{style:{fontSize:11,color:"#aaa",fontStyle:"italic",marginTop:1},children:l})]}),(0,a.jsxs)("span",{style:{display:"inline-flex",alignItems:"center",background:"rgba(232,68,34,0.12)",border:"0.5px solid rgba(232,68,34,0.35)",borderRadius:999,padding:"2px 7px",fontSize:10,color:"#e84422",fontWeight:600,flexShrink:0},children:["−",i,"%"]})]},t.id)})]})})(),(0,a.jsxs)("div",{className:"round-complete-desktop-bottom",style:{position:"fixed",bottom:0,left:0,right:0,background:"#111111",borderTop:"1px solid #222222",height:"56px",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",paddingBottom:"env(safe-area-inset-bottom, 0px)",zIndex:1e3},children:[a.jsx("button",{onClick:()=>n.push("/"),style:{background:"transparent",border:"none",cursor:"pointer",padding:8},children:(0,a.jsxs)("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"#6b7280",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:[a.jsx("path",{d:"M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"}),a.jsx("polyline",{points:"9 21 9 12 15 12 15 21"})]})}),(0,a.jsxs)("div",{style:{fontSize:13,color:"#9ca3af"},children:["Round ",l.currentRoundIndex+1," / ",l.rounds.length]}),null!==G&&(0,a.jsxs)("p",{className:"text-sm text-gray-400 text-center mb-2",children:["Auto-advancing in ",G,"s"]}),a.jsx("button",{onClick:eh,disabled:l.readyForNext?.includes(J??""),style:{background:"#f97316",color:"#fff",fontWeight:700,fontSize:14,border:"none",borderRadius:8,padding:"10px 18px",cursor:l.readyForNext?.includes(J??"")?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:l.readyForNext?.includes(J??"")?.5:1},children:"Next Round →"})]})]})})()]}):null,"SESSION_COMPLETE"===l.status?(0,a.jsxs)("section",{className:"gh-final-section",children:[a.jsx("style",{children:`
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
              .gh-final-wrap {
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
              .gh-final-score-hero {
                min-width: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px 12px 18px;
              }
              .gh-final-ring-row {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              }
              .gh-final-ring-box {
                position: relative;
                width: 154px;
                height: 154px;
                flex: 0 0 auto;
              }
              .gh-final-ring-box svg {
                width: 154px;
                height: 154px;
                display: block;
              }
              .gh-final-ring-number {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: 48px;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-ring-percent {
                color: #ffffff;
                font-size: 24px;
                font-weight: 700;
                line-height: 1;
                transform: translateY(10px);
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
                color: #ffffff;
                font-weight: 700;
                line-height: 1;
              }
              .gh-final-stat-number {
                font-size: 24px;
              }
              .gh-final-stat-symbol {
                font-size: 12px;
                margin-left: 1px;
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
                color: #ffffff;
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
                font-size: 11px;
                margin-left: 1px;
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
              @keyframes ghFinalRing {
                from {
                  stroke-dashoffset: 339.292;
                }
                to {
                  stroke-dashoffset: var(--gh-final-ring-offset);
                }
              }
              @media (min-width: 768px) {
                .gh-final-section {
                  padding-bottom: 48px;
                }
                .gh-final-topbar {
                  padding-left: 24px;
                  padding-right: 24px;
                }
                .gh-final-wrap {
                  padding-top: 22px;
                }
                .gh-final-score-grid {
                  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                  align-items: stretch;
                }
                .gh-final-score-hero {
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
            `}),k?(()=>{if(!J)return null;let e=en(J),t=e?.avgAccuracy??0,i=e?.totalScore??0,r=e?.avgLocationAccuracy??0,s=e?.avgYearAccuracy??0,o=e?.avgDistanceKm??0,d=e?.avgYearDiff??0,c=l.players.find(e=>e.playerId===J),h=b(l.players,J),p=h?h.charAt(0).toUpperCase():"?",g=2*Math.PI*54,f=g*(1-Math.max(0,Math.min(100,t))/100),x=new Map;for(let e=0;e<l.config.totalRounds;e++){let t=k.filter(t=>t.roundIndex===e),n=Math.max(...t.map(e=>e.score));if(n>0){let a=t.filter(e=>e.score===n).map(e=>e.playerId);x.set(e,a)}}let u=l.players.map(e=>{let t=en(e.playerId),n=[];for(let t=0;t<l.config.totalRounds;t++){let a=x.get(t);a?.includes(e.playerId)&&n.push(t)}return{playerId:e.playerId,displayName:e.displayName,totalScore:t?.totalScore??0,avgAccuracy:t?.avgAccuracy??0,wonRounds:n}}).sort((e,t)=>t.totalScore-e.totalScore);return(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{className:"gh-final-topbar",children:[a.jsx("div",{className:"gh-final-title",children:"Guess History"}),(0,a.jsxs)("details",{className:"gh-final-profile",children:[a.jsx("summary",{"aria-label":"Open profile menu",children:a.jsx("span",{className:"gh-final-avatar-button",children:c?.avatarUrl?a.jsx("img",{src:c.avatarUrl,alt:h,style:{width:"100%",height:"100%",objectFit:"cover"}}):p})}),a.jsx("div",{className:"gh-final-profile-menu",children:a.jsx("button",{type:"button",children:"Sign Out"})})]})]}),(0,a.jsxs)("div",{className:"gh-final-wrap",children:[(0,a.jsxs)("div",{className:"gh-final-score-grid",children:[(0,a.jsxs)("div",{className:"gh-final-score-hero gh-final-card",children:[(0,a.jsxs)("div",{className:"gh-final-ring-row",children:[(0,a.jsxs)("div",{className:"gh-final-ring-box",children:[(0,a.jsxs)("svg",{viewBox:"0 0 154 154","aria-hidden":"true",children:[a.jsx("circle",{cx:77,cy:77,r:54,fill:"none",stroke:"#1a1a1a",strokeWidth:10}),a.jsx("circle",{cx:77,cy:77,r:54,fill:"none",stroke:"#f97316",strokeWidth:10,strokeLinecap:"round",strokeDasharray:g,strokeDashoffset:g,transform:"rotate(-90 77 77)",style:{"--gh-final-ring-offset":`${f}`,animation:"ghFinalRing 900ms ease-out forwards"}})]}),a.jsx("div",{className:"gh-final-ring-number",children:t})]}),a.jsx("span",{className:"gh-final-ring-percent",children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-xp",children:[i," XP"]})]}),(0,a.jsxs)("div",{className:"gh-final-stat-grid",children:[(0,a.jsxs)("div",{className:"gh-final-stat-card",children:[(0,a.jsxs)("svg",{className:"gh-final-stat-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("path",{d:"M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"}),a.jsx("circle",{cx:12,cy:10,r:2.5})]}),(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-stat-number",children:r}),a.jsx("span",{className:"gh-final-stat-symbol",children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-stat-sub",children:["avg ",Math.round(o)," km away"]})]}),(0,a.jsxs)("div",{className:"gh-final-stat-card",children:[(0,a.jsxs)("svg",{className:"gh-final-stat-icon",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("rect",{x:4,y:5,width:16,height:15,rx:2}),a.jsx("path",{d:"M8 3v4M16 3v4M4 10h16"})]}),(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-stat-number",children:s}),a.jsx("span",{className:"gh-final-stat-symbol",children:"%"})]}),(0,a.jsxs)("div",{className:"gh-final-stat-sub",children:["avg ",Math.round(d)," yrs off"]})]})]})]}),(0,a.jsxs)("div",{className:"gh-final-panel",children:[a.jsx("div",{className:"gh-final-panel-heading",children:"Final Rankings"}),u.map((e,t)=>{let n=e.playerId===J,i=l.players.find(t=>t.playerId===e.playerId),r=b(l.players,e.playerId),s=r?r.charAt(0).toUpperCase():"?";return(0,a.jsxs)("div",{className:"gh-final-rank-row",style:{borderLeftColor:0===t?"#f59e0b":"transparent"},children:[a.jsx("div",{className:"gh-final-rank-number",children:t+1}),a.jsx("div",{className:"gh-final-rank-avatar",children:i?.avatarUrl?a.jsx("img",{src:i.avatarUrl,alt:r,style:{width:"100%",height:"100%",objectFit:"cover"}}):s}),(0,a.jsxs)("div",{className:"gh-final-rank-main",children:[(0,a.jsxs)("div",{className:"gh-final-rank-name-line",children:[a.jsx("span",{className:"gh-final-rank-name",style:{color:n?"#f97316":"#ffffff"},children:r}),n?a.jsx("span",{className:"gh-final-you-tag",children:"(you)"}):null]}),a.jsx("div",{className:"gh-final-progress-track",children:a.jsx("div",{className:"gh-final-progress-fill",style:{width:`${Math.max(0,Math.min(100,e.avgAccuracy))}%`,background:"#9ca3af"}})})]}),(0,a.jsxs)("div",{className:"gh-final-rank-score",children:[(0,a.jsxs)("div",{className:"gh-final-rank-percent",children:[e.avgAccuracy,"%"]}),(0,a.jsxs)("div",{className:"gh-final-rank-xp",children:[e.totalScore," XP"]})]})]},e.playerId)})]}),a.jsx("div",{className:"gh-final-panel-heading",style:{paddingLeft:2},children:"Round Breakdown"}),a.jsx("div",{className:"gh-final-rounds",children:l.rounds.map((e,t)=>{let n=ea(t);if(!n)return null;let i=b(l.players,n.bestPlayerId),r=n.bestPlayerId===J;return(0,a.jsxs)("div",{className:"gh-final-round-card",children:[(0,a.jsxs)("div",{className:"gh-final-photo",children:[e.imageUrl?a.jsx("img",{src:e.imageUrl,alt:e.title,onClick:()=>Y(e.imageUrl)}):(0,a.jsxs)("div",{className:"gh-final-photo-fallback",children:[e.locationName||`${e.latitude.toFixed(2)}, ${e.longitude.toFixed(2)}`," \xb7 ",e.year]}),(0,a.jsxs)("div",{className:"gh-final-round-badge",children:["ROUND ",t+1]})]}),(0,a.jsxs)("div",{className:"gh-final-round-body",children:[a.jsx("div",{className:"gh-final-round-title",children:e.title}),(0,a.jsxs)("div",{className:"gh-final-mini-grid",children:[(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",children:n.avgAccuracy}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"Total"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:[n.totalScore," pts"]})]}),(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",children:n.avgLocationScore}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"Where"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:["avg ",Math.round(n.avgDistanceKm)," km"]})]}),(0,a.jsxs)("div",{className:"gh-final-mini-tile",children:[(0,a.jsxs)("div",{className:"gh-final-percent-line",children:[a.jsx("span",{className:"gh-final-mini-number",children:n.avgTimeScore}),a.jsx("span",{className:"gh-final-mini-symbol",children:"%"})]}),a.jsx("div",{className:"gh-final-mini-label",children:"When"}),(0,a.jsxs)("div",{className:"gh-final-mini-sub",children:["avg ",Math.round(n.avgYearDiff)," yrs"]})]})]}),(0,a.jsxs)("div",{className:"gh-final-best-row",children:[(0,a.jsxs)("div",{className:"gh-final-best-label",children:[(0,a.jsxs)("svg",{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[a.jsx("path",{d:"M8 21h8"}),a.jsx("path",{d:"M12 17v4"}),a.jsx("path",{d:"M7 4h10v4a5 5 0 0 1-10 0V4z"}),a.jsx("path",{d:"M5 6H3a3 3 0 0 0 3 3h1"}),a.jsx("path",{d:"M19 6h2a3 3 0 0 1-3 3h-1"})]}),"Best Player"]}),a.jsx("div",{className:"gh-final-best-name",style:{color:r?"#f97316":"#9ca3af"},children:i})]})]})]},t)})}),(0,a.jsxs)("div",{className:"gh-final-cta",children:[a.jsx("button",{type:"button",className:"gh-final-home",onClick:()=>n.push("/"),children:"Home"}),a.jsx("button",{type:"button",className:"gh-final-play",onClick:()=>n.push("/compete"),children:"Play Again"})]})]})]})})():a.jsx("div",{style:{padding:40,textAlign:"center",color:"#9ca3af",fontSize:13},children:"Loading results…"})]}):null]}),a.jsx(p,{hints:l?.rounds?.[l.currentRoundIndex]?.hints??[],isOpen:U,onClose:e=>{F(e),$(!1)}}),H&&a.jsx("div",{onClick:()=>Y(null),style:{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},children:a.jsx("img",{src:H,alt:"Fullscreen",style:{maxWidth:"100vw",maxHeight:"100vh",objectFit:"contain"},onClick:e=>e.stopPropagation()})})]})}},4798:(e,t,n)=>{"use strict";n.d(t,{w7:()=>i});var a=n(3710);new Promise(e=>{});async function i(){await a.V.auth.signOut()}},3710:(e,t,n)=>{"use strict";let a;n.d(t,{V:()=>r});var i=n(6867);let r=new Proxy({},{get:(e,t)=>(function(){if(a)return a;let e="https://gzvixlvkwjsrtmtybtkf.supabase.co",t="sb_publishable_xyAVhfMbjsXKsWL7MJpdsg_L8D92J5O";if(!e)throw Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_URL is not set. Identity bootstrap cannot proceed.");if(!t)throw Error("IDENTITY_VIOLATION: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Identity bootstrap cannot proceed.");return a=(0,i.eI)(e,t)})()[t]})},7661:(e,t,n)=>{"use strict";n.d(t,{j:()=>i});var a=n(7577);function i(){let[e,t]=(0,a.useState)({status:"loading"});(0,a.useRef)(!1);let n="ready"===e.status?e.playerId:null,i="ready"===e.status,r="loading"===e.status,l="error"===e.status?e.error:null;return{state:e,playerId:n,isReady:i,isLoading:r,error:l}}n(4798)},903:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>a});let a=(0,n(8570).createProxy)(String.raw`D:\GH-NEW\src\app\compete\[gameId]\page.tsx#default`)},2029:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>r,metadata:()=>i});var a=n(9510);n(5023);let i={title:"Guess-History Practice",description:"Deterministic historical guessing game"};function r({children:e}){return a.jsx("html",{lang:"en",suppressHydrationWarning:!0,children:a.jsx("body",{suppressHydrationWarning:!0,children:e})})}},3881:(e,t,n)=>{"use strict";n.r(t),n.d(t,{default:()=>i});var a=n(6621);let i=e=>[{type:"image/x-icon",sizes:"32x32",url:(0,a.fillMetadataSegment)(".",e.params,"favicon.ico")+""}]},5023:()=>{}};var t=require("../../../webpack-runtime.js");t.C(e);var n=e=>t(t.s=e),a=t.X(0,[948,471,621,454],()=>n(5232));module.exports=a})();