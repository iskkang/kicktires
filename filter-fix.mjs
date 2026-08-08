import fs from "node:fs";

const file = "dist/cars/index.html";
if (!fs.existsSync(file)) throw new Error("dist/cars/index.html missing; run UI build first");

let html = fs.readFileSync(file, "utf8");

const css = `
/* make/model filter fix */
.hub-model-card[hidden]{display:none!important}
.hub-empty[hidden]{display:none!important}
`;

if (!html.includes("make/model filter fix")) {
  html = html.replace("</style>", `${css}</style>`);
}

const robustFilter = `<script>
(function(){
  const input=document.getElementById('hubSearch');
  const button=document.getElementById('hubSearchButton');
  const cards=[...document.querySelectorAll('#hubGrid .hub-model-card')];
  const count=document.getElementById('hubCount');
  const empty=document.getElementById('hubEmpty');
  const filters=[...document.querySelectorAll('.hub-filter')];
  if(!input||!cards.length||!count||!empty||!filters.length)return;
  let active='all';
  function apply(){
    const q=(input.value||'').trim().toLowerCase();
    let shown=0;
    cards.forEach(card=>{
      const make=(card.querySelector('.hub-make')?.textContent||'').trim().toLowerCase();
      const search=(card.dataset.search||'').toLowerCase();
      const visible=(active==='all'||make===active)&&(!q||search.includes(q));
      card.hidden=!visible;
      card.style.display=visible?'':'none';
      if(visible)shown++;
    });
    count.textContent=shown+' model'+(shown===1?'':'s');
    empty.hidden=shown!==0;
    empty.style.display=shown===0?'block':'none';
  }
  filters.forEach(btn=>btn.addEventListener('click',function(e){
    e.preventDefault();
    filters.forEach(x=>x.classList.remove('on'));
    this.classList.add('on');
    active=(this.dataset.make||'all').toLowerCase();
    apply();
  }));
  input.addEventListener('input',apply);
  if(button)button.addEventListener('click',apply);
  apply();
})();
</script>`;

if (!html.includes("#hubGrid .hub-model-card")) {
  html = html.replace("</body>", `${robustFilter}</body>`);
}

fs.writeFileSync(file, html);
console.log("[filter-fix] make/model filters hardened");
