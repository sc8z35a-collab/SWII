import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {cities,build,TOKYO_TOWER_SCALE} from '../dist/world.js';
import {limits,TILE_COLS,TILE_ROWS,WORLD_VERSION,hasTile,liquidAt,tileOrigin,toGlobal,toTile,waterLevel} from '../dist/geography.js';
import {decodeTile,meshKinds,overlaps,platformHeight,sampleHeight,terrainWater,tilesAround} from '../dist/tiles.js';
import {RUN_SPEED,discoverable,frameInputs,idleDrive,keepCameraOutOfWalls,landmarks,readInputs,simulate,spawn,stepMotion,terrainSampler} from '../dist/physics.js';
import {createMission} from '../dist/mission.js';
import {makeRoutes} from '../tools/layout.mjs';
import {pedestrianPose,peopleMeshes} from '../dist/people.js';
import {ASPHALT,PAVING} from '../dist/surfaces.js';
import {prepareVisualTile} from '../dist/tile-payload.js';
import {frustumPlanes,inFrustum} from '../dist/mesh-batches.js';
import {cameraProjection} from '../dist/engine.js';
import {terrainMesh} from '../dist/terrain-mesh.js';
import {SIGNAL_GREEN,SIGNAL_RED,STREET_LAMP,signalAt} from '../dist/street-lights.js';
import {recordFixtures} from '../tools/fixture-footprints.mjs';
import {buildingSite} from '../tools/building-sites.mjs';
import {apartmentPlans,facilityPlans} from '../tools/neighborhood-plans.mjs';
import {facadeAppearance} from '../dist/facade-look.js';
import {APARTMENT_GLASS,ROOM_MATERIAL_OFFSET} from '../dist/architecture-materials.js';

const file=new URL('../dist/world/'+WORLD_VERSION+'/',import.meta.url);
const cache=new Map();
function tile(ix,iz,visual=false){
  const key=ix+':'+iz+':'+visual;
  if(!hasTile(ix,iz))return null;
  if(!cache.has(key)){
    const bytes=readFileSync(new URL((visual?'':'physics/')+ix+'-'+iz+'.bin',file));
    const buffer=visual?gunzipSync(bytes):bytes;
    cache.set(key,decodeTile(Uint8Array.from(buffer).buffer,ix,iz,visual));
  }
  return cache.get(key);
}
const get=(x,z)=>tile(...toTile(x,z));
const terrain=terrainSampler({at:get});
const height=(x,z)=>sampleHeight(get(x,z),x,z);

test('compressed rendering tiles keep collision and geometry, with conservative camera culling',async()=>{
  const start=spawn('tokyo'),[ix,iz]=toTile(start.x,start.z);
  const bytes=readFileSync(new URL(ix+'-'+iz+'.bin',file));
  const prepared=await prepareVisualTile(Uint8Array.from(bytes).buffer,ix,iz);
  const collision=tile(ix,iz),visual=tile(ix,iz,true);
  for(const key of ['heights','solids','decks','platforms'])assert.deepEqual(prepared[key],collision[key]);
  const expected=meshKinds.reduce((sum,kind)=>sum+visual[kind].length,terrainMesh(visual).length);
  assert.equal(prepared.batch.data.length,expected);
  assert.equal(prepared.batch.ranges.reduce((sum,range)=>sum+range.count*16,0),expected);
  const eye=[start.x,terrain.support(start.x,start.z)+1.72,start.z];
  const planes=frustumPlanes(cameraProjection(eye,[eye[0],eye[1],eye[2]-1],16/9));
  assert.ok(inFrustum(prepared.batch.bounds,planes));
  const rotated=frustumPlanes(cameraProjection([43,11,-170],[44,11,-170],16/9));
  assert.ok(inFrustum([50,10,-171,51,12,-169],rotated));
  assert.equal(inFrustum([33,10,-171,34,12,-169],rotated),false);
  assert.equal(inFrustum([50,49,-171,51,50,-169],rotated),false);
});

