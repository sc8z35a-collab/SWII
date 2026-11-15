import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {ARCHITECTURE_ASSET,MATERIAL_SIZE,materialLayer,softwareMaterialMips,surfaceProfiles} from '../dist/architecture-materials.js';
import {drapedShadow,skyColor,visibleFacade} from '../dist/software.js';
import {packedColor,rasterizer} from '../dist/software-raster.js';
import {blendLighting,cities,lighting} from '../dist/world.js';
import {glassOrder,meshBatch} from '../dist/mesh-batches.js';
import {shadowProjection} from '../dist/engine.js';
import {DAMAGE_CLASSES,appearanceMaterial,damageLevels,damageRecipe,facadeAppearance,facadeDamage} from '../dist/facade-look.js';
import {buildingLook} from '../tools/building-looks.mjs';
import {entryPortal,recessedWindows} from '../tools/facade-details.mjs';

test('building appearances survive Float32 serialization and preserve material and distance flags',()=>{
  const seen=new Set();
  const recipes=new Set();
  for(let damage=0;damage<DAMAGE_CLASSES;damage++)for(let era=0;era<6;era++)for(let wear=0;wear<8;wear++)for(let window=0;window<8;window++){
    // 181 is a facade material on the lifted tower, the largest integer part in use.
    for(const material of [13,181]){
      const base=Math.fround(appearanceMaterial(material,era,wear,window,damage));
      const detailed=Math.fround(appearanceMaterial(material+.25,era,wear,window,damage));
      assert.equal(Math.floor(base),material);
      assert.equal(Math.floor(detailed),material);
      assert.ok(base-material<.2499&&detailed-material>=.2499);
      const decoded=facadeAppearance(detailed);
      assert.equal(facadeAppearance(base),decoded);
      assert.deepEqual([decoded.era,decoded.wear,decoded.window],[era,wear,window]);
      assert.equal(facadeDamage(base),damage);assert.equal(facadeDamage(detailed),damage);
      if(material===13)seen.add(base);
    }
    recipes.add(damageLevels(damageRecipe(damage*384+era*64+wear*8+window)).join(''));
  }
  assert.equal(seen.size,384*DAMAGE_CLASSES);
  assert.ok(recipes.size>12000);
  assert.equal(facadeAppearance(13.25),null);
});

test('glazing sits behind physical window jambs and a tower entrance keeps its passage clear',()=>{
  const look=buildingLook('paris',-2358,-1294,18,8,'dfc7a6');
  for(const front of [-1,1]){
    const meshes=[];
    const part=(...mesh)=>meshes.push(mesh);
    recessedWindows(part,{a:0,b:0,w:8,d:8,low:0,high:9,front,paint:look.tone,trim:'e7d7b8',
      material:look.surface(8),look,rows:3,bays:3});
    const windows=meshes.filter(m=>m[0]==='window');
    const glazing=meshes.filter(m=>Math.floor(m[8])===10);
    assert.equal(windows.length,9);
    assert.equal(glazing.length,9);
    assert.ok(windows.every(m=>m[6]>.15&&m[9]===(front<0?Math.PI:0)));
    assert.ok(glazing.every(m=>m[3]*front<3.84));
    meshes.length=0;
    const obstacles=[];
    entryPortal(part,{level:0,edge:4*front,front,width:4.55,height:3.72,trim:'e7d7b8',look,open:true,
      obstacle:(...rect)=>obstacles.push(rect)});
    assert.equal(obstacles.length,2);
    assert.ok(obstacles.every(([a,,w])=>Math.abs(a)-w*.5>2.17));
    assert.ok(!meshes.some(m=>Math.floor(m[8])===10));
  }
});

test('the visible part of a window stays projectable when the facade crosses the near plane',()=>{
  const facade=[[-.25,-1,-.3],[1,-1,5],[1,2,5],[-.25,2,-.3]];
  const visible=visibleFacade(facade,800,600,505);
  assert.ok(visible.bounds[0]>0&&visible.bounds[2]===1);
  assert.equal(visible.cell(0,0,.05,.1),undefined);
  assert.ok(visible.cell(.4,.2,.1,.4).every(p=>p.every(Number.isFinite)));
});

test('fallback shadows follow the terrain grid and stop where the land is missing',()=>{
  const ground=(x,z)=>x<-9?undefined:1+x*.18+z*.1;
  const caster=[[2,6.66,3],[8,0,0],[0,0,7],10];
  const pieces=drapedShadow(caster,[Math.SQRT1_2,Math.SQRT1_2,0],ground);
  assert.ok(pieces.length>1);
  for(const [x,y,z] of pieces.flat())assert.ok(x>=-9&&Math.abs(y-ground(x,z)-.238)<1e-7);
  assert.deepEqual(drapedShadow([[2,25,3],...caster.slice(1)],[0,1,0],ground),[]);
});

test('a diagonal shadow contains the silhouette of the ground and the displaced roof',()=>{
  const caster=[[0,4,0],[8,0,0],[0,0,8],8];
  const shadow=drapedShadow(caster,[.5,Math.SQRT1_2,.5],()=>0).flat();
  for(const [x,z] of [[4,4],[-4,4],[4,-4],[-4-4/Math.SQRT1_2,-4-4/Math.SQRT1_2]]){
    assert.ok(shadow.some(p=>Math.hypot(p[0]-x,p[2]-z)<1e-7));
  }
  const chamfer=drapedShadow([...caster,'chamfer'],[0,1,0],()=>0).flat();
  assert.ok(chamfer.some(([x,,z])=>Math.abs(x-4)<1e-7&&Math.abs(z-2.88)<1e-7));
  assert.ok(chamfer.every(([x,,z])=>Math.abs(x)+Math.abs(z)<=6.88+1e-7));
});

