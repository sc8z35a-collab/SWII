import {mkdir,writeFile} from 'node:fs/promises';
import {toGlobal,toLocal,toTile,tileOrigin,TILE_COLS,TILE_ROWS,hasTile} from '../dist/geography.js';
import {atPad} from '../dist/mission-layout.js';

const clearZone=[[-90,1279],[-72,1194]];
const span=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Eighty books: thirty around the start in Tokyo and ten in each of the other cities.
const bookCounts={tokyo:30,paris:10,newyork:10,cairo:10,sydney:10,rio:10};
export const BOOK_TOTAL=Object.values(bookCounts).reduce((sum,count)=>sum+count,0);
const focal={
  tokyo:[[0,85],[0,72],[0,61],[0,49],[-12,43],[-23,45],[-35,47],[10,43],[20,39],[29,35],
    [37,24],[44,13],[55,10],[45,49],[34,67],[21,75],[10,77],[-12,79],[-22,80],[-33,90]],
  paris:[[0,77],[17,39]],newyork:[[0,77],[17,39]],cairo:[[0,77],[17,39]],sydney:[[0,77],[17,39]],rio:[[0,77],[17,39]]
};
const spawns={tokyo:[0,79],paris:[0,77],newyork:[0,78],cairo:[0,81],sydney:[0,78],rio:[0,77]};

export function placeMissionBooks(routes,height,blocked){
  const books=[];
  for(const [city,count] of Object.entries(bookCounts)){
    const eligible=routes.filter(route=>route.id===city&&route.local&&route.width>=5.7);
    // Beyond the old centre the wider neighbourhood streets also carry books.
    const streets=routes.filter(route=>route.id===city&&!route.portal&&route.width>=5.7);
    const end=books.length+count;
    function place(target,spacing,pool=eligible){
      const destination=toGlobal(city,...target);
      const spots=[];
      for(const {points,width} of pool)for(let i=1;i<points.length;i++){
        const [a,b]=[points[i-1],points[i]];
        const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        if(length<.01)continue;
        const t=Math.max(0,Math.min(1,((destination[0]-a[0])*dx+(destination[1]-a[1])*dz)/length**2));
        for(const change of [0,.34,-.34])for(const side of [1,-1,0]){
          const s=Math.max(0,Math.min(1,t+change)),offset=side*Math.min(2.5,width*.31);
          const x=a[0]+dx*s-dz/length*offset,z=a[1]+dz*s+dx/length*offset;
          if(span([x,z],destination)>32||atPad(x,z,2)||clearZone.some(p=>span(p,[x,z])<3.8)||
            books.some(b=>span([b.x,b.z],[x,z])<spacing)||blocked(x,z))continue;
          spots.push({x,z,y:height(x,z)+.14,yaw:Math.atan2(dx,-dz)+((books.length%5)-2)*.27});
        }
      }
      spots.sort((a,b)=>span([a.x,a.z],destination)-span([b.x,b.z],destination));
      if(!spots.length)return false;
      books.push({id:books.length,...spots[0]});
      return true;
    }
    for(const target of focal[city]){
      if(books.length<end&&!place(target,5.2))throw Error('No clear road for book '+city+' '+target.join('/'));
    }
    // The remaining books spiral outward from the spawn, well apart from one another.
    const [sx,sz]=spawns[city],first=city==='tokyo'?105:46;
    for(let i=0;i<900&&books.length<end;i++){
      const radius=first+7.5*i**.82,angle=i*2.399963+sx;
      place([sx+Math.cos(angle)*radius,sz+Math.sin(angle)*radius],21,streets);
    }
    if(books.length<end)throw Error('Only '+(books.length-end+count)+' of '+count+' books fit in '+city);
  }
  return books;
}

// Road points where the creatures can start and between which they patrol.
export function placeHaunts(routes,height,blocked){
  const haunts=[],perCity=170;
  for(const city of Object.keys(bookCounts)){
    const mine=[];
    for(const {points} of routes.filter(route=>route.id===city&&!route.portal&&route.width>=5.7)){
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],length=span(a,b);
        for(let d=5;d<length;d+=17){
          const x=a[0]+(b[0]-a[0])*d/length,z=a[1]+(b[1]-a[1])*d/length;
          if(Math.hypot(...toLocal(city,x,z))>640||atPad(x,z,34)||blocked(x,z)||mine.some(p=>span(p,[x,z])<26))continue;
          mine.push([x,z]);
        }
      }
    }
    const stride=Math.max(1,mine.length/perCity);
    for(let i=0;i<mine.length&&i/stride<perCity;i+=stride){
      const [x,z]=mine[Math.floor(i)];
      haunts.push(Math.round(x*10)/10,Math.round(z*10)/10,Math.round(height(x,z)*10)/10);
    }
  }
  return haunts;
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
