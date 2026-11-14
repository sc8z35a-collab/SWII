import {entryFoundation} from './building-sites.mjs';
import {entryPortal,recessedWindows} from './facade-details.mjs';
import {roofEquipment,roofFlashing,roofParapet} from './roof-details.mjs';
import {apartmentInterior,furnishRoom} from './apartment-rooms.mjs';
import {APARTMENT_GLASS} from '../dist/architecture-materials.js';

const detail=.25,glass='617e8a';
function parts({x,z,angle,front},geometry){
  const c=Math.cos(angle),s=Math.sin(angle);
  const point=(a,b)=>[x+a*c+b*front*s,z-a*s+b*front*c];
  const part=(kind,a,y,b,w,h,d,paint,mat=0,turn=0)=>{
    const [px,pz]=point(a,b);
    geometry.shape(kind,px,y,pz,w,h,d,paint,mat,angle+turn);
  };
  const obstacle=(a,b,w,d)=>geometry.collision(...point(a,b),w,d,angle);
  const block=(...args)=>part('box',...args);
  const solid=(a,y,b,w,h,d,paint,mat)=>{block(a,y,b,w,h,d,paint,mat);obstacle(a,b,w,d);};
  return {part,block,point,obstacle,solid};
}

export function buildApartment(plot,plan,geometry){
  const {width:w,depth:d,height:h,floors,roofHeight,level,front,access,look}=plot;
  const {part,block,obstacle,point:worldPoint}=parts(plot,geometry);
  const [surface,,stone,metal,roof]=plan.finish,paint=look.tone,material=look.surface(surface);
  const approach=entryFoundation(plot,geometry,stone,'b1aa98',access);
  const storey=(h-roofHeight)/floors;
  const floorAt=f=>f===0?0:f===1?floors:Math.max(1,Math.min(floors-1,Math.round(f*floors)));
  const volumes=plan.volumes.map(([x,z,width,depth,start,end,kind='box'])=>{
    const from=floorAt(start);
    return {a:x*w,b:z*d,width:width*w,depth:depth*d,from,to:Math.max(from+1,floorAt(end)),kind};
  });
  const entry=volumes.filter(v=>v.from===0).reduce((chosen,v)=>
    v.b+v.depth*.5+v.width*.06>chosen.b+chosen.depth*.5+chosen.width*.06?v:chosen);
  const facade=plan.facade;
  const loggia=({kind,depth})=>facade==='loggia'&&kind==='box'?Math.min(.96,depth*.12):0;
  const interior=apartmentInterior(plot.x,plot.z);
  let rooms=0;
  for(const volume of volumes){
    const {a,b,width,depth,from,to,kind}=volume;
    const low=level+from*storey,high=level+to*storey,edge=b+depth*.5,recess=loggia(volume);
    const physical=kind==='box'&&!['belt','ribbon','bay'].includes(facade);
    const span=width*(kind==='chamfer'?.72:physical?1:.93);
    const bays=Math.max(2,Math.round(span/(2.7*look.windowProfile[0]))),bay=span/bays;
    if(from===0)obstacle(a,b-recess*.5,width,depth-recess);
    const visible=(x,floor)=>!volumes.some(v=>v!==volume&&v.b+v.depth*.5>edge+.045&&
      floor>=v.from&&floor<v.to&&Math.abs(v.a-x)<v.width*.5+.06);
    const showcase=volume===entry;
    if(showcase){
      const rows=Math.min(3,to-from),floorHeight=rows*storey,back=b-depth*.5;
      const reveal=Math.max(.185,look.eraProfile[2]*.85),face=edge-recess;
      const roomDepth=Math.min(4.8,(depth-recess)*.76);
      const trimWidth=(width-span)*.5;
      if(kind==='chamfer'){
        const shoulder=width*.14,bevel=depth*.14;
        const facePoints=[
          [-width*.36,face],[-width*.5,face-bevel],[-width*.5,back+bevel],[-width*.36,back],
          [width*.36,back],[width*.5,back+bevel],[width*.5,face-bevel],[width*.36,face]
        ];
        for(let i=0;i<facePoints.length-1;i++){
          const [u0,v0]=facePoints[i],[u1,v1]=facePoints[i+1];
          const p=worldPoint(a+u0,v0),q=worldPoint(a+u1,v1);
          const l=[p[0],low,p[1]],r=[q[0],low,q[1]],h=[p[0],low+floorHeight,p[1]],k=[q[0],low+floorHeight,q[1]];
          if(front>0){geometry.triangle(l,h,r,paint,40);geometry.triangle(h,k,r,paint,40);}
          else{geometry.triangle(l,r,h,paint,40);geometry.triangle(h,r,k,paint,40);}
        }
        block(a,low+floorHeight*.5,(back+face-roomDepth)*.5,width-shoulder*2,floorHeight,face-roomDepth-back,paint,material);
      }else{
        block(a,low+floorHeight*.5,(back+face-roomDepth)*.5,width,floorHeight,face-roomDepth-back,paint,material);
        if(trimWidth>.035)for(const side of [-1,1])
          block(a+side*(span+trimWidth)*.5,low+floorHeight*.5,face-roomDepth*.5,trimWidth,floorHeight,roomDepth,paint,material);
      }
      if(to-from>rows)part(kind,a,low+floorHeight+(high-low-floorHeight)*.5,b-recess*.5,
        width,high-low-floorHeight,depth-recess,paint,material);
      for(let row=0;row<rows;row++){
        const floor=low+row*storey;
        for(let col=0;col<bays;col++){
          const x=a-span*.5+bay*(col+.5);
          const windowPaint=look.surface(18);
          part('window',x,floor+storey*.5,face-reveal*.5,bay,storey,reveal,paint,windowPaint,front<0?Math.PI:0);
          part('pane',x,floor+storey*.54,face-reveal+.007,bay*.782,storey*.68,.022,'82a1ac',APARTMENT_GLASS);
          block(x,floor+storey*.54,face-reveal+.026,.058,storey*.676,.058,look.frame,25);
          if(look.window%3===0)block(x,floor+storey*.43,face-reveal+.026,bay*.781,.052,.059,look.frame,25);
          part('chamfer',x,floor+storey*.193,face+.037,bay*.83,.105,.19,stone,18);
          if(roomDepth-reveal>=.92&&visible(x,row+from)){
            furnishRoom(part,{x,edge:face-reveal-.013,floor,w:bay-.038,height:storey,
              depth:roomDepth-reveal-.022,interior,row,col});
            rooms++;
          }else block(x,floor+storey*.5,face-reveal-.13,bay,storey,.20,'afb3a8',43);
        }
      }
    }else if(physical)recessedWindows(part,{a,b:b-recess*.5,w:width,d:depth-recess,low,high,
      front:1,facing:front,paint,trim:stone,material,look,rows:to-from,bays});
    else part(kind,a,(low+high)*.5,b-recess*.5,width,high-low,depth-recess,paint,material);
    for(let row=from;row<to;row++){
      const sill=level+row*storey;
      if(facade==='belt'||facade==='ribbon'){
        if(visible(a,row)){
          part(kind,a,sill+.15,b,width+.10,.25,depth+.10,stone,18);
          if(facade==='ribbon'&&row>0&&(!showcase||row>=from+3))block(a,sill+1.62,edge+.053,span*.96,1.24,.108,glass,10);
        }
        continue;
      }
      for(let col=0;col<bays;col++){
        const x=a-span*.5+bay*(col+.5);
        if(!visible(x,row))continue;
        const doorway=volume===entry&&row===0&&Math.abs(x-a)<bay*.76;
        if((facade==='gallery'||facade==='balcony')&&row>0){
          const rail=facade==='gallery'?bay:bay*.79,projection=facade==='gallery'?.76:.98+.21*(col%2);
          block(x,sill+.14,edge+projection*.43,rail,.21,projection,stone,18);
          block(x,sill+.61,edge+projection*.89,rail*.94,.73,.084,metal,15);
          block(x,sill+.99,edge+projection*.89,rail,.073,.104,stone,18+detail);
        }else if(recess){
          block(x,sill+.11,edge-recess*.5,bay,.21,recess,stone,18);
          block(x-bay*.48,sill+storey*.5,edge-.105,.20,storey,.23,stone,18);
          if(row>0)block(x,sill+.54,edge-.09,bay*.91,.73,.09,metal,15);
          if(row===0)obstacle(x-bay*.48,edge-.105,.20,.23);
        }else if(facade==='fins'||facade==='screen'){
          block(x-bay*.43,sill+storey*.51,edge+.075,.18,storey*.95,.37,stone,18);
          if(facade==='screen'&&!doorway){
            block(x,sill+2.26,edge+.26,bay*.74,.13,.49,metal,24);
            for(const offset of [-.27,-.09,.09,.27])
              block(x+bay*offset,sill+1.47,edge+.37,.082,1.54,.089,metal,24+detail);
          }
        }else if(facade==='bay'&&!doorway&&(!showcase||row>=from+3)){
          recessedWindows(part,{a:x,b:edge+.25,w:bay*.75,d:.64,low:sill+.49,high:sill+2.72,
            front:1,facing:front,paint:stone,trim:metal,material:18,look,rows:1,bays:1});
        }else if(facade==='shutters'&&!doorway){
          for(const side of [-1,1])block(x+side*bay*.40,sill+storey*.54,edge+.08,bay*.13,storey*.68,.11,metal,24);
        }else if(facade==='arch'&&!doorway){
          if(!physical&&(!showcase||row>=from+3))block(x,sill+1.51,edge+.055,bay*.58,1.69,.13,glass,10);
          part('chamfer',x,sill+2.52,edge+.10,bay*.75,.23,.20,stone,18);
        }
      }
    }
    const peak=to===floors,cap=peak?roofHeight:Math.min(roofHeight,.27);
    if(peak&&['gable','hip','mansard','saw'].includes(plan.roof)){
      const form=plan.roof==='hip'||plan.roof==='mansard'?'taper':'roof',sections=plan.roof==='saw'?2:1;
      for(let i=0;i<sections;i++)
        part(form,a+width*((i+.5)/sections-.5),high+cap*.5,b,width/sections+(sections===1?.08:0),cap,depth+.10,roof,14);
      roofFlashing(part,{a,b,width,depth,y:high,height:cap,type:plan.roof,metal:look.frame});
      if(plan.roof==='mansard')for(const side of [-1,1]){
        block(a+width*.22*side,high+cap*.34,edge-depth*.122,.84,cap*.69,.99,stone,18);
        block(a+width*.22*side,high+cap*.34,edge-depth*.122+.507,.54,cap*.42,.042,glass,10);
      }
    }else{
      part(kind,a,high+.09,b,width+.07,.18,depth+.07,stone,18);
      if(plan.roof==='garden'&&!volumes.some(v=>v.from===to&&v.b+v.depth*.5>=edge-.62)){
        for(const side of [-1,1]){
          const x=a+side*span*.28;
          block(x,high+.28,edge-.48,span*.24,.26,.50,stone,18);
          part('ball',x,high+.51,edge-.48,span*.22,.44,.47,'648063',6+detail);
        }
      }else if(peak&&plan.roof==='parapet'){
        roofParapet(part,{kind,a,b,width,depth,y:high+.18,height:cap-.18,stone,metal:look.frame,facing:front});
      }else if(peak&&plan.roof==='utility'){
        part(kind,a+width*.08,high+cap*.5,b-depth*.16,width*.39,cap,depth*.40,roof,25);
        roofParapet(part,{kind,a,b,width,depth,y:high+.18,height:.44,stone,metal:look.frame,facing:front});
        roofEquipment(part,{a,b:b+depth*.22,width,depth:depth*.73,y:high+.18,height:cap-.18,look});
      }
    }
  }
  entryPortal(part,{a:entry.a,level,edge:entry.b+entry.depth*.5-loggia(entry),front:1,
    width:Math.min(1.65,entry.width*.45),trim:stone,look,obstacle});
  return {approach,rooms,interior};
}

