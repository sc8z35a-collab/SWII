import {normalize,vectorCross} from '../dist/engine.js';
import {entryFoundation} from './building-sites.mjs';

const detail=.25,grass=47,stone=18,wood=24,steel=25,rubber=42;
const species=['658355','71834e','52764c','779461','5f7858'];
export const parkPlans={
  japanese:{name:'日本庭園',size:[34,28],landscape:japaneseGarden},
  playground:{name:'遊具公園',size:[33,26],landscape:playground},
  flowers:{name:'花壇庭園',size:[32,27],landscape:flowerGarden},
  fountain:{name:'噴水広場',size:[35,28],landscape:fountainSquare},
  sports:{name:'スポーツ公園',size:[39,30],landscape:sportsCourt},
  pond:{name:'池のある公園',size:[38,31],landscape:pondGarden},
  botanical:{name:'植物庭園',size:[35,30],landscape:botanicalGarden},
  picnic:{name:'ピクニック公園',size:[34,28],landscape:picnicLawn},
  skate:{name:'スケート公園',size:[36,29],landscape:skatePark},
  woodland:{name:'雑木林公園',size:[38,31],landscape:woodlandWalk}
};
export const parksByCity={
  tokyo:['japanese','playground'],paris:['flowers','fountain'],newyork:['sports','pond'],
  cairo:['botanical','picnic'],sydney:['skate','woodland'],rio:['playground','fountain']
};

