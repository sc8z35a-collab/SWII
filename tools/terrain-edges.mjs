import {GRID_STEP} from '../dist/geography.js';

// A segment can cross a cell boundary or either side of its height interpolation diagonal.
export function terrainCuts(a,b){
  const cuts=[0,1];
  for(const [start,end] of [[a[0],b[0]],[a[1],b[1]],[a[0]+a[1],b[0]+b[1]]]){
    const low=Math.min(start,end),high=Math.max(start,end);
    for(let line=(Math.floor(low/GRID_STEP)+1)*GRID_STEP;line<high-1e-8;line+=GRID_STEP){
      cuts.push((line-start)/(end-start));
    }
  }
  cuts.sort((a,b)=>a-b);
  return cuts.filter((value,index)=>index===0||value-cuts[index-1]>1e-8);
}
