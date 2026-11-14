import {GRID_STEP,TILE_SIZE,TILE_COLS,WORLD_VERSION,hasTile,highestWaterLevel,tileOrigin,toTile,triangleLiquid} from './geography.js';
import {fixtureFootprints} from './fixture-footprints.js';

export const meshKinds=['tri','box','tube','cone','pyramid','ball','roof','chamfer','taper','window','pane'];
export const cells=TILE_SIZE/GRID_STEP;
const corners=(cells+1)**2;
const fieldNames=['solids','decks','platforms','roads',...meshKinds];
const fieldStride=[6,6,8,5,...meshKinds.map(()=>16)];
const key=(x,z)=>x+':'+z;
const layout=(fields,magic,visual)=>{
  const header=8+fields.length*4;
  const heightEnd=header+corners*2;
  const paletteEnd=heightEnd+corners*2;
  const end=visual?paletteEnd+corners*2:heightEnd;
  return {fields,magic,header,heightEnd,paletteEnd,start:Math.ceil(end/4)*4};
};
const visualLayout=layout(fieldNames,0x384c5441,true);
const physicsLayout=layout(fieldNames.slice(0,3),0x38505441,false);

export function tilePath(x,z,visual=true){
  return './world/'+WORLD_VERSION+'/'+(visual?'':'physics/')+x+'-'+z+'.bin';
}

