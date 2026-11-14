import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {ARCHITECTURE_ASSET,MATERIAL_SIZE,surfaceProfiles} from '../dist/architecture-materials.js';

const fract=x=>x-Math.floor(x);
const wrap=(n,size)=>((n%size)+size)%size;
const limit=x=>Math.min(1,Math.max(0,x));
const blend=(a,b,x)=>a+(b-a)*x;
const smooth=(lo,hi,x)=>{const t=limit((x-lo)/(hi-lo));return t*t*(3-2*t);};
function hash(x,y,salt){
  let h=Math.imul(x+salt*23,0x45d9f3b)^Math.imul(y+salt*89,0x27d4eb2d);
  h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)/0xffffffff;
}
function noise(u,v,nx,ny,salt){
  const x=u*nx,z=v*ny,i=Math.floor(x),j=Math.floor(z);
  const sx=smooth(0,1,x-i),sy=smooth(0,1,z-j);
  const a=wrap(i,nx),b=wrap(i+1,nx),c=wrap(j,ny),d=wrap(j+1,ny);
  return blend(blend(hash(a,c,salt),hash(b,c,salt),sx),blend(hash(a,d,salt),hash(b,d,salt),sx),sy)-.5;
}

function blocks(u,v,options,salt){
  const {columns,rows,grout,variation,mortar,stagger,roughness}=options;
  const y=v*rows,row=Math.floor(y),offset=(row%2)*stagger;
  const sway=noise(u,v,9,12,salt+8)*.055;
  const x=u*columns+offset+sway,col=Math.floor(x);
  const px=fract(x),py=fract(y+sway*.25);
  const gap=Math.min(px,1-px,py,1-py);
  const edge=smooth(grout*.51,grout*1.55,gap);
  const value=hash(wrap(col,columns),wrap(row,rows),salt)-.5;
  const fine=noise(u,v,112,112,salt+5),grain=noise(u,v,44,48,salt+7);
  const within=noise(u,v,22,28,salt+1),flecks=noise(u,v,72,93,salt+3);
  const chips=smooth(.31,.45,flecks)*(1-edge*.72);
  const height=blend(.14,.74,edge)+edge*(within*.21+fine*.16)-chips*.18;
  const face=.54+value*variation+within*.12+grain*.075+fine*.050;
  return [blend(mortar+grain*.10,face,edge)-chips*.052,height,blend(.86,roughness,edge)+fine*.08,
    .50+value*.23+within*.13];
}
const joints={
  ashlar:{columns:4,rows:6,grout:.017,variation:.21,mortar:.36,stagger:.5,roughness:.68},
  brick:{columns:12,rows:24,grout:.053,variation:.24,mortar:.34,stagger:.5,roughness:.77},
  concrete:{columns:2,rows:2,grout:.012,variation:.115,mortar:.27,stagger:0,roughness:.73},
  ceramic:{columns:12,rows:12,grout:.044,variation:.14,mortar:.31,stagger:0,roughness:.38},
  pavers:{columns:6,rows:6,grout:.039,variation:.19,mortar:.31,stagger:.5,roughness:.76},
  rubble:{columns:6,rows:8,grout:.054,variation:.28,mortar:.25,stagger:.5,roughness:.91},
  setts:{columns:17,rows:14,grout:.071,variation:.24,mortar:.26,stagger:.5,roughness:.79},
  'glazed-tile':{columns:5,rows:5,grout:.020,variation:.095,mortar:.39,stagger:0,roughness:.38}
};

