import {normalize,vectorCross} from '../dist/engine.js';
import {STREET_LAMP} from '../dist/street-lights.js';
import {entryPortal,recessedWindows} from './facade-details.mjs';
import {roofEquipment,roofFlashing,roofParapet} from './roof-details.mjs';

const walls={
  tokyo:['c8c4b6','b8ad9e','829ba5','c8b8ab','a3a8a3','9d8776','667f90','cccbc1'],
  paris:['e0cbaa','d8c5ad','b8a995','dbc3a6','e6d3b7','c9b09a'],
  newyork:['a87461','bd8871','b5947c','869ba6','aa9b90','cfb096','815f55','6e8495'],
  cairo:['d1ad7f','bf936a','dcbd92','c3a583','b88e6b','e2c199'],
  sydney:['c7c0aa','b0977f','abb7b4','e0ccad','7897a1','b9ab99','9dbaa8'],
  rio:['e1d2bb','e2ceaa','d6dbcc','d9b899','d6d0c0','93b2b6','c5c6a9','e5dbca','b4b8a8']
};
const awnings={
  tokyo:['785653','36666d','79615a','b98356','46566a'],
  paris:['742f42','365e50','b49972','584e52','57706a'],
  newyork:['754b42','45605b','805e4c','373e4c','a46c4b'],
  cairo:['aa7755','ae6553','58736e','b19a70','77845c'],
  sydney:['547787','80846d','a5664f','477268','d5b985'],
  rio:['327582','55836d','aa754d','c18d6a','758276','9f5550']
};
const trim={tokyo:'9e9c8f',paris:'caba9d',newyork:'b1a79a',cairo:'c6ab83',sydney:'bbb6a5',rio:'c6bdaa'};
const detail=.25;
export function facadeBuilder({shape,box,drape,foundation,heightAt,solidProp,platform,roadMask,pick,rnd,appearance,parkedCar}){
  function building({id,x,z,w,d,h,angle,front,rich,coast,retail,ground,level,site,style}){
    const c=Math.cos(angle),s=Math.sin(angle);
    const place=(a,b)=>[x+a*c+b*s,z-a*s+b*c];
    const frontY=(heightAt(...place(-w*.29,d*.5*front))+heightAt(...place(w*.29,d*.5*front)))*.5;
    const base=level??Math.max(ground+.26,frontY+.15);
    const look=appearance(id,x,z,h,style.material,pick(walls[id])),stone=trim[id];
    const paint=look.tone,material=look.surface(style.material);
    const balconies=style.material===12||id==='rio'&&coast&&h>12;
    const useShop=retail&&h>7.1&&rnd()<(id==='rio'?.81:.67);
    const bottom=useShop?4.18:Math.min(3.47,Math.max(2.65,h*.29));
    const pitched=['gable','mansard','hip','lean','saw'].includes(style.roof);
    // Domes, vaults, spires, tiered eaves and crowns need a taller share of the building.
    const lofty=['dome','barrel','spire','pagoda','crown'].includes(style.roof);
    const crown=lofty?Math.min(4.6,h*.19):Math.min(pitched?3.25:1.44,h*(pitched?.165:.074));
    const bodyH=h-bottom-crown,top=base+h-crown;
    const part=(kind,a,y,b,width,height,depth,tint,mat=0,turn=0)=>{
      const [u,v]=place(a,b);
      shape(kind,u,y,v,width,height,depth,tint,mat,angle+turn);
    };
    const block=(...args)=>part('box',...args);
    if(level!==undefined){
      foundation(x,z,site.foundationWidth,site.foundationDepth,angle,base-.108,stone,site.embed);
      block(0,base-.054,0,site.foundationWidth,.108,site.foundationDepth,stone,18);
      platform(x,z,site.foundationWidth,site.foundationDepth,angle,base,0);
    }else if(rich&&base-ground>.62)foundation(x,z,w+.07,d+.08,angle,base,stone);
    else block(0,(base+ground)*.5,0,w+.07,base-ground,d+.08,stone,18);
    if(useShop&&rich){
      const recess=.89,opening=.54,count=Math.max(2,Math.round(w/3.2)),bay=w/count;
      const storefront=pick(awnings[id]),glass='758f9c';
      block(0,base+bottom*.5,-front*recess*.5,w,bottom,d-recess,stone,18);
      for(const side of [-1,1])block(side*(w*.5-.07),base+bottom*.5,front*(d*.5-recess*.5),.14,bottom,recess,stone,18);
      for(let i=0;i<count;i++){
        const a=bay*(i+.5)-w*.5;
        const y=base+bottom*.5,z=front*(d*.5-opening*.5);
        part('window',a,y,z,bay,bottom,opening,storefront,18,front<0?Math.PI:0);
        part('pane',a,y+bottom*.040,front*(d*.5-opening+.034),bay*.78,bottom*.68,.02,glass,22);
        block(a,y+bottom*.04,front*(d*.5-opening+.062),.059,bottom*.68,.054,'4c5252',25);
        block(a,base+.80,front*(d*.5-.79),bay*.68,.14,.26,'b69678',24+detail);
        block(a+bay*.16,base+1.08,front*(d*.5-.76),bay*.27,.36,.18,i%2?'c9a876':'9ba89b',detail);
      }
    }else{
      block(0,base+bottom*.5,0,w,bottom,d,useShop?pick(awnings[id]):paint,useShop?11:material);
    }

    const roofParts=[];
    function volume(kind,a,b,width,depth,low,high,cap=high===top){
      if(rich&&kind==='box'&&(style.mass==='plain'||style.mass==='setback')&&high-low>3.0)
        recessedWindows(part,{a,b,w:width,d:depth,low,high,front,paint,trim:stone,material,look});
      else part(kind,a,(low+high)*.5,b,width,high-low,depth,paint,material);
      if(cap)roofParts.push({kind,a,b,width,depth});
      if(balconies&&rich&&kind==='box'){
        const edge=b+front*depth*.5;
        for(let y=low+.33;y<high-1.1;y+=3.86){
          part('chamfer',a,y,edge+front*.28,width*.86,.19,1.08,stone,detail);
          block(a,y+.43,edge+front*.74,width*.78,.72,.073,coast?'638894':'536e70',15+detail);
        }
      }
    }
    const low=base+bottom,v=style.variation;
    switch(style.mass){
      case 'chamfer':
        volume('chamfer',0,0,w,d,low,top);
        break;
      case 'bay':
        volume('box',0,-front*d*.07,w,d*.86,low,top);
        volume('box',w*(v-.50)*.48,front*d*.43,w*.39,d*.14,low,top);
        break;
      case 'wing':
        volume('box',-w*.13,0,w*.74,d,low,top);
        volume('box',w*.37,-front*d*.11,w*.26,d*.75,low,low+bodyH*.74);
        break;
      case 'court':
        volume('box',0,-front*d*.30,w,d*.40,low,top);
        for(const side of [-1,1])volume('box',side*w*.365,front*d*.20,w*.27,d*.60,low,top);
        break;
      case 'setback': {
        const split=low+bodyH*.62;
        volume('box',0,0,w,d,low,split);
        volume('box',(v-.50)*w*.15,-front*d*.11,w*.79,d*.72,split,top);
        break;
      }
      case 'stack': {
        const split=low+bodyH*.46;
        volume('box',0,0,w,d,low,split);
        volume('chamfer',w*(v-.5)*.14,-front*d*.10,w*.79,d*.78,split,top);
        block(0,split-.10,0,w+.17,.20,d+.16,stone,25);
        break;
      }
      case 'podium': {
        // A broad base that fills the lot and a slender tower set back from the street.
        const split=low+Math.min(bodyH*.3,9.5);
        volume('box',0,0,w,d,low,split);
        volume('box',w*(v-.5)*.2,-front*d*.12,w*.6,d*.66,split,top);
        block(0,split+.1,0,w+.14,.2,d+.14,stone,25);
        break;
      }
      case 'twin': {
        // Two slabs of different height joined by a glazed bridge.
        const gap=w*.14,each=(w-gap)*.5,second=low+bodyH*(.72+v*.16);
        volume('box',-(each+gap)*.5,0,each,d,low,top);
        volume('box',(each+gap)*.5,-front*d*.04,each,d*.92,low,second);
        block((each+gap)*.5,second+.09,-front*d*.04,each+.12,.18,d*.92+.11,stone,18);
        if(bodyH>9){
          const y=low+bodyH*.46,tall=Math.min(3.1,bodyH*.15);
          block(0,y,0,gap+.3,tall,d*.42,'6f8a96',look.surface(19));
          for(const edge of [-1,1])block(0,y+edge*tall*.5,0,gap+.34,.12,d*.42+.1,look.frame,25+detail);
        }
        break;
      }
      case 'ell':
        // A bar along the back of the lot with one wing reaching the street.
        volume('box',0,-front*d*.26,w,d*.48,low,top);
        volume('box',w*(v<.5?-.29:.29),front*d*.24,w*.42,d*.52,low,low+bodyH*.7);
        block(w*(v<.5?-.29:.29),low+bodyH*.7+.09,front*d*.24,w*.42+.12,.18,d*.52+.11,stone,18);
        break;
      case 'ziggurat': {
        // Stepped tiers, each smaller than the one below.
        const tiers=bodyH>20?4:3;
        for(let i=0;i<tiers;i++){
          const k=1-i*.16,from=low+bodyH*i/tiers,to=i===tiers-1?top:low+bodyH*(i+1)/tiers;
          volume('box',0,-front*d*i*.035,w*k,d*k,from,to);
          if(i)block(0,from+.07,-front*d*(i-1)*.035,w*(k+.16)+.1,.14,d*(k+.16)+.1,stone,18);
        }
        break;
      }
      case 'drum': {
        // A round tower on a square base.
        const split=low+Math.min(bodyH*.24,5.5),size=Math.min(w,d)*.94;
        volume('box',0,0,w,d,low,split);
        block(0,split+.09,0,w+.12,.18,d+.11,stone,18);
        volume('tube',0,0,size,size,split,top);
        break;
      }
      case 'cantilever': {
        // The upper storeys project beyond a narrower shaft.
        const split=low+bodyH*.42;
        volume('box',0,-front*d*.05,w*.72,d*.8,low,split);
        volume('box',0,0,w,d,split,top);
        block(0,split+.09,0,w+.1,.18,d+.1,look.frame,25);
        break;
      }
      case 'turret': {
        // A corner tower rises above the main block.
        const main=top-Math.min(bodyH*.16,3.4),side=v<.5?-1:1,tw=Math.max(2.6,w*.3),td=Math.max(2.6,d*.3);
        volume('box',0,0,w,d,low,main,false);
        block(0,main+.09,0,w+.12,.18,d+.11,stone,18);
        volume('chamfer',side*(w*.5-tw*.5+.22),front*(d*.5-td*.5+.22),tw,td,low,top);
        break;
      }
      case 'fins': {
        // A slab between projecting piers.
        volume('box',0,0,w*.9,d,low,top);
        const count=Math.max(3,Math.round(w/2.7));
        for(let i=0;i<=count;i++)for(const face of rich?[1,-1]:[1])
          block(-w*.45+w*.9*i/count,(low+top)*.5,front*face*d*.5,.18,top-low,.62,stone,18+(i%2?detail:0));
        break;
      }
      case 'gate': {
        // Two legs carry a block that bridges the opening between them.
        const leg=w*.3,span=low+bodyH*.6;
        for(const side of [-1,1])volume('box',side*(w-leg)*.5,0,leg,d,low,top,false);
        volume('box',0,0,w-leg*2,d*.94,span,top,false);
        block(0,span-.08,0,w-leg*2+.1,.16,d*.94+.08,look.frame,25);
        roofParts.push({kind:'box',a:0,b:0,width:w,depth:d});
        break;
      }
      case 'cluster':
        // Three volumes of different heights stand shoulder to shoulder.
        volume('box',-w*.02,-front*d*.1,w*.42,d*.8,low,top);
        volume('box',-w*.33,front*d*.08,w*.34,d*.84,low,low+bodyH*.76);
        volume('box',w*.34,front*d*.02,w*.32,d*.9,low,low+bodyH*.56);
        block(-w*.33,low+bodyH*.76+.09,front*d*.08,w*.34+.12,.18,d*.84+.11,stone,18);
        block(w*.34,low+bodyH*.56+.09,front*d*.02,w*.32+.12,.18,d*.9+.11,stone,18);
        break;
      default:
        volume('box',0,0,w,d,low,top);
    }
    const roofPaint=id==='paris'||style.roof==='saw'?pick(['535c65','626c73','777a77']):
      pick(['8c584b','a2725b','936452','6e7575']);
    const across=[c,0,-s],along=[s,0,c];
    for(const {kind,a,b,width,depth} of roofParts){
      const roofH=crown;
      const slab=()=>part(kind,a,top+.09,b,width+.12,.18,depth+.11,stone,18);
      const small=Math.min(width,depth);
      if(style.roof==='dome'){
        // A drum, a hemisphere and a lantern.
        slab();
        const size=small*.74;
        part('tube',a,top+.18+roofH*.13,b,size,roofH*.26,size,stone,18);
        part('ball',a,top+.18+roofH*.26,b,size*.97,roofH*1.48,size*.97,roofPaint,25);
        part('tube',a,top+.18+roofH*1.06,b,size*.13,roofH*.2,size*.13,look.frame,25+detail);
        part('cone',a,top+.18+roofH*1.26,b,size*.11,roofH*.22,size*.11,look.frame,25+detail);
      }else if(style.roof==='barrel'){
        // A vault whose axis follows the long side of the block.
        slab();
        const [u,q]=place(a,b),wide=width>=depth;
        shape('tube',u,top+.12,q,(wide?depth:width)*.94,(wide?width:depth)+.06,roofH*2,roofPaint,25,angle,
          wide?[along,across,[0,1,0]]:[across,along.map(n=>-n),[0,1,0]]);
        if(rich)for(const t of [-.3,0,.3]){
          const [ru,rq]=wide?place(a+width*t,b):place(a,b+depth*t);
          shape('tube',ru,top+.12,rq,(wide?depth:width)*.96,.14,roofH*2.04,look.frame,25+detail,angle,
            wide?[along,across,[0,1,0]]:[across,along.map(n=>-n),[0,1,0]]);
        }
      }else if(style.roof==='spire'){
        // A steep pyramid on a broach.
        const size=small*.56;
        part('taper',a,top+roofH*.17,b,width+.1,roofH*.34,depth+.1,roofPaint,14);
        part('box',a,top+roofH*.42,b,size*.7,roofH*.3,size*.7,stone,18);
        part('pyramid',a,top+roofH*.57+roofH*.72,b,size*1.42,roofH*1.44,size*1.42,roofPaint,25,Math.PI/4);
        part('ball',a,top+roofH*2.03,b,.2,.2,.2,look.frame,25+detail);
      }else if(style.roof==='pagoda'){
        // Tiers of sweeping eaves, each smaller than the one below.
        const tiers=small>7?3:2,each=roofH/tiers;
        for(let i=0;i<tiers;i++){
          const k=1-i*.25,y=top+each*i;
          part('taper',a,y+each*.3,b,(width+1.3)*k,each*.6,(depth+1.3)*k,roofPaint,14);
          part('box',a,y+each*.05,b,(width+1.36)*k,.07,(depth+1.36)*k,look.frame,25+detail);
          if(i<tiers-1)part('box',a,y+each*.8,b,width*k*.62,each*.42,depth*k*.62,paint,material);
        }
        part('cone',a,top+roofH+.3,b,.26,1.0,.26,look.frame,25+detail);
      }else if(style.roof==='crown'){
        // A stepped crown with a pinnacle at every corner.
        part('taper',a,top+roofH*.3,b,width+.1,roofH*.6,depth+.1,stone,18);
        part('taper',a,top+roofH*.8,b,width*.5,roofH*.4,depth*.5,roofPaint,25);
        for(const sx of [-1,1])for(const sz of [-1,1])
          part('pyramid',a+sx*width*.42,top+roofH*.5,b+sz*depth*.42,small*.2,roofH,small*.2,look.frame,25+detail,Math.PI/4);
        part('cone',a,top+roofH*1.3,b,.24,roofH*.6,.24,look.frame,25);
      }else if(style.roof==='tank'){
        // A timber water tank on a steel frame.
        slab();
        const r=Math.min(1.45,small*.19),tx=a+width*(v-.5)*.36,tz=b-front*depth*.16,legs=1.15,y=top+.18;
        for(const sx of [-1,1])for(const sz of [-1,1])block(tx+sx*r*.62,y+legs*.5,tz+sz*r*.62,.1,legs,.1,look.frame,25+detail);
        block(tx,y+legs,tz,r*1.5,.1,r*1.5,look.frame,25+detail);
        part('tube',tx,y+legs+.05+r*.78,tz,r*2,r*1.56,r*2,'7a5b43',24);
        part('cone',tx,y+legs+.05+r*1.56+r*.28,tz,r*2.12,r*.56,r*2.12,'5b5148',25);
        for(const t of [.22,.5,.78])part('tube',tx,y+legs+.05+r*1.56*t,tz,r*2.04,.05,r*2.04,'3c3f41',25+detail);
        if(rich&&kind!=='tube'&&width>3.8&&depth>3.5)roofParapet(part,{kind,a,b,width,depth,y,height:.7,stone,metal:look.frame});
      }else if(style.roof==='garden'){
        // A planted terrace with a pergola.
        slab();
        const y=top+.18;
        part(kind,a,y+.05,b,width-.9,.1,depth-.9,'6d8a54',9);
        const trees=Math.max(1,Math.min(4,Math.round(width*depth/34)));
        for(let i=0;i<trees;i++){
          const tx=a+width*(.28*Math.cos(i*2.4+v*6)),tz=b+depth*(.28*Math.sin(i*2.4+v*6)),size=.8+((i*37+Math.round(v*100))%5)*.12;
          part('tube',tx,y+.1+size*.5,tz,.12,size,.12,'6c5944',detail);
          part('ball',tx,y+.1+size+size*.55,tz,size*1.7,size*1.5,size*1.7,i%2?'5c7d54':'69845b',6+detail);
        }
        if(rich&&small>5){
          const px=a-width*.22,pz=b-front*depth*.2;
          for(const sx of [-1,1])for(const sz of [-1,1])block(px+sx*1.1,y+1.15,pz+sz*.9,.1,2.2,.1,'7c6a54',24+detail);
          for(const t of [-1,-.5,0,.5,1])block(px+t*1.1,y+2.3,pz,.08,.1,2.2,'7c6a54',24+detail);
        }
        if(kind!=='tube'&&width>3.8&&depth>3.5)roofParapet(part,{kind,a,b,width,depth,y,height:1.0,stone,metal:look.frame});
      }else if(style.roof==='solar'){
        // Rows of photovoltaic panels tilted toward the street.
        slab();
        const y=top+.18,rows=Math.max(1,Math.min(6,Math.floor((depth-1.1)/1.55))),tilt=.33;
        const up=[along[0]*Math.sin(tilt)*front,Math.cos(tilt),along[2]*Math.sin(tilt)*front];
        const slope=[along[0]*Math.cos(tilt),-Math.sin(tilt)*front,along[2]*Math.cos(tilt)];
        for(let i=0;i<rows;i++){
          const z=b+(i-(rows-1)*.5)*1.55,[u,q]=place(a,z);
          shape('box',u,y+.42,q,width*.82,.05,1.05,'1f2f45',15+(i%2?detail:0),angle,[across,up,slope]);
          block(a,y+.16,z,width*.8,.32,.07,look.frame,25+detail);
        }
      }else if(style.roof==='helipad'){
        // A landing deck with its marking and edge lights.
        slab();
        const r=small*.36,y=top+.18;
        part('tube',a,y+.24,b,r*.9,.48,r*.9,'6d7273',18);
        part('tube',a,y+.56,b,r*2,.16,r*2,'565b5c',18);
        part('tube',a,y+.645,b,r*1.5,.012,r*1.5,'d8cf9e',detail);
        part('tube',a,y+.648,b,r*1.36,.012,r*1.36,'565b5c',detail);
        for(const sx of [-1,1])block(a+sx*r*.24,y+.655,b,.13,.012,r*.74,'ece5cc',detail);
        block(a,y+.655,b,r*.48,.012,.13,'ece5cc',detail);
        for(let i=0;i<8;i++)block(a+Math.cos(i*Math.PI/4)*r*.96,y+.67,b+Math.sin(i*Math.PI/4)*r*.96,.1,.07,.1,i%2?'f3d27a':'8dd6a0',7+detail);
      }else if(style.roof==='mast'){
        // A plant room, a lattice mast and an aviation light.
        slab();
        const y=top+.18,px=a+width*(v-.5)*.2,mast=Math.min(9,2.6+h*.09);
        part('box',px,y+roofH*.5,b,width*.34,roofH,depth*.36,roofPaint,25);
        part('tube',px,y+roofH+mast*.5,b,.16,mast,.16,look.frame,25);
        for(const t of [.3,.55,.8])block(px,y+roofH+mast*t,b,.62,.045,.045,look.frame,25+detail);
        part('ball',px,y+roofH+mast+.08,b,.2,.2,.2,'d0503c',7);
        block(px+.5,y+roofH+.35,b+.3,.5,.5,.08,'c9cdca',25+detail,.5);
      }else if(style.roof==='billboard'){
        // A sign board on a steel frame faces the street.
        slab();
        const y=top+.18,wide=Math.min(width*.78,7.5),tall=Math.min(3.1,1.4+h*.05),edge=b+front*(depth*.5-.5);
        const ink=pick(['c9463c','2f6f8f','e3b23c','3f8f6a','d9d6c9','7a3f8a']);
        for(const t of [-.4,0,.4])block(a+wide*t,y+.5+tall*.5,edge-front*.14,.09,1+tall,.09,look.frame,25+detail);
        block(a,y+1+tall*.5,edge,wide,tall,.1,ink,detail);
        block(a,y+1+tall*.5,edge+front*.056,wide*.9,tall*.2,.012,'f2ead2',7+detail);
        block(a,y+1+tall+.05,edge,wide+.1,.08,.16,look.frame,25+detail);
        for(const t of [-.33,0,.33])block(a+wide*t,y+1+tall+.24,edge+front*.3,.1,.07,.5,look.frame,25+detail);
      }else if(pitched){
        if(style.roof==='saw'){
          for(const side of [-1,1])
            part('roof',a+side*width*.25,top+roofH*.5,b,width*.50,roofH,depth,roofPaint,25);
        }else if(style.roof==='lean'){
          part('roof',a+width*.12,top+roofH*.5,b,width*.76,roofH,depth,roofPaint,14);
          block(a-width*.38,top+.06,b,width*.24,.12,depth,stone,18);
        }else{
          const form=style.roof==='hip'||style.roof==='mansard'?'taper':'roof';
          part(form,a,top+roofH*.5,b,width+.09,roofH,depth+.10,roofPaint,style.roof==='mansard'?25:14);
          if(style.roof==='mansard'&&rich&&width>5)for(const side of [-1,1])
            block(a+side*width*.20,top+roofH*.27,b+front*depth*.32,1.12,roofH*.54,1.01,stone,5+detail);
        }
      }else if(style.roof==='plant'||style.roof==='pavilion'){
        part(style.roof==='pavilion'?'chamfer':'box',a+width*(v-.5)*.20,top+roofH*.5,b,
          width*(.37+v*.25),roofH,depth*.53,roofPaint,25);
      }else if(style.roof==='terrace'){
        part(kind,a,top+.12,b,width+.10,.24,depth+.11,stone,18);
        if(!rich)block(a,top+roofH*.5,b+front*depth*.48,width,roofH,.16,stone,18);
      }else if(rich){
        part(kind,a,top+.09,b,width+.12,.18,depth+.11,stone,18);
      }else{
        part(kind,a,top+roofH*.5,b,width+.12,roofH,depth+.11,stone,18);
      }
      if(rich&&pitched){
        roofFlashing(part,{a,b,width,depth,y:top,height:roofH,type:style.roof,metal:look.frame});
      }else if(rich&&!lofty&&kind!=='tube'&&!['tank','garden'].includes(style.roof)&&width>3.8&&depth>3.5){
        const y=top+(style.roof==='terrace'?.24:style.roof==='parapet'?.18:0);
        roofParapet(part,{kind,a,b,width,depth,y,height:Math.max(.22,roofH-(y-top)),
          stone,metal:look.frame});
        if(style.roof==='terrace'||style.roof==='parapet')
          roofEquipment(part,{a,b,width,depth,y,height:roofH-(y-top),look});
      }
    }
    if(rich&&h<34&&style.mass==='plain'&&look.era<4){
      const side=look.window%2===0?1:-1,edge=front*(d*.5+.065),height=h-crown-.37;
      const x=side*(w*.5-.23);
      part('tube',x,base+.18+height*.5,edge,.112,height,.112,look.frame,25+detail);
      for(const t of [.14,.48,.84])block(x,base+.18+height*t,edge,.171,.085,.128,stone,18+detail);
    }
    if(useShop){
      const hue=pick(awnings[id]),offset=d*.5*front;
      block(0,base+bottom-.17,offset+front*.06,w*.91,.36,.28,hue,detail);
      if(id==='tokyo'&&rich&&v<.69){
        const width=Math.min(w*.48,3.35),sign=['debfa0','8ab5bb','cca0a0'][Math.floor(v*4)];
        block(0,base+bottom-.16,offset+front*.219,width,.24,.045,'39474b',detail);
        for(let i=-2;i<=2;i++)
          block(i*width*.143,base+bottom-.16,offset+front*.25,width*.081,.082,.025,sign,7+detail);
      }
      part('chamfer',0,base+3.22,offset+front*.54,w*.84,.15,1.24,hue,detail);
      if(rich)block(0,base+3.25,offset+front*1.02,w*.81,.16,.078,paint,detail);
    }
    if(rich&&h>=6.2){
      const width=Math.min(w*.45,useShop?1.78:1.46);
      entryPortal(part,{level:base,edge:front*(d*.5-(useShop?.32:0)),front,width,
        height:useShop?2.62:Math.min(2.36,bottom-.11),trim:stone,look,
        obstacle:(a,b,w,d)=>solidProp(...place(a,b),w,d,angle)});
    }
    if(rich&&(useShop||base-ground>.75)){
      const edge=(level!==undefined?site.foundationDepth:d)*.5;
      const near=edge*front,far=(edge+1.95)*front;
      const at=(a,b)=>{const [x,z]=place(a,b);return [x,0,z];};
      const p=at(-w*.48,near),q=at(w*.48,near),r=at(w*.48,far),u=at(-w*.48,far);
      drape(p,q,r,stone,1,.207,'outside');
      drape(p,r,u,stone,1,.207,'outside');
      const width=Math.min(w*.56,2.55);
      const entry=Math.min(...[-1,0,1].map(side=>heightAt(...place(side*width*.5,far))));
      const rise=base-entry;
      if(rise>.29&&rise<=1.42&&[-1,0,1].every(side=>!roadMask.contains(...place(side*width*.5,far)))){
        const steps=Math.ceil(rise/.22),tread=1.95/steps;
        for(let i=0;i<steps;i++){
          const b=far-front*tread*(i+.5),top=entry+rise*(i+1)/steps;
          const [px,pz]=place(0,b);
          const foot=Math.min(entry,...[-1,1].flatMap(side=>[-1,1].map(end=>heightAt(...place(side*width*.5,b+end*tread*.5)))))-.10;
          block(0,(foot+top)*.5,b,width,top-foot,tread+.008,stone,18+detail);
          platform(px,pz,width,tread+.008,angle,top,0);
        }
      }
    }
  }
  function light(x,z,angle,side,id){
    const y=heightAt(x,z),c=Math.cos(angle),s=Math.sin(angle);
    const h=id==='paris'?4.05:id==='cairo'?3.6:5.1,arm=id==='paris'?.42:.72;
    const paint=id==='paris'?'384540':'424b48';
    shape('tube',x,y+h*.5,z,.13,h,.13,paint,detail);
    box(x+s*arm*.5*side,y+h-.17,z+c*arm*.5*side,.12,.15,arm,paint,detail,angle);
    box(x+s*arm*side,y+h-.18,z+c*arm*side,.26,.12,.48,'d6ddc7',STREET_LAMP+detail,angle);
  }
  function planter(x,z,angle,id){
    const y=heightAt(x,z);
    box(x,y+.16,z,1.25,.40,1.13,trim[id],18+detail,angle);
    box(x,y+.40,z,1.08,.19,.96,'65754c',9+detail,angle);
    shape('ball',x,y+.62,z,1.17,.62,1.11,'4d704a',6+detail);
    solidProp(x,z,1.25,1.13,angle);
  }
  function car(x,z,angle,paint=pick(['c8c4b7','738a99','a47a64','6c6f69','9c5b4d','d9d6c9','47515b']),lot=false,level){
    const c=Math.cos(angle),s=Math.sin(angle);
    if(!lot&&![-1.91,1.91].every(a=>[-.87,.87].every(b=>roadMask.contains(x+a*c+b*s,z-a*s+b*c))))return;
    const ground=level===undefined?(a,b)=>heightAt(a,b)+.118:()=>level;
    const y=ground(x,z);
    if(parkedCar){parkedCar(x,y,z,angle+Math.PI/2,paint);return;}
    const rise=(a,b,n)=>(ground(x+a,z+b)-ground(x-a,z-b))/(2*n);
    const forward=normalize([c,rise(c*1.68,-s*1.68,1.68),-s]);
    const crossSlope=[s,rise(s*.80,c*.80,.80),c];
    const up=normalize(vectorCross(crossSlope,forward)),side=vectorCross(forward,up);
    const basis=[forward,up,side];
    const point=(a,h,b)=>[x,y,z].map((n,i)=>n+a*forward[i]+h*up[i]+b*side[i]);
    const put=(kind,a,h,b,w,H,d,tint,mat=0)=>shape(kind,...point(a,h,b),w,H,d,tint,mat+detail,angle,basis);
    const contact=(a,b)=>{
      const [px,,pz]=point(a,0,b);
      return [px,ground(px,pz),pz];
    };
    const a=contact(-1.86,-.80),b=contact(1.88,-.80),c1=contact(1.88,.80),d=contact(-1.86,.80);
    if(!lot){
      drape(a,b,c1,'4f5151',detail,.137,'road');
      drape(a,c1,d,'4f5151',detail,.137,'road');
    }
    put('chamfer',0,.49,0,4.12,.57,1.72,paint,10);
    put('taper',-.18,.89,0,2.72,.55,1.57,'576d77',10);
    put('chamfer',-.18,1.176,0,1.61,.07,.94,paint,10);
    const tireBasis=[forward,side,up.map(n=>-n)];
    const radius=.32;
    for(const along of [-1.31,1.27])for(const across of [-.82,.82]){
      const center=contact(along,across).map((n,i)=>n+radius*up[i]);
      shape('tube',...center,radius*2,.21,radius*2,'2b3236',detail,angle,tireBasis);
    }
    for(const b of [-.54,.54]){
      put('box',2.00,.55,b,.09,.12,.28,'e1d7b5',7);
      put('box',-2.00,.56,b,.08,.12,.26,'a34742');
    }
    solidProp(x,z,4.10,1.72,angle);
  }
  return {building,light,planter,car};
}
