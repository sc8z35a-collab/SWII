import {GRID_STEP,TILE_SIZE,OCEAN,liquidAt,triangleLiquid} from './geography.js';
import {cells} from './tiles.js';
import {LAND,packColor,unpackColor,packSlope,unpackSlope,surfaceTriangle} from './surfaces.js';
import {tunnelCuts} from './road-tunnels.js';
import {assemblyBounds} from './mission-layout.js';

const mix=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
function splitAt(points,axis,value,sign){
  const inside=[],outside=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    const p=(a.position[axis]-value)*sign,q=(b.position[axis]-value)*sign;
    (p>=0?inside:outside).push(a);
    if((p>=0)===(q>=0))continue;
    const t=p/(p-q),position=mix(a.position,b.position,t);
    const [nx,,nz]=mix(unpackSlope(a.normal),unpackSlope(b.normal),t);
    const cut={position,tint:packColor(mix(unpackColor(a.tint),unpackColor(b.tint),t)),
      normal:packSlope(nx,nz),water:liquidAt(position[0],position[2],position[1])};
    inside.push(cut);outside.push(cut);
  }
  return [inside,outside];
}
function removeTrench(points,[w,n,e,s]){
  if(points.every(p=>p.position[0]<=w)||points.every(p=>p.position[0]>=e)||
    points.every(p=>p.position[2]<=n)||points.every(p=>p.position[2]>=s))return [points];
  let remaining=points;
  const kept=[];
  for(const [axis,edge,sign] of [[0,w,1],[0,e,-1],[2,n,1],[2,s,-1]]){
    const [inside,outside]=splitAt(remaining,axis,edge,sign);
    if(outside.length>=3)kept.push(outside);
    remaining=inside;
    if(remaining.length<3)break;
  }
  return kept;
}

const liquidColor=liquid=>[0,2,4].map(i=>parseInt(liquid.color.slice(i,i+2),16)/255);
function waterTriangle(out,a,b,c,color){
  const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
  if(Math.abs(u[0]*v[2]-u[2]*v[0])>.00001)out.push(...a,...u,0,1,0,...v,...color,3);
}

export function terrainMesh(tile){
  const tris=[];
  // The flat open sea needs two triangles for the entire 200 m tile.
  if(tile.heights.every(height=>height===Math.round((OCEAN.level-8)*100))&&liquidAt(tile.x,tile.z,OCEAN.level-8)===OCEAN){
    const {x,z}=tile,y=OCEAN.level,e=x+TILE_SIZE,s=z+TILE_SIZE,color=liquidColor(OCEAN);
    waterTriangle(tris,[x,y,z],[x,y,s],[e,y,z],color);
    waterTriangle(tris,[e,y,s],[e,y,z],[x,y,s],color);
    return new Float32Array(tris);
  }
  const stride=cells+1;
  const vertices=Array.from({length:stride**2},(_,n)=>{
    const position=[tile.x+(n%stride)*GRID_STEP,tile.heights[n]*.01,tile.z+Math.floor(n/stride)*GRID_STEP];
    return {position,tint:tile.palette[n],normal:tile.normals[n],water:liquidAt(position[0],position[2],position[1])};
  });
  const land=(a,b,c)=>surfaceTriangle(tris,a.position,b.position,c.position,[a.normal,b.normal,c.normal],[a.tint,b.tint,c.tint],LAND);
  const cuts=tunnelCuts(tile.x,tile.z,TILE_SIZE);
  const [w,n,e,s]=assemblyBounds;
  if(e>tile.x&&s>tile.z&&w<tile.x+TILE_SIZE&&n<tile.z+TILE_SIZE)cuts.push(assemblyBounds);
  function fill(a,b,c){
    const p=a.position,q=b.position,r=c.position;
    const liquid=triangleLiquid(p,q,r,[a.water,b.water,c.water]);
    if(!liquid){land(a,b,c);return;}
    const points=[a,b,c];
    const bank=[],pool=[];
    for(let i=0;i<3;i++){
      const a=points[i],b=points[(i+1)%3],p=a.position,q=b.position,sub=p[1]<liquid.level;
      if(sub)pool.push([p[0],liquid.level,p[2]]);else bank.push(a);
      if(sub!==(q[1]<liquid.level)){
        const t=(liquid.level-p[1])/(q[1]-p[1]);
        const shore=[p[0]+(q[0]-p[0])*t,liquid.level,p[2]+(q[2]-p[2])*t];
        const [nx,,nz]=mix(unpackSlope(a.normal),unpackSlope(b.normal),t);
        const tint=packColor(mix(unpackColor(a.tint),unpackColor(b.tint),t));
        pool.push(shore);bank.push({position:shore,tint,normal:packSlope(nx,nz)});
      }
    }
    const water=liquidColor(liquid);
    for(let i=1;i<bank.length-1;i++)land(bank[0],bank[i],bank[i+1]);
    for(let i=1;i<pool.length-1;i++)waterTriangle(tris,pool[0],pool[i],pool[i+1],water);
  }
  function surface(a,b,c){
    if(!cuts.length){fill(a,b,c);return;}
    let pieces=[[a,b,c]];
    for(const cut of cuts)pieces=pieces.flatMap(points=>removeTrench(points,cut));
    for(const points of pieces)for(let i=1;i+1<points.length;i++)fill(points[0],points[i],points[i+1]);
  }
  for(let j=0;j<cells;j++)for(let i=0;i<cells;i++){
    const n=j*stride+i;
    const a=vertices[n],b=vertices[n+1],c=vertices[n+stride],d=vertices[n+stride+1];
    surface(a,c,b);surface(d,b,c);
  }
  return new Float32Array(tris);
}
