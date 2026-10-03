import {availableParallelism} from 'node:os';
import {Worker} from 'node:worker_threads';

function summarize(histogram,total,maximum) {
  const rank=Math.ceil(total*.99);let cumulative=0,p99=255;
  for(let value=0;value<histogram.length;value++) {
    cumulative+=histogram[value];
    if(cumulative>=rank){p99=value;break;}
  }
  return {meanAbsoluteChannelError:+(histogram.reduce((sum,value,index)=>sum+value*index,0)/total).toFixed(4),
    p99AbsoluteChannelError:p99,maxAbsoluteChannelError:maximum,comparedChannelSamples:total,
    percentileDefinition:'p99 over native-resolution 8-bit sRGB RGB channel absolute errors after background compositing'};
}
function histogramRgb(original,decoded) {
  if(original.length!==decoded.length||original.length%3!==0)throw new Error('Expected equally sized RGB byte arrays');
  const histogram=new Uint32Array(256);let maximum=0;
  for(let index=0;index<original.length;index++) {
    let difference=original[index]-decoded[index];if(difference<0)difference=-difference;
    histogram[difference]++;if(difference>maximum)maximum=difference;
  }
  return summarize(histogram,original.length,maximum);
}
export function rgbChannelError(original,decoded) { return histogramRgb(original,decoded); }

export async function rgbChannelErrorParallel(original,decoded) {
  if(original.length!==decoded.length||original.length%3!==0)throw new Error('Expected equally sized RGB byte arrays');
  const workerCount=Math.min(4,availableParallelism(),Math.ceil(original.length/3));
  const reports=await Promise.all(Array.from({length:workerCount},async(_,workerIndex)=>{
    const start=Math.floor(original.length*workerIndex/workerCount),end=Math.floor(original.length*(workerIndex+1)/workerCount);
    const left=new Uint8Array(end-start),right=new Uint8Array(end-start);
    left.set(original.subarray(start,end));right.set(decoded.subarray(start,end));
    const worker=new Worker(new URL('./model-pixel-fidelity-worker.mjs',import.meta.url));
    try {
      return await new Promise((resolve,reject)=>{
        worker.once('message',resolve);worker.once('error',reject);
        worker.postMessage({original:left,decoded:right},[left.buffer,right.buffer]);
      });
    } finally {await worker.terminate();}
  }));
  const histogram=new Uint32Array(256);let maximum=0,total=0;
  for(const report of reports) {
    total+=report.total;maximum=Math.max(maximum,report.maximum);
    for(let value=0;value<histogram.length;value++)histogram[value]+=report.histogram[value];
  }
  return summarize(histogram,total,maximum);
}
