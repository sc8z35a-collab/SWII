import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {cities,build} from '../dist/world.js';
import {normalize,vectorCross} from '../dist/engine.js';
import {limits,districts,districtAt,toGlobal,toLocal,GRID_STEP,TILE_SIZE,TILE_COLS,TILE_ROWS,WORLD_VERSION,toTile,tileOrigin,hasTile,rawHeight,surfaceAt,liquidAt,waterLevel,rioShore} from '../dist/geography.js';
import {cells,meshKinds as kinds,encodeTile,propBlocks,blockFootprint,overlaps,BLOCK_STRIDE} from '../dist/tiles.js';
import {BODY_HEIGHT,BODY_RADIUS,STEP_UP} from '../dist/physics.js';
import {blockLanes,makeRoutes,makeRoadIndex,roadStyle} from './layout.mjs';
import {createDraper} from './drape.mjs';
import {connectStreets} from './road-links.mjs';
import {packSlope} from '../dist/surfaces.js';
import {makePedestrians} from './pedestrians.mjs';
import {capPoints,makeRoadMask,roadPoint} from './road-surfaces.mjs';
import {terrainCuts} from './terrain-edges.mjs';
import {recordFixtures,writeFixtureFootprints} from './fixture-footprints.mjs';
import {buildRoadTunnels,buildTransitSites,infrastructureRoads,protectedSite} from './infrastructure.mjs';
import {railwayMeters,stations} from '../dist/metro.js';
import {parkLocations} from '../dist/park-locations.js';
import {roadTunnels} from '../dist/road-tunnels.js';
import {assemblyBounds,atPad,launchSite} from '../dist/mission-layout.js';
import {placeHaunts,placeMissionBooks,writeMissionSight} from './mission-bake.mjs';
const colors=new Map();
const model=()=>Object.fromEntries(['solids','decks','platforms','roads',...kinds].map(name=>[name,[]]));
const color=c=>{
  if(!colors.has(c))colors.set(c,[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255));
  return colors.get(c);
};
const reserved={
  tokyo:[[18,-58,72],[44,10,21]],
  paris:[[-17,-61,23],[0,5,15]],
  newyork:[[53,8,24],[-29,-49,12]],
  cairo:[[-23,-58,31],[28,-78,24],[-68,-91,20],[47,9,19]],
  sydney:[[-17,-20,24],[-55,-18,15]],
  rio:[[-37,-105,34],[52,1,8]]
};
const occupied=(id,x,z,extra=0)=>reserved[id].some(([a,b,r])=>Math.hypot(a-x,b-z)<r+extra);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const at=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const boxKey=(x,z)=>Math.floor(x/30)+','+Math.floor(z/30);
const cols=TILE_COLS*cells,rows=TILE_ROWS*cells;
const elevation=new Int16Array((cols+1)*(rows+1));
for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++)elevation[j*(cols+1)+i]=Math.round(rawHeight(limits.west+i*GRID_STEP,limits.north+j*GRID_STEP)*100);
function heightAt(x,z){
  const a=clamp((x-limits.west)/GRID_STEP,0,cols-.00001),b=clamp((z-limits.north)/GRID_STEP,0,rows-.00001);
  const i=Math.floor(a),j=Math.floor(b),u=a-i,v=b-j,k=j*(cols+1)+i;
  const p=elevation[k],q=elevation[k+1],r=elevation[k+cols+1],s=elevation[k+cols+2];
  return .01*(u+v<=1?p+(q-p)*u+(r-p)*v:s+(r-s)*(1-u)+(q-s)*(1-v));
}
const inWater=(x,z)=>liquidAt(x,z,heightAt(x,z))!==null;
function makeRegion(){
  const chunks=new Map(),hit=new Map();
  const towerAssembly=Object.fromEntries(kinds.map(name=>[name,[]])),parkedCars=[];
  const padFloor=heightAt(launchSite.x,launchSite.z)+.087;
  let seed=46212719;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const routes=makeRoutes(heightAt,rnd);
  routes.push(...infrastructureRoads(routes,heightAt));
  const repairs=connectStreets(routes,heightAt,([x,z],radius)=>{
    const id=districtAt(x,z);
    if(x<limits.west+12||x>limits.east-12||z<limits.north+12||z>limits.south-12||
      occupied(id,...toLocal(id,x,z),radius)||protectedSite(x,z,radius))return false;
    return [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([a,b])=>!inWater(x+a,z+b));
  });
  routes.push(...repairs);
  const lanes=blockLanes(routes,heightAt);
  routes.push(...lanes);
  for(const route of routes)route.surface=roadStyle(route);
  const nearestRoad=makeRoadIndex(routes);
  const edgesByRoute=new Map(routes.map(route=>[route,roadEdges(route)]));
  const caps=new Map();
  for(const route of routes)for(const point of [route.points[0],route.points.at(-1)]){
    const key=point.map(n=>Math.round(n*100)).join(',');
    const previous=caps.get(key);
    if(!previous||previous.surface.rank<route.surface.rank||
      previous.surface.rank===route.surface.rank&&previous.radius<route.width*.5)
      caps.set(key,{point,radius:route.width*.5,surface:route.surface});
  }
  const roadMask=makeRoadMask(routes,edgesByRoute,caps.values());
  function tile(ix,iz){
    ix=clamp(ix,0,TILE_COLS-1);iz=clamp(iz,0,TILE_ROWS-1);
    const key=iz*TILE_COLS+ix;
    if(!chunks.has(key))chunks.set(key,{ix,iz,...model()});
    return chunks.get(key);
  }
  const getChunk=(x,z)=>tile(...toTile(x,z));
  function covering(x0,z0,x1,z1,action){
    const [a,b]=toTile(x0,z0),[c,d]=toTile(x1,z1);
    for(let i=a;i<=c;i++)for(let j=b;j<=d;j++)if(hasTile(i,j))action(tile(i,j));
  }
  function rectangle(field,x,z,w,d,yaw=0,...extra){
    const c=Math.cos(yaw),s=Math.sin(yaw),rx=(Math.abs(c)*w+Math.abs(s)*d)*.5+.5,rz=(Math.abs(s)*w+Math.abs(c)*d)*.5+.5;
    covering(x-rx,z-rz,x+rx,z+rz,t=>t[field].push(x,z,w*.5,d*.5,c,s,...extra));
  }
  function triangle(a,b,c,paint,mat){
    let u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=normalize(vectorCross(u,v));
    if(n[1]<0){[u,v]=[v,u];n=n.map(k=>-k);}
    if(Math.hypot(...n)<.5)return;
    getChunk((a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3).tri.push(...a,...u,...n,...v,...color(paint),mat);
  }
  function instance(target,kind,x,y,z,w,h,d,paint,mat=0,angle=0,basis){
    const s=Math.sin(angle),c=Math.cos(angle);
    const extents=[w,h,d];
    const axes=basis?basis.flatMap((axis,i)=>axis.map(value=>value*extents[i])):[c*w,0,-s*w,0,h,0,s*d,0,c*d];
    target[kind].push(x,y,z,...axes,...color(paint),mat);
  }
  const shape=(kind,x,y,z,...rest)=>instance(getChunk(x,z),kind,x,y,z,...rest);
  function footprint(x,z,w,d,yaw,pad){
    return {x,z,w:w*.5+pad,d:d*.5+pad,c:Math.cos(yaw),s:Math.sin(yaw)};
  }
  function footprintCells({x,z,w,d,c,s},visit){
    const rx=Math.abs(c)*w+Math.abs(s)*d,rz=Math.abs(s)*w+Math.abs(c)*d;
    for(let ix=Math.floor((x-rx)/30);ix<=Math.floor((x+rx)/30);ix++)for(let iz=Math.floor((z-rz)/30);iz<=Math.floor((z+rz)/30);iz++){
      if(visit(ix+','+iz))return true;
    }
    return false;
  }
  function reserveFootprint(x,z,w,d,yaw=0,pad=.38,index=hit){
    const item=footprint(x,z,w,d,yaw,pad);
    footprintCells(item,key=>{
      if(!index.has(key))index.set(key,[]);
      index.get(key).push(item);
    });
  }
  function collision(x,z,w,d,yaw=0){
    reserveFootprint(x,z,w,d,yaw);
    rectangle('solids',x,z,w,d,yaw);
  }
  function blocked(x,z,index=hit){
    return (index.get(boxKey(x,z))??[]).some(o=>{
      const a=x-o.x,b=z-o.z;
      return Math.abs(a*o.c-b*o.s)<o.w&&Math.abs(a*o.s+b*o.c)<o.d;
    });
  }
  function bridgeHeight(x,z){
    const water=waterLevel(x,z);
    return water===undefined?heightAt(x,z):Math.max(heightAt(x,z),water+.61);
  }
  const terrainDrape=createDraper({heightAt,bridgeHeight,getChunk,triangle,color,cut:assemblyBounds});
  const flat=([x,z])=>[x,0,z];
  function drape(a,b,c,paint,mat,offset,clip){
    if(!clip){terrainDrape(a,b,c,paint,mat,offset);return;}
    const pieces=roadMask.clip([a,b,c].map(p=>[p[0],p[2]]),clip==='road');
    for(const polygon of pieces){
      const vertices=polygon.map(flat);
      for(let i=1;i+1<vertices.length;i++)terrainDrape(vertices[0],vertices[i],vertices[i+1],paint,mat,offset);
    }
  }
  function edgeWall(a,b,bottom,top,paint,material=18){
    let previous=a;
    for(const cut of terrainCuts(a,b).slice(1)){
      const next=at(a,b,cut),y=bridgeHeight(...previous),nextY=bridgeHeight(...next);
      const low=[previous[0],y+bottom,previous[1]],high=[previous[0],y+top,previous[1]];
      const endLow=[next[0],nextY+bottom,next[1]],endHigh=[next[0],nextY+top,next[1]];
      triangle(low,endLow,endHigh,paint,material);triangle(low,endHigh,high,paint,material);
      previous=next;
    }
  }
  const seineLevel=waterLevel(...toGlobal('paris',0,7));
  function bridgeRail(a,b){
    edgeWall(a,b,.19,.91,'b9ab98');
    edgeWall(b,a,.19,.91,'b9ab98');
    collision(...at(a,b,.5),dist(a,b)+.08,.31,Math.atan2(a[1]-b[1],b[0]-a[0]));
  }
  buildRoadTunnels({shape,triangle,heightAt});
  buildTransitSites({drape});
  const launch=build(cities[0]);
  for(const [kind,parts] of Object.entries(launch.lift)){
    const [start,end]=parts;
    for(let i=start;i<end;i+=16){
      const item=launch[kind].slice(i,i+16),[x,z]=toGlobal('tokyo',item[0],item[2]);
      item[0]=x;item[1]+=padFloor-.087;item[2]=z;
      towerAssembly[kind].push(...item);
    }
  }
  for(const [x0,z0,x1,z1] of launch.obstacles)
    collision(...toGlobal('tokyo',(x0+x1)*.5,(z0+z1)*.5),x1-x0,z1-z0);
  function roadEdges(route){
    return route.points.map((p,i)=>{
      const a=route.points[Math.max(0,i-1)],b=route.points[Math.min(i+1,route.points.length-1)];
      const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;
      return {x:p[0],z:p[1],ux:dx/len,uz:dz/len,nx:-dz/len,nz:dx/len};
    });
  }
  function ribbon(edges,l,r,color,mat,offset,{skip,clip}={}){
    const position=(edge,width)=>flat(roadPoint(edge,typeof width==='function'?width(edge):width));
    for(let i=1;i<edges.length;i++){
      const a=edges[i-1],b=edges[i];
      if(skip?.(a,b))continue;
      const left=position(a,l),right=position(a,r),nextLeft=position(b,l),nextRight=position(b,r);
      drape(left,nextLeft,right,color,mat,offset,clip);
      drape(right,nextLeft,nextRight,color,mat,offset,clip);
    }
  }
  for(const route of routes){
    const edges=edgesByRoute.get(route),half=route.width*.5;
    const {paint,mat,walk,mark,rank}=route.surface;
    const dense=route.local||route.points.some(p=>{const id=districtAt(...p);return Math.hypot(...toLocal(id,...p))<415;});
    const sidewalkWidth=walk?(dense?(route.main?2.22:1.38):route.main?1.28:0):0;
    for(let i=1;i<edges.length;i++){
      const a=edges[i-1],b=edges[i],x=(a.x+b.x)*.5,z=(a.z+b.z)*.5;
      covering(Math.min(a.x,b.x)-half,Math.min(a.z,b.z)-half,Math.max(a.x,b.x)+half,Math.max(a.z,b.z)+half,t=>t.roads.push(a.x,a.z,b.x,b.z,route.width));
      const deck=waterLevel(x,z);
      const overWater=deck!==undefined&&(inWater(x,z)||inWater(a.x,a.z)||inWater(b.x,b.z));
      if(deck!==undefined&&(heightAt(x,z)<deck+.65||overWater)){
        rectangle('decks',x,z,Math.hypot(b.x-a.x,b.z-a.z)+1.1,route.width+2*sidewalkWidth+.12,Math.atan2(a.z-b.z,b.x-a.x));
      }
      if(overWater){
        const edge=half+sidewalkWidth;
        for(const side of [-1,1]){
          const p=roadPoint(a,side*edge),q=roadPoint(b,side*edge);
          if(side<0)edgeWall(q,p,-.37,sidewalkWidth?.19:.11,'8f8a7c');
          else edgeWall(p,q,-.37,sidewalkWidth?.19:.11,'8f8a7c');
          if(route.id==='paris'&&deck===seineLevel){
            const first=roadPoint(a,side*(edge-.12)),last=roadPoint(b,side*(edge-.12));
            for(const [from,to] of roadMask.exposed(first,last,route))
              bridgeRail(at(first,last,from),at(first,last,to));
          }
        }
      }
    }
    const sidewalk=route.id==='cairo'?'bca384':route.id==='paris'?'b9b1a2':'adad9e';
    if(sidewalkWidth){
      for(const side of [-1,1]){
        const l=side<0?-half-sidewalkWidth:half,r=side<0?-half:half+sidewalkWidth;
        ribbon(edges,l,r,sidewalk,1,.195,{clip:'outside'});
        if(dense){
          ribbon(edges,side<0?-half-.13:half,side<0?-half:half+.13,'c4beb0',18.25,.221,{clip:'outside'});
          for(let i=1;i<edges.length;i++){
            const a=roadPoint(edges[i-1],side*half),b=roadPoint(edges[i],side*half);
            for(const [from,to] of roadMask.exposed(a,b,route)){
              const p=at(a,b,from),q=at(a,b,to);
              if(side<0)edgeWall(p,q,.114,.221,'a7a296',18.25);
              else edgeWall(q,p,.114,.221,'a7a296',18.25);
            }
          }
        }
      }
    }
    ribbon(edges,-half,half,paint,mat,.112+rank*.003);
    if(mark&&(route.arterial||dense)&&route.id!=='cairo'){
      for(let i=1;i<edges.length;i+=2){
        const a=edges[i-1],b=edges[i],first={...a,x:a.x*.73+b.x*.27,z:a.z*.73+b.z*.27},last={...b,x:a.x*.17+b.x*.83,z:a.z*.17+b.z*.83};
        if(nearestRoad((a.x+b.x)*.5,(a.z+b.z)*.5,8,route)<4)continue;
        ribbon([first,last],-.073,.073,route.local?'ddd4b8':'d4ceb8',0,.168);
      }
    }
  }
  for(const cap of caps.values()){
    const center=flat(cap.point),ring=capPoints(cap).map(flat);
    const {paint,mat,rank}=cap.surface;
    for(let i=0;i<ring.length;i++)drape(center,ring[i],ring[(i+1)%ring.length],paint,mat,.112+rank*.003);
  }
  {
    const walk=[];
    for(let z=-145;z<=151;z+=2.4)walk.push(toGlobal('rio',rioShore(z)-13.6,z));
    const edge=roadEdges({points:walk}),skip=(a,b)=>inWater((a.x+b.x)*.5,(a.z+b.z)*.5);
    const pavement={skip,clip:'outside'};
    ribbon(edge,-3.7,3.7,'d8d1bb',16,.235,pavement);
    for(const offset of [-2.56,-.07,2.41]){
      const wave=e=>offset+Math.sin(e.z*.52)*.66;
      ribbon(edge,e=>wave(e)-.35,e=>wave(e)+.35,'424846',16,.258,pavement);
    }
    ribbon(edge,3.68,3.94,'b3ac99',18,.288,pavement);
    ribbon(edge,-3.9,-3.67,'c5bdac',18,.288,pavement);
  }
  for(const {point:[x,z],yaw} of parkLocations){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const point=(a,b)=>[x+a*c+b*s,0,z+a*s-b*c];
    const [a,b,d,e]=[point(-1.15,0),point(1.15,0),point(1.15,24),point(-1.15,24)];
    drape(a,b,d,'b2a996',1,.167,'outside');drape(a,d,e,'b2a996',1,.167,'outside');
  }
  // Cars remain recognizable and usable; all roadside furniture is gone.
  for(const city of cities){
    const yaw=city.id==='sydney'||city.id==='rio'?Math.PI:0;
    for(const [lx,lz] of [[-3.6,66],[3.6,32],[3.6,-31]]){
      const [x,z]=toGlobal(city.id,lx,lz);
      if(!inWater(x,z)&&!blocked(x,z)&&!atPad(x,z,4))
        parkedCars.push({id:parkedCars.length,x,y:heightAt(x,z)+.12,z,yaw,paint:'879da3'});
    }
  }
  const count=routes.reduce((sum,route)=>sum+route.points.slice(1).reduce((n,p,i)=>n+dist(p,route.points[i]),0),0);
  const footprints={};
  for(const chunk of chunks.values())recordFixtures(chunk,footprints);
  function blocksPedestrian(x,z){
    if(blocked(x,z))return true;
    const [ix,iz]=toTile(x,z),fixtures=footprints[iz*TILE_COLS+ix]??[];
    for(let i=0;i<fixtures.length;i+=6){
      if(Math.abs(x-fixtures[i])<fixtures[i+2]+.37&&Math.abs(z-fixtures[i+1])<fixtures[i+3]+.37)return true;
    }
    return false;
  }
  const pedestrians=makePedestrians(routes,{heightAt,blocked:blocksPedestrian,inWater,roadMask});
  const occupiedRoad=(x,z)=>inWater(x,z)||blocksPedestrian(x,z)||parkedCars.some(c=>Math.hypot(c.x-x,c.z-z)<2.75);
  const books=placeMissionBooks(routes,heightAt,occupiedRoad);
  const haunts=placeHaunts(routes,heightAt,(x,z)=>inWater(x,z)||occupiedRoad(x,z)||
    parkedCars.some(c=>Math.hypot(c.x-x,c.z-z)<4.5)||books.some(b=>Math.hypot(b.x-x,b.z-z)<3));
  return {tile,routes,meters:Math.round(count),pedestrians,footprints,towerAssembly,parkedCars,books,padFloor,haunts};

}

function packColor(color){
  const n=parseInt(color,16);
  return ((n>>>19)<<11)|(((n>>>10)&63)<<5)|((n&255)>>>3);
}
const out=fileURLToPath(new URL('../dist/world/'+WORLD_VERSION+'/',import.meta.url));
await mkdir(out+'physics/',{recursive:true});
const world=makeRegion();
const serializeArchitecture=data=>JSON.stringify(data,(_key,value)=>typeof value==='number'?Number(value.toFixed(6)):value);
if(process.argv.includes('--pedestrians-only')){
  const path=out+'architecture.json',architecture=JSON.parse(await readFile(path,'utf8'));
  await writeFile(path,serializeArchitecture({...architecture,pedestrians:world.pedestrians}));
  console.log('Updated paths for '+world.pedestrians.length+' pedestrians.');
  process.exit(0);
}
let total=0,rawTotal=0,physicsTotal=0,instances=0;
// Prop colliders, copied into every tile a prop reaches so a body is stopped on either side of a border.
const blockSets=new Map();
for(let j=0;j<TILE_ROWS;j++)for(let i=0;i<TILE_COLS;i++){
  const list=propBlocks(world.tile(i,j));
  for(let k=0;k<list.length;k+=BLOCK_STRIDE){
    const reach=Math.hypot(list[k+2],list[k+3])+.6;
    const [a,b]=[list[k],list[k+1]];
    for(let n=-1;n<=1;n++)for(let m=-1;m<=1;m++){
      const ti=i+m,tj=j+n;
      if(ti<0||tj<0||ti>=TILE_COLS||tj>=TILE_ROWS)continue;
      const [x0,z0]=tileOrigin(ti,tj);
      const dx=Math.max(x0-a,0,a-(x0+TILE_SIZE)),dz=Math.max(z0-b,0,b-(z0+TILE_SIZE));
      if(dx>reach||dz>reach)continue;
      const key=ti+','+tj;
      if(!blockSets.has(key))blockSets.set(key,[]);
      blockSets.get(key).push(...list.slice(k,k+BLOCK_STRIDE));
    }
  }
}
// Pedestrian route points that land inside a prop (a pole, a bench) move to the nearest free spot, so
// people walk around props instead of through them.
function propAt(x,y,z){
  const [i,j]=toTile(x,z),list=blockSets.get(i+','+j)??[],solids=world.tile(i,j)?.solids??[];
  if(overlaps(solids,x,z,.37))return true;
  for(let k=0;k<list.length;k+=BLOCK_STRIDE){
    if(list[k+6]>=y+(list[k+8]===2?.9:BODY_HEIGHT)||list[k+7]<=y+STEP_UP)continue;
    if(blockFootprint(list,k,x,z,BODY_RADIUS+.05))return true;
  }
  return false;
}
let nudged=0;
for(const person of world.pedestrians)for(const point of person.path){
  const [x,y,z]=point;
  if(!propAt(x,y,z))continue;
  search:for(const r of [.25,.45,.7,1,1.4,1.9])for(let a=0;a<16;a++){
    const nx=x+Math.cos(a*Math.PI/8)*r,nz=z+Math.sin(a*Math.PI/8)*r;
    if(!propAt(nx,y,nz)){point[0]=nx;point[2]=nz;nudged++;break search;}
  }
}
let blockTotal=0;
for(let j=0;j<TILE_ROWS;j++)for(let i=0;i<TILE_COLS;i++){
  const tile=world.tile(i,j),[x,z]=tileOrigin(i,j),heights=[],palette=[],normals=[];
  for(let n=0;n<=cells;n++)for(let m=0;m<=cells;m++)heights.push(elevation[(j*cells+n)*(cols+1)+i*cells+m]);
  for(let n=0;n<=cells;n++)for(let m=0;m<=cells;m++){
    const a=x+m*GRID_STEP,b=z+n*GRID_STEP;
    palette.push(packColor(surfaceAt(a,b,heightAt(a,b)).color));
    const dx=(heightAt(a+GRID_STEP,b)-heightAt(a-GRID_STEP,b))/(2*GRID_STEP);
    const dz=(heightAt(a,b+GRID_STEP)-heightAt(a,b-GRID_STEP))/(2*GRID_STEP),length=Math.hypot(dx,1,dz);
    normals.push(packSlope(-dx/length,-dz/length));
  }
  const blocks=blockSets.get(i+','+j)??[];blockTotal+=blocks.length/BLOCK_STRIDE;
  const data={...tile,blocks,heights,palette,normals};
  const buffer=encodeTile(data),packed=gzipSync(Buffer.from(buffer),{level:9});
  const collision=encodeTile(data,false);
  await Promise.all([writeFile(out+i+'-'+j+'.bin',packed),writeFile(out+'physics/'+i+'-'+j+'.bin',Buffer.from(collision))]);
  total+=packed.byteLength;rawTotal+=buffer.byteLength;physicsTotal+=collision.byteLength;
  instances+=kinds.reduce((n,k)=>n+tile[k].length/16,0);
}
await writeMissionSight(world,out);
await writeFile(out+'tower-assembly.json',serializeArchitecture(world.towerAssembly));
await writeFile(new URL('../dist/mission-data.js',import.meta.url),
  'export const missionData='+serializeArchitecture({padFloor:world.padFloor,books:world.books,cars:world.parkedCars,haunts:world.haunts})+';\n');
await writeFixtureFootprints(world.footprints);
await writeFile(out+'architecture.json',serializeArchitecture({towers:[],skyline:Object.fromEntries(kinds.map(kind=>[kind,[]])),pedestrians:world.pedestrians}));
const stats={version:WORLD_VERSION,width:limits.east-limits.west,depth:limits.south-limits.north,tiles:TILE_COLS*TILE_ROWS,
  buildings:0,shops:0,roads:world.routes.length,roadMeters:world.meters,instances,tileBytes:total,rawTileBytes:rawTotal,
  physicsTileBytes:physicsTotal,propColliders:blockTotal,pedestrianPointsMoved:nudged,
  books:world.books.length,haunts:world.haunts.length/3,pedestrians:world.pedestrians.length,
  roadSurfaces:Object.fromEntries([...new Set(world.routes.map(r=>r.surface.kind))].map(kind=>[kind,world.routes.filter(r=>r.surface.kind===kind).length])),
  metroMeters:Math.round(railwayMeters),metroStations:stations.length,tunnels:roadTunnels.map(({id,length})=>({id,length}))};
await writeFile(out+'stats.json',serializeArchitecture(stats));
console.log(stats);