export function buildPark(plot,style,geometry){
  const {x,z,width:w,depth:d,level,angle,front}=plot;
  const {shape,triangle,collision,platform}=geometry;
  const c=Math.cos(angle),s=Math.sin(angle);
  const at=(a,h,b)=>[x+a*c+b*front*s,level+h,z-a*s+b*front*c];
  const part=(kind,a,h,b,w,hgt,d,tone,mat=0,turn=0)=>
    shape(kind,...at(a,h,b),w,hgt,d,tone,mat,angle+turn*front);
  const box=(...args)=>part('box',...args);
  const obstacle=(a,b,w,d,turn=0)=>{
    const [x,,z]=at(a,0,b);
    collision(x,z,w,d,angle+turn*front);
  };
  const surface=(a,b,w,d,tone,mat,h=.035)=>{
    const p=at(a-w*.5,h,b-d*.5),q=at(a+w*.5,h,b-d*.5);
    const r=at(a+w*.5,h,b+d*.5),s=at(a-w*.5,h,b+d*.5);
    triangle(p,q,r,tone,mat);triangle(p,r,s,tone,mat);
  };
  function beam(a,b,width,tone,mat=steel+detail){
    const p=at(...a),q=at(...b),delta=q.map((v,i)=>v-p[i]);
    const axis=normalize(delta),side=normalize(vectorCross(axis,Math.abs(axis[1])>.96?[1,0,0]:[0,1,0]));
    const cross=vectorCross(side,axis);
    shape('box',...p.map((v,i)=>(v+q[i])*.5),width,Math.hypot(...delta),width,tone,mat,0,[side,axis,cross]);
  }
  function walk(points,width,tone='bab3a0',mat=1){
    const edges=points.map(([a,b],i)=>{
      const previous=points[Math.max(i-1,0)],next=points[Math.min(i+1,points.length-1)];
      const u=next[0]-previous[0],v=next[1]-previous[1],half=width*.5/Math.hypot(u,v);
      return [at(a-v*half,.045,b+u*half),at(a+v*half,.045,b-u*half)];
    });
    for(let i=1;i<edges.length;i++){
      const [a,b]=edges[i-1],[c,d]=edges[i];
      triangle(a,b,c,tone,mat);triangle(b,d,c,tone,mat);
    }
  }
  function bench(a,b,face=1){
    for(const offset of [-.77,.77])box(a+offset,.245,b,.11,.43,.44,'56615c',steel+detail);
    for(const offset of [-.19,0,.19])box(a,.488,b+offset,2.00,.09,.163,'997757',wood+detail);
    for(const h of [.70,.88])box(a,h,b-face*.23,2.00,.138,.066,'987451',wood+detail);
    for(const offset of [-.77,.77])box(a+offset,.69,b-face*.25,.057,.53,.056,'57635d',steel+detail);
    obstacle(a,b,2,.57);
  }
  function tree(a,b,size,index,palm=false){
    const bark=palm?'84735b':'6f6050',trunk=.23*size;
    part('tube',a,1.23*size,b,trunk,2.46*size,trunk,bark,wood);
    const leaves=species[index%species.length];
    if(palm){
      for(let i=0;i<7;i++){
        const angle=i*Math.PI*2/7;
        part('ball',a+Math.sin(angle)*size*.72,size*(2.43+(i%2)*.12),b+Math.cos(angle)*size*.72,
          size*.53,size*.31,size*1.74,leaves,6,angle);
      }
    }else{
      beam([a,.83*size,b],[a+.40*size,2.61*size,b-.27*size],.094*size,bark,wood+detail);
      for(const [u,v,y,g] of [[0,0,3.1,1],[-.61,.12,2.78,.76],[.67,-.34,2.89,.82],[.08,.60,2.74,.70]])
        part('ball',a+u*size,y*size,b+v*size,2.52*size*g,1.98*size*g,2.34*size*g,leaves,6);
    }
    obstacle(a,b,trunk+.08,trunk+.08);
  }
  function flowers(a,b,w,d,index){
    part('chamfer',a,.135,b,w,.27,d,'a29c84',stone);
    part('chamfer',a,.265,b,w-.20,.08,d-.20,'79765b',9);
    const palette=['be777d','c69365','c8b664','b2a0c4','d6ccae'];
    const count=Math.max(4,Math.round(w*2.25));
    for(let i=0;i<count;i++)for(const side of [-1,1]){
      const x=a+Math.sin(i*11.7+index)*.075+w*((i+.5)/count-.5);
      const z=b+side*d*(.22+.045*Math.cos(i*7.2));
      part('ball',x,.36,z,.32,.31,.32,'6f8554',6+detail);
      part('ball',x,.54+.057*Math.sin(i*3.67),z,.20,.12,.20,palette[(i+index+side+5)%5],detail);
    }
    obstacle(a,b,w,d);
  }
  function basin(a,b,span,depth,h=.31,tone='69968b'){
    part('tube',a,h*.5,b,span+.43,h,depth+.43,'aaa18f',stone);
    part('tube',a,h+.014,b,span,.028,depth,tone,3);
    const rings=12;
    for(let i=0;i<rings;i++){
      const angle=i*2*Math.PI/rings;
      const px=a+Math.cos(angle)*span*.45,pz=b+Math.sin(angle)*depth*.45;
      obstacle(px,pz,span*.267+.23,depth*.268+.23);
    }
    obstacle(a,b,span*.68,depth*.68);
  }
  function ramp(a,b,span,depth,high){
    const near=at(a-span*.5,.041,b-depth*.5),right=at(a+span*.5,.041,b-depth*.5);
    const leftTop=at(a-span*.5,high,b+depth*.5),top=at(a+span*.5,high,b+depth*.5);
    triangle(near,right,leftTop,'979c98',12);triangle(leftTop,right,top,'979c98',12);
    for(const [p,q] of [[near,leftTop],[top,right]]){
      const bottom=[q[0],level+.035,q[2]];
      const foot=[p[0],level+.035,p[2]];
      triangle(p,q,bottom,'868c88',12);triangle(q,bottom,foot,'868c88',12);
    }
    const [px,,pz]=at(a,0,b);
    platform(px,pz,span,depth,angle,level+(high+.041)*.5,front*(high-.041)/depth);
  }
  const approach=entryFoundation(plot,geometry,'a09d8d','b8b3a1',plot.access);
  surface(0,0,w,d,plot.id==='cairo'?'87955f':'7d995e',grass,.025);
  for(const side of [-1,1]){
    for(let i=0;i<10;i++){
      const a=side*(w*.474+.21*Math.sin(i*1.23)),b=d*(i/11-.404);
      const size=.64+.29*Math.sin(i*1.7)**2,high=.45+size*.24;
      part('ball',a,high*.58,b,size,high,size*1.42,species[(i+side+3)%5],6);
    }
    for(let i=0;i<5;i++){
      const a=side*w*(.23+i*.045),b=d*.449;
      const size=.73+.19*Math.sin(i*2.4)**2;
      part('ball',a,.39,b,size,.58,size*.89,species[(i+side+3)%5],6);
    }
  }
  const landscape=parkPlans[style].landscape;
  landscape({w,d,part,box,obstacle,surface,walk,beam,bench,tree,flowers,basin,ramp});
  return {approach,style,name:parkPlans[style].name,yaw:Math.atan2(x-approach[0],approach[1]-z)};
}

