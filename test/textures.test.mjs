import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPhotoTable,PHOTO_TABLE_WIDTH,PHOTO_VARIANTS} from '../dist/generated-textures.js';
import {materialLayers} from '../dist/architecture-materials.js';

const catalog=JSON.parse(readFileSync(new URL('../tools/texture-catalog.json',import.meta.url),'utf8'));
const slots=catalog.sheets.flatMap(sheet=>sheet.slots);

test('the texture catalog has 10 sheets of nine: 36 existing surfaces and 54 exteriors',()=>{
  assert.equal(catalog.sheets.length,10);
  for(const sheet of catalog.sheets)assert.equal(sheet.slots.length,9,sheet.id);
  assert.equal(new Set(slots.map(s=>s.id)).size,90);
  assert.equal(catalog.sheets.filter(s=>s.id.startsWith('surfaces-')).flatMap(s=>s.slots).length,36);
  assert.equal(catalog.sheets.filter(s=>s.id.startsWith('exteriors-')).flatMap(s=>s.slots).length,54);
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
  assert.equal(layers.length,90);
  const cell=(row,column,i)=>table[(row*PHOTO_TABLE_WIDTH+column)*4+i];
  // Brick (13) has its base texture first, then six exterior variants; the eighth slot is empty.
  const brick=[0,1,2,3].map(i=>cell(0,13,i)).concat([0,1,2,3].map(i=>cell(1,13,i)));
  assert.equal(layers[brick[0]].id,'brick');
  assert.deepEqual(brick.slice(1,7).map(i=>layers[i].id),['brick-english','brick-clinker','brick-white','brick-yellow','brick-modern','brick-old']);
  assert.equal(brick[7],-1);
  assert.equal(cell(0,3,0),-1,'water keeps its procedural surface');
  const marble=layers.findIndex(l=>l.id==='marble');
  assert.equal(cell(2,marble,0),3);assert.equal(cell(2,marble,2),Math.fround(.2));assert.equal(cell(3,marble,0),Math.fround(.18));
  assert.deepEqual(buildPhotoTable({}).slots,[]);
});
