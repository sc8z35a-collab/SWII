import {airport} from './transport-layout.js';
export const limits={west:-4000,east:4000,north:-3000,south:3000};
export const WORLD_VERSION='atlas-13';
export const TILE_SIZE=200;
export const GRID_STEP=10;
export const TILE_COLS=(limits.east-limits.west)/TILE_SIZE;
export const TILE_ROWS=(limits.south-limits.north)/TILE_SIZE;
export const toTile=(x,z)=>[Math.floor((x-limits.west)/TILE_SIZE),Math.floor((z-limits.north)/TILE_SIZE)];
export const tileOrigin=(ix,iz)=>[limits.west+ix*TILE_SIZE,limits.north+iz*TILE_SIZE];
export const hasTile=(ix,iz)=>ix>=0&&ix<TILE_COLS&&iz>=0&&iz<TILE_ROWS;
export const districts={
  tokyo:{x:-90,z:1200,turn:1,ground:'6c8166',road:'555961'},
  paris:{x:-2350,z:-1280,turn:1,ground:'818970',road:'82786d'},
  newyork:{x:25,z:-1450,turn:1,ground:'6f816d',road:'545d62'},
  cairo:{x:2290,z:-1170,turn:1,ground:'b9996c',road:'a28868'},
  sydney:{x:2300,z:1380,turn:-1,ground:'7d8e72',road:'646869'},
  rio:{x:-2380,z:1290,turn:-1,ground:'77956e',road:'756e62'}
};
export const toGlobal=(id,x,z)=>{
  const d=districts[id];return [d.x+x*d.turn,d.z+z*d.turn];
};
export const toLocal=(id,x,z)=>{
  const d=districts[id];return [(x-d.x)*d.turn,(z-d.z)*d.turn];
};
export function districtAt(x,z){
  let nearest='tokyo',best=Infinity;
  for(const [id,d] of Object.entries(districts)){
    const ax=x-d.x,az=z-d.z;
    const edge=82*Math.sin(x*.006+id.length)*Math.sin(z*.005-id.length*.46);
    const distance=Math.hypot(ax,az)+edge;
    if(distance<best){nearest=id;best=distance;}
  }
  return nearest;
}
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const softMax=(a,b,k)=>Math.max(a,b)+Math.max(0,k-Math.abs(a-b))**2/(4*k);
const waterLevels={seine:-.47,hudson:-.52,harbor:-.52,atlantic:-.50};
export const highestWaterLevel=Math.max(...Object.values(waterLevels));
function hash(x,z){
  let n=Math.imul(x,374761393)+Math.imul(z,668265263);
  n=Math.imul(n^(n>>>13),1274126177);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,z){
  const a=Math.floor(x),b=Math.floor(z),u=smooth(0,1,x-a),v=smooth(0,1,z-b);
  return mix(mix(hash(a,b),hash(a+1,b),u),mix(hash(a,b+1),hash(a+1,b+1),u),v);
}
export function rioShore(z){
  return 67+(26*Math.sin((z+5)/91)+6*Math.sin(z*.042))*smooth(39,164,Math.abs(z));
}
function waterShape(x,z){
  const [px,pz]=toLocal('paris',x,z);
  if(px<335&&Math.abs(pz)<160){
    const center=5+(19*Math.sin(px/86)+44*Math.sin(px/230))*smooth(20,210,Math.abs(px));
    const width=13.5+(9+6*Math.sin(px*.012))*smooth(65,360,Math.abs(px));
    const d=softMax(Math.abs(pz-center)-width,px-272,11);
    const cove=Math.hypot((px-273)*.88,(pz-center)*1.1)-34;
    const bank=Math.min(d,cove);
    if(bank<45)return {bank,level:waterLevels.seine,color:'4c7b81',id:'seine'};
  }
  const [nx,nz]=toLocal('newyork',x,z);
  if(nz<-63){
    const t=Math.max(0,-nz-89),mid=t*.44+36*Math.sin(t*.009)+47*Math.sin(t*.002);
    const bank=softMax(nz+92+13*Math.sin(nx/58)*smooth(17,101,Math.abs(nx)),Math.abs(nx-mid)-134-t*.20-20*Math.sin(t*.016),36);
    if(bank<47)return {bank,level:waterLevels.hudson,color:'4d7584',id:'hudson'};
  }
  const [sx,sz]=toLocal('sydney',x,z);
  if(sz<47){
    const t=Math.max(0,-sz-13),mid=-t*.44+28*Math.sin(t*.012)+60*Math.sin(t*.003);
    const innerBank=-14-12*Math.sin((sx+20)/51)*smooth(41,121,Math.abs(sx));
    const bank=softMax(sz-innerBank,Math.abs(sx-mid)-150-t*.28-19*Math.sin(t*.017),32);
    if(bank<45)return {bank,level:waterLevels.harbor,color:'357f94',id:'harbor'};
  }
  const [rx,rz]=toLocal('rio',x,z);
  if(rx>27&&Math.abs(rz)<1520){
    const shore=rioShore(rz);
    const bank=softMax(shore-rx,Math.abs(rz+44*Math.sin(rx*.006))-172-(rx-67)*.74,29);
    if(bank<45)return {bank,level:waterLevels.atlantic,color:'438f9c',id:'atlantic'};
  }
  return null;
}
const hill=(x,z,cx,cz,h,rx,rz)=>h*Math.exp(-((x-cx)**2/rx**2+(z-cz)**2/rz**2));
export const flatLandmarks={
  tokyo:[[45,1,14,27],[18,-58,72,109]],
  paris:[[-17,-63,13,28]],
  newyork:[[-29,-49,13,25],[55,3,8,19]],
  cairo:[[-23,-58,27,47],[28,-78,20,34],[-68,-91,17,31],[47,8,14,24]],
  sydney:[],
  rio:[[-37,-105,8,18]]
};
function coreHeight(id,x,z){
  if(id==='rio'){
    const shore=rioShore(z);
    let y=19*smooth(shore-8,-72,x);
    y+=hill(x,z,-79,64,11,99,116)+hill(x,z,-128,164,23,104,118);
    y+=Math.sin(z*.039+x*.025)*1.37*smooth(shore-9,shore-55,x);
    for(const [a,b,h,w,d] of [[-37,-105,56,30,35],[-82,-119,49,52,47],[-145,-147,63,49,45],[-123,-200,38,71,54]]){
      y+=hill(x,z,a,b,h,w,d)*(.88+noise(x*.057,z*.049)*.17);
    }
    return y;
  }
  if(id==='sydney')return 3+hill(x,z,-61,90,27,115,105)+hill(x,z,103,65,22,106,127)+3*Math.sin(x*.021+z*.016)-5*smooth(42,-13,z);
  if(id==='cairo')return 5+hill(x,z,-63,-79,14,120,108)+hill(x,z,113,75,17,131,94)+Math.sin(x*.040+Math.sin(z*.039)*1.05)*2.7+Math.sin(z*.053)*1.9;
  if(id==='paris')return 3+hill(x,z,-105,97,19,130,116)+hill(x,z,106,-114,17,144,90)+hill(x,z,22,143,10,95,100)-4*smooth(43,8,Math.abs(z-5));
  if(id==='newyork')return 3+hill(x,z,63,-10,15,89,87)+hill(x,z,-99,38,13,108,123)+4*Math.sin(z*.022+x*.012)+2*Math.cos(x*.032);
  return 4+hill(x,z,-79,39,21,126,103)+hill(x,z,77,-57,16,112,145)+3.1*Math.sin(x*.035-z*.023)-hill(x,z,1,55,4,24,116);
}
export function rawHeight(x,z){
  const id=districtAt(x,z),[dx,dz]=toLocal(id,x,z);
  const distance=Math.hypot(dx,dz);
  let detail=coreHeight(id,dx,dz);
  for(const [cx,cz,inner,outer] of flatLandmarks[id]){
    const f=1-smooth(inner,outer,Math.hypot(dx-cx,dz-cz));
    if(f>0)detail=mix(detail,coreHeight(id,cx,cz),f);
  }
  const broad=noise(x/870+5.7,z/780-2.6)*37+noise(x/330-3.4,z/300+9.2)*21+noise(x/131,z/114)*9-20;
  let y=mix(broad,detail,1-smooth(155,635,distance));
  const water=waterShape(x,z);
  if(water){
    const b=water.bank,coast=water.id==='atlantic';
    if(b<0)y=water.level-.17-smooth(0,44,-b)*5.5;
    else if(b<(coast?26:20)){
      const toe=water.level+.09+b*(coast?.055:.094);
      y=mix(toe,Math.max(toe,y),smooth(0,coast?26:20,b));
    }
  }
  const edge=Math.max(airport.west-x,x-airport.east,airport.north-z,z-airport.south,0);
  return edge<104?mix(airport.elevation,y,smooth(0,104,edge)):y;
}
export function surfaceAt(x,z,height){
  const district=districtAt(x,z),water=waterShape(x,z);
  if(water&&water.bank<4&&height<water.level+.025)return {color:water.color,water};
  const t=noise(x*.026,z*.026),jitter=noise(x*.008+4,z*.008);
  const sand=smooth(1380,350,Math.hypot(x-districts.cairo.x,z-districts.cairo.z)+(jitter-.5)*230);
  const grass=[109+t*24,131+t*21,104+t*19],sandTone=[190+t*17,156+t*19,113+t*20];
  let tone=grass.map((n,i)=>mix(n,sandTone[i],sand));
  if(district==='rio'){
    const rock=smooth(.45,.85,noise(x*.044,z*.045))*smooth(33,58,height);
    const hillTone=[77+t*28,110+t*20,79+t*13].map((n,i)=>mix(n,[126,129,116][i],rock));
    tone=tone.map((n,i)=>mix(n,hillTone[i],smooth(25,46,height)));
  }
  if(water&&water.bank<27){
    const shore=district==='rio'?[212,193,151]:[174,172,154];
    const dry=smooth(0,11,water.bank),away=smooth(13,27,water.bank);
    tone=tone.map((n,i)=>mix(shore[i]*(.83+dry*.17),n,away));
  }
  return {color:tone.map(n=>Math.round(n).toString(16).padStart(2,'0')).join(''),water:null};
}
export function liquidAt(x,z,height){
  if(height>=highestWaterLevel+.075)return null;
  const water=waterShape(x,z);
  return water&&water.bank<1.5&&height<water.level+.075?water:null;
}
export function triangleLiquid(a,b,c,corners){
  const at=([x,y,z])=>liquidAt(x,z,y);
  return liquidAt((a[0]+b[0]+c[0])/3,(a[2]+b[2]+c[2])/3,(a[1]+b[1]+c[1])/3)??
    (corners?(corners[0]??corners[1]??corners[2]):(at(a)??at(b)??at(c)));
}
export function waterLevel(x,z){return waterShape(x,z)?.level;}

const seaDirections=Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);
export function seascape(x,z){
  let u=0,v=0,weight=0;
  for(const [a,b] of seaDirections)for(const [distance,strength] of [[95,.5],[215,.38],[405,.25]]){
    const water=waterShape(x+a*distance,z+b*distance);
    if(!water||water.id==='seine')continue;
    const open=smooth(3,27,-water.bank)*strength;
    u+=a*open;v+=b*open;weight+=open;
  }
  const magnitude=Math.hypot(u,v);
  return {ocean:smooth(.28,2.0,weight),oceanBearing:magnitude>.001?[u/magnitude,v/magnitude]:[-1,0]};
}