function japaneseGarden({w,d,walk,basin,tree,part,box,bench,obstacle}){
  walk([[0,d*.50],[0,d*.34],[-w*.22,d*.20],[-w*.24,-d*.12],[0,-d*.31],[w*.20,-d*.21]],1.93,'b3aa91',35);
  basin(w*.20,-d*.05,w*.39,d*.44,.24,'698e86');
  for(const [a,b,i] of [[-.37,.29,1],[-.36,-.25,4],[.37,.34,2],[.36,-.29,3]])tree(a*w,b*d,1.12+i*.12,i);
  for(const [a,b] of [[-.11,.23],[-.14,-.25],[.32,.18]]){
    const x=a*w,z=b*d;
    part('chamfer',x,.13,z,.62,.26,.62,'9c9a87',stone);
    box(x,.43,z,.16,.49,.16,'999887',stone);
    box(x,.78,z,.43,.27,.43,'828575',stone);
    part('taper',x,1.01,z,.61,.25,.60,'a5a38f',stone);
    obstacle(x,z,.57,.57);
  }
  bench(-w*.20,-d*.34,1);
}

function playground({w,d,surface,walk,box,part,beam,bench,tree,obstacle}){
  walk([[0,d*.50],[0,d*.30],[-w*.22,d*.24],[-w*.26,-d*.29]],2.0);
  surface(w*.06,-d*.067,w*.68,d*.59,'b69165',rubber,.044);
  const tower=w*.19;
  for(const a of [-.81,.81])for(const b of [-.81,.81])
    box(tower+a,1.14,b-2,.16,2.24,.16,'9c7456',wood);
  box(tower,1.65,-2,1.78,.19,1.78,'b38959',wood);
  part('roof',tower,2.65,-2,2.04,.65,2.02,'af6251',steel);
  for(const a of [-.41,.41])beam([tower+a,1.75,-1.12],[tower+a,.29,2.32],.101,'be9a53');
  for(let i=0;i<8;i++)box(tower,1.64-i*.18,-1.12+i*.43,.83,.072,.59,'c9a250',rubber);
  for(let i=0;i<5;i++)box(tower,.30+i*.28,-3.17,.67,.065,.18,'9e785b',wood);
  obstacle(tower,-1,1.98,4.02);
  const center=-w*.12;
  for(const a of [-1.87,1.87])for(const b of [-.88,.88])
    beam([center+a,.07,b-.93],[center+a,2.53,-.93],.11,'517878');
  beam([center-1.93,2.53,-.93],[center+1.93,2.53,-.93],.13,'517878');
  for(const a of [-.94,.94]){
    for(const b of [-.16,.16])beam([center+a+b,2.48,-.93],[center+a+b,.72,-.86],.024,'586668');
    box(center+a,.70,-.86,.43,.10,.27,'a46054',rubber);
  }
  obstacle(center,-.93,3.96,1.83);
  bench(w*.23,d*.28);
  for(const side of [-1,1])tree(side*w*.36,-d*.36,1.01,side+2);
}

