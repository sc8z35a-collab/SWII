import {entryFoundation} from './building-sites.mjs';
import {entryPortal} from './facade-details.mjs';

// Each entry spans two relative heights above the podium and has its own width, depth and center.
const forms={
  spire:[[0,.49,.88,.91,0,0,'chamfer'],[.49,.72,.69,.73,0,0],[.72,.86,.47,.52,0,0],
    [.86,.94,.36,.39,0,0,'taper'],[.94,1,.055,.055,0,0,'cone']],
  crown:[[0,.76,.84,.83,0,0,'chamfer'],[.76,.91,.67,.68,0,0,'chamfer'],[.91,1,.68,.68,0,0,'taper']],
  needle:[[0,.24,.66,.75,0,0],[.24,.89,.56,.62,0,0],[.89,1,.49,.55,0,0,'taper']],
  slot:[[0,.90,.38,.76,-.24,0],[0,.81,.37,.70,.23,0],[.56,.63,.86,.49,0,0],[.90,1,.35,.66,-.24,0,'taper']],
  stepped:[[0,.35,.91,.84,0,0],[.35,.63,.74,.72,-.075,0],[.63,.83,.59,.58,-.14,.05],[.83,1,.43,.45,-.21,.05]],
  ribbon:[[0,.38,.82,.81,0,0,'chamfer'],[.38,.72,.69,.67,.04,.06,'chamfer'],[.72,1,.57,.57,.10,.09,'chamfer']],
  fluted:[[0,.93,.75,.86,0,0],[.08,.94,.86,.37,0,0],[.93,1,.66,.66,0,0,'chamfer']],
  terraced:[[0,.36,.91,.84,0,0,'chamfer'],[.36,.67,.73,.74,0,-.04],[.67,.87,.56,.62,.02,-.07],[.87,1,.40,.45,.04,-.11]],
  prism:[[0,.93,.88,.80,0,0,'chamfer',.15],[.93,1,.85,.76,0,0,'taper',.15]],
  offset:[[0,.38,.80,.83,-.07,0],[.38,.68,.72,.76,.07,.01],[.68,.94,.64,.68,-.08,0],[.94,1,.45,.54,-.08,0]],
  skybridge:[[0,.95,.33,.66,-.255,0],[0,.83,.34,.63,.24,0],[.64,.71,.86,.51,0,0],[.95,1,.32,.64,-.255,0,'taper']],
  pinwheel:[[0,.37,.78,.77,0,0,'chamfer'],[.37,.69,.72,.71,0,0,'chamfer',.17],[.69,1,.64,.66,0,0,'chamfer',.34]],
  blade:[[0,.68,.81,.51,0,-.10,'chamfer'],[.14,.82,.45,.65,-.13,.07],[.68,1,.70,.49,0,-.10,'taper']],
  beveled:[[0,.83,.88,.82,0,0,'chamfer'],[.83,1,.74,.68,.05,.04,'taper']],
  arc:[[0,.87,.84,.89,0,0,'tube'],[.17,.84,.55,.70,-.13,.09,'chamfer'],[.87,1,.62,.69,0,0,'tube']],
  pavilion:[[0,.72,.90,.84,0,0],[.72,.90,.72,.70,0,0,'chamfer'],[.90,1,.69,.66,0,0,'roof']],
  obelisk:[[0,.23,.85,.87,0,0,'chamfer'],[.23,.93,.80,.81,0,0,'taper'],[.93,1,.45,.45,0,0,'pyramid']],
  paired:[[0,.94,.45,.75,-.21,.05,'chamfer'],[0,.72,.43,.72,.22,-.08,'chamfer'],[.94,1,.39,.64,-.21,.05,'taper']],
  screen:[[0,.90,.73,.79,0,0],[.07,.87,.92,.46,0,0,'chamfer'],[.90,1,.49,.52,0,0,'roof']],
  lantern:[[0,.69,.90,.84,0,0],[.69,.90,.69,.68,0,0,'chamfer'],[.90,1,.52,.59,0,0,'tube']],
  sail:[[0,.28,.90,.81,0,0,'chamfer'],[.28,.96,.85,.78,0,0,'taper'],[.96,1,.48,.44,0,0,'taper']],
  rotunda:[[0,.79,.83,.86,0,0,'tube'],[.79,.93,.75,.80,0,0,'tube'],[.93,1,.64,.70,0,0,'tube']],
  fold:[[0,.51,.91,.79,0,0,'chamfer'],[.51,.89,.72,.70,-.09,.035,'chamfer',-.21],[.89,1,.62,.61,-.09,.035,'taper',-.21]],
  loggia:[[0,.81,.69,.79,0,0],[.04,.88,.89,.50,0,0,'chamfer'],[.81,1,.55,.64,0,0,'chamfer']],
  veranda:[[0,.58,.83,.81,0,0,'chamfer'],[.58,.86,.73,.65,0,-.08],[.86,1,.61,.60,0,-.08,'chamfer']],
  balconies:[[0,.87,.81,.86,0,0],[.87,1,.67,.75,0,-.05,'chamfer']],
  'brise-soleil':[[0,.77,.83,.83,0,0],[.77,1,.67,.64,0,0,'chamfer']],
  portico:[[0,.71,.85,.82,0,0],[.71,.87,.74,.72,0,0,'chamfer'],[.87,1,.70,.69,0,0,'roof']]
};
const tones={
  tokyo:['819ba6','c4c2b1','374955','5e5950','554239','c6c9bb'],
  newyork:['829aa9','c0a98e','3b4850','66564b','745847','d3c6ab'],
  paris:['93a7ae','d0c2a8','404c55','756b5a','715344','ded5be'],
  cairo:['94a7a1','c6ac82','5a5c51','9d8769','7c5138','dbc39a'],
  sydney:['7ca4ac','cbc8b9','415660','546b68','795b49','cbd3cc'],
  rio:['84a9a8','dad0bc','4c615f','8b806d','875c45','ded0b6']
};
const masonry=new Set(['spire','stepped','beveled','obelisk','paired','screen','portico']);
const ribs=new Set(['fluted','needle','ribbon','blade','loggia','veranda','brise-soleil','balconies','skybridge']);
const detail=.25;

