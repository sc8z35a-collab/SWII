import {normalize,vectorCross} from './vector.js';
export const TOKYO_TOWER_SCALE=5;
export const cities=[
  {id:'tokyo',n:'01',name:'東京',en:'Tokyo',country:'日本',region:'ASIA',coords:'35.68° N   139.69° E',accent:'#ed9276',sky:'#3c668a',desc:'朱色の塔が立つ島。海に囲まれた道が鳥居へ続く。',spawn:[0,79],hero:[[164,143,315],[-40,143,-45]],spots:[['crossing','中央大通り','交差点の白い横断歩道へ',0,43],['shrine','鳥居の参道','東京タワー下の鳥居へ',18,-9],['tower','東京タワー広場','赤と白の鉄塔を見上げる',15,-39]]},
  {id:'paris',n:'02',name:'パリ',en:'Paris',country:'フランス',region:'EUROPE',coords:'48.86° N   2.35° E',accent:'#e2ae77',sky:'#6d7794',desc:'セーヌ川の石橋から海へ続く島。',spawn:[0,77],hero:[[49,20,72],[-17,19,-43]],spots:[['boulevard','並木通り','島の中央を走る道へ',0,55],['seine','セーヌ川の橋','欄干越しに川を眺める',0,7],['eiffel','セーヌ北岸','川沿いの高台へ',-16,-40]]},
  {id:'newyork',n:'03',name:'ニューヨーク',en:'New York',country:'アメリカ',region:'NORTH AMERICA',coords:'40.71° N   74.01° W',accent:'#9ed0ea',sky:'#4e6591',desc:'ハドソン川と海に囲まれた島。',spawn:[0,78],hero:[[-43,34,104],[12,32,-35]],spots:[['avenue','ミッドタウン大通り','島の中央の交差点へ',0,47],['park','セントラルパーク','開けた緑地へ',53,9],['skyline','ハドソン川沿い','川と海を眺める',0,-83]]},
  {id:'cairo',n:'04',name:'カイロ',en:'Cairo',country:'エジプト',region:'AFRICA',coords:'30.04° N   31.24° E',accent:'#f0c170',sky:'#8a6250',desc:'緩やかな砂丘が海に落ち込む島。',spawn:[0,81],hero:[[60,23,108],[-18,16,-40]],spots:[['market','中央の砂道','砂丘へ続く通りへ',0,48],['oasis','オアシスの庭','島の東側へ',48,9],['giza','ギザの砂漠','大ピラミッドの手前へ',-23,-26]]},
  {id:'sydney',n:'05',name:'シドニー',en:'Sydney',country:'オーストラリア',region:'OCEANIA',coords:'33.87° S   151.21° E',accent:'#83d6c6',sky:'#367b9d',desc:'海沿いの道から青い港を見渡す。',spawn:[0,78],hero:[[44,20,77],[-14,11,-24]],spots:[['quay','サーキュラー・キー','波止場へ続く大通りへ',0,44],['opera','港の遊歩道','海沿いの道へ',-12,-4],['bridge','港の西岸','港の西側へ',-54,-12]]},
  {id:'rio',n:'06',name:'リオデジャネイロ',en:'Rio de Janeiro',country:'ブラジル',region:'SOUTH AMERICA',coords:'22.91° S   43.17° W',accent:'#8acbb4',sky:'#52807a',desc:'波模様の遊歩道から、南大西洋の浜辺と緑の山を見渡す。',spawn:[0,77],hero:[[74,35,101],[-16,12,-38]],spots:[['walk','コパカバーナ遊歩道','波模様の舗道へ',23,38],['beach','コパカバーナ海岸','南大西洋を望む浜辺へ',51,1],['mountain','コルコバード展望地点','緑の山を見渡せる場所へ',-17,-31]]}
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
export function build(city){
  const world={box:[],tube:[],ball:[],obstacles:[],lift:{}};
  if(city.id!=='tokyo')return world;
  function shape(type,x,y,z,w,h,d,color,mat=0){
    world[type].push(x,y,z,w,0,0,0,h,0,0,0,d,...rgb(color),mat);
  }
  const box=(...args)=>shape('box',...args),tube=(...args)=>shape('tube',...args),ball=(...args)=>shape('ball',...args);
  function rod(a,b,w,color,mat){
    const v=b.map((n,i)=>n-a[i]),y=normalize(v),x=normalize(vectorCross(y,Math.abs(y[1])>.95?[0,0,1]:[0,1,0])),z=vectorCross(x,y);
    world.box.push(...a.map((n,i)=>(n+b[i])*.5),...x.map(n=>n*w),...v,...z.map(n=>n*w),...rgb(color),mat);
  }
  function bound(x,z,w,d){
    world.obstacles.push([x-w/2,z-d/2,x+w/2,z+d/2]);
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
  tube(18,-.12,-58,96,.40,96,'adaba0',1);
  lattice(18,-58,[[.1,9],[7,7.4],[15,5.6],[23,4.0],[31,2.45],[40,1.75],[49,1.15],[58,.62]],['ba4a42','e1ddd2'],TOKYO_TOWER_SCALE);
  for(const a of [-1,1])for(const b of [-1,1]){
    box(18+a*45,-.16,-58+b*45,10.8,.48,10.8,'9b9b91',18);
    bound(18+a*45,-58+b*45,7.3,7.3);
  }
  torii(18,-12,1.73);
  for(const x of [13.33,22.67])bound(x,-12,1.37,1.37);
  for(const kind of ['box','tube','ball'])world.lift[kind]=[0,world[kind].length];
  return world;
}