function flowerGarden({w,d,walk,flowers,bench,tree}){
  walk([[0,d*.50],[0,-d*.35]],2.1,'c4bba3',35);
  for(const sign of [-1,1]){
    walk([[0,d*.25],[sign*w*.34,d*.25],[sign*w*.34,-d*.28],[0,-d*.28]],1.61,'c4bba3',35);
    for(let i=0;i<3;i++)flowers(sign*w*.18,d*(.13-.15*i),w*.22,d*.085,i+sign+2);
    bench(sign*w*.18,d*.33,-1);
    tree(sign*w*.36,-d*.36,.98,sign+2);
  }
}

function fountainSquare({w,d,surface,basin,part,bench,tree,walk}){
  surface(0,0,w*.91,d*.91,'beb7a8',1);
  const span=Math.min(w,d)*.32;
  basin(0,-d*.06,span,span,.49,'6797a1');
  part('tube',0,.81,-d*.06,.63,1.07,.63,'aba897',stone);
  part('tube',0,1.18,-d*.06,1.55,.21,1.55,'b4ae99',stone);
  part('tube',0,1.30,-d*.06,1.25,.032,1.25,'8ca9a5',3);
  walk([[0,d*.50],[0,d*.26]],2.52,'c6bfae',1);
  for(const sign of [-1,1]){
    bench(sign*w*.25,d*.21);
    tree(sign*w*.35,-d*.33,1.29,sign+2);
    tree(sign*w*.36,d*.31,1.16,sign+3);
  }
}

function sportsCourt({w,d,surface,box,bench,walk,obstacle}){
  const cw=w*.70,cd=d*.61,b=-d*.082;
  walk([[0,d*.5],[0,b+cd*.49]],2.2);
  surface(0,b,cw,cd,'9c7261',rubber,.047);
  surface(0,b,cw*.88,.072,'e2deca',0,.053);
  for(const side of [-1,1]){
    surface(side*cw*.446,b,.078,cd*.86,'e5dfcb',0,.054);
    surface(0,b+side*cd*.429,cw*.89,.078,'e5dfcb',0,.054);
    surface(side*cw*.364,b,cw*.16,.065,'e5dfcb',0,.054);
    box(side*cw*.47,1.53,b,.115,3.05,.115,'5b706e',steel);
    box(side*cw*.45,2.71,b,.13,.79,1.45,'c4cec1',steel);
    box(side*cw*.431,2.48,b,.48,.068,.46,'ab6849',steel+detail);
    obstacle(side*cw*.47,b,.29,.29);
    bench(side*w*.28,d*.30);
  }
  const z=b-cd*.50;
  for(let i=0;i<=12;i++)box(cw*(i/12-.5),1.19,z,.079,2.36,.079,'617b73',steel);
  for(const y of [.15,.83,1.49,2.31])box(0,y,z,cw,.039,.051,'647b74',steel);
  obstacle(0,z,cw,.13);
}

function pondGarden({w,d,basin,walk,bench,tree,part}){
  basin(0,-d*.065,w*.60,d*.54,.25,'648b81');
  walk([[0,d*.50],[0,d*.30],[-w*.30,d*.25],[-w*.39,.02*d],[-w*.33,-d*.26],
    [0,-d*.41],[w*.32,-d*.25],[w*.39,.01*d],[w*.29,d*.24],[0,d*.30]],1.71,'b4b09b',35);
  for(const sign of [-1,1]){
    tree(sign*w*.405,-d*.36,1.10,sign+3);
    bench(sign*w*.26,d*.34,1);
    for(let i=0;i<5;i++)part('ball',sign*w*(.112+.033*i),.28,-d*(.22-.019*i),.49,.08,.38,'7b985b',6+detail);
  }
}

