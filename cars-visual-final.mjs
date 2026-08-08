import fs from 'node:fs';
import { CAR_SPRITE } from './car-sprite.mjs';

const FILE='dist/cars/index.html';
if(!fs.existsSync(FILE)) throw new Error('dist/cars/index.html missing');

const HERO='https://images.unsplash.com/photo-1663316265644-d54f76215a09?auto=format&fit=crop&fm=jpg&q=86&w=1800';
const TESLA='https://tessi-supply.com/cdn/shop/articles/img-1697552724002_079d16f2-746d-47a5-8b6d-07cf0a16e1f6.jpg?v=1697890990&width=1920';
const EVS='https://www.torquenews.com/sites/default/files/images/id4-modely-ev6-ioniq5-kona-niro.jpg';
const PREMIUM='https://car.motor-fan.jp/images/articles/10017939/big_main10017939_20210113223427000000.jpg';
const RIVIAN='https://static-gi.asianetnews.com/images/01j7ascynf805ef6qvx6sg31qc/electric-vehicle--electric-suv--electric-cars--longest-range-_1200x800xt.jpg';

const logos={
  'Toyota':['toyota','D71921'],'Honda':['honda','111111'],'Ford':['ford','003478'],'Chevrolet':['chevrolet','C89B3C'],
  'Nissan':['nissan','111111'],'BMW':['bmw','0066B1'],'Mercedes-Benz':['mercedes','111111'],'Audi':['audi','111111'],
  'Tesla':['tesla','E82127'],'Hyundai':['hyundai','002C5F'],'Kia':['kia','111111'],'Lexus':['lexus','111111'],
  'Acura':['acura','111111'],'Infiniti':['infiniti','111111'],'Genesis':['genesis','111111'],'Rivian':['rivian','111111'],
  'Lucid':['lucid','111111'],'Polestar':['polestar','111111'],'Volvo':['volvo','003057']
};

const exactSprite={
 'Honda|Civic':14.2857,'Toyota|Camry':28.5714,'Tesla|Model 3':42.8571,'BMW|330i':57.1429,
 'Toyota|RAV4':71.4286,'Ford|F-150':85.7143,'Hyundai|Tucson':100
};

const staticCrops={
 'Tesla|Model S':[TESLA,'400% 100%','0% 50%'],
 'Tesla|Model X':[TESLA,'400% 100%','66.66% 50%'],
 'Tesla|Model Y':[TESLA,'400% 100%','100% 50%'],
 'Hyundai|IONIQ 5':[EVS,'300% 200%','100% 0%'],
 'Kia|EV6':[EVS,'300% 200%','100% 100%'],
 'Lexus|RX':[PREMIUM,'300% 200%','50% 100%'],
 'Mercedes-Benz|GLC 300':[PREMIUM,'300% 200%','0% 0%'],
 'Acura|RDX':[PREMIUM,'300% 200%','50% 0%'],
 'Infiniti|QX60':[PREMIUM,'300% 200%','100% 0%'],
 'Rivian|R1S':[RIVIAN,'200% 200%','100% 100%']
};

const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let html=fs.readFileSync(FILE,'utf8');

// Match the previously approved hero image exactly.
html=html.replace(/\.cp-hero-bg\{[^}]*\}/,`.cp-hero-bg{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(5,20,38,.96) 0%,rgba(5,20,38,.86) 43%,rgba(5,20,38,.16) 72%,rgba(5,20,38,.04) 100%),url('${HERO}');background-size:cover;background-position:center 48%;filter:saturate(.82) contrast(1.04)}`);

// Replace letter badges with real brand logos.
for(const [name,[slug,color]] of Object.entries(logos)){
  const re=new RegExp(`<span class="cp-logo-dot">[^<]*<\\/span><b>${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<\\/b>`,'g');
  html=html.replace(re,`<span class="cp-logo-dot cp-logo-img"><img src="https://cdn.simpleicons.org/${slug}/${color}" alt="${esc(name)} logo" loading="lazy" decoding="async"></span><b>${esc(name)}</b>`);
}

// Restore exact embedded car imagery for the models already in the approved sprite.
for(const [key,pos] of Object.entries(exactSprite)){
  const [make,model]=key.split('|');
  const search=`${make} ${model}`.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(<article class="cp-card"[^>]*data-search="${search}"[\\s\\S]*?<div class="cp-image[^>]*>)[\\s\\S]*?(<\\/div>\\s*<div class="cp-stats)`,'i');
  if(re.test(html)) html=html.replace(re,`$1<span class="cp-static-photo" role="img" aria-label="${esc(make+' '+model)}" style="background-image:url('${CAR_SPRITE}');background-size:100% 800%;background-position:center ${pos}%"></span>$2`);
}

// Stable visual fallbacks for expansion models while exact per-model assets are being curated.
for(const [key,[url,size,pos]] of Object.entries(staticCrops)){
  const [make,model]=key.split('|');
  const search=`${make} ${model}`.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(<article class="cp-card"[^>]*data-search="${search}"[\\s\\S]*?<div class="cp-image[^>]*>)[\\s\\S]*?(<\\/div>\\s*<div class="cp-stats)`,'i');
  if(re.test(html)) html=html.replace(re,`$1<span class="cp-static-photo" role="img" aria-label="${esc(make+' '+model)}" style="background-image:url('${url}');background-size:${size};background-position:${pos}"></span>$2`);
}

const css=`<style id="carsVisualFinalCss">
.cp-logo-img{background:#fff!important;border-radius:8px!important}.cp-logo-img img{display:block;width:26px;height:26px;object-fit:contain}.cp-static-photo{display:block;width:100%;height:100%;min-height:190px;background-repeat:no-repeat;background-color:#f5f7fa;background-origin:border-box}.cp-image:has(.cp-static-photo)::after{display:none!important}.cp-image:has(.cp-static-photo)>div{display:none!important}
</style>`;
if(!html.includes('carsVisualFinalCss')) html=html.replace('</head>',css+'</head>');
html=html.replace('</body>',`<script id="carsVisualFinalMarker">window.__kicktiresCarsVisual='final-v2';</script></body>`);
fs.writeFileSync(FILE,html);
console.log('[cars-visual-final] restored approved hero, real brand logos, and stable vehicle imagery');
