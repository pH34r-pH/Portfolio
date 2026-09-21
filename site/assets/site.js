const menuButton=document.querySelector('.menu-toggle');const menu=document.querySelector('#site-menu');if(menuButton&&menu){menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')==='true';menuButton.setAttribute('aria-expanded',String(!open));menu.hidden=open});menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false')}));}
const root=document.documentElement;
function setPalette(name){root.dataset.palette=name;localStorage.setItem('portfolio-palette',name);document.querySelectorAll('.palette button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===name)))}
setPalette(localStorage.getItem('portfolio-palette')||'nacre');
document.querySelectorAll('.palette button').forEach(b=>b.addEventListener('click',()=>setPalette(b.dataset.palette)));

async function loadPublication(){
  const target=document.querySelector('#provenance-data'),list=document.querySelector('#notebook-list'),build=document.querySelector('#build-id');
  try{
    const response=await fetch('/publication.json',{cache:'no-store'});if(!response.ok)throw new Error();
    const manifest=await response.json(),sources=manifest.sources||{};
    target.textContent=Object.entries(sources).map(([k,v])=>k+'  '+String(v.commit||'').slice(0,12)).join('\n');
    build.textContent=sources.portfolio?.commit?' / '+sources.portfolio.commit.slice(0,8):'';
    if(manifest.notebooks?.length){
      const notebooks=[...manifest.notebooks].filter(n=>n.slug!=='visual_intuition_atlas').sort((a,b)=>{
        const ad=Date.parse(a.modifiedAt||a.publishedAt||'')||0,bd=Date.parse(b.modifiedAt||b.publishedAt||'')||0;
        if(ad!==bd)return bd-ad;
        return (b.path||'').localeCompare(a.path||'',undefined,{numeric:true});
      });
      list.replaceChildren(...notebooks.map((n,i)=>{
        const a=document.createElement('article');a.className='card';a.dataset.index=String(i+1).padStart(2,'0');
        const h=document.createElement('h3');h.textContent=n.title||n.path;
        const meta=document.createElement('p');meta.className='card-meta';meta.textContent=n.modifiedAt?'Updated '+new Date(n.modifiedAt).toLocaleDateString():'Executable notebook · browser-local';
        const links=document.createElement('div');links.className='links';
        const read=document.createElement('a');read.href='/notebooks/'+encodeURIComponent(n.slug||n.path.split('/').pop().replace(/\.ipynb$/,''))+'/';read.textContent='Read notebook';
        const lab=document.createElement('a');lab.href='/lab/lab/index.html?path='+encodeURIComponent(n.jupyterPath||n.path.replace(/^publication\/notebooks\//,''));lab.textContent='Run in Lab ↗';
        links.append(read,lab);a.append(h,meta,links);return a;
      }));
    }
  }catch(e){list.innerHTML='<p>Publication catalog unavailable.</p>';target.textContent='Build metadata unavailable.'}
}
loadPublication();
async function loadExperimentPackages(){const link=document.querySelector('#experiment-download'),status=document.querySelector('#experiment-download-status');if(!link)return;try{const r=await fetch('/experiments/index.json',{cache:'no-store'});if(!r.ok)throw new Error();const index=await r.json(),pkg=index.packages?.find(p=>p.id==='issue-164-adamw');if(!pkg)throw new Error();link.href=pkg.download;link.setAttribute('aria-disabled',String(pkg.status!=='qualified'));status.textContent=pkg.status==='qualified'?'Qualified · SHA-256 '+pkg.sha256.slice(0,12)+'…':'Fixture route · '+pkg.status;if(pkg.status!=='qualified')link.addEventListener('click',e=>e.preventDefault())}catch(e){link.setAttribute('aria-disabled','true');status.textContent='Package index unavailable';link.addEventListener('click',e=>e.preventDefault())}}loadExperimentPackages();
