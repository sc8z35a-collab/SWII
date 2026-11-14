import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {hasTile,toTile,tileOrigin,TILE_COLS,TILE_ROWS,WORLD_VERSION} from '../dist/geography.js';
import {decodeTile} from '../dist/tiles.js';

const trunkColors=new Set([0x6c5944,0x766148,0x8a7051,0x74654e,0x796650,0x6c6249]);
const lampColors=new Set([0x374750,0x384540,0x424b48]);
const centimeters=n=>Math.round(n*100)/100;

export function recordFixtures(tile,footprints){
  const counts={trees:0,lamps:0,signals:0};
  for(const kind of ['box','tube']){
    const data=tile[kind];
    for(let i=0;i<data.length;i+=16){
      const color=(Math.round(data[i+12]*255)<<16)|(Math.round(data[i+13]*255)<<8)|Math.round(data[i+14]*255);
      const h=data[i+7],w=Math.abs(data[i+3]),d=Math.abs(data[i+11]);
      if(h<1.25||w<.08||w>.75||d<.08||d>.75||Math.abs(data[i+6])+Math.abs(data[i+8])>.001)continue;
      const type=kind==='box'&&color===0x37444b&&Math.abs(h-3.1)<.01?'signals':
        kind==='tube'&&trunkColors.has(color)?'trees':kind==='tube'&&lampColors.has(color)?'lamps':null;
      if(!type)continue;
      counts[type]++;
      const x=centimeters(data[i]),z=centimeters(data[i+2]);
      const halfWidth=centimeters(Math.max(w*.5,type==='lamps'&&color===0x374750?.16:0)),halfDepth=centimeters(Math.max(d*.5,type==='lamps'&&color===0x374750?.16:0));
      const [left,top]=toTile(x-halfWidth-.40,z-halfDepth-.40),[right,bottom]=toTile(x+halfWidth+.40,z+halfDepth+.40);
      for(let iz=top;iz<=bottom;iz++)for(let ix=left;ix<=right;ix++){
        if(hasTile(ix,iz))(footprints[iz*TILE_COLS+ix]??=[]).push(x,z,halfWidth,halfDepth,1,0);
      }
    }
  }
  return counts;
}

export async function writeFixtureFootprints(footprints){
  const lines=Object.entries(footprints).map(([key,values])=>{
    const [west,north]=tileOrigin(Number(key)%TILE_COLS,Math.floor(Number(key)/TILE_COLS));
    const bytes=Buffer.alloc(values.length);
    for(let i=0;i<values.length;i+=6){
      bytes.writeInt16LE(Math.round((values[i]-west)*100),i);
      bytes.writeInt16LE(Math.round((values[i+1]-north)*100),i+2);
      bytes[i+4]=Math.round(values[i+2]*100);bytes[i+5]=Math.round(values[i+3]*100);
    }
    return '  '+key+':'+JSON.stringify(bytes.toString('base64'));
  });
  await writeFile(new URL('../dist/fixture-footprints.js',import.meta.url),
    '// Generated from atlas meshes by tools/fixture-footprints.mjs.\nexport const fixtureFootprints={\n'+lines.join(',\n')+'\n};\n');
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const folder=fileURLToPath(new URL('../dist/world/'+WORLD_VERSION+'/',import.meta.url)),footprints={};
  const totals={trees:0,lamps:0,signals:0};
  for(let z=0;z<TILE_ROWS;z++)for(let x=0;x<TILE_COLS;x++){
    const bytes=gunzipSync(await readFile(folder+x+'-'+z+'.bin'));
    const tile=decodeTile(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),x,z,true);
    const count=recordFixtures(tile,footprints);
    for(const key of Object.keys(totals))totals[key]+=count[key];
  }
  await writeFixtureFootprints(footprints);
  console.log(totals);
}