test('collision lookup preserves exact terrain, water and rotated obstacle results',()=>{
  for(const city of cities){
    const center=spawn(city.id);
    for(let dz=-140;dz<=140;dz+=5.29)for(let dx=-140;dx<=140;dx+=5.71){
      const x=center.x+dx,z=center.z+dz,t=get(x,z),y=sampleHeight(t,x,z);
      const deck=overlaps(t.decks,x,z);
      const blocked=overlaps(t.solids,x,z,.37)||!deck&&terrainWater(t,x,z,y);
      const expected=blocked?null:platformHeight(t.platforms,x,z,deck?Math.max(y,(waterLevel(x,z)??-.52)+.61):y);
      assert.equal(terrain.support(x,z),expected);
    }
  }
});

test('the visible dry bank of the Seine is walkable and its water blocks movement',()=>{
  const x=-2452,dry=-1300.8,wet=-1298;
  const dryHeight=height(x,dry),wetHeight=height(x,wet);
  assert.ok(liquidAt(x,dry,dryHeight),'the former loose water mask covered the dry strip');
  assert.equal(terrain.support(x,dry),dryHeight);
  assert.equal(terrain.support(x,wet),null);
  const mesh=terrainMesh(tile(...toTile(x,wet),true));
  function drawnWater(x,z){
    for(let i=0;i<mesh.length;i+=16){
      if(mesh[i+15]!==3)continue;
      const dx=x-mesh[i],dz=z-mesh[i+2],ax=mesh[i+3],az=mesh[i+5],bx=mesh[i+9],bz=mesh[i+11];
      const area=ax*bz-az*bx,u=(dx*bz-dz*bx)/area,v=(ax*dz-az*dx)/area;
      if(u>=0&&v>=0&&u+v<=1)return mesh[i+1];
    }
    return null;
  }
  assert.equal(drawnWater(x,dry),null);
  assert.ok(drawnWater(x,wet)>wetHeight);
});

test('world is 8 km by 6 km with dense, streamable, contiguous data',()=>{
  const stats=JSON.parse(readFileSync(new URL('stats.json',file),'utf8'));
  assert.equal(stats.width,8000);assert.equal(stats.depth,6000);
  assert.equal(stats.tiles,TILE_COLS*TILE_ROWS);assert.ok(stats.buildings>65_000);
  assert.ok(stats.roads>5000);
  for(const [i,j] of [[0,0],[20,15],[38,28]]){
    const a=tile(i,j,true),b=tile(i+1,j,true);
    const [x,z]=tileOrigin(i+1,j);
    assert.ok(Math.abs(sampleHeight(a,x,z+45)-sampleHeight(b,x,z+45))<.00001);
    assert.ok(a.palette.length>0);
    for(let row=0;row<=20;row++){
      assert.equal(a.palette[row*21+20],b.palette[row*21],'color across tile boundary');
      assert.equal(a.normals[row*21+20],b.normals[row*21],'normal across tile boundary');
    }
  }
  const [coast,street,hill]=[[53,38],[0,77],[-65,48]].map(p=>height(...toGlobal('rio',...p)));
  assert.ok(street-coast>9&&street-coast<23);
  assert.ok(hill-street>11);
  const rio=toGlobal('rio',0,0),lots=new Set();
  for(const [ix,iz] of tilesAround(...rio,178)){
    const solids=tile(ix,iz).solids;
    for(let i=0;i<solids.length;i+=6){
      const [x,z,w,d]=solids.subarray(i,i+4);
      if(w>=2.2&&d>=2.2&&Math.hypot(x-rio[0],z-rio[1])<178)lots.add(x+','+z);
    }
  }
  assert.ok(lots.size>=100);
  assert.equal(terrain.support(limits.east+1,0),null);
  assert.ok(tilesAround(limits.east,limits.south,250).every(coords=>hasTile(...coords)));
});

