import {GRID_STEP,TILE_SIZE,TILE_COLS,WORLD_VERSION,hasTile,highestWaterLevel,tileOrigin,toTile,triangleLiquid} from './geography.js';
import {fixtureFootprints} from './fixture-footprints.js';

export const meshKinds=['tri','box','tube','cone','pyramid','ball','roof','chamfer','taper','window','pane'];
// A block: center x, z, half width and depth along its own axes (width along the direction (c, s) in x and
// z), that direction's c and s, bottom and
// top heights, and a shape code: 0 a rectangle, 1 round (poles, trunks: an ellipse), 2 round foliage,
// which only stops a body when it reaches below the waist (a bush, not a canopy overhead).
export const BLOCK_STRIDE=9;
const solidKinds=['box','chamfer','taper','roof','tube','cone','pyramid','ball'],roundKinds=new Set(['tube','cone','ball']);
// Materials that never stop a body: glass, water and the effect sprites.
const passable=new Set([3,22,39,59,60,61,62,63]);
// Turns the visible instances of a tile into colliders. Building-sized volumes are left to the footprints
// (solids), which keep lobby entrances open; everything smaller collides exactly where it is drawn.
export function propBlocks(tile){
  const blocks=[];
  for(const kind of solidKinds){
    const list=tile[kind];
    if(!list)continue;
    for(let i=0;i<list.length;i+=16){
      const mat=Math.floor(list[i+15]);
      if(mat>=64||passable.has(mat))continue;
      const axes=[[list[i+3],list[i+4],list[i+5]],[list[i+6],list[i+7],list[i+8]],[list[i+9],list[i+10],list[i+11]]];
      // The heading comes from the most horizontal axis; the footprint is the box projected onto it.
      let best=axes[0],flat=0;
      for(const a of axes){const h=Math.hypot(a[0],a[2])*(1-Math.abs(a[1])/(Math.hypot(...a)||1));if(h>flat){flat=h;best=a;}}
      const length=Math.hypot(best[0],best[2])||1,c=best[0]/length,s=best[2]/length;
      let hw=0,hd=0,hh=0;
      for(const a of axes){hw+=Math.abs(a[0]*c+a[2]*s)/2;hd+=Math.abs(-a[0]*s+a[2]*c)/2;hh+=Math.abs(a[1])/2;}
      if(hh<.01||hw<.015&&hd<.015||Math.min(hw,hd)>3)continue;
      const foliage=mat===6||mat===45;
      blocks.push(list[i],list[i+2],hw,hd,c,s,list[i+1]-hh,list[i+1]+hh,foliage?2:roundKinds.has(kind)?1:0);
    }
  }
  return blocks;
}
// True when a body of the given radius standing at x, z overlaps the block's footprint.
export function blockFootprint(list,i,x,z,radius){
  const dx=x-list[i],dz=z-list[i+1],c=list[i+4],s=list[i+5];
  const u=dx*c+dz*s,v=-dx*s+dz*c,w=list[i+2]+radius,d=list[i+3]+radius;
  if(list[i+8])return (u*u)/(w*w)+(v*v)/(d*d)<=1;
  return Math.abs(u)<=w&&Math.abs(v)<=d;
}
export const cells=TILE_SIZE/GRID_STEP;
const corners=(cells+1)**2;
// blocks: every visible prop as a 3D collider (see propBlocks), shared by the client and the server.
const fieldNames=['solids','decks','platforms','blocks','roads',...meshKinds];
const fieldStride=[6,6,8,BLOCK_STRIDE,5,...meshKinds.map(()=>16)];
const key=(x,z)=>x+':'+z;
const layout=(fields,magic,visual)=>{
  const header=8+fields.length*4;
  const heightEnd=header+corners*2;
  const paletteEnd=heightEnd+corners*2;
  const end=visual?paletteEnd+corners*2:heightEnd;
  return {fields,magic,header,heightEnd,paletteEnd,start:Math.ceil(end/4)*4};
};
const visualLayout=layout(fieldNames,0x394c5441,true);
const physicsLayout=layout(fieldNames.slice(0,4),0x39505441,false);

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