function surface(name,u,v,salt){
  const large=noise(u,v,5,5,salt),grain=noise(u,v,63,72,salt+3),fine=noise(u,v,128,128,salt+7);
  if(name==='heat-metal'||name==='shield'){
    const weld=1-smooth(.012,.032,Math.min(fract(u*4),1-fract(u*4)));
    const oxide=noise(u,v,11,7,salt+1),brush=noise(u,v,8,126,salt+11);
    const band=.5+.5*Math.sin(Math.PI*2*(v*3+oxide*.66));
    if(name==='heat-metal')return [.59+.19*brush-.17*weld+.09*band+.08*oxide,
      .56+.19*brush-.22*weld,.39+.17*band+.28*oxide,.49+.33*(band-.5)+.22*oxide];
    const seam=1-smooth(.012,.028,Math.min(fract(v*5),1-fract(v*5)));
    const mist=noise(u,v,22,21,salt+5);
    const panel=hash(Math.floor(u*4),Math.floor(v*5),salt);
    return [.52+.24*panel+.12*mist-.21*Math.max(weld,seam),.60+.20*mist-.28*Math.max(weld,seam),
      .67+.22*oxide,.47+.15*panel];
  }
  if(name==='leather'){
    const pore=smooth(.18,.41,grain+fine*.42);
    return [.51+.23*large-.22*pore+.18*fine,.52+.31*pore+.18*fine,.57+.25*grain,.54+.24*large];
  }
  if(name==='paper'){
    const pages=.5+.5*Math.sin(Math.PI*2*(v*47+noise(u,v,8,30,salt+2)*.19));
    return [.72+.17*pages+.09*grain,.55+.22*pages+.12*fine,.87+.11*grain,.53+.11*(1-pages)];
  }
  if(name==='soot'){
    const streak=noise(u,v,13,4,salt+13),carbon=smooth(.13,.72,large*.95+streak*.60+grain*.26);
    return [.54+.18*fine-.30*carbon,.53+.17*grain,.67+.31*carbon,.53+.14*(1-carbon)];
  }
  if(name in joints){
    const value=blocks(u,v,joints[name],salt);
    if(name==='concrete'){
      const x=fract(u*2),y=fract(v*2);
      const tie=1-smooth(.012,.020,Math.hypot(Math.min(Math.abs(x-.13),Math.abs(x-.87)),Math.min(Math.abs(y-.17),Math.abs(y-.83))));
      const form=noise(u,v,4,54,salt+9);
      value[0]+=form*.075-tie*.22;value[1]-=tie*.38;
    }
    return value;
  }
  if(name==='roof-tile'){
    const y=v*12,row=Math.floor(y),x=u*8+row%2*.5,phase=fract(x),rise=fract(y);
    const gap=smooth(.018,.064,Math.min(phase,1-phase));
    const crown=Math.sin(Math.PI*phase)**.77,overlap=smooth(.02,.13,rise);
    const hue=hash(wrap(Math.floor(x),8),wrap(row,12),salt)-.5;
    return [.45+gap*.085+crown*.067-(1-overlap)*.12+hue*.16+grain*.10,
      .19+gap*crown*.57+rise*.15,.66+grain*.15,.52+hue*.21];
  }
  if(name==='steel'){
    const brush=noise(u,v,8,128,salt),scratches=smooth(.31,.46,noise(u,v,14,108,salt+10));
    return [.53+brush*.15+large*.07+scratches*.067,.57+brush*.12+fine*.045,.34+brush*.16,.48+large*.11];
  }
  if(name==='wood'){
    const fibers=noise(u,v,58,4,salt),bend=noise(u,v,6,4,salt+3);
    const rings=Math.sin((u*29+bend*.88+noise(u,v,7,10,salt+2)*.4)*Math.PI*2);
    return [.50+fibers*.22+rings*.048+large*.078,.55+fibers*.22+rings*.055,.60+fibers*.14,.64+bend*.17];
  }
  if(name==='marble'){
    const bands=fract(u*3+v*5+noise(u,v,8,9,salt+12)*.68+large*.31);
    const vein=(1-smooth(.014,.074,Math.abs(bands-.5)))*smooth(.20,.86,noise(u,v,7,7,salt+5)+.5);
    const grout=smooth(.006,.014,Math.min(fract(u*3),1-fract(u*3),fract(v*3),1-fract(v*3)));
    return [.58-vein*.245-(1-grout)*.15+large*.083+fine*.045,
      .59-(1-grout)*.18-vein*.018+fine*.024,.28+vein*.19,.51-vein*.14];
  }
  if(name==='sandstone'){
    const bed=noise(u,v,5,47,salt+5),layer=Math.sin((v*13+large*.51)*Math.PI*2);
    return [.56+bed*.18+layer*.022+grain*.09,.57+bed*.17+fine*.16,.78+grain*.12,.60+bed*.19];
  }
  if(name==='linen'){
    const warp=Math.cos(Math.PI*2*(u*114+grain*.22)),weft=Math.cos(Math.PI*2*(v*110+fine*.22));
    const thread=(warp+weft)*.25,knots=Math.max(0,warp*weft)*.5;
    return [.55+large*.10+thread*.11+fine*.10,.51+thread*.28+knots*.12,.87+grain*.14,.5+large*.18+thread*.071];
  }
  if(name==='rubber'){
    const granule=noise(u,v,117,123,salt+6),fleck=smooth(.22,.43,noise(u,v,64,69,salt+8));
    return [.53+granule*.23+fleck*.12+large*.066,.52+granule*.40+fleck*.11,.84+fine*.17,.53+grain*.24];
  }
  if(name==='plaster'){
    const stipple=noise(u,v,86,88,salt+4);
    return [.61+large*.11+stipple*.085,.58+stipple*.21+fine*.12,.83+grain*.14,.51+large*.13+stipple*.082];
  }
  if(name==='foliage'){
    const bed=noise(u,v,15,18,salt+1),leaves=noise(u,v,42,47,salt+4);
    const ridge=smooth(.02,.37,leaves+bed*.43);
    return [.47+bed*.21+ridge*.23+fine*.06,.43+ridge*.43+grain*.14,.83+grain*.14,.54+bed*.27+leaves*.13];
  }
  if(name==='zinc'){
    const seam=smooth(.006,.037,Math.min(fract(u*3),1-fract(u*3)));
    const patina=noise(u,v,18,12,salt+2),striations=noise(u,v,115,7,salt+3);
    return [.49+large*.18+patina*.13+striations*.069+seam*.051,
      .61+striations*.092-(1-seam)*.38,.63+patina*.27,.52+large*.28];
  }
  if(name==='gravel'){
    const grains=noise(u,v,91,107,salt+8),stone=smooth(.03,.33,noise(u,v,42,44,salt+12)+grains*.34);
    return [.42+stone*.25+large*.19+fine*.12,.36+stone*.42+grains*.14,.86+grain*.15,.49+large*.23+fine*.17];
  }
  if(name==='sand'){
    const ripple=Math.sin((v*16+noise(u,v,7,4,salt+2)*1.12)*Math.PI*2);
    const grainBed=noise(u,v,98,104,salt+4),track=smooth(.12,.40,noise(u,v,23,3,salt+3));
    return [.58+large*.14+ripple*.036+grainBed*.16-track*.085,
      .53+ripple*.074+grainBed*.13-track*.093,.92+grainBed*.13,.57+large*.20+track*.05];
  }
  if(name==='asphalt'||name==='soil'){
    const grit=noise(u,v,100,96,salt+3),aggregate=noise(u,v,49,47,salt+4),stone=smooth(.22,.47,grit);
    const asphalt=name==='asphalt';
    return [.48+aggregate*.21+grit*.15+stone*.14+large*.12,.48+grit*.29+stone*.13,
      (asphalt?.83:.91)+aggregate*.10,(asphalt?.47:.60)+large*.19];
  }
  const pits=smooth(.30,.46,noise(u,v,89,82,salt+15));
  return [.54+large*.15+grain*.10+fine*.10-pits*.11,.58+grain*.22+fine*.17-pits*.17,
    (name==='paint'?.48:.83)+grain*.10,.50+large*.16];
}

const size=MATERIAL_SIZE;
const bytes=Buffer.alloc(size*size*4*surfaceProfiles.length);
for(const [layer,{name}] of surfaceProfiles.entries()){
  const start=layer*size*size*4;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const data=surface(name,(x+.5)/size,(y+.5)/size,layer*113+47);
    const index=start+(y*size+x)*4;
    for(let c=0;c<4;c++)bytes[index+c]=Math.round(limit(data[c])*255);
  }
  // Store the fine joint occlusion in albedo as well as the normal relief.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=start+(y*size+x)*4;
    const right=start+(y*size+((x+1)&(size-1)))*4+1;
    const above=start+((((y+1)&(size-1))*size+x))*4+1;
    const slope=(bytes[right]+bytes[above]-bytes[i+1]*2)*.22;
    bytes[i]=Math.max(0,Math.min(255,Math.round(bytes[i]-slope)));
  }
}
const out=new URL('../dist/materials/',import.meta.url);
await mkdir(out,{recursive:true});
const asset=gzipSync(bytes,{level:9});
await writeFile(new URL(ARCHITECTURE_ASSET,out),asset);
console.log(`${surfaceProfiles.length} materials, ${size} × ${size} texels, ${asset.length} compressed bytes`);