test('all spawns, landmarks, and seven arterial links are reachable',()=>{
  let seed=46212719;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const routes=makeRoutes((x,z)=>height(Math.min(3999.99,Math.max(-3999.99,x)),Math.min(2999.99,Math.max(-2999.99,z))),random);
  for(const city of cities){
    const player=spawn(city.id);
    assert.notEqual(terrain.support(player.x,player.z),null,city.id+' spawn');
    for(const spot of landmarks.get(city.id)){
      assert.notEqual(terrain.support(spot[3],spot[4]),null,spot[0]);
      assert.equal(discoverable({...player,x:spot[3],z:spot[4]},city.id,spot[0]),spot);
    }
  }
  const arterials=routes.filter(r=>!r.local&&r.arterial);
  assert.equal(arterials.length,7);
  for(const city of cities){
    const origin=spawn(city.id),spacing=3,side=137,center=(side-1)/2;
    const offset=[origin.x-center*spacing,origin.z-center*spacing];
    const visited=new Uint8Array(side*side),queue=[[center,center]];
    visited[center*side+center]=1;
    for(let i=0;i<queue.length;i++){
      const [x,z]=queue[i];
      for(const [a,b] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){
        if(a<0||b<0||a>=side||b>=side||visited[b*side+a])continue;
        visited[b*side+a]=terrain.support(offset[0]+a*spacing,offset[1]+b*spacing)===null?2:1;
        if(visited[b*side+a]===1)queue.push([a,b]);
      }
    }
    const near=([x,z])=>{
      const a=Math.round((x-offset[0])/spacing),b=Math.round((z-offset[1])/spacing);
      for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)if(visited[(b+j)*side+a+i]===1)return true;
      return false;
    };
    const targets=landmarks.get(city.id).map(spot=>[spot[3],spot[4]]);
    for(const r of arterials)for(const p of [r.points[0],r.points.at(-1)])
      if(Math.hypot(p[0]-origin.x,p[1]-origin.z)<204)targets.push(p);
    for(const p of targets)assert.ok(near(p),city.id+' connection at '+p);
  }
  for(const road of arterials)for(let i=1;i<road.points.length;i++){
    const [a,b]=road.points[i-1],[c,d]=road.points[i],n=Math.ceil(Math.hypot(a-c,b-d)/3);
    for(let j=0;j<=n;j++){
      const t=j/n,x=a+(c-a)*t,z=b+(d-b)*t;
      assert.notEqual(terrain.support(x,z),null,road.id+' arterial at '+x+','+z);
    }
  }
});

test('the skyline contains distinct tall forms and every lobby has a walkable entrance and solid walls',()=>{
  const stats=JSON.parse(readFileSync(new URL('stats.json',file),'utf8'));
  const {towers,skyline}=JSON.parse(readFileSync(new URL('architecture.json',file),'utf8'));
  assert.ok(stats.buildingStyles>=60);
  assert.ok(stats.heightBands.length>=40);
  assert.ok(stats.heightBands.at(-1)>=400);
  assert.equal(towers.length,stats.lobbies);
  // Twenty-eight original towers, and ten further forms that each stand twice.
  assert.equal(new Set(towers.map(tower=>tower.style)).size,38);
  assert.equal(stats.addedTowers,20);assert.equal(towers.length,48);
  assert.equal(stats.addedStreetStyles,60);assert.equal(stats.streetStyles,104);
  assert.ok(stats.appearanceCombinations>5_000_000&&stats.buildingCombinations>100_000_000);
  assert.equal(stats.damageKinds,16);assert.ok(stats.damageRecipes>5000);
  assert.equal(new Set(towers.map(tower=>tower.city)).size,cities.length);
  assert.ok(towers.filter(tower=>tower.height>=300).length>=5);
  assert.ok(skyline.taper.length>16&&skyline.tube.length>16&&skyline.box.length>16);
  for(const tower of towers){
    const {approach,hall,door,floor,angle,front,depth,x,z,style,city}=tower;
    assert.ok(tower.site.plotWidth>tower.site.foundationWidth&&tower.site.foundationWidth>tower.width,style+' width');
    assert.ok(tower.site.plotDepth>tower.site.foundationDepth&&tower.site.foundationDepth>depth,style+' depth');
    const [a,b]=approach,[c,d]=hall;
    const distance=Math.hypot(c-a,d-b),yaw=Math.atan2(c-a,b-d);
    const start=terrain.support(a,b);
    assert.notEqual(start,null,style+' approach');
    assert.ok(Math.abs(terrain.support(...door)-floor)<.04,style+' threshold');
    const state={...spawn(city),x:a,z:b,y:start,yaw};
    for(let ms=0;ms<distance/6.8*1000+120;ms+=100)simulate(state,[[100,1,0,yaw,false]],terrain);
    assert.ok(Math.hypot(state.x-c,state.z-d)<1.05,style+' entry');
    assert.ok(Math.abs(state.y-floor)<.03,style+' interior floor');
    const rear=-front*(depth*.5-.31);
    assert.equal(terrain.support(x+Math.sin(angle)*rear,z+Math.cos(angle)*rear),null,style+' rear wall');
    simulate(state,[[230,0,0,yaw,false]],terrain);
    for(let ms=0;ms<distance/6.8*1000+270;ms+=100)simulate(state,[[100,-1,0,yaw,false]],terrain);
    assert.ok(Math.hypot(state.x-a,state.z-b)<1.3,style+' exit');
  }
});