export function buildTower(plan,geometry){
  const {shape,skyShape,collision}=geometry;
  const {id,name,x,z,width:w,depth:d,height:h,angle,front,level,site,access}=plan;
  const c=Math.cos(angle),s=Math.sin(angle);
  const [glass,stone,frame,upholstery,wood,floor]=tones[id];
  const material=masonry.has(name)?20:ribs.has(name)?21:19;
  const look=geometry.appearance(id,x,z,h,material,material===20?stone:glass);
  const skin=look.tone;
  const podium=6.25+(h>=196?1.55:0);
  const outer=d*.5, door=4.55;
  const point=(a,b)=>[x+a*c+b*s,z-a*s+b*c];
  const part=(kind,a,y,b,wide,tall,deep,paint,mat=0,turn=0)=>{
    const [u,v]=point(a,b);
    shape(kind,u,y,v,wide,tall,deep,paint,mat,angle+turn);
  };
  const block=(...args)=>part('box',...args);
  const solid=(a,y,b,wide,tall,deep,paint,mat=0)=>{
    block(a,y,b,wide,tall,deep,paint,mat);
    collision(...point(a,b),wide,deep,angle);
  };
  const approach=entryFoundation(plan,geometry,stone,floor,access);
  const [dx,dz]=point(0,outer*front);

  solid(0,level+podium*.48,-front*(outer-.31),w,podium*.96,.62,stone,18);
  for(const side of [-1,1])solid(side*(w*.5-.29),level+podium*.48,0,.58,podium*.96,d,stone,18);
  block(0,level+podium-.35,0,w+.20,.70,d+.20,stone,23);
  block(0,level+podium-.79,0,w+.39,.16,d+.38,frame,25);
  block(0,level+podium-1.21,outer*front,w,.84,.56,stone,18);
  block(0,level+podium-1.64,outer*front,w+.16,.069,.69,frame,25+detail);
  const glassY=level+(podium-1.63)*.5;
  const glassH=podium-1.63;
  const glazing=.78+look.eraProfile[2];
  const edge=(w-door)*.5;
  const bays=Math.max(2,Math.round(edge/2.75));
  for(const side of [-1,1]){
    for(let k=0;k<bays;k++){
      const bay=edge/bays,a=side*(door*.5+bay*(k+.5));
      part('pane',a,glassY,front*(outer-glazing),bay-.12,glassH,.022,glass,22);
      collision(...point(a,front*(outer-glazing)),bay,.12,angle);
      block(a,level+.12,front*(outer-glazing*.49),bay,.24,glazing+.15,stone,23);
      block(a,level+2.85,front*(outer-glazing+.04),bay,.08,.09,frame,25);
      block(side*(door*.5+bay*k),glassY,front*(outer-glazing*.55),.15,glassH,glazing,frame,25);
      block(a,level+glassH+.035,front*(outer-glazing*.54),bay,.070,glazing+.09,frame,25+detail);
      block(a,level+glassH+.018,front*(outer-glazing+.14),bay*.82,.036,.079,'e8d4a8',7+detail);
    }
    solid(side*(door*.5+.22),level+glassH*.5,front*(outer-.15),.43,glassH,.85,stone,18);
    solid(side*(w*.5-.43),level+glassH*.5,front*(outer-.23),.83,glassH,1.02,stone,18);
  }
  // Deep entry jambs, soffit and a continuous band of warm light mark the open doorway.
  entryPortal(part,{level,edge:outer*front,front,width:door,height:3.72,trim:stone,look,open:true,
    obstacle:(a,b,w,d)=>collision(...point(a,b),w,d,angle)});
  block(0,level+.033,front*(outer-2.1),door-.84,.051,2.72,upholstery,24);

  const rear=-front*(outer-1.45),hall=front*(outer*.10),column=Math.min(w*.29,10.6);
  for(const side of [-1,1]){
    const x=side*(w*.5-.77);
    block(x,level+.025,0,.24,.036,d*.91,'7a7971',23+detail);
    for(const z of [-d*.25,0,d*.25]){
      block(x*.62,level+podium-1.03,z,w*.25,.13,.62,stone,18);
      block(x*.62,level+podium-1.11,z,w*.21,.048,.22,'f3ddaf',7+detail);
    }
  }
  for(const side of [-1,1]){
    for(const b of [-d*.27,d*.27]){
      solid(side*column,level+podium*.46,b,.78,podium*.92,.79,stone,23);
      block(side*column,level+.22,b,.94,.44,.96,frame,25);
    }
    const lightX=side*w*.26;
    block(lightX,level+podium-.79,0,.12,.07,d*.65,'f1d7a7',7);
    block(lightX,level+podium-.93,front*outer*.50,1.42,.065,.12,'fff0cf',7);
    const seatX=side*w*.28,seatZ=front*(outer-4.1);
    solid(seatX,level+.39,seatZ,3.25,.47,.97,upholstery);
    block(seatX,level+.81,seatZ+front*.39,3.25,.73,.18,upholstery);
    for(const edge of [-1,1])block(seatX+edge*1.52,level+.70,seatZ,.18,.39,.93,upholstery);
    const tableZ=seatZ-front*1.52;
    solid(seatX,level+.20,tableZ,1.64,.40,.88,wood,24);
    block(seatX,level+.43,tableZ,1.84,.09,1.03,stone,23);
    const planterX=side*(w*.5-1.68),planterZ=front*(outer-2.48);
    solid(planterX,level+.39,planterZ,.94,.78,.94,wood,24);
    part('tube',planterX,level+1.19,planterZ,.12,.89,.12,'766852');
    part('ball',planterX,level+1.77,planterZ,.94,.98,.86,'547650',6);
    part('ball',planterX+side*.32,level+1.58,planterZ,.77,.81,.72,'658453',6);
  }
  const deskX=-w*.26,deskZ=-front*(outer*.43);
  solid(deskX,level+.52,deskZ,w*.22,1.04,1.45,wood,24);
  block(deskX,level+1.085,deskZ,w*.22+.22,.13,1.59,stone,23);
  block(deskX+.52,level+1.42,deskZ,.51,.38,.09,frame,10);
  block(deskX+.52,level+1.18,deskZ,.31,.08,.18,frame,25);
  for(const a of [-2.22,0,2.22]){
    block(a,level+1.46,rear,1.95,2.92,.30,frame,25);
    block(a-.44,level+1.37,rear+front*.18,.82,2.68,.11,'8a9292',25);
    block(a+.44,level+1.37,rear+front*.18,.82,2.68,.11,'8a9292',25);
    block(a,level+3.15,rear+front*.23,.27,.11,.075,'dfbc83',7);
  }
  solid(0,level+1.55,rear-.08*front,6.55,3.1,.32,frame,25);
  block(0,level+3.44,rear-front*.09,7.44,.32,.41,wood,24);
  const [ix,iz]=point(0,hall);

  const shaft=h-podium;
  for(const [from,to,wide,deep,a,b,kind='box',turn=0] of forms[name]){
    const [u,v]=point(a*w,b*d),tall=(to-from)*shaft;
    const cap=from>=.86&&kind!=='box';
    skyShape(kind,u,level+podium+shaft*(from+to)*.5,v,w*wide,tall,d*deep,cap?frame:skin,
      cap?25:look.surface(material),angle+turn);
    // Service and transfer levels show the construction sequence across the facade.
    if(!cap&&['box','chamfer','tube'].includes(kind)&&tall>=19){
      const floor=level+podium+from*shaft,sectionYaw=angle+turn;
      const width=w*wide,depth=d*deep;
      skyShape(kind,u,floor+.19,v,width+.21,.38,depth+.21,frame,25,sectionYaw);
      const separation=look.era<3?24.2:30.8;
      for(let y=separation;y<tall-2.3;y+=separation){
        skyShape(kind,u,floor+y,v,width+.16,.62,depth+.16,frame,25,sectionYaw);
        skyShape(kind,u,floor+y-.366,v,width+.19,.105,depth+.19,stone,18,sectionYaw);
      }
      if(kind==='box'&&tall>31&&width>9.5){
        const c=Math.cos(sectionYaw),s=Math.sin(sectionYaw);
        for(const side of [-1,1])for(const axis of [-1,1]){
          const x=side*(width*.5-.12),z=axis*(depth*.5-.17);
          skyShape('box',u+x*c+z*s,floor+tall*.5,v-x*s+z*c,.26,tall,.36,frame,25,sectionYaw);
        }
      }
    }
  }
  if(['veranda','balconies','loggia','brise-soleil'].includes(name)){
    for(let y=podium+4;y<h*.72;y+=name==='brise-soleil'?3.12:3.35){
      part('chamfer',0,level+y,front*d*.40,w*.83,.20,1.26,stone,detail);
      block(0,level+y+.49,front*(d*.40+.57),w*.76,.77,.10,glass,15+detail);
    }
  }
  if(h>=234){
    const [,,,,a,b]=forms[name].find(row=>row[1]===1);
    const [u,v]=point(a*w,b*d);
    skyShape('ball',u,level+h-.12,v,.48,.24,.48,'bc6759',7);
  }
  return {city:id,style:name,height:h,x,z,angle,front,width:w,depth:d,floor:level,site,year:look.year,
    renovation:look.renovation.id,approach,door:[dx,dz],hall:[ix,iz]};
}
