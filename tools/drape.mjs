import {GRID_STEP} from '../dist/geography.js';
import {ASPHALT,PAVING,packColor,packSlope,surfaceTriangle} from '../dist/surfaces.js';
import {terrainPolygons} from '../dist/terrain-polygon.js';

// Clip each road polygon to the same triangles used by the collision terrain.
function outsidePolygon(points,[w,n,e,s]){
  let inside=points;
  const pieces=[];
  for(const [axis,edge,sign] of [[0,w,1],[0,e,-1],[1,n,1],[1,s,-1]]){
    const inner=[],outer=[];
    for(let i=0;i<inside.length;i++){
      const a=inside[i],b=inside[(i+1)%inside.length],p=(a[axis]-edge)*sign,q=(b[axis]-edge)*sign;
      (p>=0?inner:outer).push(a);
      if((p>=0)===(q>=0))continue;
      const t=p/(p-q),v=a.map((x,j)=>x+(b[j]-x)*t);
      inner.push(v);outer.push(v);
    }
    if(outer.length>=3)pieces.push(outer);
    inside=inner;
    if(inside.length<3)break;
  }
  return pieces;
}
export function createDraper({heightAt,bridgeHeight,getChunk,triangle,color,cut}){
  function normal(x,z){
    const dx=(heightAt(x+GRID_STEP,z)-heightAt(x-GRID_STEP,z))/(2*GRID_STEP);
    const dz=(heightAt(x,z+GRID_STEP)-heightAt(x,z-GRID_STEP))/(2*GRID_STEP);
    const length=Math.hypot(dx,1,dz);
    return packSlope(-dx/length,-dz/length);
  }
  return function drape(a,b,c,paint,mat,offset){
    const source=[a,b,c].map(p=>[p[0],p[2]]);
    const tint=packColor(color(paint));
    const crosses=cut&&!source.every(p=>p[0]<=cut[0])&&!source.every(p=>p[0]>=cut[2])&&
      !source.every(p=>p[1]<=cut[1])&&!source.every(p=>p[1]>=cut[3]);
    const pieces=crosses?outsidePolygon(source,cut):[source];
    for(const piece of pieces)for(const polygon of terrainPolygons(piece)){
      const points=polygon.map(([a,b])=>[a,bridgeHeight(a,b)+offset,b]);
      const slopes=mat===1||mat===2?polygon.map(([a,b])=>normal(a,b)):null;
      for(let i=1;i<points.length-1;i++){
        const [a,b,c]=[points[0],points[i],points[i+1]];
        const area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
        if(Math.abs(area)<1e-6)continue;
        if(slopes){
          const order=area<0?[0,i,i+1]:[0,i+1,i];
          const out=getChunk((a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3).tri;
          surfaceTriangle(out,...order.map(n=>points[n]),order.map(n=>slopes[n]),[tint,tint,tint],mat===2?ASPHALT:PAVING);
        }else triangle(a,b,c,paint,mat);
      }
    }
  };
}