test('larger buildings reserve more land and increase the foundation on both axes',()=>{
  const sizes=[12,32,90,234,406].map(height=>buildingSite(24,20,height));
  for(let i=1;i<sizes.length;i++)for(const key of Object.keys(sizes[i]))
    assert.ok(sizes[i][key]>sizes[i-1][key],key);
  const small=buildingSite(7,6,4.1),large=buildingSite(23,17,5.6);
  assert.ok(large.plotWidth>large.foundationWidth&&large.plotDepth>large.foundationDepth);
  assert.ok(large.foundationWidth*large.foundationDepth>8*small.foundationWidth*small.foundationDepth);
});

test('residential forms have distinct furnished interiors and facilities keep walkable approaches',()=>{
  const {streetBuildings,buildingStyles,appearanceVariants,renovationStyles}=JSON.parse(readFileSync(new URL('stats.json',file),'utf8'));
  assert.ok(buildingStyles>=112);
  assert.ok(appearanceVariants>7000);
  assert.equal(renovationStyles.length,10);
  const residential=streetBuildings.filter(building=>building.type==='apartment');
  assert.equal(new Set(residential.map(home=>home.interior.key)).size,residential.length);
  assert.equal(new Set(residential.map(home=>home.interior.design)).size,8);
  assert.ok(residential.every(home=>home.rooms>=3));
  // A ray through the middle of the furnished front window must reach a room surface
  // before any exterior mass. This catches a full shell left behind the new panes.
  for(const home of residential.filter(building=>building.style==='paris-stone-garden-wing')){
    const {x,z,level,angle,front,width,depth}=home,c=Math.cos(angle),s=Math.sin(angle);
    const nearby=tilesAround(x,z,Math.hypot(width,depth)).map(([a,b])=>tile(a,b,true));
    const coordinates=(a,b)=>[(a-x)*c-(b-z)*s,((a-x)*s+(b-z)*c)*front];
    const windows=nearby.flatMap(({pane})=>Array.from({length:pane.length/16},(_,i)=>pane.subarray(i*16,i*16+16)))
      .filter(pane=>{
        const [u,v]=coordinates(pane[0],pane[2]);
        return Math.floor(pane[15])===APARTMENT_GLASS&&pane[1]>level+1.2&&pane[1]<level+2.6&&
          Math.abs(u)<width*.49&&v>depth*.26&&v<depth*.51;
      });
    const visible=windows.some(pane=>{
      const [center,v]=coordinates(pane[0],pane[2]);
      const u=center+.18,y=pane[1]+.23;
      let wall=-Infinity,room=-Infinity;
      for(const {box} of nearby)for(let i=0;i<box.length;i+=16){
        if(Math.abs(box[i+1]-y)>=box[i+7]*.5||Math.abs(box[i]-x)>width||Math.abs(box[i+2]-z)>depth)continue;
        const [a,b]=coordinates(box[i],box[i+2]);
        const halfW=Math.hypot(box[i+3],box[i+5])*.5,halfD=Math.hypot(box[i+9],box[i+11])*.5;
        if(Math.abs(a-u)>halfW||b-halfD>=v+1)continue;
        if(box[i+15]>=ROOM_MATERIAL_OFFSET)room=Math.max(room,b+halfD);
        else wall=Math.max(wall,b+halfD);
      }
      return room>wall+.01;
    });
    assert.ok(visible,home.style+' transparent frontage at '+x+','+z);
  }
  const apartments=Object.values(apartmentPlans).flat();
  assert.equal(new Set(apartments.map(plan=>JSON.stringify(plan.volumes))).size,30);
  const eras=new Set(),wears=new Set(),windows=new Set();
  for(const city of cities){
    const local=streetBuildings.filter(building=>building.city===city.id);
    const homes=local.filter(building=>building.type==='apartment'),shops=local.filter(building=>building.type==='facility');
    assert.equal(homes.length,30);
    assert.deepEqual(new Set(homes.map(building=>building.style)),new Set(apartmentPlans[city.id].map(plan=>plan.id)));
    assert.equal(shops.length,facilityPlans.length);
    assert.deepEqual(new Set(shops.map(building=>building.style)),new Set(facilityPlans.map(plan=>plan.id)));
    const spawnPoint=spawn(city.id);
    for(const [ix,iz] of tilesAround(spawnPoint.x,spawnPoint.z,150)){
      const visual=tile(ix,iz,true);
      for(let i=15;i<visual.window.length;i+=16){
        const look=facadeAppearance(visual.window[i]);
        if(!look)continue;
        eras.add(look.era);wears.add(look.wear);windows.add(look.window);
      }
    }
  }
  assert.equal(eras.size,6);
  assert.equal(wears.size,8);
  assert.equal(windows.size,8);
  for(const building of streetBuildings){
    const {x,z,width,depth,site,level,approach,style}=building;
    const {platforms}=get(x,z);
    assert.ok(site.plotWidth>=site.foundationWidth&&site.foundationWidth>width,style+' plot width');
    assert.ok(site.plotDepth>=site.foundationDepth&&site.foundationDepth>depth,style+' plot depth');
    let slab=false;
    for(let i=0;i<platforms.length;i+=8){
      const [a,b,w,d,,,y]=platforms.subarray(i,i+8);
      if(Math.hypot(x-a,z-b)<.002&&Math.abs(y-level)<.002&&
        w*2>=site.foundationWidth-.003&&d*2>=site.foundationDepth-.003)slab=true;
    }
    assert.ok(slab,style+' foundation has a physics platform');
    assert.notEqual(terrain.support(...approach),null,style+' sidewalk access');
    if(style==='produce-market'){
      assert.notEqual(terrain.support(x,z),null,building.city+' market aisle');
      const [a,b]=approach,yaw=Math.atan2(x-a,b-z),distance=Math.hypot(x-a,z-b);
      const state={...spawn(building.city),x:a,z:b,y:terrain.support(a,b),yaw};
      for(let ms=0;ms<distance/6.8*1000+170;ms+=100)simulate(state,[[100,1,0,yaw,false]],terrain);
      assert.ok(Math.hypot(state.x-x,state.z-z)<1.35,building.city+' market entrance');
    }
  }
});

