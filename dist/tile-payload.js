import {decodeTile} from './tiles.js';
import {terrainMesh} from './terrain-mesh.js';
import {meshBatch} from './mesh-batches.js';
import {tagLegacyLights} from './street-lights.js';

export async function prepareVisualTile(payload,ix,iz){
  const bytes=new Uint8Array(payload);
  let buffer=payload;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    const input=new ReadableStream({
      start(controller){controller.enqueue(bytes);controller.close();}
    });
    buffer=await new Response(input.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const tile=decodeTile(buffer,ix,iz,true);
  tagLegacyLights(tile.box);
  return {
    ix,iz,x:tile.x,z:tile.z,
    heights:tile.heights.slice(),solids:tile.solids.slice(),decks:tile.decks.slice(),
    platforms:tile.platforms.slice(),blocks:tile.blocks.slice(),roads:tile.roads.slice(),
    batch:meshBatch(tile,terrainMesh(tile))
  };
}
