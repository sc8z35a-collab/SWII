import {ROOM_MATERIAL_OFFSET} from '../dist/architecture-materials.js';

const palettes=[
  ['dbcfc0','b09877','83948a','e6d8c8','986d52'],
  ['ebdcc0','ad8c6c','ac795e','eee1c8','846d5e'],
  ['d7e1dd','a08a73','547888','cedcd8','5e6c6a'],
  ['e3d6c0','9b785c','717f69','ece5d6','8a6a4d'],
  ['e6d9cb','b7a28b','b07873','e6dfc9','907361'],
  ['d6d8db','876d57','576c82','c6cdd8','596270'],
  ['e5dcd4','ba9d7a','b49a61','f0e3ca','8a725e'],
  ['e1e1d2','a68d6f','679186','d9e3d9','8d8767'],
  ['dfcdbd','806c5d','a77052','dfd3bc','695f58'],
  ['e4d8c9','b89f7c','7c8093','d3d4d8','897f73'],
  ['e4e0d0','a38c72','738a67','d6ddc7','82755e'],
  ['d9d8d6','a48b79','b0785c','e5d6c7','83766a']
];
const layoutNames=['living-room','dining-room','bedroom','study','kitchen','reading-room','studio','plant-room'];
function seedAt(x,z){
  let state=(Math.imul(Math.round(x*100),374761393)^Math.imul(Math.round(z*100),668265263))>>>0;
  return Math.imul(state^(state>>>13),1274126177)>>>0;
}
export function apartmentInterior(x,z){
  const seed=seedAt(x,z),scheme=seed%palettes.length,layout=(seed>>>7)%layoutNames.length;
  return {seed,scheme,layout,design:layoutNames[layout],key:seed.toString(36)+'-'+Math.round(x*100)+'-'+Math.round(z*100)};
}
const detail=.25,wood=24+detail,linen=41+detail,ceramic=44+detail,plaster=43+detail,metal=25+detail;