test('surface roads stay above the terrain and the expanded crowd has safe sidewalk routes',()=>{
  const stats=JSON.parse(readFileSync(new URL('stats.json',file),'utf8'));
  assert.ok(stats.roadConnections>=30);
  assert.ok(stats.infill>=3000);
  assert.ok(stats.squares>=6);
  assert.ok(stats.capitalBuildings>=100);
  const {pedestrians}=JSON.parse(readFileSync(new URL('architecture.json',file),'utf8'));
  assert.equal(pedestrians.length,100);
  assert.equal(new Set(pedestrians.map(p=>p.id)).size,pedestrians.length);
  assert.equal(new Set(pedestrians.map(p=>p.city)).size,6);
  for(const person of pedestrians){
    assert.ok(person.path.length>=13);
    for(const [x,,z] of person.path)assert.notEqual(terrain.support(x,z),null,person.city+' sidewalk');
    const pose=pedestrianPose(person,163.7),next=pedestrianPose(person,163.71);
    assert.ok(pose.position.every(Number.isFinite)&&Number.isFinite(pose.yaw));
    assert.ok(Math.hypot(...pose.position.map((n,i)=>n-next.position[i]))<.04);
    const geometry=peopleMeshes([person],163.7,pose.position);
    assert.ok(geometry.tube.length>=16&&geometry.ball.length>=16);
    for(const data of Object.values(geometry))assert.equal(data.length%16,0);
  }
  let checked=0;
  for(const city of cities){
    const point=spawn(city.id);
    for(const [ix,iz] of tilesAround(point.x,point.z,115)){
      const data=tile(ix,iz,true).tri;
      for(let i=0;i<data.length;i+=16){
        if(Math.floor(data[i+15])!==ASPHALT)continue;
        for(const [u,v] of [[1/3,1/3],[.15,.60]]){
          const x=data[i]+data[i+3]*u+data[i+9]*v;
          const y=data[i+1]+data[i+4]*u+data[i+10]*v;
          const z=data[i+2]+data[i+5]*u+data[i+11]*v;
          assert.ok(y-height(x,z)>.10,'road buried at '+x+','+z);
        }
        checked++;
      }
    }
  }
  assert.ok(checked>1000);
});

