import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPhotoTable,PHOTO_TABLE_WIDTH,PHOTO_VARIANTS} from '../dist/generated-textures.js';
import {materialLayers} from '../dist/architecture-materials.js';

const catalog=JSON.parse(readFileSync(new URL('../tools/texture-catalog.json',import.meta.url),'utf8'));
const slots=catalog.sheets.flatMap(sheet=>sheet.slots);

test('the texture catalog: 36 base surfaces, 54 exteriors, 36 Atlantis and 36 more city textures, nine per sheet',()=>{
  assert.equal(catalog.sheets.length,18);
  for(const sheet of catalog.sheets)assert.equal(sheet.slots.length,9,sheet.id);
  assert.equal(new Set(slots.map(s=>s.id)).size,162);
  const group=prefix=>catalog.sheets.filter(s=>s.id.startsWith(prefix)).flatMap(s=>s.slots).length;
  assert.equal(group('surfaces-'),36);assert.equal(group('exteriors-'),54);assert.equal(group('atlantis-'),36);assert.equal(group('street-')+group('nature-')+group('roads-')+group('interiors'),36);
  for(const slot of slots)if(slot.art)assert.deepEqual(slot.materials,[],slot.id+' is a picture, not a surface');
  const uses=new Map();
  for(const slot of slots){
    assert.ok(slot.prompt.length>20&&slot.meters>0&&slot.tint>=0&&slot.tint<=1,slot.id);
    assert.ok(slot.roughness>0&&slot.roughness<1&&slot.relief>=0,slot.id);
    for(const material of slot.materials){
      assert.ok(Number.isInteger(material)&&material>=0&&material<materialLayers.length,slot.id+' '+material);
      uses.set(material,(uses.get(material)??0)+1);
    }
  }
  for(const [material,count] of uses)assert.ok(count<=PHOTO_VARIANTS,'material '+material+' has '+count);
});

test('the photo table lists each material\'s textures and each texture\'s scale',()=>{
  const manifest={sheets:catalog.sheets.map(sheet=>({file:sheet.id+'.webp',slots:sheet.slots.map(s=>({...s,luma:.2}))}))};
  const {table,slots:layers}=buildPhotoTable(manifest);
  const cell=(row,column,i)=>table[(row*PHOTO_TABLE_WIDTH+column)*4+i];
  assert.equal(layers.length,162);
  // Pictures for rooms are spread over four columns, the kilim is the rug.
  const listed=column=>[0,1,2,3,4,5,6,7].map(i=>cell(i>>2,column,i&3)).filter(v=>v>=0).map(i=>layers[i].id);
  assert.equal([64,65,66,67].flatMap(listed).length,slots.filter(s=>s.art===true).length);
  assert.deepEqual(listed(68),['kilim']);assert.deepEqual(listed(69),['awning-stripes']);assert.deepEqual(listed(70),['venetian-blinds']);
  assert.deepEqual(listed(71),['zelkova-bark']);assert.deepEqual(listed(74),['tactile-paving']);
  assert.deepEqual(listed(76),['roof-membrane','roof-gravel','folded-metal-roof']);assert.deepEqual(listed(77),['terrazzo','checker-vinyl']);
  assert.deepEqual(listed(128+24),['tatami','short-carpet','walnut-floor','checker-vinyl']);
  // Brick (13) has its base texture first, then six exterior variants; the eighth slot is empty.
  const brick=[0,1,2,3].map(i=>cell(0,13,i)).concat([0,1,2,3].map(i=>cell(1,13,i)));
  assert.equal(layers[brick[0]].id,'brick');
  assert.deepEqual(brick.slice(1,7).map(i=>layers[i].id),['brick-english','brick-clinker','brick-white','brick-yellow','brick-modern','brick-old']);
  assert.equal(brick[7],-1);
  assert.equal(layers[cell(0,3,0)].id,'sea-water','water takes its color from the sea photo');assert.equal(cell(0,3,1),-1);
  const marble=layers.findIndex(l=>l.id==='marble');
  assert.equal(cell(2,marble,0),3);assert.equal(cell(2,marble,2),Math.fround(.2));assert.equal(cell(3,marble,0),Math.fround(.18));
  assert.deepEqual(buildPhotoTable({}).slots,[]);
});

test('the shipped manifest matches the catalog and its atlases exist',()=>{
  const url=new URL('../dist/materials/generated/manifest.json',import.meta.url);
  let manifest;
  try{manifest=JSON.parse(readFileSync(url,'utf8'));}catch{return;}
  const byId=new Map(slots.map(slot=>[slot.id,slot]));
  for(const sheet of manifest.sheets){
    assert.ok(readFileSync(new URL('../dist/materials/generated/'+sheet.file,import.meta.url)).length>10000,sheet.file);
    assert.equal(sheet.slots.length,9);
    for(const slot of sheet.slots){
      assert.deepEqual(slot.materials,byId.get(slot.id).materials,slot.id);
      assert.ok(slot.size.every(n=>n>0)&&slot.luma>0,slot.id);
    }
  }
  assert.ok(!JSON.stringify(manifest).includes('sk-'),'no key in the manifest');
});
