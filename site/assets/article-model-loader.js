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

  startup.onStart = async () => {
    const controller=await loadLM();
    return controller?.boot() ?? null;
  };

  startup.onQuietChange = quiet => {
    syncQuietButton();
    if (quiet && root.machineController) root.machineController.fallback("quiet-mode", true);
    else if (!quiet && startup.started&&root.dataset.viewerHidden!=='true') startup.start({ retained: true });
  };

  root.addEventListener('portfolio:model-visibility',event=>{if(event.detail.visible&&!startup.quiet&&startup.started)startup.start({retained:true});});
  if (!startup.quiet && startup.started&&root.dataset.viewerHidden!=='true') startup.start({ retained: true });
}