test('pavement and the Copacabana promenade stop at the asphalt in all six cities',()=>{
  function covers(data,i,x,z){
    const dx=x-data[i],dz=z-data[i+2],ax=data[i+3],az=data[i+5],bx=data[i+9],bz=data[i+11];
    const area=ax*bz-az*bx;
    if(Math.abs(area)<1e-5)return false;
    const u=(dx*bz-dz*bx)/area,v=(ax*dz-az*dx)/area;
    return Math.min(u,v,1-u-v)>.006;
  }
  let checked=0,promenade=0;
  for(const city of cities){
    const origin=spawn(city.id),ids=tilesAround(origin.x,origin.z,145),roads=new Map(),walk=[];
    const key=(x,z)=>Math.floor(x/12)+','+Math.floor(z/12);
    for(const [ix,iz] of ids){
      const data=tile(ix,iz,true).tri;
      for(let i=0;i<data.length;i+=16){
        const material=data[i+15];
        if(material===ASPHALT){
          const x=data[i],z=data[i+2],xs=[x,x+data[i+3],x+data[i+9]],zs=[z,z+data[i+5],z+data[i+11]];
          for(let a=Math.floor(Math.min(...xs)/12);a<=Math.floor(Math.max(...xs)/12);a++)
            for(let b=Math.floor(Math.min(...zs)/12);b<=Math.floor(Math.max(...zs)/12);b++){
              const id=a+','+b;
              if(!roads.has(id))roads.set(id,[]);
              roads.get(id).push([data,i]);
            }
        }else if(material===PAVING||city.id==='rio'&&material===16)walk.push([data,i]);
      }
    }
    for(const [data,i] of walk)for(const [u,v] of [[1/3,1/3],[.68,.16],[.16,.68]]){
      const x=data[i]+u*data[i+3]+v*data[i+9],z=data[i+2]+u*data[i+5]+v*data[i+11];
      if(Math.hypot(x-origin.x,z-origin.z)>118)continue;
      assert.ok(!(roads.get(key(x,z))??[]).some(([asphalt,j])=>covers(asphalt,j,x,z)),city.id+' pavement overlaps road at '+x+','+z);
      checked++;
      if(data[i+15]===16)promenade++;
    }
  }
  assert.ok(checked>10_000&&promenade>150);
});

test('parked cars and the Seine parapet block movement while the deck remains usable',()=>{
  const simulation=terrainSampler({at:get},createMission({blocked:()=>false}));
  assert.equal(simulation.support(...toGlobal('tokyo',-3.6,66)),null);
  assert.notEqual(terrain.support(...toGlobal('tokyo',0,66)),null);
  const z=7,center=toGlobal('paris',0,z),walk=toGlobal('paris',5.8,z),rail=toGlobal('paris',7.20,z);
  assert.ok(liquidAt(...center,height(...center)));
  assert.ok(terrain.support(...center)>height(...center)+.2);
  assert.ok(terrain.support(...walk)>height(...walk)+.2);
  assert.equal(terrain.support(...rail),null);
  const [x,north]=walk,state={...spawn('paris'),x,z:north,y:terrain.support(...walk)};
  for(let i=0;i<12;i++)simulate(state,[[100,0,1,0,true]],terrain);
  assert.ok(state.x>x&&state.x<rail[0]-.20);
});

