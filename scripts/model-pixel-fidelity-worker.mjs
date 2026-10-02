import {parentPort} from 'node:worker_threads';

parentPort.on('message',({original,decoded})=>{
  const histogram=new Uint32Array(256);let maximum=0;
  for(let index=0;index<original.length;index++) {
    let difference=original[index]-decoded[index];if(difference<0)difference=-difference;
    histogram[difference]++;if(difference>maximum)maximum=difference;
  }
  parentPort.postMessage({histogram,total:original.length,maximum});
});
