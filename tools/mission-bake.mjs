import {mkdir,writeFile} from 'node:fs/promises';
import {toGlobal,toTile,tileOrigin,TILE_COLS,TILE_ROWS,hasTile} from '../dist/geography.js';
import {atPad} from '../dist/mission-layout.js';

const clearZone=[[-90,1279],[-72,1194]];
const span=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const bookCounts={tokyo:20,paris:2,newyork:2,cairo:2,sydney:2,rio:2};
const focalTokyo=[[0,85],[0,72],[0,61],[0,49],[-12,43],[-23,45],[-35,47],[10,43],[20,39],[29,35],
  [37,24],[44,13],[55,10],[45,49],[34,67],[21,75],[10,77],[-12,79],[-22,80],[-33,90]];

export function placeMissionBooks(routes,height,blocked){
  const books=[];
  for(const [city,count] of Object.entries(bookCounts)){
    const eligible=routes.filter(route=>route.id===city&&route.local&&route.width>=5.7);
    const targets=city==='tokyo'?focalTokyo:[[0,77],[17,39]];
    for(const target of targets.slice(0,count)){
      const destination=toGlobal(city,...target);
      const spots=[];
      for(const {points,width} of eligible)for(let i=1;i<points.length;i++){
        const [a,b]=[points[i-1],points[i]];
        const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        if(length<.01)continue;
        const t=Math.max(0,Math.min(1,((destination[0]-a[0])*dx+(destination[1]-a[1])*dz)/length**2));
        for(const change of [0,.34,-.34])for(const side of [1,-1,0]){
          const s=Math.max(0,Math.min(1,t+change)),offset=side*Math.min(2.5,width*.31);
          const x=a[0]+dx*s-dz/length*offset,z=a[1]+dz*s+dx/length*offset;
          if(span([x,z],destination)>32||atPad(x,z,2)||clearZone.some(p=>span(p,[x,z])<3.8)||
            books.some(b=>span([b.x,b.z],[x,z])<5.2)||blocked(x,z))continue;
          spots.push({x,z,y:height(x,z)+.14,yaw:Math.atan2(dx,-dz)+((books.length%5)-2)*.27});
        }
      }
      spots.sort((a,b)=>span([a.x,a.z],destination)-span([b.x,b.z],destination));
      if(!spots.length)throw Error('No clear road for book '+city+' '+target.join('/'));
      books.push({id:books.length,...spots[0]});
    }
  }
  return books;
}

// Quantize visible opaque volumes to centimeters. Layering the actual heights
// keeps roofs, gaps below bridges and low street furniture distinct.
export async function writeMissionSight(world,out){
  const chunks=new Map();
  const kinds=['box','chamfer','taper','roof','tube','cone','pyramid','ball','window'];
  function box(volume){
    const [w,b,n,e,t,s]=volume;
    const [a,c]=toTile(w,n),[d,f]=toTile(e,s);
    for(let i=a;i<=d;i++)for(let j=c;j<=f;j++){
      if(!hasTile(i,j))continue;
      const [x,z]=tileOrigin(i,j),key=i+'-'+j;
      if(!chunks.has(key))chunks.set(key,[]);
      const data=chunks.get(key);
      data.push(...[w-x,b,n-z,e-x,t,s-z].map((v,k)=>Math[k<3?'floor':'ceil'](v*50)));
    }
  }
  for(let i=0;i<TILE_COLS;i++)for(let j=0;j<TILE_ROWS;j++){
    const tile=world.tile(i,j);
    for(const kind of kinds){
      const a=tile[kind];
      for(let o=0;o<a.length;o+=16){
        const [x,y,z,ux,uy,uz,vx,vy,vz,wx,wy,wz]=a.slice(o,o+12);
        const mat=Math.floor(a[o+15]);
        if(mat===3||mat===7||mat===22||mat===39||Math.abs(vy)<.16&&Math.abs(uy)+Math.abs(wy)<.27)continue;
        const rx=(Math.abs(ux)+Math.abs(vx)+Math.abs(wx))*.5;
        const ry=(Math.abs(uy)+Math.abs(vy)+Math.abs(wy))*.5;
        const rz=(Math.abs(uz)+Math.abs(vz)+Math.abs(wz))*.5;
        if(rx<.085||rz<.085||ry<.11||ry*rx*rz<.025)continue;
        box([x-rx,y-ry,z-rz,x+rx,y+ry,z+rz]);
      }
    }
  }
  await mkdir(out+'sight/',{recursive:true});
  for(const [key,data] of chunks)await writeFile(out+'sight/'+key+'.bin',Buffer.from(Int16Array.from(data).buffer));
  await writeFile(out+'sight/tiles.json',JSON.stringify([...chunks.keys()]));
  console.log('Visibility tiles',chunks.size);
}