test('a pedestrian plants a shoe while their body advances along a slope',()=>{
  const person={id:0,speed:1.14,phase:.5,path:[[0,0,0],[0,4,-32]]},slope=(x,z)=>x*.20-z*.125;
  function shoes(seconds){
    const pose=pedestrianPose(person,seconds);
    const {chamfer}=peopleMeshes([person],seconds,pose.position,slope);
    return [32,48].map(i=>[chamfer[i],chamfer[i+1]-chamfer[i+7]*.5,chamfer[i+2]]);
  }
  const first=shoes(0),next=shoes(.025);
  assert.ok(Math.abs(pedestrianPose(person,.025).position[2]-pedestrianPose(person,0).position[2])>.04);
  assert.ok(first.some(([x,y,z],i)=>Math.abs(y-slope(x,z))<.006&&Math.hypot(x-next[i][0],z-next[i][2])<.003));
  assert.deepEqual(peopleMeshes([person],0,[0,0,0],()=>undefined),{box:[],chamfer:[],tube:[],ball:[]});
});

test('existing atlas tiles acquire signal and lamp materials without changing their geometry',async()=>{
  const [ix,iz]=toTile(...toGlobal('tokyo',0,43));
  const fileBytes=readFileSync(new URL(ix+'-'+iz+'.bin',file));
  const {batch}=await prepareVisualTile(Uint8Array.from(fileBytes).buffer,ix,iz);
  const materials=[];
  for(const range of batch.ranges.filter(range=>range.kind==='box'))
    for(let i=0;i<range.count;i++)materials.push(Math.floor(batch.data[range.start+i*16+15]));
  for(const material of [SIGNAL_GREEN,SIGNAL_GREEN+1,SIGNAL_RED])
    assert.equal(materials.filter(value=>value===material).length,2);
  assert.ok(materials.includes(STREET_LAMP));
  assert.deepEqual([signalAt(1),signalAt(14),signalAt(18),signalAt(30)],[SIGNAL_GREEN,SIGNAL_GREEN+1,SIGNAL_RED,SIGNAL_GREEN]);
});

test('baked trees, streetlights and signal poles block walking at their visible locations',()=>{
  const [ix,iz]=toTile(...toGlobal('tokyo',0,43)),footprints={};
  const counts=recordFixtures(tile(ix,iz,true),footprints);
  assert.ok(counts.trees>0&&counts.lamps>0&&counts.signals>0);
  for(const entries of Object.values(footprints)){
    for(let i=0;i<entries.length;i+=6)assert.equal(terrain.support(entries[i],entries[i+1]),null);
  }
});

test('walking follows a diagonal corridor and a falling player can land on a shelf below them',()=>{
  const speed=RUN_SPEED/Math.sqrt(2),corner={support:(x,z)=>x>.02&&z>=-.02?.42:0};
  const walker={...spawn(),x:0,y:0,z:0,vx:speed,vz:-speed};
  stepMotion(walker,[1000/60,1,1,0,true],1000/60,corner);
  assert.ok(walker.x>.1&&walker.z<-.1);
  const falling={...spawn(),x:0,y:1,z:0,vx:RUN_SPEED,vy:-1};
  stepMotion(falling,[1000/60,0,1,0,true],1000/60,{support:x=>x>.1?.7:0});
  assert.ok(falling.x>.1&&falling.y>=.7);
});

test('pedestrians turn continuously at a waypoint on a bend',()=>{
  const person={path:[[0,0,0],[0,0,-2],[2,0,-2],[2,0,-4]],speed:1,phase:0};
  const turn=Math.acos(1/3)/Math.PI*6;
  const a=pedestrianPose(person,turn-.001),b=pedestrianPose(person,turn+.001);
  assert.ok(Math.abs(a.yaw-b.yaw)<.01);
});

test('walking distance follows each segment and camera corrections cannot cross a wall',()=>{
  const player={...spawn(),x:0,z:0,vx:RUN_SPEED},terrain={support:()=>0},metrics={distance:0};
  simulate(player,[[110,1,0,Math.PI*.5,true],[110,1,0,0,true]],terrain,230,metrics);
  assert.ok(metrics.distance>Math.hypot(player.x,player.z)+.001);
  const offset=[1.8,-.8,0],floor={...spawn(),x:0,z:0,y:0};
  keepCameraOutOfWalls(floor,offset,{support:x=>x>.65&&x<1.15?null:0});
  assert.deepEqual(offset,[0,-.2,0]);
});

