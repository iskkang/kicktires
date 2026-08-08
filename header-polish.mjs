import fs from "node:fs";
import path from "node:path";

const OUT = "dist";

function htmlFiles(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...htmlFiles(full));
    else if(entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const css = `
/* premium header / brand pass */
nav{position:sticky;top:0;z-index:1000;background:rgba(255,255,255,.97)!important;border-bottom:1px solid #e5ebf2!important;box-shadow:0 1px 0 rgba(11,32,56,.02);backdrop-filter:saturate(160%) blur(16px)}
.navin,.kt-nav,.hub-nav{width:min(100%,1240px)!important;min-height:68px!important;margin:0 auto!important;padding:0 24px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:28px!important}
.logo.kt-wordmark{display:inline-flex!important;align-items:center!important;gap:0!important;text-decoration:none!important;font-family:"Avenir Next","Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif!important;font-size:22px!important;line-height:1!important;font-weight:800!important;letter-spacing:-.055em!important;color:#0b213b!important;white-space:nowrap!important}
.logo.kt-wordmark i{display:none!important}.kt-logo-main{color:#0b213b!important}.kt-logo-accent{color:#1769e0!important}.kt-logo-dot{display:inline-block;width:5px;height:5px;margin-left:4px;margin-bottom:11px;border-radius:50%;background:#1769e0}
.navlinks{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;font-family:"Avenir Next","Segoe UI Variable","Segoe UI",Inter,system-ui,-apple-system,sans-serif!important}
.navlink{display:inline-flex!important;align-items:center!important;min-height:40px!important;padding:0 11px!important;border-radius:9px!important;text-decoration:none!important;font-size:13.5px!important;line-height:1!important;font-weight:600!important;letter-spacing:-.018em!important;color:#31475d!important;transition:background .16s ease,color .16s ease,transform .16s ease!important;white-space:nowrap!important}
.navlink:hover{background:#f3f7fb!important;color:#0b213b!important}.navlink:active{transform:translateY(1px)}
.kt-nav-cta,.navlink.navcheck:last-child{min-height:40px!important;padding:0 16px!important;border-radius:10px!important;background:#0d4fae!important;color:#fff!important;font-size:13.5px!important;font-weight:700!important;letter-spacing:-.018em!important;box-shadow:0 5px 14px rgba(13,79,174,.18)!important}
.kt-nav-cta:hover,.navlink.navcheck:last-child:hover{background:#0b438f!important;color:#fff!important}
@media(max-width:900px){.navin,.kt-nav,.hub-nav{min-height:62px!important;padding:0 18px!important}.logo.kt-wordmark{font-size:20px!important}.navlinks{gap:1px!important;overflow-x:auto!important;scrollbar-width:none}.navlinks::-webkit-scrollbar{display:none}.navlink{font-size:12.5px!important;padding:0 9px!important;min-height:36px!important}.kt-nav-cta,.navlink.navcheck:last-child{min-height:36px!important;padding:0 13px!important}}
@media(max-width:640px){.navlinks .navlink:nth-child(n+4):not(:last-child){display:none!important}.logo.kt-wordmark{font-size:19px!important}.navin,.kt-nav,.hub-nav{gap:12px!important}}
`;

if(!fs.existsSync(OUT)) throw new Error("dist missing; run build first");
let changed=0;
for(const file of htmlFiles(OUT)){
  let html=fs.readFileSync(file,"utf8");
  const before=html;
  html=html.replace(/<a class="logo(?: [^"]*)?" href="\/">\s*<i><\/i>\s*KickTires\s*<\/a>/g,
    '<a class="logo kt-wordmark" href="/" aria-label="KickTires home"><span class="kt-logo-main">Kick</span><span class="kt-logo-accent">Tires</span><span class="kt-logo-dot" aria-hidden="true"></span></a>');
  if(!html.includes("premium header / brand pass")) html=html.replace("</style>",`${css}</style>`);
  if(html!==before){fs.writeFileSync(file,html);changed++;}
}
console.log(`[header] polished brand and navigation on ${changed} pages`);
