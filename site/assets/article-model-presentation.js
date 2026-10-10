import {modelContext} from './model-context.js';
const KEY='portfolio.article-viewer.preferences.v1';

export class ArticleModelPresentation {
  constructor(root) {
    this.root=root;
    let saved={};try{saved=JSON.parse(sessionStorage.getItem(KEY))||{};}catch{}
    this.hidden=saved.hidden===true;this.pinned=saved.pinned!==false;this.follow=saved.follow!==false;
    const toolbar=document.createElement('div');toolbar.className='article-model-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Model presentation');
    toolbar.innerHTML='<button type="button" data-viewer-visibility>Hide model</button><button type="button" data-viewer-pin>Unpin model</button><button type="button" data-viewer-follow>Follow article</button><span data-viewer-context aria-live="polite">Model view</span>';
    root.prepend(toolbar);this.toolbar=toolbar;
    toolbar.append(root.querySelector('.article-model-startup'));
    this.visibility=toolbar.querySelector('[data-viewer-visibility]');this.pin=toolbar.querySelector('[data-viewer-pin]');this.followButton=toolbar.querySelector('[data-viewer-follow]');this.label=toolbar.querySelector('[data-viewer-context]');
    const stage=root.querySelector('[data-machine-stage]');stage.id ||= `${root.getAttribute('aria-labelledby')}-viewer`;
    this.visibility.setAttribute('aria-controls',stage.id);
    this.visibility.addEventListener('click',()=>{
      this.hidden=!this.hidden;this.sync();
      if(this.hidden){root.machine?.pause();if(root.machineController)root.machineController.visible=false;root.machineController?.scene?.pauseGlassContext();}
      else requestAnimationFrame(()=>root.machineController?.scene?.resize());
      root.dispatchEvent(new CustomEvent('portfolio:model-visibility',{detail:{visible:!this.hidden}}));
    });
    this.pin.addEventListener('click',()=>{this.pinned=!this.pinned;this.sync();root.dispatchEvent(new CustomEvent('portfolio:article-layout'));});
    this.followButton.addEventListener('click',()=>{this.follow=!this.follow;this.sync();root.dispatchEvent(new CustomEvent('portfolio:article-follow'));});
    root.addEventListener('portfolio:model-inspection',()=>{if(this.follow){this.follow=false;this.sync();}});
    root.addEventListener('portfolio:model-focus',event=>{
      const context=modelContext(event.detail.part);
      this.label.textContent=event.detail.title?`${context.label} · ${event.detail.title}`:context.label;
      let card=root.querySelector('[data-model-article-summary]');
      if(!card){card=document.createElement('p');card.dataset.modelArticleSummary='';card.className='machine-article-summary';root.querySelector('[data-glass-panel="inspect"]')?.prepend(card);}
      card.textContent=event.detail.summary||context.description;
    });
    this.resize=new ResizeObserver(()=>root.style.setProperty('--model-controls-height',`${toolbar.getBoundingClientRect().height}px`));this.resize.observe(toolbar);
    this.sync();
  }
  sync() {
    const root=this.root;root.dataset.viewerHidden=String(this.hidden);root.dataset.viewerPinned=String(this.pinned);root.dataset.modelFollow=String(this.follow);
    this.visibility.textContent=this.hidden?'Show':'Hide';this.visibility.setAttribute('aria-label',this.hidden?'Show model':'Hide model');this.visibility.setAttribute('aria-expanded',String(!this.hidden));
    this.pin.textContent=this.pinned?'Unpin':'Pin';this.pin.setAttribute('aria-label',this.pinned?'Unpin model':'Pin model');this.pin.setAttribute('aria-pressed',String(this.pinned));
    this.followButton.textContent='Follow';this.followButton.setAttribute('aria-label','Follow article');
    this.followButton.setAttribute('aria-pressed',String(this.follow));
    try{sessionStorage.setItem(KEY,JSON.stringify({hidden:this.hidden,pinned:this.pinned,follow:this.follow}));}catch{}
  }
}