test('Tokyo Tower is scaled five times with physical footings and a reachable plaza',()=>{
  assert.equal(TOKYO_TOWER_SCALE,5);
  const source=build(cities.find(city=>city.id==='tokyo'));
  const colors=['ba4a42','e1ddd2','e97254'].map(hex=>[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255));
  let low=Infinity,high=-Infinity,left=Infinity,right=-Infinity;
  for(const kind of ['box','tube','ball']){
    const data=source[kind];
    for(let i=0;i<data.length;i+=16){
      if(!colors.some(rgb=>rgb.every((n,j)=>Math.abs(n-data[i+12+j])<1e-6)))continue;
      const rx=(Math.abs(data[i+3])+Math.abs(data[i+6])+Math.abs(data[i+9]))*.5;
      const ry=(Math.abs(data[i+4])+Math.abs(data[i+7])+Math.abs(data[i+10]))*.5;
      left=Math.min(left,data[i]-rx);right=Math.max(right,data[i]+rx);
      low=Math.min(low,data[i+1]-ry);high=Math.max(high,data[i+1]+ry);
    }
  }
  assert.ok(high>318&&high<321);
  assert.ok(right-left>90&&right-left<101);
  assert.ok(low<1);
  for(const a of [-1,1])for(const b of [-1,1]){
    assert.equal(terrain.support(...toGlobal('tokyo',18+a*45,-58+b*45)),null);
  }
  assert.notEqual(terrain.support(...toGlobal('tokyo',15,-39)),null);
});

test('movement integrates acceleration, bounds, step height and a diagonal speed cap',()=>{
  const state={...spawn(),x:0,z:0,yaw:0};
  const blocked={support:(x,z)=>x<.6?(z< -2?2:0):null};
  for(let i=0;i<45;i++)simulate(state,[[90,1,1,0,true]],blocked);
  assert.ok(state.x<.6&&state.z>=-2);
  assert.ok(Math.hypot(state.vx,state.vz)<=RUN_SPEED+.0001);
  const time=simulate(state,[[90,1,0,0,false]],blocked,12);
  assert.equal(time,12);
  const falling={...spawn(),x:0,z:0,y:3};
  const floor={support:()=>0};
  simulate(falling,[[100,0,0,0,false]],floor);
  assert.ok(falling.y>0&&falling.y<3&&falling.vy<0);
  for(let i=0;i<12;i++)simulate(falling,[[100,0,0,0,false]],floor);
  assert.equal(falling.y,0);assert.equal(falling.vy,0);
  assert.equal(readInputs([[101,1,1,0,false]])?.length,1);
  assert.equal(readInputs([[91,1.1,0,0,false]]),null);
  assert.equal(readInputs([[Infinity,1,0,0,false]]),null);
  assert.equal(readInputs([[95,1,0,0,false],[95,1,0,0,false],[95,1,0,0,false]]),null);
});

test('a diagonal movement step has one total vertical climb allowance',()=>{
  const speed=RUN_SPEED/Math.sqrt(2);
  const state={...spawn(),x:0,z:0,y:0,vx:speed,vz:-speed};
  const ledges={support:(x,z)=>(x>.01?.22:0)+(z<-.01?.22:0)};
  stepMotion(state,[1000/60,1,1,0,true],1000/60,ledges);
  assert.ok(state.x>0);
  assert.equal(state.z,0);
  assert.equal(state.y,.22);
});

test('slow frames fit the wire limit and batching keeps each predicted integration step',()=>{
  const inputs=[...frameInputs(13,1,0,.4,true),...frameInputs(203,1,0,.4,true)];
  const wire=readInputs(inputs);
  assert.equal(wire,inputs);
  assert.equal(wire.reduce((ms,row)=>ms+row[0],0),216);
  const authority=spawn(),predicted=spawn(),floor={support:()=>0};
  for(const input of inputs)simulate(predicted,[input],floor);
  simulate(authority,wire,floor);
  assert.deepEqual(authority,predicted);
  assert.equal(idleDrive(true,[...wire,[1,0,0,.4,false]]),false);
  assert.equal(idleDrive(true,[[1,0,0,.4,false]]),true);
  assert.equal(readInputs(frameInputs(2000,1,0,.4,true)).reduce((ms,row)=>ms+row[0],0),230);
});
