import { ModelStartup } from "./model-startup.js";
import { ArticleModelPresentation } from './article-model-presentation.js';

const root = document.querySelector(".myst-reader .article-model-machine[data-model-startup]");
if (root) {
  root.modelPresentation=new ArticleModelPresentation(root);
  const startup = new ModelStartup(root);
  root.modelStartup = startup;
  const quietButton=document.createElement('button');quietButton.type='button';quietButton.textContent='Load language model';quietButton.dataset.modelQuietLoad='';
  root.querySelector('.article-model-startup').prepend(quietButton);
  const syncQuietButton=()=>{quietButton.hidden=!startup.quiet||Boolean(root.lmSession);};
  const loadLM=async()=>{
    await import('./model-machine.js');
    const controller=root.machineController;
    if(!controller.lmSession){const {ArticleLMSession}=await import('./article-lm-session.js');root.lmSession=new ArticleLMSession(root,controller);}
    root.dispatchEvent(new CustomEvent('portfolio:model-ready'));
    syncQuietButton();return controller;
  };
  quietButton.addEventListener('click',()=>loadLM().catch(()=>{quietButton.textContent='Retry language model';}));
  syncQuietButton();

  startup.onStart = async ({retained=false}={}) => {
    const controller=await loadLM();
    const scene=await controller?.boot() ?? null;
    // Explicit Start reveals the prepared canvas. Restoring a prior session
    // preserves the reader's scroll position and waits for visible startup.
    if(scene&&!retained)controller.stage.scrollIntoView({block:'nearest',behavior:'instant'});
    return scene;
  };

  startup.onQuietChange = quiet => {
    syncQuietButton();
    if (quiet && root.machineController) root.machineController.fallback("quiet-mode", true);
    else if (!quiet && startup.started&&root.dataset.viewerHidden!=='true') startup.start({ retained: true });
  };

  root.addEventListener('portfolio:model-visibility',event=>{if(event.detail.visible&&!startup.quiet&&startup.started)startup.start({retained:true});});
  if (!startup.quiet && startup.started&&root.dataset.viewerHidden!=='true') startup.start({ retained: true });
}