export function furnishRoom(part,{x,edge,floor,w,height,depth,interior,row,col}){
  const hash=(interior.seed+Math.imul(row+1,0x41c64e6d)+Math.imul(col+1,0x045d9f3b))>>>0;
  const layout=(interior.layout+row*3+col)%layoutNames.length;
  const [wall,timber,fabric,curtain,trim]=palettes[(interior.scheme+(hash>>>26)%5)%palettes.length];
  const mirror=hash&1?1:-1;
  const bias=((hash>>>6)%7-3)*.021;
  const at=(kind,a,y,b,width,h,d,color,mat=plaster,turn=0)=>
    part(kind,x+a*w*mirror,floor+y,edge-b*depth,width*w,h,d*depth,color,mat+ROOM_MATERIAL_OFFSET,turn);
  const box=(...args)=>at('box',...args);
  const soft=(...args)=>at('chamfer',...args);
  const plant=(a,b,scale=1)=>{
    at('tube',a,.19*scale,b,.18*scale,.38*scale,.14*scale,'b0886a',ceramic);
    at('tube',a,.52*scale,b,.021*scale,.64*scale,.015*scale,'756f51',wood);
    at('ball',a,.75*scale,b,.22*scale,.42*scale,.17*scale,'667f59',6+detail);
    at('ball',a+.065*scale,.66*scale,b+.026,.15*scale,.31*scale,.14*scale,'7d9464',6+detail);
  };
  const lamp=(a,b)=>{
    at('tube',a,.065,b,.15,.13,.12,trim,metal);
    at('tube',a,.66,b,.022,1.21,.015,trim,metal);
    at('chamfer',a,1.36,b,.19,.29,.16,curtain,linen);
  };
  const shelf=(a,b,width)=>{
    box(a,1.07,b,width,2.08,.125,timber,wood);
    for(const y of [.64,1.16,1.68]){
      box(a,y,b-.078,width,.04,.03,timber,wood);
      for(let i=0;i<3;i++)box(a+(i-1)*width*.24,y+.106,b-.082,width*.16,.21-i*.019,.052,
        [fabric,curtain,'8e6851'][(i+col+row)%3],linen);
    }
  };
  // The room shell is opaque so the view never opens through the next building.
  box(0,-.038,.51,.992,.076,.985,timber,wood);
  box(0,height-.17,.51,.992,.11,.985,wall,plaster);
  box(0,height*.5-.05,.958,.998,height-.10,.087,wall,plaster);
  for(const side of [-1,1]){
    box(side*.491,height*.5-.05,.49,.018,height-.12,.94,wall,plaster);
    box(side*.476,.057,.52,.026,.114,.92,trim,wood);
  }
  box(0,.055,.903,.955,.11,.022,trim,wood);
  soft(0,.017,.44,.75,.034,.55,fabric,linen);
  if(layout===0||layout===5||layout===6){
    soft(bias,.36,.66,.67,.47,.26,fabric,linen);
    soft(bias,.72,.751,.68,.48,.10,fabric,linen);
    for(const side of [-1,1]){
      soft(bias+side*.307,.60,.655,.09,.30,.26,fabric,linen);
      soft(bias+side*.18,.66,.655,.15,.27,.075,curtain,linen);
    }
    soft(-.07,.43,.37,.46,.077,.20,timber,wood);
    for(const a of [-.235,.095])for(const b of [.30,.44])box(a,.215,b,.039,.43,.027,trim,wood);
    box(.025,.488,.35,.135,.036,.103,curtain,linen);
    if(layout===5)shelf(.365,.867,.235);
    else lamp(.36,.74);
  }else if(layout===1||layout===4){
    const table=layout===1;
    soft(0,.80,table?.48:.77,table?.58:.86,.09,table?.27:.31,timber,wood);
    if(table){
      for(const side of [-1,1]){
        soft(side*.33,.49,.48,.16,.07,.16,fabric,linen);
        box(side*.42,.74,.48,.055,.49,.16,timber,wood);
        box(side*.32,.23,.48,.047,.46,.073,timber,wood);
      }
      box(0,.43,.48,.078,.70,.079,trim,wood);
      at('tube',0,.946,.48,.118,.21,.085,curtain,ceramic);
    }else{
      box(0,.402,.82,.85,.804,.238,trim,wood);
      box(-.19,.879,.746,.31,.076,.098,'777f7b',metal);
      box(.21,1.012,.85,.10,.325,.065,'8c918b',metal);
      for(const a of [-.25,0,.25])box(a,1.93,.878,.232,.57,.16,curtain,plaster);
    }
  }else if(layout===2){
    box(-.035,.23,.63,.66,.46,.48,trim,wood);
    soft(-.035,.49,.57,.66,.14,.43,curtain,linen);
    soft(-.04,.56,.474,.666,.094,.264,fabric,linen);
    soft(-.035,.83,.861,.70,1.02,.067,timber,wood);
    for(const a of [-.20,.13])soft(a,.63,.755,.244,.153,.104,curtain,linen);
    box(.365,.30,.718,.17,.60,.146,timber,wood);
    at('tube',.365,.79,.718,.12,.28,.096,curtain,linen);
  }else{
    shelf(-.31,.855,.29);
    soft(.19,.76,.652,.49,.071,.26,timber,wood);
    box(.352,.36,.67,.075,.71,.20,trim,wood);
    box(.13,.989,.716,.23,.338,.033,'565d61',metal);
    soft(.17,.46,.47,.166,.076,.133,fabric,linen);
    soft(.17,.70,.418,.17,.48,.061,fabric,linen);
    if(layout===7)plant(.26,.53,1.25);
  }
  plant(-.359,.626,.74+(hash>>>18)%4*.16);
  box(-.08,height*.66,.907,.28,.39,.036,trim,wood);
  box(-.08,height*.66,.883,.239,.34,.018,fabric,linen);
  const curtainSide=hash&8?1:-1;
  for(let i=0;i<3;i++){
    box(curtainSide*(.392+i*.034),height*.57,.125+i*.012,.047,height*.69,.052,curtain,linen);
  }
  at('tube',.06,height-.50,.52,.18,.21,.144,curtain,linen);
}
