import {prepareVisualTile} from './tile-payload.js';
self.onmessage=async ({data})=>{
  try{
    const tile=await prepareVisualTile(data.payload,data.ix,data.iz);
    const transfer=[tile.heights,tile.solids,tile.decks,tile.platforms,tile.roads,tile.batch.data].map(a=>a.buffer);
    self.postMessage({id:data.id,tile},transfer);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