function botanicalGarden({w,d,walk,box,part,bench,tree,flowers,obstacle}){
  walk([[0,d*.50],[0,-d*.34]],2.23,'bdb198',35);
  for(const side of [-1,1]){
    for(let i=0;i<3;i++){
      const x=side*w*.26,b=d*(.21-i*.22);
      flowers(x,b,w*.25,d*.115,i+3);
      if(i%2)tree(x,b+.09*d,1.09,2,true);
      else{
        part('ball',x,.94,b,.68,1.15,.68,'66875b',6);
        part('ball',x+.30,.74,b,.47,.70,.54,'7a915c',6);
      }
    }
    for(const x of [w*.09,w*.38]){
      box(side*x,1.23,-d*.35,.13,2.45,.13,'8d785d',wood);
      obstacle(side*x,-d*.35,.22,.22);
    }
    for(let i=0;i<8;i++)box(side*w*(.08+i*.045),2.45,-d*.35,.083,.16,1.98,'9e8565',wood);
    box(side*w*.24,2.35,-d*.35,w*.33,.15,.15,'8e7659',wood);
    bench(side*w*.24,-d*.35,-1);
  }
}

function picnicLawn({w,d,walk,box,part,obstacle,tree}) {
  walk([[0,d*.50],[0,d*.20],[-w*.14,-d*.06],[w*.17,-d*.34]],2.03,'b6ab8f',35);
  for(const side of [-1,1])for(const row of [0,1]){
    const a=side*w*(.26+.045*row),b=d*(.27-.45*row);
    tree(a+side*w*.115,b-.092*d,1.35,row+side+2,side>0);
    box(a,.82,b,2.02,.12,.80,'9b7a54',wood);
    for(const u of [-.72,.72]){
      box(a+u,.40,b,.10,.78,.12,'655f50',wood);
      box(a+u,.34,b,.11,.10,1.54,'74664f',wood);
    }
    for(const offset of [-.65,.65])box(a,.47,b+offset,2.03,.092,.26,'a28058',wood);
    if(row===0){
      part('tube',a,1.42,b,.078,2.81,.078,'6b6e64',steel);
      part('cone',a,2.69,b,2.85,.65,2.85,side>0?'ad7861':'8c9f7b',41);
    }
    obstacle(a,b,2.13,1.64);
  }
}

function skatePark({w,d,surface,walk,ramp,box,beam,bench,tree,obstacle}){
  walk([[0,d*.50],[0,d*.29]],2.24);
  surface(0,-d*.09,w*.76,d*.68,'a6aba6',12,.036);
  for(const sign of [-1,1]){
    ramp(sign*w*.22,-d*.22,w*.20,d*.21,.97);
    box(sign*w*.22,.49,-d*.108,w*.202,.96,.09,'8b938f',12);
    obstacle(sign*w*.22,-d*.103,w*.203,.15);
    bench(sign*w*.31,d*.31);
    tree(sign*w*.39,-d*.34,1.04,sign+3);
  }
  box(0,.186,-d*.074,w*.20,.32,.63,'8e9590',12);
  beam([-w*.095,.44,-d*.08],[w*.095,.44,-d*.08],.065,'5d7574');
  obstacle(0,-d*.074,w*.205,.68);
}

function woodlandWalk({w,d,walk,bench,tree,part,obstacle}){
  walk([[0,d*.50],[-w*.08,d*.32],[-w*.19,d*.15],[-w*.12,-d*.064],[w*.19,-d*.24],[w*.24,-d*.36]],2.05,'aa9e82',35);
  for(const [a,b,size,i] of [[-.33,.30,1.20,0],[-.32,.08,1.48,1],[-.37,-.18,1.36,2],[-.17,-.32,1.64,3],
    [.05,-.37,1.15,4],[.36,-.25,1.46,2],[.20,-.04,1.34,0],[.35,.10,1.59,4],[.23,.28,1.29,3],[.045,.19,.98,1]]){
    tree(a*w,b*d,size,i);
    part('chamfer',a*w+.72,.18,b*d+.31,.68,.34,.56,'8f9383',stone);
    obstacle(a*w+.72,b*d+.31,.66,.55);
  }
  bench(-w*.265,-d*.26);
  bench(w*.13,d*.36);
}
