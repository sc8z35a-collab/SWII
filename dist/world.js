import {rad, normalize, vectorCross} from './engine.js';
import {rioShore} from './geography.js';
import {SIGNAL_COLORS,SIGNAL_GREEN,STREET_LAMP} from './street-lights.js';
import {CERAMIC_SHELL} from './architecture-materials.js';
export const TOKYO_TOWER_SCALE=5;
export const cities=[
  {id:'tokyo',n:'01',name:'東京',en:'Tokyo',country:'日本',region:'ASIA',coords:'35.68° N   139.69° E',accent:'#ed9276',sky:'#3c668a',desc:'朱色の塔を見上げ、石畳の大通りから静かな社へ。',spawn:[0,79],hero:[[164,143,315],[-40,143,-45]],spots:[['crossing','中央大通り','交差点の白い横断歩道へ',0,43],['shrine','朱の参道','朱色の鳥居の前へ',45,12],['tower','東京タワー広場','赤と白の鉄塔を見上げる',15,-39]]},
  {id:'paris',n:'02',name:'パリ',en:'Paris',country:'フランス',region:'EUROPE',coords:'48.86° N   2.35° E',accent:'#e2ae77',sky:'#6d7794',desc:'セーヌ川に伸びる石橋を渡り、街を見守る鉄塔のふもとへ。',spawn:[0,77],hero:[[49,20,72],[-17,19,-43]],spots:[['boulevard','並木通り','街路樹の続く広場へ',0,55],['seine','セーヌ川の橋','欄干越しに川を眺める',0,7],['eiffel','エッフェル塔広場','鉄塔の南側へ',-16,-40]]},
  {id:'newyork',n:'03',name:'ニューヨーク',en:'New York',country:'アメリカ',region:'NORTH AMERICA',coords:'40.71° N   74.01° W',accent:'#9ed0ea',sky:'#4e6591',desc:'高層ビルの谷間を抜けて、街路の先に広がる緑と水辺へ。',spawn:[0,78],hero:[[-43,34,104],[12,32,-35]],spots:[['avenue','ミッドタウン大通り','高層ビルの交差点へ',0,47],['park','セントラルパーク','公園の噴水広場へ',53,9],['skyline','スカイライン展望地点','川沿いから街を眺める',0,-83]]},
  {id:'cairo',n:'04',name:'カイロ',en:'Cairo',country:'エジプト',region:'AFRICA',coords:'30.04° N   31.24° E',accent:'#f0c170',sky:'#8a6250',desc:'砂漠の風が吹く石造りの街から、砂丘の向こうにそびえるピラミッドへ。',spawn:[0,81],hero:[[60,23,108],[-18,16,-40]],spots:[['market','旧市街の市場','布屋根の並ぶ通りへ',0,48],['oasis','オアシスの庭','ヤシの木の並ぶ池へ',48,9],['giza','ギザの砂漠','大ピラミッドの手前へ',-23,-26]]},
  {id:'sydney',n:'05',name:'シドニー',en:'Sydney',country:'オーストラリア',region:'OCEANIA',coords:'33.87° S   151.21° E',accent:'#83d6c6',sky:'#367b9d',desc:'帆のような屋根と青い港。海沿いの遊歩道を歩く。',spawn:[0,78],hero:[[44,20,77],[-14,11,-24]],spots:[['quay','サーキュラー・キー','波止場へ続く大通りへ',0,44],['opera','オペラハウス','白い帆の建物の正面へ',-12,-4],['bridge','ハーバーブリッジ展望地点','港の西側の展望デッキへ',-54,-12]]},
  {id:'rio',n:'06',name:'リオデジャネイロ',en:'Rio de Janeiro',country:'ブラジル',region:'SOUTH AMERICA',coords:'22.91° S   43.17° W',accent:'#8acbb4',sky:'#52807a',desc:'波模様の遊歩道から、南大西洋の浜辺と緑の山を見渡す。',spawn:[0,77],hero:[[74,35,101],[-16,12,-38]],spots:[['walk','コパカバーナ遊歩道','波模様の舗道へ',23,38],['beach','コパカバーナ海岸','パラソルの並ぶ浜辺へ',51,1],['mountain','コルコバード展望地点','山の上の像を見渡せる場所へ',-17,-31]]}
];
const cloudCover={tokyo:.42,paris:.5,newyork:.38,cairo:.16,sydney:.36,rio:.46};
const daylight={
  tokyo:[[.71,.82,.89],[.22,.51,.78],[-.49,.75,.44],.00235],
  paris:[[.78,.84,.88],[.32,.55,.79],[-.57,.72,.39],.00248],
  newyork:[[.68,.79,.88],[.23,.47,.76],[.53,.73,.42],.00265],
  cairo:[[.87,.84,.78],[.29,.53,.77],[-.43,.82,.39],.00284],
  sydney:[[.66,.81,.90],[.18,.48,.77],[.47,.79,.40],.00236],
  rio:[[.70,.83,.87],[.21,.52,.76],[.55,.75,.36],.00249]
};
export function lighting(city){
  const [horizon,zenith,sun,haze]=daylight[city.id];
  return {horizon,zenith,sun:normalize(sun),night:0,haze,clouds:cloudCover[city.id]??.4,ocean:city.id==='rio'||city.id==='sydney'?1:0};
}
export function blendLighting(from,to,progress){
  const t=progress*progress*(3-2*progress),mix=(a,b)=>a+(b-a)*t;
  const color=(a,b)=>a.map((value,i)=>mix(value,b[i]));
  return {horizon:color(from.horizon,to.horizon),zenith:color(from.zenith,to.zenith),
    sun:normalize(color(from.sun,to.sun)),night:mix(from.night,to.night),haze:mix(from.haze,to.haze),ocean:mix(from.ocean,to.ocean),
    clouds:mix(from.clouds??.4,to.clouds??.4),
    oceanBearing:color(from.oceanBearing??[-1,0],to.oceanBearing??[-1,0])};
}
const colorCache=new Map();
const rgb=color=>{
  if(!colorCache.has(color))colorCache.set(color,[0,2,4].map(i=>parseInt(color.slice(i,i+2),16)/255));
  return colorCache.get(color);
};
const lerp=(a,b,t)=>a+(b-a)*t;
export function build(city){
  const world={box:[],tube:[],cone:[],pyramid:[],ball:[],tri:[],obstacles:[],water:[],safe:[],map:[],vehicles:[],markings:[],anchors:{},furniture:[],lift:{}};
  let seed=16671+Number(city.n)*9127;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const range=(a,b)=>lerp(a,b,random()), pick=items=>items[Math.floor(random()*items.length)];
  let anchor=null;
  function assembly(x,z,draw,roadside=false){
    anchor={x,z,roadside};
    draw();
    anchor=null;
  }
  function add(type,instance){
    const list=world[type];
    if(anchor)(world.anchors[type]??=new Map()).set(list.length,anchor);
    list.push(...instance);
  }
  function shape(type,x,y,z,w,h,d,color,mat=0,yaw=0){
    const s=Math.sin(yaw),c=Math.cos(yaw);
    add(type,[x,y,z,c*w,0,-s*w,0,h,0,s*d,0,c*d,...rgb(color),mat]);
  }
  const box=(...args)=>shape('box',...args), tube=(...args)=>shape('tube',...args), cone=(...args)=>shape('cone',...args), ball=(...args)=>shape('ball',...args);
  function beam(type,a,b,w,d,color,mat=0){
    const v=b.map((n,i)=>n-a[i]),y=normalize(v),x=normalize(vectorCross(y,Math.abs(y[1])>.95?[0,0,1]:[0,1,0])),z=vectorCross(x,y);
    add(type,[...a.map((n,i)=>(n+b[i])*.5),...x.map(n=>n*w),...v,...z.map(n=>n*d),...rgb(color),mat]);
  }
  const rod=(a,b,w,c,mat)=>beam('box',a,b,w,w,c,mat);
  function triangle(a,b,c,paint,material){
    const u=b.map((value,i)=>value-a[i]),v=c.map((value,i)=>value-a[i]);
    add('tri',[...a,...u,...normalize(vectorCross(u,v)),...v,...rgb(paint),material]);
  }
  function bound(x,z,w,d,kind='obstacles'){
    world[kind].push([x-w/2,z-d/2,x+w/2,z+d/2]);
  }
  function ground(x,z,w,d,c,mat=1,y=0){
    box(x,y-.24,z,w,.48,d,c,mat);
    if(y>=0)world.map.push([x,z,w,d,c]);
  }
  const facade={
    tokyo:['ad9a93','c1a597','557480','8f9a9f','687e87','a7938c','849396'],
    paris:['c3ad95','d4bc9e','b8a290','d1baa1','bc9d7d'],
    newyork:['73929e','7d8898','968581','6a8296','a7958b','899ba0'],
    cairo:['c99c6c','bf9064','d3ac7a','af805c','c49a71'],
    sydney:['9aafb3','748c9b','b7a8a0','8699aa','c2a992'],
    rio:['ded0ac','9fb9ac','ddc0a4','b3b5a3','e0b299','acbfc0']
  }[city.id];
  function building(x,z,w,d,h,far=false){
    const c=pick(facade), glass=['tokyo','newyork','sydney'].includes(city.id)&&h>20&&random()<.67;
    const mat=glass?4:(city.id==='paris'?8:5);
    box(x,h*.5,z,w,h,d,c,mat);
    box(x,h+.12,z,w+.48,.4,d+.48,glass?'637783':'c5b29b');
    if(glass){
      box(x,h*.28,z,w+.06,.26,d+.06,'415968');
      box(x,h*.70,z,w+.06,.26,d+.06,'415968');
      box(x,h+.65,z,w*.51,1.1,d*.58,'62727b');
    }else{
      box(x,.62,z,w+.33,1.24,d+.33,'8b8076');
      box(x,h-.65,z,w+.40,.28,d+.40,'d2bda5');
      if(city.id==='paris'){
        box(x,h*.50,z,w+.27,.22,d+.27,'cbb9a3');
        shape('pyramid',x,h+2,z,w*1.36,3.9,d*1.36,'59606b',0,Math.PI/4);
        for(const q of [-.25,.26]){
          box(x+w*q,h+1,z+d*.31,1.7,1.7,1.8,'88817b',5);
          box(x+w*q,h+2,z+d*.31,2,.25,2,'4a535f');
        }
      }else box(x+w*.24,h+.59,z-d*.16,w*.24,.9,d*.32,'8d857e');
    }
    if(!far){
      bound(x,z,w+.48,d+.48);world.map.push([x,z,w,d,'354150']);
      if(!glass&&city.id!=='cairo'&&random()<.75){
        const awning=pick(['79434c','355e63','a66b47','3e586f']);
        box(x,2.6,z+d*.5+.68,w*.72,.18,1.65,awning);
        box(x,2.46,z+d*.5+1.51,w*.72,.34,.085,awning);
      }
    }
  }
  function tree(x,z,scale=1,palm=false){
    assembly(x,z,()=>{
      const trunk=pick(['6c5944','766148','8a7051']);
      tube(x,scale*(palm?2.6:1.46),z,.37*scale,scale*(palm?5.2:2.92),.35*scale,trunk);
      if(palm){
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4+random()*.45,r=range(1.3,2.1)*scale;
          const p=[x+Math.cos(a)*r,scale*5.4,z+Math.sin(a)*r];
          beam('tube',[x,scale*5.02,z],p,.45*scale,.25*scale,'5b823e',6);
          beam('tube',p,[x+Math.cos(a)*r*1.63,scale*4.62,z+Math.sin(a)*r*1.63],.28*scale,.21*scale,'567438',6);
        }
      }else{
        const leaves=pick(['547845','446b45','647945','597e50','385f46']);
        for(const [dx,dy,dz,w] of [[0,3.9,0,3.8],[-1.04,3.29,.25,2.8],[.97,3.35,.31,2.92],[.3,4.65,-.42,2.62]])ball(x+dx*scale,dy*scale,z+dz*scale,w*scale,w*.85*scale,w*scale,leaves,6);
      }
    },true);
  }
  function lamp(x,z,side=1){
    assembly(x,z,()=>{
      tube(x,1.85,z,.16,3.7,.16,'374750');
      box(x+side*.41,3.68,z,.94,.12,.13,'405157');
      box(x+side*.86,3.62,z,.43,.14,.31,'ffe6ae',STREET_LAMP);
      tube(x,.15,z,.32,.66,.32,'4b5459');
    },true);
  }
  function crossing(x,z){
    for(let i=-5;i<=5;i++)world.markings.push([x+i*.92,z,.50,3.15]);
    for(const side of [-1,1]){
      box(x+side*6.7,1.55,z+1.6,.14,3.1,.14,'37444b');
      box(x+side*6.7,2.92,z+1.6,.39,.71,.3,'212e36');
      for(let j=0;j<3;j++)box(x+side*6.7,2.71+j*.19,z+1.77,.16,.12,.038,SIGNAL_COLORS[j],SIGNAL_GREEN+j);
    }
  }
  function car(x,z,yaw,paint){
    world.vehicles.push({x,z,angle:yaw+Math.PI/2,paint});
  }
  function fountain(x,z,diam){
    tube(x,.16,z,diam+.6,.32,diam+.6,'8b8f8f');
    tube(x,.35,z,diam,.28,diam,'577f88',3);
    tube(x,.73,z,.63,1.05,.63,'a5a7a1');
    tube(x,1.17,z,2.1,.22,2.1,'a5a7a1');
    ball(x,1.27,z,1.82,.21,1.82,'74a4ad',3);
    bound(x,z,diam*.72,diam*.72);
  }
  function bench(x,z,yaw=0){
    const s=Math.sin(yaw),c=Math.cos(yaw);
    const part=(u,y,v,w,h,d,color)=>box(x+c*u+s*v,y,z-s*u+c*v,w,h,d,color,0,yaw);
    assembly(x,z,()=>{
      part(0,.53,0,1.85,.14,.59,'8f6e51');
      part(0,.81,-.21,1.85,.43,.10,'917358');
      for(const side of [-1,1])part(side*.63,.16,0,.11,.70,.36,'404a4f');
    });
    world.furniture.push([x,z,1.85,.59,yaw]);
  }
  function torii(x,z,scale=1){
    const s=scale;
    for(const q of [-1,1]){
      tube(x+q*2.7*s,2.63*s,z,.62*s,5.26*s,.62*s,'b94439',24);
      tube(x+q*2.7*s,.31*s,z,.79*s,.62*s,.79*s,'42434b',18);
    }
    box(x,4.47*s,z,7.10*s,.42*s,.46*s,'b64a39',24);
    box(x,5.49*s,z,8*s,.46*s,.65*s,'be4939',24);
    box(x,5.78*s,z,8.65*s,.22*s,.93*s,'343747',25);
    box(x,5.06*s,z,.7*s,.81*s,.54*s,'ad4634');
    box(x,5.07*s,z+.29*s,.45*s,.55*s,.08*s,'d6ae6a');
    for(const q of [-1,1])rod([x+q*3.8*s,5.72*s,z],[x+q*4.8*s,6.03*s,z],.24*s,'343747');
  }
  function lattice(x,z,levels,colors,scale=1){
    const starts=Object.fromEntries(['box','tube','ball'].map(kind=>[kind,world[kind].length]));
    for(let i=0;i<levels.length-1;i++){
      const [y0,r0]=levels[i],[y1,r1]=levels[i+1],c=colors[i%colors.length];
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
      const ring=(y,r)=>corners.map(([a,b])=>[x+a*r,y,z+b*r]);
      const a=ring(y0,r0),b=ring(y1,r1),y=(y0+y1)*.5;
      const m=ring(y,(r0+r1)*.5);
      for(let j=0;j<4;j++){
        const k=(j+1)%4;
        rod(a[j],b[j],i<3?1.13:.63,c,25);
        if(i>0||scale===1)rod(a[j],a[k],i<3?.69:.42,c,25);
        rod(m[j],m[k],i<3?.51:.31,c,25);
        rod(a[j],m[k],.37,c,25);rod(a[k],m[j],.37,c,25);
        rod(m[j],b[k],.33,c,25);rod(m[k],b[j],.33,c,25);
        if(i>0){
          const [px,py,pz]=a[j];
          box(px,py,pz,i<3?1.24:.73,i<3?.58:.39,i<3?1.24:.73,c,25);
        }
      }
      if(i===1||i===4){
        box(x,y1,z,r1*2+.8,.7,r1*2+.8,c,25);
        box(x,y1+.55,z,r1*2+.33,.45,r1*2+.33,'829198',4);
        box(x,y1+.81,z,r1*2+.48,.14,r1*2+.48,'acaaa0',25);
      }
    }
    const [height,r]=levels.at(-1);
    tube(x,height+2.8,z,Math.max(.36,r*.6),5.6,Math.max(.36,r*.6),'d9b5a1');
    ball(x,height+5.6,z,.48,.48,.48,'e97254',7);
    if(scale!==1)for(const [kind,start] of Object.entries(starts)){
      const data=world[kind];
      for(let i=start;i<data.length;i+=16){
        data[i]=x+(data[i]-x)*scale;data[i+1]*=scale;data[i+2]=z+(data[i+2]-z)*scale;
        for(let j=3;j<12;j++)data[i+j]*=scale;
      }
    }
  }
  if(city.id==='tokyo'){
    crossing(0,42);crossing(8,-23);
    const first=Object.fromEntries(['box','tube','ball','cone','tri'].map(kind=>[kind,world[kind].length]));
    tube(18,-.12,-58,96,.40,96,'adaba0',1);
    lattice(18,-58,[[.1,9],[7,7.4],[15,5.6],[23,4.0],[31,2.45],[40,1.75],[49,1.15],[58,.62]],['ba4a42','e1ddd2'],TOKYO_TOWER_SCALE);
    for(const a of [-1,1])for(const b of [-1,1]){
      ground(18+a*45,-58+b*45,10.8,10.8,'9b9b91',18,.08);
      bound(18+a*45,-58+b*45,7.3,7.3);
    }
    for(let i=0;i<8;i++){
      const angle=i*Math.PI/4,px=18+Math.sin(angle)*49.5,pz=-58+Math.cos(angle)*49.5;
      if(i%2===0){tree(px,pz,1.25);bench(px+2.1,pz+1.1,-angle);}
    }
    torii(18,-12,1.73);
    for(const [kind,start] of Object.entries(first))world.lift[kind]=[start,world[kind].length];
    for(const x of [13.33,22.67])bound(x,-12,1.37,1.37);
    ground(44,11,40,40,'7b8b73',9,.05);
    ground(44,6,7,38,'aa9a88',1,.065);
    torii(45,5,1.12);torii(45,-4,.88);
    box(45,2.4,-14,12,4.8,8,'b89475',5);
    shape('pyramid',45,5.55,-14,20,3.1,15,'414858',14,Math.PI/4);
    bound(45,-14,12,8);
    for(const x of [32,56])for(const z of [-7,4,16,23])tree(x,z,1.13);
    for(const s of [-1,1])for(const z of [-83,-64,-43,-17,7,25,53,75,88])lamp(s*8.1,z,-s);
    for(const z of [-79,-65,-33,5,25,66])car(z%3===0?-3.6:3.6,z,0,pick(['c78b74','d2ccc1','879da3','5a647b']));
    for(const z of [25,57,74,89])for(const side of [-1,1]){
      const x=side*11.5;
      box(x,.22,z,1.55,.44,1.55,'a2a097');
      box(x,.44,z,1.32,.09,1.32,'667b5a');
      tree(x,z,.72);
      if(z!==57)bench(x+side*1.17,z+2.8,Math.PI/2);
    }
  }
  if(city.id==='paris'){
    ground(-17,-57,37,50,'a7a08c',1,.065);
    lattice(-17,-63,[[0,9.3],[9,6.2],[17,4.3],[24,3.1],[34,2],[45,1.2],[54,.63]],['6b615b','7b6b5a']);
    for(const s of [-1,1])for(const z of [30,40,51,62,73,84,-24,-36,-48,-60,-73]){
      tree(s*10,z,.82);lamp(s*6.9,z+3,-s);
    }
    for(const x of [-52,-42,-32,13,23,33,43,53])for(const z of [-13,24])tree(x,z,1);
    for(const x of [-36,-23,25,42])bench(x,23);
    for(const z of [32,57,76])car(3,z,0,pick(['826e62','a77562','b0a79a']));
  }
  if(city.id==='newyork'){
    crossing(0,47);
    ground(53,8,38,50,'6d8b65',9,.08);ground(53,8,7,50,'a3a79a',1,.095);
    ground(53,9,24,20,'a6a197',1,.10);fountain(55,3,7);
    for(const x of [37,66])for(const z of [-12,-3,9,20,29])tree(x,z,range(.9,1.3));
    for(const x of [42,64])for(const z of [-4,20])bench(x,z);
    building(-29,-49,16,16,70);
    box(-29,73,-49,11,6,11,'a9a5a0',8);box(-29,77,-49,6,3,6,'ada8a2',8);
    tube(-29,82,-49,.65,8,.65,'b9ada2');ball(-29,86,-49,.45,.45,.45,'f76e6f',7);
    ground(0,-83,44,9,'a9a299',1,.065);
    for(const s of [-1,1])for(const z of [-78,-61,-42,-14,3,20,39,59,77])lamp(s*9.5,z,-s);
    for(const z of [-66,-46,-19,16,34,64])car(z<0?-4.1:4.1,z,0,pick(['dfb054','c5ad6c','d2d0c6','52687c']));
  }
  if(city.id==='cairo'){
    for(const [x,z,w,h] of [[-23,-58,49,34],[28,-78,37,25],[-68,-91,30,20]]){
      shape('pyramid',x,h*.5,z,w*1.415,h,w*1.415,'d2ad75',8,Math.PI/4);
      for(let j=0;j<3;j++){
        const y=.26+j*.49,width=w*(1-y/h)-.15;
        box(x,y,z,width,.51,width,j===0?'b59871':'c3a479',18);
      }
      bound(x,z,w*.80,w*.80);world.map.push([x,z,w,w,'8c7458']);
    }
    ground(47,9,33,29,'8b946b',9,.035);ground(48,3,21,11,'537f79',3,.055);bound(48,3,21,11,'water');
    for(const x of [34,61])for(const z of [-6,2,11,19])tree(x,z,range(.78,1.11),true);
    for(const s of [-1,1])for(const z of [32,40,48,56,64,73]){
      const x=s*9.6,c=pick(['af6551','b28e51','5f8177','a87a63']);
      assembly(x,z,()=>{
        box(x,2.65,z,4.2,.18,3.0,c);
        for(const q of [-1,1])for(const p of [-1,1])box(x+q*1.95,1.1,z+p*1.4,.12,3.0,.12,'766044');
        box(x,1.0,z,2.6,.15,.90,'a47b51');
        for(let i=0;i<4;i++)tube(x+i*.52-.78,1.20,z,.34,.25,.34,pick(['c59655','aa694d','916f4b']));
      });
      bound(x,z,2.7,1.1);
    }
    tube(-51,8,24,2.2,16,2.2,'c9a67e');
    tube(-51,13.5,24,3.2,.48,3.2,'c4aa87');
    cone(-51,17.8,24,2.6,3.6,2.6,'a07f68');
    for(let i=0;i<20;i++){
      const x=range(-127,128),z=range(-107,-18);
      if(Math.abs(x)>76)ball(x,-2.7,z,range(13,28),range(6,10),range(10,26),'c5a173',9);
    }
  }
  if(city.id==='sydney'){
    ground(-16,-19,46,31,'aaa69b',1,.09);bound(-16,-19,46,31,'safe');
    ground(-55,-16,23,26,'999f9e',1,.09);bound(-55,-16,23,26,'safe');
    ground(-12,-23,31,21,'b5aa98',1,.12);
    box(-12,.70,-23,26,1.4,17,'a79e8c',18);
    box(-12,2.0,-25,22,1.2,10,'52727d',4);
    for(const [i,h] of [8.8,12.7,15.1,12.4,8.6].entries()){
      const x=-22+i*4.4,z=-25+i*.69;
      const rings=Array.from({length:19},(_,j)=>Array.from({length:11},(_,k)=>{
        const t=j/18,across=k/5-1,curve=Math.sin(t*2.07),span=2.52*(1-t*.92);
        const edge=(1-Math.sqrt(1-across*across*.87))*(1.40+curve*h*.62);
        return [x+t*2.0+span*across,2.82+curve*h-edge,z+5.72-t*12.2+Math.abs(across)*span*.16];
      }));
      const underside=([x,y,z])=>[x,y-.19,z];
      const seam=(left,right)=>{
        triangle(left,right,underside(right),'c9c7b7',CERAMIC_SHELL);
        triangle(left,underside(right),underside(left),'c9c7b7',CERAMIC_SHELL);
      };
      for(let row=0;row<18;row++)for(let col=0;col<10;col++){
        const a=rings[row][col],b=rings[row][col+1],c=rings[row+1][col+1],d=rings[row+1][col];
        triangle(a,b,c,'e6e0d0',CERAMIC_SHELL);triangle(a,c,d,'e6e0d0',CERAMIC_SHELL);
        triangle(underside(a),underside(c),underside(b),'a9ada6',0);
        triangle(underside(a),underside(d),underside(c),'a9ada6',0);
        if(col===0)seam(a,d);
        if(col===9)seam(c,b);
        if(row===0)seam(b,a);
        if(row===17)seam(d,c);
      }
    }
    bound(-12,-24,26,17);
    for(const x of [-102,-83,-61,-41,-20])box(x,7.4,-53,24,.82,6,'535c65');
    for(const x of [-99,-24]){
      box(x,4.15,-53,5,21.3,8,'a5a39c');
      box(x,14.95,-53,6,.65,9,'b0ada3');
    }
    world.fixed={box:world.box.length,tri:world.tri.length};
    for(const z of [-56.1,-49.9]){
      let prev=null;
      for(let i=0;i<=16;i++){
        const t=i/16,p=[-99+t*75,9+Math.sin(t*Math.PI)*18,z];
        if(prev)rod(prev,p,.48,'586a73');
        if(i%2===0)rod([p[0],7.5,z],p,.29,'59666e');
        prev=p;
      }
    }
    for(const x of [-92,-75,-59,-43,23,37,51,64,80])lamp(x,-8,1);
    for(const x of [-81,-69,17,32,51,71])tree(x,1,.95);
    for(const x of [-55,-37,44,59])bench(x,-10);
  }
  if(city.id==='rio'){
    const x=-37,z=-105,y=0;
    box(x,y+.68,z,3.1,1.8,3.1,'9d9e93');
    tube(x,y+3.65,z,1.4,4.7,1.4,'d4d0bd');
    rod([x-3.2,y+5.1,z],[x+3.2,y+5.1,z],.69,'d4d0bd');
    ball(x,y+6.15,z,.88,1.06,.9,'d4d0bd');
    for(const zz of [-98,-76,-56,-39,-18,10,27,48,66,87,106]){
      tree(rioShore(zz)-17.7,zz,.88+random()*.43,true);
    }
    for(const zz of [-48,-34,-19,0,16,29,44,61])for(const offset of [5.2,8.7]){
      const xx=rioShore(zz)-offset;
      tube(xx,1.2,zz,.11,2.4,.11,'796b55');
      cone(xx,2.35,zz,3.4,.9,3.4,pick(['b75f50','d2a651','4c8192','cfbe9a']));
    }
  }
  return world;
}