const letters={
  A:'010 101 111 101 101',B:'110 101 110 101 110',C:'011 100 100 100 011',D:'110 101 101 101 110',
  E:'111 100 110 100 111',F:'111 100 110 100 100',H:'101 101 111 101 101',I:'111 010 010 010 111',
  K:'101 101 110 101 101',L:'100 100 100 100 111',M:'10001 11011 10101 10001 10001',O:'010 101 101 101 010',
  N:'1001 1101 1011 1001 1001',
  P:'110 101 110 100 100',R:'110 101 110 101 101',S:'011 100 010 001 110',
  T:'111 010 010 010 010',U:'101 101 101 101 111',Y:'101 101 010 010 010'
};
export function storefrontSign(block,label,front,y,edge,width,height,paint){
  const glyphs=[...label].map(letter=>letters[letter].split(' '));
  const size=glyphs.reduce((sum,glyph)=>sum+glyph[0].length+1,0)-1;
  const cell=Math.min(height*.132,width*.84/size);
  block(0,y,edge,width,height,.14,paint,25);
  let offset=-size*cell*.5;
  for(const glyph of glyphs){
    for(const [row,bits] of glyph.entries())for(const run of bits.matchAll(/1+/g)){
      const span=run[0].length;
      block(front*(offset+cell*(run.index+span*.5)),y+cell*(2-row),edge+.083,
        cell*(span-.04),cell*.93,.031,'f3e8cc',7+detail);
    }
    offset+=cell*(glyph[0].length+1);
  }
}

