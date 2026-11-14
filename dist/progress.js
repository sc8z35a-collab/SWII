import {cities} from './world.js';
import {MAX_PHOTOS,PHOTO_PREFIX} from './photos.js';
import {withTabLock} from './network.js';

export const progressKey='atlantis.travel.v1';

export function readProgress(storage){
  let saved;
  try{saved=JSON.parse(storage?.getItem(progressKey)??'null');}catch{}
  const stamps=Object.fromEntries(cities.map(city=>[city.id,city.spots.map(s=>s[0]).filter(id=>
    Array.isArray(saved?.stamps?.[city.id])&&saved.stamps[city.id].includes(id))]));
  const photos=Array.isArray(saved?.photos)?saved.photos.filter(p=>
    typeof p?.image==='string'&&p.image.startsWith(PHOTO_PREFIX)).slice(0,MAX_PHOTOS):[];
  return {city:cities.some(city=>city.id===saved?.city)?saved.city:'tokyo',stamps,photos,
    quality:['auto','high','low'].includes(saved?.quality)?saved.quality:'auto',
    sensitivity:[.65,1,1.5].includes(saved?.sensitivity)?saved.sensitivity:1};
}

export async function writeProgress(storage,change,locks=null){
  function write(){
    const current=readProgress(storage),next={...current,...change(current)};
    delete next.time;
    storage.setItem(progressKey,JSON.stringify(next));
    return next;
  }
  try{return await withTabLock(progressKey,write,locks);}
  catch{return null;}
}