export function encodeTile(tile,visual=true){
  const {fields,magic,header,heightEnd,paletteEnd,start}=visual?visualLayout:physicsLayout;
  const size=fields.reduce((bytes,name)=>bytes+tile[name].length*4,start);
  const result=new ArrayBuffer(size),h=new DataView(result,0,header);
  h.setUint32(0,magic,true);h.setUint16(4,tile.ix,true);h.setUint16(6,tile.iz,true);
  new Int16Array(result,header,corners).set(tile.heights);
  if(visual){
    new Uint16Array(result,heightEnd,corners).set(tile.palette);
    new Uint16Array(result,paletteEnd,corners).set(tile.normals);
  }
  let offset=start;
  for(const [i,name] of fields.entries()){
    const data=tile[name];
    if(data.length%fieldStride[i])throw Error('Invalid '+name+' data');
    h.setUint32(8+i*4,data.length,true);
    new Float32Array(result,offset,data.length).set(data);
    offset+=data.length*4;
  }
  return result;
}
export function decodeTile(buffer,ix,iz,visual){
  const {fields,magic,header,heightEnd,paletteEnd,start}=visual?visualLayout:physicsLayout;
  if(buffer.byteLength<start)throw Error('Incomplete world tile');
  const h=new DataView(buffer,0,header);
  if(h.getUint32(0,true)!==magic||h.getUint16(4,true)!==ix||h.getUint16(6,true)!==iz)throw Error('World tile does not match this version');
  const [x,z]=tileOrigin(ix,iz);
  const tile={ix,iz,x,z,heights:new Int16Array(buffer,header,corners)};
  if(visual){
    tile.palette=new Uint16Array(buffer,heightEnd,corners);
    tile.normals=new Uint16Array(buffer,paletteEnd,corners);
  }
  let offset=start;
  for(const [i,name] of fields.entries()){
    const count=h.getUint32(8+i*4,true),end=offset+count*4;
    if(count%fieldStride[i]||end>buffer.byteLength)throw Error('Corrupt world tile '+name);
    tile[name]=new Float32Array(buffer,offset,count);
    offset=end;
  }
  if(offset!==buffer.byteLength)throw Error('Unexpected world tile data');
  const encodedFixtures=fixtureFootprints[iz*TILE_COLS+ix];
  if(encodedFixtures){
    const fixtures=atob(encodedFixtures),start=tile.solids.length;
    const solids=new Float32Array(start+fixtures.length);
    const signed16=i=>((fixtures.charCodeAt(i)|(fixtures.charCodeAt(i+1)<<8))<<16)>>16;
    solids.set(tile.solids);
    for(let i=0;i<fixtures.length;i+=6){
      solids.set([x+signed16(i)*.01,z+signed16(i+2)*.01,fixtures.charCodeAt(i+4)*.01,fixtures.charCodeAt(i+5)*.01,1,0],start+i);
    }
    tile.solids=solids;
  }
  return tile;
}
export function sampleHeight(tile,x,z){
  const a=Math.min(cells-1e-7,Math.max(0,(x-tile.x)/GRID_STEP));
  const b=Math.min(cells-1e-7,Math.max(0,(z-tile.z)/GRID_STEP));
  const i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j,p=j*(cells+1)+i,h=tile.heights;
  const q=h[p],r=h[p+1],s=h[p+cells+1],t=h[p+cells+2];
  return .01*(u+v<=1?q+(r-q)*u+(s-q)*v:t+(s-t)*(1-u)+(r-t)*(1-v));
}
export function terrainWater(tile,x,z,height){
  if(height>=highestWaterLevel)return null;
  const a=Math.min(cells-1e-7,Math.max(0,(x-tile.x)/GRID_STEP));
  const b=Math.min(cells-1e-7,Math.max(0,(z-tile.z)/GRID_STEP));
  const i=Math.floor(a),j=Math.floor(b),stride=cells+1,k=j*stride+i;
  const px=tile.x+i*GRID_STEP,pz=tile.z+j*GRID_STEP,h=tile.heights;
  const east=[px+GRID_STEP,h[k+1]*.01,pz],south=[px,h[k+stride]*.01,pz+GRID_STEP];
  const water=a-i+b-j<=1?
    triangleLiquid([px,h[k]*.01,pz],south,east):
    triangleLiquid([px+GRID_STEP,h[k+stride+1]*.01,pz+GRID_STEP],east,south);
  return water&&height<water.level?water:null;
}
export function overlaps(list,x,z,pad=0,offsets){
  const count=offsets?.length??list.length/6;
  for(let item=0;item<count;item++){
    const i=offsets?offsets[item]:item*6;
    const dx=x-list[i],dz=z-list[i+1],c=list[i+4],s=list[i+5];
    if(Math.abs(dx*c-dz*s)<list[i+2]+pad&&Math.abs(dx*s+dz*c)<list[i+3]+pad)return true;
  }
  return false;
}
export function platformHeight(list,x,z,ground,offsets){
  const count=offsets?.length??list.length/8;
  for(let item=0;item<count;item++){
    const i=offsets?offsets[item]:item*8;
    const dx=x-list[i],dz=z-list[i+1],c=list[i+4],s=list[i+5];
    const depth=dx*s+dz*c;
    if(Math.abs(dx*c-dz*s)<=list[i+2]&&Math.abs(depth)<=list[i+3]){
      ground=Math.max(ground,list[i+6]+depth*list[i+7]);
    }
  }
  return ground;
}
export function tilesAround(x,z,radius){
  const [x0,z0]=toTile(x-radius,z-radius),[x1,z1]=toTile(x+radius,z+radius);
  const result=[];
  for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++)if(hasTile(ix,iz)){
    const [a,b]=tileOrigin(ix,iz);
    const dx=Math.max(a-x,0,x-(a+TILE_SIZE)),dz=Math.max(b-z,0,z-(b+TILE_SIZE));
    if(dx*dx+dz*dz<=radius*radius)result.push([ix,iz]);
  }
  return result;
}
export function tileCache(load,{capacity=48}={}){
  const ready=new Map(),pending=new Map();
  const peek=(ix,iz)=>ready.get(key(ix,iz));
  function get(ix,iz){
    if(!hasTile(ix,iz))return Promise.reject(Error('Outside world'));
    const id=key(ix,iz);
    if(ready.has(id)){
      const value=ready.get(id);ready.delete(id);ready.set(id,value);return Promise.resolve(value);
    }
    if(pending.has(id))return pending.get(id);
    const loading=Promise.resolve().then(()=>load(ix,iz)).then(tile=>{
      ready.set(id,tile);
      if(ready.size>capacity)ready.delete(ready.keys().next().value);
      return tile;
    }).finally(()=>pending.delete(id));
    pending.set(id,loading);
    return loading;
  }
  return {get,peek,at(x,z){return peek(...toTile(x,z));},
    around(x,z,radius){return Promise.all(tilesAround(x,z,radius).map(([a,b])=>get(a,b)));}};
}
