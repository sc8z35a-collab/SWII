import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {cities,build} from '../dist/world.js';
import {normalize,vectorCross} from '../dist/engine.js';
import {limits,districts,districtAt,toGlobal,toLocal,GRID_STEP,TILE_SIZE,TILE_COLS,TILE_ROWS,WORLD_VERSION,toTile,tileOrigin,hasTile,rawHeight,surfaceAt,liquidAt,waterLevel,flatLandmarks,rioShore} from '../dist/geography.js';
import {cells,meshKinds as kinds,encodeTile} from '../dist/tiles.js';
import {blockLanes,makeRoutes,makeRoadIndex,roadStyle} from './layout.mjs';
import {facadeBuilder} from './streets.mjs';
import {addedStreetStyles,denseTowerPlans,fitHeight,streetStyle,streetStyleCount,towerPlans} from './architecture.mjs';
import {buildTower,towerForms} from './towers.mjs';
import {createDraper} from './drape.mjs';
import {connectStreets} from './road-links.mjs';
import {packSlope} from '../dist/surfaces.js';
import {makePedestrians} from './pedestrians.mjs';
import {capPoints,makeRoadMask,roadPoint} from './road-surfaces.mjs';
import {terrainCuts} from './terrain-edges.mjs';
import {recordFixtures,writeFixtureFootprints} from './fixture-footprints.mjs';
import {buildingSite} from './building-sites.mjs';
import {apartmentPlans,facilityPlans,neighborhoodSize} from './neighborhood-plans.mjs';
import {buildApartment,buildFacility} from './neighborhood-buildings.mjs';
import {buildingLook,lookCounts} from './building-looks.mjs';
import {buildParkingLot,buildRoadTunnels,buildTransitSites,buildWorksite,infrastructureRoads,protectedSite} from './infrastructure.mjs';
import {buildPark,parkPlans,parksByCity} from './parks.mjs';
import {railwayMeters,stations} from '../dist/metro.js';
import {roadTunnels} from '../dist/road-tunnels.js';
import {assemblyBounds,atPad,launchSite} from '../dist/mission-layout.js';
import {placeHaunts,placeMissionBooks,writeMissionSight} from './mission-bake.mjs';
const colors=new Map();
const model=()=>Object.fromEntries(['solids','decks','platforms','roads',...kinds].map(name=>[name,[]]));
const color=c=>{
  if(!colors.has(c))colors.set(c,[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255));
  return colors.get(c);
};
const heights={tokyo:[8,47],paris:[11,21],newyork:[13,72],cairo:[5,15],sydney:[8,34],rio:[6,26]};
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
  const chunks=new Map(),hit=new Map(),accesses=new Map();
  const skyline=Object.fromEntries(kinds.map(name=>[name,[]])),towers=[],streetBuildings=[],styles=new Set(),heightBands=new Set();
  const towerAssembly=Object.fromEntries(kinds.map(name=>[name,[]])),parkedCars=[];
  const padFloor=heightAt(launchSite.x,launchSite.z)+.087;
  const appearances=new Set();
  const renovations=new Set();
  const recipes=new Set(),damageUse=new Array(lookCounts.damageKinds).fill(0);
  function appearance(...args){
    const look=buildingLook(...args);
    appearances.add(look.key+'/'+look.tone);
    renovations.add(look.renovation.id);
    if(look.wear>0){
      recipes.add(look.recipe.join('')+look.wear);
      for(const [kind,level] of look.recipe.entries())if(level>1)damageUse[kind]++;
    }
    return look;
  }
  let seed=46212719,buildings=0,accessMeters=0,linkedBuildings=0;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*rnd(),pick=a=>a[Math.floor(rnd()*a.length)];
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
  const skyShape=(...args)=>instance(skyline,...args);
  const box=(...args)=>shape('box',...args);
  const platform=(...args)=>rectangle('platforms',...args);
  const propSolids=[];
  function solidProp(x,z,w,d,angle=0){
    rectangle('solids',x,z,w,d,angle);
    propSolids.push([x,z,w,d,angle]);
  }
  function foundation(x,z,w,d,angle,top,paint,embed=.07){
    const c=Math.cos(angle),s=Math.sin(angle);
    const rim=[[-w*.5,d*.5],[w*.5,d*.5],[w*.5,-d*.5],[-w*.5,-d*.5]].map(([a,b])=>[x+a*c+b*s,z-a*s+b*c]);
    for(let side=0;side<4;side++){
      const a=rim[side],b=rim[(side+1)%4],cuts=terrainCuts(a,b);
      const point=t=>{
        const px=a[0]+(b[0]-a[0])*t,pz=a[1]+(b[1]-a[1])*t;
        return [px,Math.min(top,heightAt(px,pz)-embed),pz];
      };
      let from=point(0);
      for(const cut of cuts.slice(1)){
        const to=point(cut),u=[from[0],top,from[2]],v=[to[0],top,to[2]];
        triangle(from,to,v,paint,18);triangle(from,v,u,paint,18);
        from=to;
      }
    }
  }
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
  function crossesFootprint(x,z,w,d,angle,index=hit){
    const p=footprint(x,z,w,d,angle,.19);
    return footprintCells(p,key=>(index.get(key)??[]).some(o=>{
      const dx=p.x-o.x,dz=p.z-o.z;
      const parallel=Math.abs(p.c*o.c+p.s*o.s),across=Math.abs(p.c*o.s-p.s*o.c);
      return Math.abs(dx*p.c-dz*p.s)<p.w+parallel*o.w+across*o.d&&
        Math.abs(dx*p.s+dz*p.c)<p.d+across*o.w+parallel*o.d&&
        Math.abs(dx*o.c-dz*o.s)<o.w+parallel*p.w+across*p.d&&
        Math.abs(dx*o.s+dz*o.c)<o.d+across*p.w+parallel*p.d;
    }));
  }
  function blocked(x,z,index=hit){
    return (index.get(boxKey(x,z))??[]).some(o=>{
      const a=x-o.x,b=z-o.z;
      return Math.abs(a*o.c-b*o.s)<o.w&&Math.abs(a*o.s+b*o.c)<o.d;
    });
  }
  const clearStreetFurniture=(x,z)=>!protectedSite(x,z,1.6)&&!blocked(x,z)&&!blocked(x,z,accesses);
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
  function bridgeRail(a,b,offset,stone){
    const first=[a[0],bridgeHeight(...a)+offset,a[1]],last=[b[0],bridgeHeight(...b)+offset,b[1]];
    const delta=last.map((value,i)=>value-first[i]);
    const forward=normalize(delta),across=normalize(vectorCross(forward,[0,1,0]));
    const up=vectorCross(across,forward),center=first.map((value,i)=>(value+last[i])*.5);
    const length=Math.hypot(...delta),angle=Math.atan2(a[1]-b[1],b[0]-a[0]);
    if(length<.05)return;
    const basis=[forward,up,across];
    box(...center,length+.04,stone?.72:.10,stone?.31:.15,stone?'b9ab98':'637477',18,angle,basis);
    if(!stone){
      box(a[0],first[1]-.42,a[1],.15,.90,.15,'728184',18,angle);
      box(center[0],center[1]-.44,center[2],length+.04,.064,.075,'718186',18,angle,basis);
    }
    solidProp(center[0],center[2],dist(a,b)+.08,stone?.31:.15,angle);
  }
  const streets=facadeBuilder({shape,box,drape,foundation,heightAt,solidProp,platform,roadMask,pick,rnd,appearance,
    parkedCar(x,y,z,yaw,paint){
      if(!atPad(x,z,4)&&!parkedCars.some(car=>Math.hypot(car.x-x,car.z-z)<3.8))
        parkedCars.push({id:parkedCars.length,x,y,z,yaw,paint});
    }});
  buildRoadTunnels({shape,triangle,heightAt});
  buildTransitSites({shape,drape,collision,heightAt},streets);
  function adapt(world,id){
    const district=districts[id];
    for(const kind of kinds){
      const list=world[kind]??[];
      for(let i=0;i<list.length;i+=16){
        const item=list.slice(i,i+16),[x,z]=toGlobal(id,item[0],item[2]);
        const fixed=i<(world.fixed?.[kind]??0);
        const anchor=world.anchors[kind]?.get(i),ax=anchor?.x??item[0],az=anchor?.z??item[2];
        if(anchor?.roadside&&roadMask.contains(...toGlobal(id,ax,az)))continue;
        const pad=flatLandmarks[id].find(([a,b,r])=>Math.hypot(ax-a,az-b)<=r+1.5);
        const base=heightAt(...toGlobal(id,pad?.[0]??ax,pad?.[1]??az));
        const onQuay=world.safe.some(([west,north,east,south])=>ax>=west&&ax<=east&&az>=north&&az<=south);
        item[0]=x;item[2]=z;item[1]+=fixed?0:onQuay?Math.max(base,.09):base;
        for(const k of [3,5,6,8,9,11])item[k]*=district.turn;
        const moving=world.lift[kind];
        if(moving&&i>=moving[0]&&i<moving[1])towerAssembly[kind].push(...item);
        else if(!atPad(x,z)||id!=='tokyo')getChunk(x,z)[kind].push(...item);
      }
    }
    const rect=([x1,z1,x2,z2])=>{
      const [x,z]=toGlobal(id,(x1+x2)*.5,(z1+z2)*.5);
      return [x,z,x2-x1,z2-z1];
    };
    for(const item of world.obstacles)collision(...rect(item));
    for(const item of world.safe){
      const quay=rect(item);
      rectangle('decks',...quay);
      foundation(...quay,0,.09,'99978d');
    }
    for(const item of world.water)collision(...rect(item));
    for(const [x,z,w,d,yaw] of world.furniture){
      const point=toGlobal(id,x,z);
      if(!atPad(...point))solidProp(...point,w,d,yaw);
    }
    for(const vehicle of world.vehicles){
      const [x,z]=toGlobal(id,vehicle.x,vehicle.z);
      streets.car(x,z,vehicle.angle+(district.turn<0?Math.PI:0),vehicle.paint);
    }
    for(const [localX,localZ,width,depth] of world.markings){
      const [x,z]=toGlobal(id,localX,localZ);
      const [a,b,c,d]=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[x+u*width/2,0,z+v*depth/2]);
      drape(a,b,c,'ddd9d1',0,.169,'road');
      drape(a,c,d,'ddd9d1',0,.169,'road');
    }
  }
  for(const city of cities)adapt(build(city),city.id);
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
          const first=roadPoint(a,side*(edge-.12)),last=roadPoint(b,side*(edge-.12));
          for(const [from,to] of roadMask.exposed(first,last,route)){
            bridgeRail(at(first,last,from),at(first,last,to),route.id==='paris'?.55:1.06,route.id==='paris');
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
    for(let i=8;i<edge.length-7;i+=8){
      const e=edge[i],x=e.x+e.nx*2.9,z=e.z+e.nz*2.9,angle=Math.atan2(-e.uz,e.ux);
      if(inWater(x,z)||roadMask.contains(x,z))continue;
      streets.light(x,z,angle,-1,'rio');
      const px=e.x-e.nx*2.94,pz=e.z-e.nz*2.94;
      if(i%16===8&&!inWater(px,pz)&&!roadMask.contains(px,pz))streets.planter(px,pz,angle,'rio');
    }
  }
  function tree(x,z,s=1,palm=false,y=heightAt(x,z)){
    const leaf=pick(['69845b','5c7d54','65875f','597452','779063']);
    shape('tube',x,y+s*1.5,z,s*.31,s*3,s*.31,'74654e');
    shape('ball',x,y+s*3.32,z,s*(palm?3.6:2.8),s*(palm?.89:2.66),s*(palm?3.3:2.7),leaf,6);
    if(!palm){
      shape('ball',x+s*.57,y+s*3.04,z+s*.48,s*2.3,s*1.9,s*2.45,leaf,6);
      shape('ball',x-s*.6,y+s*3.36,z-s*.48,s*2.27,s*2.1,s*1.93,leaf,6);
    }
  }
  const neighborhoods=new Map(),packing=38;
  function reservePlot(x,z,r){
    const key=Math.floor(x/packing)+','+Math.floor(z/packing);
    if(!neighborhoods.has(key))neighborhoods.set(key,[]);
    neighborhoods.get(key).push([x,z,r]);
  }
  const cityLandmarks=new Map(cities.map(city=>[city.id,city.spots]));
  const backLots=[];
  function lotGrade(id,x,z,w,d,angle,margin,maxGrade){
    const [lx,lz]=toLocal(id,x,z);
    if(protectedSite(x,z,1)||occupied(id,lx,lz,Math.min(w,d)*.41)||id==='rio'&&lx>rioShore(lz)-20)return null;
    const landmarkClearance=8.4+Math.hypot(w,d)*.5;
    if(cityLandmarks.get(id).some(spot=>Math.hypot(spot[3]-lx,spot[4]-lz)<landmarkClearance))return null;
    if(crossesFootprint(x,z,w+.24,d+.24,angle)||crossesFootprint(x,z,w,d,angle,accesses))return null;
    const c=Math.cos(angle),s=Math.sin(angle);
    const nx=Math.ceil(w/4),nz=Math.ceil(d/4);
    let lo=Infinity,hi=-Infinity;
    for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
      const a=w*(i/nx-.5),b=d*(j/nz-.5),px=x+a*c+b*s,pz=z-a*s+b*c;
      if(px<limits.west+2||px>limits.east-2||pz<limits.north+2||pz>limits.south-2)return null;
      const y=heightAt(px,pz);
      if(liquidAt(px,pz,y)||protectedSite(px,pz,1)||nearestRoad(px,pz,3)<margin)return null;
      if(id==='rio'){
        const [bx,bz]=toLocal('rio',px,pz);
        if(bx>rioShore(bz)-17.8)return null;
      }
      lo=Math.min(lo,y);hi=Math.max(hi,y);
      if(hi-lo>maxGrade)return null;
    }
    return {lo,hi};
  }
  function cutsRoad(x,z,w,d,angle){
    const c=Math.cos(angle),s=Math.sin(angle);
    const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>
      [x+a*w*.5*c+b*d*.5*s,z-a*w*.5*s+b*d*.5*c]);
    return roadMask.clip(corners,true).length!==0;
  }

  // Fit dedicated lots to actual street tangents before filling the blocks around them.
  const streetEdges=routes.filter(route=>!route.portal).flatMap(route=>edgesByRoute.get(route).slice(1,-1)
    .map(edge=>({...edge,width:route.width,route})));
  const streetsByCity=new Map(cities.map(city=>[city.id,streetEdges.filter(e=>
    Math.hypot(...toLocal(city.id,e.x,e.z))<1230&&districtAt(e.x,e.z)===city.id)]));
  const geometry={shape,skyShape,triangle,foundation,platform,collision,heightAt,appearance};
  function fitFrontage(id,lx,lz,size,{tower=false,margin=0,access=2.45,scales=tower?[1,.91,.82]:[1]}={}){
    const [tx,tz]=toGlobal(id,lx,lz);
    const targetDistance=edge=>Math.hypot(edge.x-tx,edge.z-tz);
    const nearby=streetsByCity.get(id).filter(edge=>targetDistance(edge)<(tower?560:440))
      .sort((a,b)=>targetDistance(a)-targetDistance(b));
    let best=null,bestScore=Infinity;
    for(const scale of scales){
      const width=size.width*scale,depth=size.depth*scale,site=buildingSite(width,depth,size.height);
      site.plotWidth+=margin*.64;
      site.plotDepth+=margin*2;
      const halfDepth=site.foundationDepth*.5;
      const walk=Math.max(tower?5.9:3.65,(site.plotDepth-site.foundationDepth)*.5+.65);
      for(const e of nearby){
        const setback=e.width*.5+halfDepth+walk+1.78;
        if(targetDistance(e)>bestScore+setback)break;
        for(const side of [-1,1]){
          const front=-side,angle=Math.atan2(-e.uz,e.ux);
          const x=e.x+e.nx*side*setback,z=e.z+e.nz*side*setback;
          const distance=Math.hypot(x-tx,z-tz);
          if(distance>=bestScore||districtAt(x,z)!==id)continue;
          const ax=x+e.nx*front*(halfDepth+walk),az=z+e.nz*front*(halfDepth+walk);
          const curb=heightAt(ax,az)+.205;
          const rx=ax+e.nx*side*walk*.5,rz=az+e.nz*side*walk*.5;
          if(inWater(ax,az)||crossesFootprint(rx,rz,access+.19,walk+1.20,angle))continue;
          const grade=lotGrade(id,x,z,site.plotWidth,site.plotDepth,angle,1.18,tower?5.3:3.7);
          if(!grade)continue;
          const level=grade.hi+.14,rise=Math.abs(level-curb),score=distance+rise*9;
          if(score>=bestScore||rise>walk*.30||cutsRoad(rx,rz,access,walk,angle)||
            cutsRoad(x,z,site.plotWidth,site.plotDepth,angle))continue;
          bestScore=score;
          best={...size,id,x,z,width,depth,angle,front,site,level,curb,walk,access,ramp:[rx,rz],
            path:[ax,az],road:[e.x+e.nx*side*(e.width*.5-.22),e.z+e.nz*side*(e.width*.5-.22)],route:e.route};
        }
      }
      if(best)break;
    }
    return best;
  }
  function reserveFrontage(plot,name){
    const {x,z,angle,site,access,walk,ramp,height,path,road,route}=plot;
    reserveFootprint(x,z,site.plotWidth,site.plotDepth,angle);
    reserveFootprint(...ramp,access+.18,walk+1.20,angle);
    reservePlot(x,z,Math.max(site.plotWidth,site.plotDepth)*.56);
    const gap=dist(path,road);
    buildAccess({origin:path,end:road,gap,mid:at(path,road,.5),yaw:Math.atan2(path[1]-road[1],road[0]-path[0]),
      width:access,route});
    styles.add(name);heightBands.add(Number(height.toFixed(2)));buildings++;linkedBuildings++;
  }
  for(const [id,plans] of Object.entries(towerPlans))for(const [lx,lz,height,width,depth,name] of plans){
    const plot=fitFrontage(id,lx,lz,{width:width*1.24,depth:depth*1.22,height:Math.round(height*1.19)},
      {tower:true,access:5.59,scales:[1,.95,.90,.84,.78]});
    if(!plot)throw Error('No buildable tower lot for '+id+' '+name);
    reserveFrontage(plot,name);
    towers.push(buildTower({...plot,name},geometry));
  }
  let denseTowers=0;
  for(const [id,plans] of Object.entries(denseTowerPlans))for(const [lx,lz,height,width,depth,name] of plans){
    const plot=fitFrontage(id,lx,lz,{width:width*1.24,depth:depth*1.22,height:Math.round(height*1.19)},
      {tower:true,access:5.59,scales:[1,.95,.90,.84,.78,.72]});
    if(!plot){console.warn('No lot for the additional '+name+' tower in '+id);continue;}
    reserveFrontage(plot,name);
    towers.push(buildTower({...plot,name},geometry));
    denseTowers++;
  }
  const civicSites=[];
  for(const [i,city] of cities.entries()){
    const side=city.id==='rio'?-1:1;
    const [first,second]=parksByCity[city.id];
    const entries=[
      ['construction',side*285,214,41+i*1.7,35+i,186+17*i,6.8],
      ['parking',side*145,206,29,21,4,6.1],
      ['park',-side*183,257,...parkPlans[first].size,4,3.2,first],
      ['park',side*305,296,...parkPlans[second].size,4,3.2,second],
      ['parking',-side*245,373,36,24,4,6.1]
    ];
    for(const [type,lx,lz,width,depth,height,access,style] of entries){
      const options={tower:type==='construction',access,margin:1.15};
      if(type==='park')options.scales=[1,.94,.88];
      const plot=fitFrontage(city.id,lx,lz,{width,depth,height},options);
      if(!plot)throw Error('No buildable '+type+' lot in '+city.id);
      reserveFrontage(plot,type);
      const feature=type==='park'?buildPark(plot,style,geometry):{
        approach:type==='construction'?buildWorksite(plot,geometry):buildParkingLot(plot,geometry,streets)};
      civicSites.push({city:city.id,type,x:plot.x,z:plot.z,height,width:plot.width,depth:plot.depth,...feature});
    }
  }
  function districtBuilding(city,plan,index,radius,angle,type){
    const [sx,sz]=city.spawn,size=neighborhoodSize(plan,index);
    if(city.id==='rio'&&Math.cos(angle)>0)angle=Math.PI-angle;
    const lx=sx+Math.cos(angle)*radius,lz=sz+Math.sin(angle)*radius;
    const access=type==='facility'?Math.min(3.9,size.width*.62):2.45;
    const options={margin:type==='facility'?1.42:1.28,access,scales:[1,.95,.90,.85]};
    const plot=fitFrontage(city.id,lx,lz,size,options)??fitFrontage(city.id,sx,sz,size,options);
    if(!plot)throw Error('No buildable street lot for '+city.id+' '+plan.id);
    reserveFrontage(plot,plan.id);
    const {x,z,width,depth,height,floors,angle:yaw,front,site,level}=plot;
    const [material,paint]=type==='apartment'?plan.finish:[18,plan.paint];
    const look=appearance(city.id,x,z,height,material,paint);
    const decorated={...plot,look};
    const features=type==='apartment'?buildApartment(decorated,plan,geometry):
      {approach:buildFacility(decorated,plan,geometry)};
    streetBuildings.push({city:city.id,type,style:plan.id,x,z,width,depth,height,floors,angle:yaw,front,
      site,level,...features,year:look.year,wear:look.wear,renovation:look.renovation.id});
  }
  for(const [cityIndex,city] of cities.entries()){
    for(const [index,plan] of facilityPlans.entries())
      districtBuilding(city,plan,index+cityIndex*13,28+index*23,index*2.399+cityIndex*.51,'facility');
    for(const [ring,radius] of [62,133,223,325,442,570].entries())
      for(const [index,plan] of apartmentPlans[city.id].entries())
        districtBuilding(city,plan,ring+index*7,radius,index*1.257+ring*.776+cityIndex*.41,'apartment');
  }
  let squares=0;
  // Pocket squares occupy small gaps, with clear access kept beside the road.
  for(const city of cities){
    let count=0;
    for(let i=7;i<streetEdges.length&&count<3;i+=9){
      const e=streetEdges[i];
      if(districtAt(e.x,e.z)!==city.id||Math.hypot(...toLocal(city.id,e.x,e.z))>330)continue;
      const side=count%2?-1:1,setback=e.width*.5+9.3;
      const x=e.x+e.nx*side*setback,z=e.z+e.nz*side*setback,angle=Math.atan2(-e.uz,e.ux);
      const grade=lotGrade(city.id,x,z,10.2,8.7,angle,.94,1.28);
      if(!grade)continue;
      reserveFootprint(x,z,10.3,8.8,angle);
      reservePlot(x,z,8.3);
      const c=Math.cos(angle),s=Math.sin(angle);
      const point=(a,b)=>[x+a*c+b*s,0,z-a*s+b*c];
      const [a,b,c1,d]=[point(-5.1,-4.35),point(5.1,-4.35),point(5.1,4.35),point(-5.1,4.35)];
      drape(a,b,c1,'b3b3a5',1,.19);drape(a,c1,d,'b3b3a5',1,.19);
      for(const side of [-1,1]){
        const [tx,,tz]=point(side*3.4,-1.75);
        tree(tx,tz,.87,city.id==='rio'||city.id==='cairo');
        const [bx,,bz]=point(side*2.7,2.32);
        const by=heightAt(bx,bz)+.19;
        box(bx,by+.49,bz,2.13,.14,.62,'7c6a54',24,angle);
        box(bx+Math.sin(angle)*.27,by+.88,bz+Math.cos(angle)*.27,2.13,.67,.09,'7c6a54',24,angle);
        for(const edge of [-1,1])box(bx+Math.cos(angle)*edge*.80,by+.25,bz-Math.sin(angle)*edge*.80,.12,.50,.57,'43524d',0,angle);
      }
      streets.light(x,z,angle,1,city.id);
      count++;squares++;
    }
  }
  function planAccess(x,z,w,d,angle,front){
    const c=Math.cos(angle),s=Math.sin(angle);
    const place=(a,b)=>[x+a*c+b*s,z-a*s+b*c];
    for(const side of [front,-front])for(const along of [0,-.23,.23]){
      const origin=place(w*along,side*(d*.5+.23));
      for(const {point,route} of nearestRoad.find(...origin,36).slice(0,9)){
        const length=dist(origin,point);
        if(length<=route.width*.5||length>41)continue;
        if(((point[0]-origin[0])*s+(point[1]-origin[1])*c)*side<length*.24)continue;
        const end=at(origin,point,1-(route.width*.5-.23)/length),gap=dist(origin,end),mid=at(origin,end,.5);
        const yaw=Math.atan2(origin[1]-end[1],end[0]-origin[0]),width=Math.min(2.05,w*.30);
        if(crossesFootprint(...mid,gap,width,yaw))continue;
        const steps=Math.max(1,Math.ceil(gap/2)),level=heightAt(...origin);
        let prior=level,valid=true;
        for(let i=1;i<=steps;i++){
          const p=at(origin,end,i/steps),y=heightAt(...p);
          if(protectedSite(...p)||liquidAt(...p,y)||Math.abs(y-prior)>Math.max(.38,gap/steps*.54)){valid=false;break;}
          prior=y;
        }
        if(valid)return {origin,end,gap,mid,yaw,width,side,route};
      }
    }
    return null;
  }
  function buildAccess({origin,end,gap,mid,yaw,width,route}){
    reserveFootprint(...mid,gap,width,yaw,.07,accesses);
    accessMeters+=gap;
    if(gap<.92)return;
    const left=[Math.sin(yaw)*width*.5,Math.cos(yaw)*width*.5];
    const pair=([x,z])=>[flat([x-left[0],z-left[1]]),flat([x+left[0],z+left[1]])];
    const [a,b]=pair(origin),[c,d]=pair(end),{kind}=route.surface;
    const paint=kind==='sand'?'c5ae8a':kind==='gravel'?'a9a499':'aba89c',mat=kind==='sand'?36:kind==='gravel'?35:1;
    drape(a,c,b,paint,mat,.207,'outside');drape(b,c,d,paint,mat,.207,'outside');
  }
  function addLot(id,x,z,w,d,h,angle,front,rich,coast,retail,modern=false){
    if(blocked(x,z)||inWater(x,z))return false;
    const frontage=w>=8.5&&d>=7.5;
    w*=modern?1.23:frontage?1.16:1.09;
    d*=modern?1.21:frontage?1.15:1.08;
    h=fitHeight(h*1.22);
    let site=buildingSite(w,d,h);
    let grade=lotGrade(id,x,z,site.plotWidth,site.plotDepth,angle,.74,6.7);
    if(!grade&&h>21){
      h=fitHeight(Math.min(21,h*.69));
      site=buildingSite(w,d,h);
      grade=lotGrade(id,x,z,site.plotWidth,site.plotDepth,angle,.74,6.7);
    }
    if(!grade&&Math.min(w,d)>6.6){
      w*=.84;d*=.87;
      site=buildingSite(w,d,h);
      grade=lotGrade(id,x,z,site.plotWidth,site.plotDepth,angle,.74,6.7);
    }
    if(!grade)return false;
    const plinth=site.foundationWidth>w+.42;
    if(plinth&&cutsRoad(x,z,site.plotWidth,site.plotDepth,angle))return false;
    const access=planAccess(x,z,w,d,angle,front);
    if(!access)return false;
    front=access.side;
    buildAccess(access);
    const style=streetStyle(id,h,x,z,modern);
    streets.building({id,x,z,w,d,h,angle,front,rich,coast,retail,ground:grade.lo-.28,
      level:plinth?grade.hi+.13:undefined,site,style});
    styles.add(style.name);heightBands.add(h);
    if(plinth)reserveFootprint(x,z,site.plotWidth,site.plotDepth,angle);
    reservePlot(x,z,Math.max(site.plotWidth,site.plotDepth)*.43);
    buildings++;linkedBuildings++;collision(x,z,w+.18,d+.18,angle);
    return true;
  }
  const capitals=new Set(['tokyo','paris','cairo']);
  const isModernCore=(id,x,z)=>id==='tokyo'||id==='paris'&&(x>78||Math.hypot(x,z)>240)||id==='cairo'&&x>52&&z>-45;
  let capitalBuildings=0;
  // Allocate larger commercial plots along the central avenues before smaller rear lots.
  for(let i=0;i<streetEdges.length;i+=3){
    const e=streetEdges[i],id=districtAt(e.x,e.z),[lx,lz]=toLocal(id,e.x,e.z),distance=Math.hypot(lx,lz);
    if(!capitals.has(id)||distance>510||!isModernCore(id,lx,lz))continue;
    for(const side of [-1,1]){
      const w=range(10.2,18.4),d=range(8.6,15.2),offset=e.width*.5+d*.60+3.0;
      const x=e.x+e.nx*side*offset,z=e.z+e.nz*side*offset,angle=Math.atan2(-e.uz,e.ux);
      const high=id==='tokyo'?94:id==='cairo'?72:61;
      const h=range(23.1,high)*(distance<270?1:.79);
      if(addLot(id,x,z,w,d,h,angle,-side,distance<340,false,true,true))capitalBuildings++;
    }
  }
  for(const route of [...routes].sort((a,b)=>Number(!!b.waterfront)-Number(!!a.waterfront))){
    if(route.portal)continue;
    const edges=edgesByRoute.get(route);
    for(const side of [-1,1]){
      let wait=0;
      for(let i=1;i<edges.length-1;i++){
        const e=edges[i];
        wait-=dist([edges[i-1].x,edges[i-1].z],[e.x,e.z]);
        if(wait>0)continue;
        const id=districtAt(e.x,e.z),d=range(6.15,13.8),w=route.waterfront?range(9.5,18.2):range(7.8,16.4);
        const angle=Math.atan2(-e.uz,e.ux)+range(-.082,.082),front=-side;
        const core=Math.hypot(...toLocal(id,e.x,e.z));
        const setback=route.width*.5+(core<430?range(2.45,3.6):range(2.1,4.3))+d*.585;
        const x=e.x+e.nx*side*setback,z=e.z+e.nz*side*setback;
        const [lx,lz]=toLocal(id,x,z),distance=Math.hypot(lx,lz);
        wait=w*1.06+range(core<500?.32:1.1,core<500?3.9:4.8);
        if(rnd()>(route.local?.98:distance<630?.96:route.arterial?.93:.90)||nearestRoad(x,z,23)<d*.51+1.12)continue;
        const [lo,hi]=heights[id],rich=distance<290;
        const coast=id==='rio'&&lx>0&&lx<rioShore(lz)-22&&Math.abs(lz)<176;
        let h=range(lo,hi)*(distance<210?1:distance<630?.80:distance<1100?.62:.49);
        if(coast)h=range(14.7,31.5);
        if(id==='rio'&&lx<-29)h=Math.min(h,range(6.1,16.3));
        if(id==='tokyo'&&lz>-47&&lz<74&&Math.abs(lx-(79-lz)*18/137)<10)h=Math.min(h,7+(79-lz)*.21);
        if(!addLot(id,x,z,w,d,h,angle,front,rich,coast,distance<510||route.arterial))continue;
        const layers=distance<460?2:1;
        for(let layer=1;layer<=layers;layer++){
          if(rnd()>(layer===1?(distance<720?.94:.78):.68))continue;
          const extra=(d+range(2.6,6.9))*layer;
          backLots.push({x:x+e.nx*side*extra+e.ux*range(-2.8,2.8),z:z+e.nz*side*extra+e.uz*range(-2.8,2.8),
            w:w*range(.68,1.10),d:d*range(.66,1.13),h:h*range(.55,.94),angle:angle+range(-.19,.19),front,rich});
        }
      }
    }
    for(let i=2;i<edges.length-2;i+=route.local?3:route.arterial?3:5){
      const e=edges[i],id=districtAt(e.x,e.z),distance=Math.hypot(...toLocal(id,e.x,e.z));
      const side=rnd()<.5?-1:1,half=route.width*.5,space=half+(distance<410?range(1.0,1.72):range(3.2,5.4));
      const x=e.x+side*e.nx*space,z=e.z+side*e.nz*space;
      if(inWater(x,z)||!clearStreetFurniture(x,z)||nearestRoad(x,z,6,route)<.75)continue;
      const angle=Math.atan2(-e.uz,e.ux);
      if(distance<395){
        streets.light(x,z,angle,-side,id);
        const x2=x+e.ux*3.0,z2=z+e.uz*3.0;
        if(clearStreetFurniture(x2,z2)&&nearestRoad(x2,z2,3,route)>1.2&&rnd()<.56)streets.planter(x2,z2,angle,id);
        if((route.local||route.arterial)&&route.width>7.1&&rnd()<.49){
          const px=e.x+side*e.nx*(half-1.04),pz=e.z+side*e.nz*(half-1.04);
          const safe=cityLandmarks.get(id).every(spot=>dist(toGlobal(id,spot[3],spot[4]),[px,pz])>8);
          if(safe&&!inWater(px,pz)&&clearStreetFurniture(px,pz)&&nearestRoad(px,pz,5,route)>2.8)streets.car(px,pz,angle);
        }
      }else if(id!=='cairo'||rnd()<.31)tree(x,z,range(.61,1.12),id==='rio'||id==='cairo');
    }
  }
  for(const lot of backLots){
    const id=districtAt(lot.x,lot.z);
    if(nearestRoad(lot.x,lot.z,24)<lot.d*.59+1.1)continue;
    addLot(id,lot.x,lot.z,lot.w,lot.d,lot.h,lot.angle,lot.front,lot.rich,false,false);
  }
  // Smaller buildings finish the interiors of irregular blocks behind the street fronts.
  let infill=0;
  for(let i=0;i<streetEdges.length;i+=3){
    const e=streetEdges[i],id=districtAt(e.x,e.z),distance=Math.hypot(...toLocal(id,e.x,e.z));
    if(distance>745)continue;
    const offsets=capitals.has(id)&&distance<470?[29,43,57,73,87]:[29,43,57,70];
    for(const side of [-1,1])for(const setback of offsets){
      const x=e.x+e.nx*side*(e.width*.5+setback),z=e.z+e.nz*side*(e.width*.5+setback);
      const angle=Math.atan2(-e.uz,e.ux)+range(-.08,.08),w=range(5.5,10.9),d=range(5.4,10.6);
      const [lx,lz]=toLocal(id,x,z),modern=capitals.has(id)&&isModernCore(id,lx,lz);
      const [low,high]=heights[id],h=modern?range(19.2,id==='tokyo'?72:52):range(low,Math.min(high,29))*(distance<270?1:.83);
      if(addLot(id,x,z,w,d,h,angle,-side,distance<300,false,false,modern)){
        infill++;
        if(modern)capitalBuildings++;
      }
    }
  }
  // Step smaller homes back from the steepest streets into the remaining hillside lots.
  for(let i=0;i<1600;i++){
    const lx=range(-117,13),lz=range(-53,131),[x,z]=toGlobal('rio',lx,lz);
    const roadGap=nearestRoad(x,z,26);
    if(roadGap<4.4||roadGap>24||occupied('rio',lx,lz,1.7))continue;
    const angle=-.37+.34*Math.sin(lz*.041)+range(-.12,.12);
    addLot('rio',x,z,range(4.7,7.3),range(4.9,7.4),range(4.35,8.3),angle,lx< -43?-1:1,true,false,false);
  }
  // Irregular frontage gaps that cannot fit a block still fit a narrow house or workshop.
  for(const route of routes){
    if(route.portal)continue;
    const edges=edgesByRoute.get(route);
    for(const side of [-1,1]){
      let since=0;
      for(let i=1;i<edges.length-1;i++){
        const e=edges[i],p=edges[i-1];
        since+=Math.hypot(e.x-p.x,e.z-p.z);
        if(since<8.1)continue;
        const id=districtAt(e.x,e.z),[lx,lz]=toLocal(id,e.x,e.z);
        const w=range(5.6,8.2),d=range(6.4,9.7),setback=route.width*.5+d*.55+2.23;
        const x=e.x+e.nx*side*setback,z=e.z+e.nz*side*setback;
        if(blocked(x,z)||blocked(x,z,accesses))continue;
        const angle=Math.atan2(-e.uz,e.ux),h=range(6.7,13.9);
        if(addLot(id,x,z,w,d,h,angle,-side,Math.hypot(lx,lz)<270,false,false))since=0;
      }
    }
  }
  for(let i=0;i<3300;i++){
    const x=range(limits.west+18,limits.east-18),z=range(limits.north+18,limits.south-18),id=districtAt(x,z);
    if(id==='cairo'&&rnd()<.9||inWater(x,z)||!clearStreetFurniture(x,z)||nearestRoad(x,z,10)<4||occupied(id,...toLocal(id,x,z),5))continue;
    tree(x,z,range(.65,1.45),id==='rio');
    if(rnd()<.32){
      const a=x+range(4,8),b=z+range(-5,5);
      if(!inWater(a,b)&&clearStreetFurniture(a,b)&&nearestRoad(a,b,10)>3)tree(a,b,range(.63,1.25));
    }
  }
  for(let group=0;group<740;group++){
    const centerX=range(limits.west+35,limits.east-35),centerZ=range(limits.north+33,limits.south-33);
    if(districtAt(centerX,centerZ)==='cairo'||inWater(centerX,centerZ))continue;
    for(let i=0;i<7;i++){
      const angle=range(0,Math.PI*2),spread=range(2,29);
      const x=centerX+Math.cos(angle)*spread,z=centerZ+Math.sin(angle)*spread,id=districtAt(x,z);
      if(!clearStreetFurniture(x,z)||inWater(x,z)||nearestRoad(x,z,10)<5||occupied(id,...toLocal(id,x,z),7))continue;
      const y=heightAt(x,z),s=range(.65,1.39);
      const leaf=pick(['668056','5e7c54','6e875d','6d885b','54764f']);
      shape('tube',x,y+s*1.17,z,s*.29,s*2.34,s*.29,'796650');
      shape('ball',x,y+s*2.8,z,s*3.0,s*2.7,s*2.85,leaf,6);
    }
  }
  for(let i=0;i<270;i++){
    const x=range(-205,-25),z=range(-224,92),[a,b]=toGlobal('rio',x,z);
    const y=heightAt(a,b);
    if(y<29||occupied('rio',x,z,2.5)||blocked(a,b)||nearestRoad(a,b,9)<5.2)continue;
    const scale=range(.68,1.57),leaf=pick(['547655','557c56','657d50','466c4f','698458']);
    shape('tube',a,y+scale*1.1,b,scale*.25,scale*2.2,scale*.25,'6c6249',.25);
    shape('ball',a,y+scale*2.3,b,scale*3.45,scale*2.6,scale*3.3,leaf,6);
    if(rnd()<.42)shape('ball',a+scale*.68,y+scale*2.1,b+scale*.67,scale*2.5,scale*2.1,scale*2.31,leaf,6.25);
  }
  const count=routes.reduce((sum,route)=>sum+route.points.slice(1).reduce((n,p,i)=>n+dist(p,route.points[i]),0),0);
  for(const prop of propSolids)reserveFootprint(...prop);
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
  const occupiedRoad=(x,z)=>blocksPedestrian(x,z)||parkedCars.some(c=>Math.hypot(c.x-x,c.z-z)<2.75);
  const books=placeMissionBooks(routes,heightAt,occupiedRoad);
  const haunts=placeHaunts(routes,heightAt,(x,z)=>inWater(x,z)||occupiedRoad(x,z)||
    parkedCars.some(c=>Math.hypot(c.x-x,c.z-z)<4.5)||books.some(b=>Math.hypot(b.x-x,b.z-z)<3));
  function terrainPaint(x,z,height){
    const natural=surfaceAt(x,z,height);
    if(natural.water||waterLevel(x,z)!==undefined&&height<1.75)return natural;
    const id=districtAt(x,z),distance=Math.hypot(...toLocal(id,x,z));
    if(distance>=730)return natural;
    const ix=Math.floor(x/packing),iz=Math.floor(z/packing),radius=distance<310?22:15;
    let cover=0;
    for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)
      for(const [a,b,r] of neighborhoods.get(i+','+j)??[])
        cover=Math.max(cover,clamp((r+radius-Math.hypot(a-x,b-z))/radius,0,1));
    if(!cover)return natural;
    cover=cover*cover*(3-2*cover);
    const value=Math.round(3*Math.sin(x*.078+z*.032)+4*Math.sin(z*.085));
    const tone=id==='cairo'?[180,157,124]:id==='rio'?[163,155,131]:[151,149,134];
    return {color:tone.map((n,i)=>Math.round((n+value)*cover+parseInt(natural.color.slice(i*2,i*2+2),16)*(1-cover)).toString(16).padStart(2,'0')).join(''),water:null};
  }
  return {tile,routes,buildings,terrainPaint,meters:Math.round(count),towers,streetBuildings,skyline,styles,appearances,renovations,heightBands,
    civicSites,linkedBuildings,accessMeters:Math.round(accessMeters),lanes:lanes.length,
    repairs:repairs.length,infill,squares,pedestrians,capitalBuildings,footprints,towerAssembly,parkedCars,books,padFloor,
    haunts,denseTowers,recipes,damageUse};
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
for(let j=0;j<TILE_ROWS;j++)for(let i=0;i<TILE_COLS;i++){
  const tile=world.tile(i,j),[x,z]=tileOrigin(i,j),heights=[],palette=[],normals=[];
  for(let n=0;n<=cells;n++)for(let m=0;m<=cells;m++)heights.push(elevation[(j*cells+n)*(cols+1)+i*cells+m]);
  for(let n=0;n<=cells;n++)for(let m=0;m<=cells;m++){
    const a=x+m*GRID_STEP,b=z+n*GRID_STEP;
    palette.push(packColor(world.terrainPaint(a,b,heightAt(a,b)).color));
    const dx=(heightAt(a+GRID_STEP,b)-heightAt(a-GRID_STEP,b))/(2*GRID_STEP);
    const dz=(heightAt(a,b+GRID_STEP)-heightAt(a,b-GRID_STEP))/(2*GRID_STEP),length=Math.hypot(dx,1,dz);
    normals.push(packSlope(-dx/length,-dz/length));
  }
  const data={...tile,heights,palette,normals};
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
await writeFile(out+'architecture.json',serializeArchitecture({towers:world.towers,skyline:world.skyline,pedestrians:world.pedestrians}));
const parks=world.civicSites.filter(site=>site.type==='park');
const parkLocations=parks.map(({style,city,name,approach,yaw})=>({
  id:'park-'+city+'-'+style,name:cities.find(entry=>entry.id===city).name+' · '+name,point:approach,yaw
}));
await writeFile(new URL('../dist/park-locations.js',import.meta.url),
  'export const parkLocations='+serializeArchitecture(parkLocations)+';\n');
const stats={version:WORLD_VERSION,width:limits.east-limits.west,depth:limits.south-limits.north,tiles:TILE_COLS*TILE_ROWS,
  buildings:world.buildings,roads:world.routes.length,roadMeters:world.meters,instances,tileBytes:total,rawTileBytes:rawTotal,physicsTileBytes:physicsTotal,
  buildingStyles:world.styles.size,appearanceVariants:world.appearances.size,renovationStyles:[...world.renovations].sort(),
  streetStyles:streetStyleCount,addedStreetStyles,towerForms:towerForms.length,addedTowers:world.denseTowers,
  books:world.books.length,haunts:world.haunts.length/3,
  // Appearance: era × pigment × wear × window pattern × renovation × damage class, before the
  // building type and height are counted. Every wall also places its damage differently.
  damageKinds:lookCounts.damageKinds,damageRecipes:world.recipes.size,damageUse:world.damageUse,
  appearanceCombinations:lookCounts.eras*lookCounts.pigments*lookCounts.wear*lookCounts.windows*10*lookCounts.damageClasses,
  buildingCombinations:lookCounts.eras*lookCounts.pigments*lookCounts.wear*lookCounts.windows*10*lookCounts.damageClasses*
    (world.styles.size)*world.heightBands.size,
  parkTypes:[...new Set(parks.map(park=>park.style))].sort(),
  heightBands:[...world.heightBands].sort((a,b)=>a-b),lobbies:world.towers.length,
  roadConnections:world.repairs,infill:world.infill,squares:world.squares,pedestrians:world.pedestrians.length,capitalBuildings:world.capitalBuildings,
  roadSurfaces:Object.fromEntries([...new Set(world.routes.map(r=>r.surface.kind))].map(kind=>[kind,world.routes.filter(r=>r.surface.kind===kind).length])),
  linkedBuildings:world.linkedBuildings,accessMeters:world.accessMeters,blockLanes:world.lanes,civicSites:world.civicSites,
  metroMeters:Math.round(railwayMeters),metroStations:stations.length,tunnels:roadTunnels.map(({id,length})=>({id,length}))};
await writeFile(out+'stats.json',serializeArchitecture({...stats,streetBuildings:world.streetBuildings}));
console.log({...stats,civicSites:world.civicSites.length});
