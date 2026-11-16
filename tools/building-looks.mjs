import {APPEARANCE_CODES,DAMAGE_CLASSES,appearanceMaterial,damageKinds,damageLevels,damageRecipe,eraProfiles,windowProfiles} from '../dist/facade-look.js';

const pigments=[
  [0,0,0],[13,9,3],[-17,-8,-5],[9,-6,-12],[-14,4,9],[10,13,7],[-9,-3,8],[17,3,-8],
  [-19,-12,-18],[21,18,12],[2,-14,-17],[-5,9,11],[-17,1,-6],[8,1,14],[19,7,-4],[-7,-16,-8],
  [-13,-11,1],[7,15,17],[22,13,-6],[-18,-6,2],[4,8,-11],[-9,1,16],[14,2,10],[-7,11,3],
  [6,-3,-9],[-11,5,-2],[16,10,1],[-4,-9,-14],[11,-2,6],[-15,-4,12],[3,12,-5],[-8,7,-13],
  [20,5,3],[-21,-15,-9],[9,17,13],[-2,-6,5],[13,-9,-3],[-10,13,9],[5,3,-17],[-16,-2,-11],
  [18,14,8],[-6,-12,3],[1,6,10],[-19,-9,-4],[12,8,-10],[-3,15,6],[15,-5,-13],[-12,-1,14],
];
export const lookCounts={eras:6,pigments:pigments.length,wear:8,windows:8,damageClasses:DAMAGE_CLASSES,
  damageKinds:damageKinds.length,appearanceCodes:APPEARANCE_CODES};
const years=[[1880,1909],[1910,1939],[1940,1964],[1965,1984],[1985,2004],[2005,2026]];
const frames=['7e766a','857666','685e51','63716e','677479','526c78'];
const climate={tokyo:1,paris:3,newyork:5,cairo:7,sydney:9,rio:11};
const original={id:'original',tint:null,weight:0,renewed:false};
const lime={id:'limewash',tint:'d9cab1',weight:.53,material:48,frame:'837769',renewed:true};
const stone={id:'restored-stone',tint:'ddc9a9',weight:.58,material:8,frame:'8b7860',renewed:true};
const brick={id:'exposed-brick',tint:'a66f59',weight:.64,material:13,frame:'665e54',renewed:false};
const tile={id:'ceramic-cladding',tint:'c7c5ba',weight:.53,material:49,frame:'5b6e72',renewed:true};
const zinc={id:'standing-seam-zinc',tint:'849598',weight:.61,material:50,frame:'526468',renewed:true};
const wood={id:'timber-cladding',tint:'ac8970',weight:.60,material:51,frame:'675c50',renewed:true};
const concrete={id:'fiber-cement-panels',tint:'9eacaa',weight:.57,material:52,frame:'667b7b',renewed:true};
const glazed={id:'glazed-refit',tint:'7493a4',weight:.64,material:19,frame:'546f79',renewed:true};
const copper={id:'patinated-copper',tint:'73918a',weight:.63,material:53,frame:'566d65',renewed:false};
const periodRenovations=[
  [original,stone,lime,brick,original,stone,lime,brick],
  [original,brick,stone,wood,lime,original,tile,brick],
  [original,lime,brick,tile,concrete,wood,zinc,original],
  [original,concrete,tile,wood,zinc,copper,lime,original],
  [original,tile,zinc,concrete,wood,glazed,copper,original],
  [original,zinc,tile,concrete,wood,glazed,copper,original]
];
const glassRenovations=[original,original,glazed,zinc,glazed,copper,concrete,original];

export function buildingLook(city,x,z,height,material,base){
  let hash=(Math.imul(Math.round(x*100),374761393)^Math.imul(Math.round(z*100),668265263)^
    Math.imul(climate[city],0x6a09e667))>>>0;
  hash=Math.imul(hash^(hash>>>16),0x7feb352d);
  hash=Math.imul(hash^(hash>>>15),0x846ca68b);
  hash=(hash^(hash>>>16))>>>0;
  const glass=material===19||material===21||material===4;
  const first=glass?height>100?4:3:height>80?1:0;
  const era=first+hash%(6-first),palette=(hash>>>6)%pigments.length;
  const renovation=(glass?glassRenovations:periodRenovations[era])[(hash>>>25)%8];
  const weather=(hash>>>14)%8;
  const aging=era<2&&weather<3?weather+3:era===5&&weather>5?weather-2:weather;
  const wear=renovation.renewed?Math.round(aging*.49):aging;
  const window=(hash>>>22)%8;
  // Which of the sixteen kinds of damage a building shows, and how strongly, follows from this class.
  const damage=(Math.imul(hash^0x9e3779b9,0x85ebca6b)>>>11)%DAMAGE_CLASSES;
  const code=damage*384+era*64+wear*8+window;
  const [from,to]=years[era],year=from+(hash>>>16)%(to-from+1);
  const tone=pigments[palette].map((shift,i)=>{
    const value=parseInt(base.slice(i*2,i*2+2),16);
    const refit=renovation.tint?parseInt(renovation.tint.slice(i*2,i*2+2),16):value;
    const blend=value+(refit-value)*renovation.weight;
    return Math.max(38,Math.min(235,Math.round(blend+(163-blend)*wear*.017+shift))).toString(16).padStart(2,'0');
  }).join('');
  return {key:[era,palette,wear,window,renovation.id,damage].join('/'),year,era,wear,window,damage,tone,frame:renovation.frame??frames[era],renovation,
    eraProfile:eraProfiles[era],windowProfile:windowProfiles[window],
    // The recipe the shader derives from this building's code: a level from 0 to 3 for every kind of damage.
    recipe:damageLevels(damageRecipe(code)),
    surface:mat=>appearanceMaterial(mat===material?(renovation.material??mat):mat,era,wear,window,damage)};
}