export function buildFacility(plot,plan,geometry){
  const {width:w,depth:d,height:h,level,angle,access,look,front:facing}=plot;
  const {point,part,block,solid,obstacle}=parts(plot,geometry);
  const {trim,sign,roof,frontage}=plan,paint=look.tone,wall=look.surface(18);
  const approach=entryFoundation(plot,geometry,trim,'b9b2a2',access);
  const front=d*.5,cafe=frontage==='tables',mall=frontage==='mall',edge=cafe?d*.21:front;
  const roofHeight={booth:.34,flat:.36,warehouse:.82,gable:1.27,parapet:.49,awning:.82,canvas:1.18,hip:1.23,saw:1.19}[roof];
  const eave=h-roofHeight;
  if(frontage==='produce'){
    for(const side of [-1,1]){
      for(const b of [-d*.38,d*.38])solid(side*w*.43,level+eave*.5,b,.20,eave,.23,trim,24);
      part('roof',side*w*.253,level+eave+roofHeight*.5,0,w*.493,roofHeight,d+.21,
        side===1?'c0a675':sign,14);
      for(const b of [-d*.23,d*.23]){
        const a=side*w*.274;
        solid(a,level+.48,b,w*.25,.96,d*.24,paint,24);
        for(let i=-1;i<=1;i++)
          block(a+i*w*.064,level+1.02,b,w*.054,.22,d*.151,['b6764e','7f8e5b','c6a659'][i+1],detail);
      }
    }
    block(0,level+3.05,d*.38,w*.87,.32,.27,trim,24);
    storefrontSign(block,plan.label,facing,level+3.05,d*.38+.155,Math.min(w*.52,5.2),.60,sign);
    return approach;
  }
  const middle=(edge-front)*.5,length=edge+front,glassHeight=Math.min(mall?4.05:3.10,eave-.64);
  block(0,level+eave*.5,-front+.18,w,eave,.36,paint,wall);
  for(const side of [-1,1])block(side*(w*.5-.16),level+eave*.5,middle,.32,eave,length,paint,wall);
  block(0,level+eave-.16,middle,w,.32,length,trim,18);
  block(0,level+eave-.35,edge-1.23,w*.72,.047,.11,'f4dfad',7);
  obstacle(0,middle,w,length);
  const booth=roof==='booth',head=glassHeight+.11,jamb=.18+look.eraProfile[2];
  block(0,level+(head+eave)*.5,edge-.11,w,eave-head,.24,paint,wall);
  block(0,level+.12,edge-.14,w,.24,.28,trim,18);
  if(mall){
    block(0,level+5.30,edge+.06,w+.16,.33,.44,sign,25);
    block(0,level+7.43,edge+.095,w*.89,2.84,.12,'64848b',19);
    for(let i=1;i<12;i++)block(w*(i/12-.5),level+7.43,edge+.20,.16,2.84,.15,trim,25);
    block(0,level+4.36,edge+1.52,w*.54,.32,3.48,trim,25);
    block(0,level+4.16,edge+2.63,w*.49,.070,.14,'eadcba',7);
  }
  const count=booth?1:Math.max(2,Math.round(w/3)),bay=w/count,entry=booth?-1:Math.floor(count*.5);
  const stock=frontage==='books'?['845d53','c0a580','6d8895']:
    frontage==='medicine'?['b1beac','e6d5be','a1aabc']:['cd9c69','b2a377','9ba588'];
  for(let i=0;i<count;i++){
    const x=(i+.5)*bay-w*.5;
    block(x-bay*.5,level+glassHeight*.52,edge-jamb*.44,.13,glassHeight,jamb,sign,25);
    if(!booth)part('pane',x,level+glassHeight*.53,edge-jamb,bay-.10,glassHeight*.92,.02,glass,22);
    if(i===entry){
      entryPortal(part,{a:x,level,edge:edge-jamb-.06,front:1,width:Math.min(bay*.72,1.98),
        height:Math.min(2.32,glassHeight-.09),trim,look});
    }else{
      block(x,level+.48,edge-.67,bay*.76,.96,.69,'9b8b76',24);
      const rows=booth||frontage==='bread'?1:2;
      for(let j=0;j<rows;j++){
        block(x,level+1+j*.44,edge-.69,bay*.83,.10,.71,trim,24);
        for(let n=-1;n<=1;n++)block(x+n*bay*.22,level+1.12+j*.44,edge-.69,bay*.156,.21,.28,stock[(n+j+1)%3],detail);
      }
    }
  }
  if(['warehouse','flat','booth','parapet','awning'].includes(roof)){
    block(0,level+eave+roofHeight*.16,middle,w+.21,roofHeight*.32,length+.19,trim,18);
    if(roof==='parapet'||roof==='warehouse')
      block(0,level+eave+roofHeight*.54,edge-.19,w+.22,roofHeight*.91,.28,paint,wall);
    if(roof==='warehouse')block(-w*.27,level+eave+roofHeight*.53,-d*.24,w*.28,roofHeight*.94,d*.29,'798282',25);
    if(roof==='warehouse'||roof==='parapet')
      roofParapet(part,{kind:'box',a:0,b:middle,width:w,depth:length,y:level+eave+roofHeight*.32,
        height:roofHeight*.45,stone:trim,metal:sign,facing});
  }else{
    const n=roof==='saw'?2:1;
    for(let i=0;i<n;i++)part(roof==='hip'?'taper':'roof',(i+.5)*w/n-w*.5,
      level+eave+roofHeight*.5,middle,w/n+(n===1?.13:0),roofHeight,length+.21,sign,14);
    roofFlashing(part,{a:0,b:middle,width:w,depth:length,y:level+eave,height:roofHeight,type:roof,metal:sign});
  }
  storefrontSign(block,plan.label,facing,level+eave-.36,edge+.21,w*(roof==='warehouse'?.67:.83),
    roof==='warehouse'?.91:booth?.53:.65,sign);
  if(frontage==='medicine'){
    block(w*.405,level+eave-.36,edge+.31,.21,.48,.073,'bde8b9',7);
    block(w*.405,level+eave-.36,edge+.319,.46,.21,.073,'bde8b9',7);
  }
  if(cafe||booth||frontage==='bread'||roof==='warehouse'){
    const canopy=cafe?front-edge-.13:roof==='warehouse'?1.38:booth?.79:.84;
    const stripes=frontage==='bread'||cafe?7:1;
    for(let i=0;i<stripes;i++)block(w*.91*((i+.5)/stripes-.5),level+glassHeight+.018,edge+canopy*.46,
      w*.91/stripes,.12,canopy,i%2===0?sign:trim,24);
  }
  if(cafe){
    for(const side of [-1,1]){
      const x=side*w*.295,b=(edge+front)*.5;
      block(x,level+.37,b,.16,.74,.16,sign,25);
      part('tube',x,level+.79,b,1.06,.106,1.06,'b49a74',24);
      obstacle(x,b,.92,.92);
      for(const offset of [-.74,.74]){
        const chair=x+offset;
        solid(chair,level+.45,b,.39,.11,.41,sign,24+detail);
        block(chair+Math.sign(offset)*.15,level+.71,b,.074,.48,.38,sign,24+detail);
        for(const dx of [-.14,.14])for(const dz of [-.15,.15])
          block(chair+dx,level+.20,b+dz,.047,.40,.047,sign,25+detail);
      }
    }
  }else if(frontage==='postboxes'){
    solid(w*.395,level+.55,edge+.34,.55,1.10,.43,sign,25);
    block(w*.395,level+.89,edge+.569,.37,.051,.03,'eedac4',detail);
  }else if(frontage==='cycles'){
    const x=-w*.35,b=edge+.32,c=Math.cos(angle),s=Math.sin(angle),basis=[[c,0,-s],[s,0,c],[0,-1,0]];
    for(const delta of [-.44,.44]){
      const [px,pz]=point(x+delta,b);
      geometry.shape('tube',px,level+.31,pz,.59,.085,.59,'414b4a',detail,angle,basis);
      geometry.shape('tube',px,level+.31,pz,.49,.092,.49,'86918f',detail,angle,basis);
    }
    block(x,level+.54,b,.92,.07,.081,sign,25+detail);
    block(x+.33,level+.65,b,.068,.35,.074,sign,25+detail);
    block(x+.33,level+.82,b,.10,.059,.34,'414b4a',detail);
    block(x-.28,level+.62,b,.25,.068,.15,'414b4a',detail);
    obstacle(x,b,1.45,.27);
  }
  return approach;
}