test('coastal fog follows the elevation and bearing of each camera ray',()=>{
  const light=lighting(cities.find(city=>city.id==='rio'));
  assert.deepEqual(skyColor(light,0,-1,-1),light.horizon);
  assert.deepEqual(skyColor(light,0,1,0),light.zenith);
  assert.notDeepEqual(skyColor(light,-1,-.1,-1),light.horizon);
  assert.deepEqual(skyColor(light,1,-.1,-1),light.horizon);
  assert.deepEqual(skyColor(light,-2,-.2,-2),skyColor(light,-1,-.1,-1));
});

test('every surface district and palette transition stays in daylight',()=>{
  for(const city of cities){
    const light=lighting(city);
    assert.equal(light.night,0);
    assert.ok(light.sun[1]>.68,city.id);
  }
  const a=lighting(cities[0]),b=lighting(cities.find(city=>city.id==='rio'));
  const midpoint=blendLighting(a,b,.5);
  assert.equal(midpoint.ocean,.5);
  assert.equal(midpoint.night,0);
  assert.ok(Math.abs(Math.hypot(...midpoint.sun)-1)<1e-7);
  assert.ok(midpoint.horizon.every((value,i)=>Math.abs(value-(a.horizon[i]+b.horizon[i])*.5)<1e-7));
});

test('software drawing preserves depth, vertex color and transparent layers',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  let image;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{
    createElement:()=>({getContext:()=>({
      createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData(data){image=data;}
    })})
  }});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else delete globalThis.document;});
  const draw=rasterizer(),quad=(depth)=>[[0,0,depth],[4,0,depth],[4,4,depth],[0,4,depth]];
  draw.begin(8,8);
  draw.fill(quad(1),packedColor([1,0,0]));
  assert.equal(draw.fill(quad(.5),packedColor([0,1,0])),false);
  draw.fill(quad(1.5),packedColor([0,0,1]),.5);
  draw.fill(quad(2).map(([x,y,z])=>[x+4,y,z,0,z,0]),0);
  const shifted=(x,y)=>quad(3).map(([a,b,z])=>[a+x,b+y,z]);
  draw.shade(shifted(4,0),0,.30);
  draw.shade(shifted(4,0),0,.30);
  draw.shade(shifted(0,4),0,.30);
  const material={size:2,bytes:Uint8Array.from([0,128,128,128,255,128,128,128,0,128,128,128,255,128,128,128])};
  const textured=quad(1).map(([x,y,z])=>[x+4,y+4,z,x/4,y/4]);
  draw.fill(textured,packedColor([.6,.6,.6]),1,0,[material]);
  assert.equal(draw.fill(quad(.5).map(([x,y,z])=>[x+4,y+4,z]),packedColor([0,0,1])),false);
  draw.present({drawImage(){}});
  const at=(x,y)=>[...image.data.slice((y*8+x)*4,(y*8+x+1)*4)];
  assert.deepEqual(at(1,2),[128,0,128,255]);
  assert.deepEqual(at(5,2),[0,178,0,255]);
  assert.deepEqual(at(1,7),[0,0,0,0]);
  assert.ok(at(7,5)[0]>at(4,5)[0]+120);
});

test('the bundled surface atlas has albedo, relief and roughness in every layer',()=>{
  const data=gunzipSync(readFileSync(new URL('../dist/materials/'+ARCHITECTURE_ASSET,import.meta.url)));
  assert.equal(data.length,MATERIAL_SIZE**2*4*surfaceProfiles.length);
  const layers=softwareMaterialMips(data);
  for(const [i,mips] of layers.entries()){
    assert.deepEqual(mips.map(mip=>mip.size),[256,128,64,32]);
    for(let channel=0;channel<3;channel++){
      const samples=new Set();
      for(let offset=channel;offset<mips[0].bytes.length;offset+=4)samples.add(mips[0].bytes[offset]);
      assert.ok(samples.size>6,surfaceProfiles[i].name+' channel '+channel);
    }
  }
  assert.notEqual(materialLayer(5,1),materialLayer(5,5));
  assert.notEqual(materialLayer(2),materialLayer(13));
  assert.equal(materialLayer(22),-1);
});

test('glass is blended by camera depth, including panes in the same chunk',()=>{
  const pane=(x,z)=>[x,0,z,3,0,0,0,3,0,0,0,.1,.5,.6,.7,22];
  const first=meshBatch({pane:[...pane(0,-2),...pane(10,-15)]});
  const second=meshBatch({pane:pane(0,-5)});
  assert.deepEqual(glassOrder([first,second],[],[0,0,0],[0,0,-1],200).map(item=>item.depth),[15,5,2]);
});

test('moving the shadow camera retains alignment with the shadow texture pixels',()=>{
  const sun=[.48,.82,.30],size=2048;
  const a=shadowProjection(sun,[0,0,0],size),b=shadowProjection(sun,[52,0,52],size);
  for(const i of [12,13]){
    const shift=(b[i]-a[i])*size*.5;
    assert.ok(Math.abs(shift-Math.round(shift))<.001);
  }
});
