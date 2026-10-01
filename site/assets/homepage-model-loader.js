import {ModelStartup} from './model-startup.js';

const root=document.querySelector('[data-model-startup]');
root.modelStartup=new ModelStartup(root);
// Begin immediately, while the powered-down image is loading/painting.
import('./model-machine.js').catch(()=>root.modelStartup.fail('model-module-unavailable'));
