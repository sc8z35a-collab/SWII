import test from 'node:test';
import assert from 'node:assert/strict';
import {skyModel} from '../dist/gfx-common.js';
import {cities,lighting} from '../dist/world.js';
import {BONES,buildHuman} from '../dist/human-model.js';
import {WHEEL,buildCar} from '../dist/car-model.js';
import {peopleMeshes} from '../dist/people.js';
import {drawCar} from '../dist/moving-models.js';
import {shadowProjection} from '../dist/engine.js';

const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;

test('the daylight sky is brighter toward the sun and keeps a warm sun over a blue sky',()=>{
  for(const city of cities){
    const sky=skyModel(lighting(city));
    for(const key of ['sunColor','ambientUp','ambientDown','ambientSun','ambientAnti','groundRadiance','horizon'])
      assert.ok(sky[key].every(v=>Number.isFinite(v)&&v>=0),city.id+' '+key);
    assert.ok(sky.sunColor[0]>sky.sunColor[2],city.id+' sun is warmer than white');
    assert.ok(sky.ambientUp[2]>sky.ambientUp[0],city.id+' skylight is blue');
    // Clear daylight: the sun on a level surface outshines the sky dome (ambient terms are E/π).
    assert.ok(luminance(sky.sunColor)*sky.sun[1]>luminance(sky.ambientUp)*Math.PI*2,city.id);
    assert.ok(luminance(sky.ambientSun)>=luminance(sky.ambientAnti),city.id+' sun side of the sky is brighter');
  }
});

test('every person body is closed, weighted to real bones and stands 1.75 m tall',()=>{
  for(const variant of [0,1,2]){
    const mesh=buildHuman(variant,0),stride=10,count=mesh.vertices.length/stride;
    assert.ok(mesh.indices.length%3===0&&mesh.indices.length>3000);
    assert.ok(Array.from(mesh.indices).every(i=>i<count));
    let low=Infinity,high=-Infinity;
    for(let i=0;i<count;i++){
      const v=mesh.vertices.subarray(i*stride,i*stride+stride);
      low=Math.min(low,v[1]);high=Math.max(high,v[1]);
      assert.ok(Math.abs(Math.hypot(v[3],v[4],v[5])-1)<1e-3,'unit normal');
      assert.ok(v[6]>=0&&v[6]<BONES.length&&v[7]>=0&&v[7]<BONES.length,'bone index');
      assert.ok(v[8]>=0&&v[8]<=1,'bone weight');
      assert.ok([0,1,2,3,4,5].includes(v[9]),'body part');
    }
    assert.ok(low>-.03&&low<.03,'feet on the ground');
    assert.ok(high>1.7&&high<(variant===2?1.86:1.8),'height '+high);
  }
});

test('the car body faces outward and its wheels sit on the ground',()=>{
  const car=buildCar(0),stride=10,count=car.vertices.length/stride;
  let outward=0,body=0,lowest=Infinity,length=0;
  const parts=new Set();
  for(let i=0;i<count;i++){
    const v=car.vertices.subarray(i*stride,i*stride+stride);
    parts.add(v[6]);
    lowest=Math.min(lowest,v[1]);length=Math.max(length,Math.abs(v[2]));
    // Sides, roof, hood and trunk; the undersides of the wheel arches face the wheels.
    const mirror=Math.abs(v[0])>.84&&Math.abs(v[2]-.73)<.16&&v[1]>.93&&v[1]<1.08;
    if(v[6]===0&&!mirror&&Math.abs(v[0])<1.2&&v[4]>-.3){
      body++;
      if(v[0]*v[3]+(v[1]-.7)*v[4]+v[2]*v[5]*.2>-.05)outward++;
    }
  }
  assert.deepEqual([...parts].sort(),[0,1,2]);
  assert.ok(outward/body>.97,'body normals point out '+outward/body);
  assert.ok(Math.abs(lowest-(WHEEL.y-.338))<.01,'tires touch the ground');
  assert.ok(length>2.25&&length<2.35,'car length');
});

test('detailed actors use one 16-value instance each',()=>{
  const path=[[0,0,0],[30,0,0],[30,0,30]];
  const people=[{id:3,path,speed:1.2,phase:.2},{id:8,path,speed:1.4,phase:.7}];
  const out=peopleMeshes(people,12,[10,1.7,5],null,true);
  assert.equal(out.detailed,true);
  assert.equal(out.humans.length,32);
  for(let i=0;i<2;i++){
    const h=out.humans.slice(i*16,i*16+16);
    assert.ok(h.every(Number.isFinite));
    assert.ok(h[4]>.85&&h[4]<1.1,'height scale');
    assert.ok([0,1].includes((h[15]>>8)&3),'pedestrian body');
  }
  const legacy=peopleMeshes(people,12,[10,1.7,5]);
  assert.ok(legacy.box.length>0&&!legacy.humans);
  const meshes={detailed:true};
  drawCar(meshes,{x:1,y:2,z:3,yaw:.5,paint:'2c4a6e',parked:true},.1,1.5);
  assert.equal(meshes.cars.length,16);
  assert.equal(meshes.cars[6],0x2c4a6e);
});

test('both shadow cascades stay aligned with their texels as the camera moves',()=>{
  const sun=[.48,.82,.30],size=2048;
  for(const range of [38,205]){
    const a=shadowProjection(sun,[0,0,0],size,range),b=shadowProjection(sun,[52,0,52],size,range);
    for(const i of [12,13]){
      const shift=(b[i]-a[i])*size*.5;
      assert.ok(Math.abs(shift-Math.round(shift))<.001);
    }
  }
});
