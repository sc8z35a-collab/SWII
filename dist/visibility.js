import {hasTile,TILE_SIZE,tileOrigin,toTile,WORLD_VERSION} from './geography.js';
import {tilesAround} from './tiles.js';

const binSize=20,binsPerTile=TILE_SIZE/binSize;
const index=(x,z)=>z*binsPerTile+x;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const bin=n=>clamp(Math.floor(n/binSize),0,binsPerTile-1);
const path='./world/'+WORLD_VERSION+'/sight/';
const stride=6;

function sightIndex(data,[x,z]){
  if(!data.length)return {data,x,z};
  const bins=Array.from({length:binsPerTile**2},()=>[]);
  for(let i=0;i<data.length;i+=stride){
    for(let a=bin(data[i]*.02);a<=bin(data[i+3]*.02);a++)
      for(let b=bin(data[i+2]*.02);b<=bin(data[i+5]*.02);b++)bins[index(a,b)].push(i);
  }
  return {data,bins,x,z};
}

function intersects(a,b,volume,i,x,z,padding){
  let near=0,far=1;
  for(let k=0;k<3;k++){
    const shift=k===0?x:k===2?z:0,v=b[k]-a[k];
    const min=volume[i+k]*.02+shift-padding,max=volume[i+k+3]*.02+shift+padding;
    if(Math.abs(v)<1e-7){
      if(a[k]<=min||a[k]>=max)return false;
    }else{
      const p=(min-a[k])/v,q=(max-a[k])/v;
      near=Math.max(near,Math.min(p,q));far=Math.min(far,Math.max(p,q));
      if(near>=far)return false;
    }
  }
  return near<.9997&&far>.0003;
}

export function createVisibility(load,capacity=32){
  const cache=new Map(),pending=new Map();
  let catalogue;
  async function get(ix,iz){
    const id=ix+'-'+iz;
    if(cache.has(id)){
      const tile=cache.get(id);
      cache.delete(id);cache.set(id,tile);
      return tile;
    }
    if(pending.has(id))return pending.get(id);
    catalogue??=load(path+'tiles.json').then(r=>r.json()).then(keys=>new Set(keys)).catch(error=>{catalogue=null;throw error;});
    const request=(async ()=>{
      const keys=await catalogue;
      const data=keys.has(id)?new Int16Array(await (await load(path+id+'.bin')).arrayBuffer()):new Int16Array(0);
      if(data.length%stride)throw Error('Invalid visibility tile');
      const tile=sightIndex(data,tileOrigin(ix,iz));
      cache.set(id,tile);
      while(cache.size>capacity)cache.delete(cache.keys().next().value);
      return tile;
    })().finally(()=>pending.delete(id));
    pending.set(id,request);
    return request;
  }
  function around(x,z,radius=42){
    const ids=tilesAround(x,z,radius);
    return Promise.all(ids.map(([a,b])=>get(a,b)));
  }
  function blocked(a,b,padding=0){
    const minX=Math.min(a[0],b[0])-padding,maxX=Math.max(a[0],b[0])+padding;
    const minZ=Math.min(a[2],b[2])-padding,maxZ=Math.max(a[2],b[2])+padding;
    const [j,k]=toTile(minX,minZ),[l,m]=toTile(maxX,maxZ);
    let unknown=false;
    for(let ix=j;ix<=l;ix++)for(let iz=k;iz<=m;iz++){
      if(!hasTile(ix,iz))return true;
      const id=ix+'-'+iz,tile=cache.get(id);
      if(!tile){unknown=true;continue;}
      const {x,z,data,bins}=tile;
      if(!data.length)continue;
      for(let p=bin(minX-x);p<=bin(maxX-x);p++)for(let q=bin(minZ-z);q<=bin(maxZ-z);q++){
        for(const i of bins[index(p,q)])if(intersects(a,b,data,i,x,z,padding))return true;
      }
    }
    return unknown?null:false;
  }
  return {around,blocked};
}
