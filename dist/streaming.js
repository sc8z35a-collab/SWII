import {tileOrigin,toTile,TILE_SIZE,WORLD_VERSION} from './geography.js';
import {tileCache,tilePath,tilesAround} from './tiles.js';
import {distanceToBounds,skylineBatches} from './mesh-batches.js';
import {prepareVisualTile} from './tile-payload.js';
import {withDeadline} from './network.js';

const tileKey=(ix,iz)=>ix+':'+iz;
const nearestRadius=84;
const parallelDownloads=4;
const retryDelay=1800;

export function createRegion(){
  const downloads=new Map(),requests=new Set(),retryAt=new Map();
  let queue=[],running=0,scheduled=false,selection=null,revision=0;
  let worker=null,requestId=0,architecture=null,architectureJob=null,architectureRetry=0;
  const decoding=new Map();
  const cache=tileCache(load,{capacity:68});

  function stopWorker(){
    worker?.terminate();
    worker=null;
    for(const job of decoding.values()){
      clearTimeout(job.timer);
      job.resolve(null);
    }
    decoding.clear();
  }
  try{
    worker=new Worker(new URL('./terrain-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      const job=decoding.get(data.id);
      if(!job)return;
      clearTimeout(job.timer);
      decoding.delete(data.id);
      if(data.error)job.reject(Error(data.error));else job.resolve(data.tile);
    };
    worker.onerror=stopWorker;
    worker.onmessageerror=stopWorker;
  }catch{}

  async function decode(payload,ix,iz){
    if(!worker)return prepareVisualTile(payload,ix,iz);
    const id=++requestId;
    const tile=await new Promise((resolve,reject)=>{
      const timer=setTimeout(stopWorker,8000);
      decoding.set(id,{resolve,reject,timer});
      try{
        worker.postMessage({id,ix,iz,payload});
      }catch{
        stopWorker();
      }
    });
    return tile??prepareVisualTile(payload,ix,iz);
  }

  // Fetch priority hint: the ground around the viewer first, the far ring behind other requests.
  function priority(ix,iz){
    if(!selection)return 'auto';
    const [a,b]=tileOrigin(ix,iz);
    const distance=Math.hypot(a+TILE_SIZE*.5-selection.x,b+TILE_SIZE*.5-selection.z);
    return distance<TILE_SIZE*1.1?'high':distance>TILE_SIZE*2.2?'low':'auto';
  }
  async function download(job){
    const {ix,iz,controller}=job;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const payload=await withDeadline(6500,async signal=>{
          const response=await fetch(tilePath(ix,iz),{cache:attempt?'reload':'default',signal,priority:priority(ix,iz)});
          if(!response.ok)throw Error('Tile '+ix+','+iz+' unavailable');
          return response.arrayBuffer();
        },controller.signal);
        if(controller.signal.aborted)throw controller.signal.reason;
        const tile=await decode(payload,ix,iz);
        if(controller.signal.aborted)throw controller.signal.reason;
        return tile;
      }catch(error){
        if(attempt||controller.signal.aborted)throw error;
      }
    }
  }

  function drain(){
    scheduled=false;
    while(running<parallelDownloads&&queue.length){
      const job=queue.shift();
      running++;
      download(job).then(tile=>{
        retryAt.delete(job.id);
        revision++;
        job.resolve(tile);
      },job.reject).finally(()=>{
        running--;
        if(downloads.get(job.id)===job)downloads.delete(job.id);
        drain();
      });
    }
  }

  function load(ix,iz){
    return new Promise((resolve,reject)=>{
      const id=tileKey(ix,iz);
      const job={id,ix,iz,resolve,reject,controller:new AbortController()};
      downloads.set(id,job);
      queue.push(job);
      if(!scheduled){scheduled=true;queueMicrotask(drain);}
    });
  }

  function loadArchitecture(){
    if(architecture||architectureJob||performance.now()<architectureRetry)return;
    architectureJob=withDeadline(6500,async signal=>{
        const response=await fetch('./world/'+WORLD_VERSION+'/architecture.json',{signal});
        if(!response.ok)throw Error('Building data unavailable');
        return response.json();
      }).then(({towers,skyline,pedestrians})=>{
        architecture={towers,batches:skylineBatches(skyline),pedestrians};
        revision++;
      }).catch(()=>{architectureRetry=performance.now()+retryDelay;})
      .finally(()=>{architectureJob=null;});
  }

  function refresh(view){
    if(view!==selection)return;
    loadArchitecture();
    const now=performance.now();
    for(const [ix,iz] of view.ids){
      const id=tileKey(ix,iz);
      if(cache.peek(ix,iz)||requests.has(id)||(retryAt.get(id)??0)>now)continue;
      requests.add(id);
      cache.get(ix,iz).then(()=>requests.delete(id),error=>{
        requests.delete(id);
        if(!selection?.wanted.has(id))return;
        if(error.name==='AbortError')refresh(selection);
        else retryAt.set(id,performance.now()+retryDelay);
      });
    }
  }

  function select(x,z,radius,focusX=x,focusZ=z,landmark){
    const [focusTileX,focusTileZ]=toTile(focusX,focusZ);
    const distance=([ix,iz])=>{
      if(ix===focusTileX&&iz===focusTileZ)return -1;
      const [a,b]=tileOrigin(ix,iz);
      const cx=a+TILE_SIZE*.5,cz=b+TILE_SIZE*.5;
      const nearby=(cx-focusX)**2+(cz-focusZ)**2;
      return landmark?Math.min(nearby,.72*((cx-landmark[0])**2+(cz-landmark[1])**2)):nearby;
    };
    const ids=tilesAround(x,z,radius);
    const wanted=new Set(ids.map(([ix,iz])=>tileKey(ix,iz)));
    if(landmark){
      for(const [ix,iz] of tilesAround(landmark[0],landmark[1],nearestRadius)){
        const id=tileKey(ix,iz);
        if(!wanted.has(id)){wanted.add(id);ids.push([ix,iz]);}
      }
    }
    ids.sort((a,b)=>distance(a)-distance(b));
    selection={x,z,ids,wanted};
    queue=queue.filter(job=>{
      if(wanted.has(job.id))return true;
      downloads.delete(job.id);
      job.reject(new DOMException('Scene changed','AbortError'));
      return false;
    });
    for(const [id,job] of downloads)if(!wanted.has(id))job.controller.abort();
    queue.sort((a,b)=>distance([a.ix,a.iz])-distance([b.ix,b.iz]));
    for(const id of retryAt.keys())if(!wanted.has(id))retryAt.delete(id);
    for(const [ix,iz] of ids)if(cache.peek(ix,iz))void cache.get(ix,iz);
    refresh(selection);
    return selection;
  }

  function batches(view){
    const visible=[];
    for(const [ix,iz] of view.ids){
      const tile=cache.peek(ix,iz);
      if(tile)visible.push(tile.batch);
    }
    for(const batch of architecture?.batches??[]){
      if(distanceToBounds(batch.bounds,view.x,view.z)<1140**2)visible.push(batch);
    }
    return visible;
  }

  async function ready(x,z){
    const [ix,iz]=toTile(x,z),id=tileKey(ix,iz);
    for(let attempt=0;attempt<2;attempt++){
      const pending=cache.get(ix,iz);
      queueMicrotask(()=>{
        const index=queue.findIndex(job=>job.id===id);
        if(index>0)queue.unshift(queue.splice(index,1)[0]);
      });
      try{return await pending;}
      catch(error){if(attempt||error.name!=='AbortError')throw error;}
    }
  }

  return {
    cache,select,refresh,batches,
    ready,
    get revision(){return revision;},
    get towers(){return architecture?.towers??[];},
    get pedestrians(){return architecture?.pedestrians??[];},
    nearby(x,z,radius){return tilesAround(x,z,radius).map(([ix,iz])=>cache.peek(ix,iz)).filter(Boolean);},
    // Share of the tiles within radius that are loaded, for the loading screen.
    progress(x,z,radius){
      const ids=tilesAround(x,z,radius);
      return ids.length?ids.filter(([ix,iz])=>cache.peek(ix,iz)).length/ids.length:1;
    }
  };
}
