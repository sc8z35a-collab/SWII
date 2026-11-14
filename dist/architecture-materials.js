import {withDeadline} from './network.js';

export const MATERIAL_SIZE=256;
export const ARCHITECTURE_ASSET='architecture-v18.bin';
export const CERAMIC_SHELL=33;
export const APARTMENT_GLASS=39;
export const ROOM_MATERIAL_OFFSET=64;
export const LIFT_MATERIAL_OFFSET=128;
export const HEAT_METAL=54,SHIELD_TILE=55,LEATHER=56,PAPER=57,SOOT=58,IGNITION=59,EXHAUST=60,DUST=61,SPIRIT=62,SHOCK=63;
export const isGlazing=mat=>mat===22||mat===APARTMENT_GLASS;
export const isRoomSurface=mat=>mat>=ROOM_MATERIAL_OFFSET;
// A repeat measures the specified meters across and vertically. Relief is
// expressed in meters, so a brick joint has much more depth than brushed steel.
export const surfaceProfiles=[
  {name:'ashlar',width:3.36,height:2.28,relief:.012},
  {name:'brick',width:2.76,height:1.80,relief:.008},
  {name:'concrete',width:4.80,height:3.12,relief:.010},
  {name:'stucco',width:2.20,height:2.20,relief:.003},
  {name:'ceramic',width:1.76,height:1.76,relief:.004},
  {name:'sandstone',width:3.68,height:2.64,relief:.008},
  {name:'roof-tile',width:2.16,height:2.64,relief:.018},
  {name:'pavers',width:2.64,height:2.16,relief:.010},
  {name:'asphalt',width:2.90,height:2.90,relief:.0035},
  {name:'steel',width:1.80,height:1.20,relief:.001},
  {name:'wood',width:1.12,height:2.62,relief:.004},
  {name:'marble',width:3.00,height:3.00,relief:.0012},
  {name:'rubble',width:3.96,height:2.94,relief:.016},
  {name:'soil',width:3.04,height:3.04,relief:.007},
  {name:'setts',width:1.72,height:1.48,relief:.008},
  {name:'paint',width:1.58,height:1.58,relief:.0018},
  {name:'gravel',width:1.95,height:1.95,relief:.015},
  {name:'sand',width:3.12,height:2.78,relief:.006},
  {name:'linen',width:.46,height:.46,relief:.0016},
  {name:'rubber',width:1.78,height:1.78,relief:.005},
  {name:'plaster',width:1.82,height:1.82,relief:.0015},
  {name:'glazed-tile',width:1.25,height:1.25,relief:.0028},
  {name:'foliage',width:1.13,height:1.22,relief:.006},
  {name:'zinc',width:2.18,height:2.78,relief:.003},
  {name:'heat-metal',width:2.40,height:1.48,relief:.005},
  {name:'shield',width:3.40,height:3.05,relief:.018},
  {name:'leather',width:.28,height:.26,relief:.0011},
  {name:'paper',width:.36,height:.145,relief:.0008},
  {name:'soot',width:4.50,height:3.65,relief:.006},
];

export const materialLayers=[
  15,7,8,-1,-1,3,22,-1,0,13,-1,3,2,1,6,9,14,5,12,-1,0,-1,-1,11,10,9,13,8,7,-1,-1,-1,-1,4,-1,16,17,8,7,
  -1,0,18,19,20,21,22,23,22,
  3,21,23,10,2,23,24,25,26,27,28
];
export function materialLayer(material,era){
  if(material>=LIFT_MATERIAL_OFFSET)material-=LIFT_MATERIAL_OFFSET;
  if(isRoomSurface(material))material-=ROOM_MATERIAL_OFFSET;
  return material===5&&era>=4?4:materialLayers[material]??-1;
}

let request;
export function loadArchitectureMaterials(){
  request??=withDeadline(12000,async signal=>{
    const response=await fetch(new URL('./materials/'+ARCHITECTURE_ASSET,import.meta.url),{signal});
    if(!response.ok||!response.body)throw Error('Architecture materials unavailable');
    const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
    const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
    if(bytes.length!==MATERIAL_SIZE**2*4*surfaceProfiles.length)throw Error('Invalid architecture materials');
    return bytes;
  }).catch(error=>{request=null;throw error;});
  return request;
}

export function softwareMaterialMips(bytes){
  const count=surfaceProfiles.length,levels=4;
  const layers=[];
  for(let layer=0;layer<count;layer++){
    let size=MATERIAL_SIZE;
    let map=bytes.subarray(layer*size*size*4,(layer+1)*size*size*4);
    const mipmaps=[{size,bytes:map}];
    for(let level=1;level<levels;level++){
      const nextSize=size>>1,next=new Uint8Array(nextSize*nextSize*4);
      for(let z=0;z<nextSize;z++)for(let x=0;x<nextSize;x++){
        const source=(z*2*size+x*2)*4,dest=(z*nextSize+x)*4;
        for(let channel=0;channel<4;channel++)
          next[dest+channel]=(map[source+channel]+map[source+4+channel]+
            map[source+size*4+channel]+map[source+size*4+4+channel]+2)>>2;
      }
      map=next;size=nextSize;
      mipmaps.push({size,bytes:map});
    }
    layers.push(mipmaps);
  }
  return layers;
}
