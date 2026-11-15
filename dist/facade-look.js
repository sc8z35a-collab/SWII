// The low fraction carries appearance without changing the integer
// material ID or the .25 distance-based detail flag.
export const APPEARANCE_SCALE=65536;
export const DETAIL_FLAG=.2499;
export const eraProfiles=[
  [.91,1.16,.34,.22],[.96,1.09,.31,.19],[1.10,.98,.26,.14],
  [1.16,.96,.30,.16],[1.02,1.02,.23,.10],[.92,1.04,.20,.08]
];
export const windowProfiles=[
  [.84,.052,.025,.57],[1.11,-.021,.006,.45],[.93,.018,.052,.62],
  [1.19,-.040,-.032,.51],[.98,.006,-.014,.69],[1.27,-.046,.027,.43],
  [.88,.035,-.022,.74],[1.06,-.019,.032,.54]
];
// Sixteen kinds of damage and ageing. A building's recipe gives each kind a level from 0 to 3.
export const damageKinds=['hairline-cracks','structural-crack','spalling','peeling-paint','rust-streaks','efflorescence',
  'moss','street-grime','rain-drips','claw-gouges','repair-patches','graffiti','sun-fading','pitting','droppings','ivy'];
export const DAMAGE_CLASSES=32;
const LOOKS=eraProfiles.length*64;
export const APPEARANCE_CODES=LOOKS*DAMAGE_CLASSES;
export function appearanceMaterial(material,era,wear,window,damage=0){
  return material+(1+damage*LOOKS+era*64+wear*8+window)/APPEARANCE_SCALE;
}
// The same integer hash runs in the fragment shader, so the levels listed here are the ones drawn.
export function damageRecipe(code){
  let x=(Math.imul(code,747796405)+2891336453)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;
  x^=x>>>15;x=Math.imul(x,0x846ca68b)>>>0;
  x^=x>>>16;
  return x>>>0;
}
export const damageLevels=recipe=>damageKinds.map((_,kind)=>(recipe>>>(kind*2))&3);
const appearances=eraProfiles.flatMap((eraProfile,era)=>
  Array.from({length:8},(_,wear)=>windowProfiles.map((windowProfile,window)=>
    ({era,wear,window,eraProfile,windowProfile}))).flat());
export function appearanceCode(material){
  return Math.round((material-Math.floor(material))*APPEARANCE_SCALE)%(APPEARANCE_SCALE/4)-1;
}
export function facadeAppearance(material){
  const code=appearanceCode(material);
  return code>=0&&code<APPEARANCE_CODES?appearances[code%LOOKS]:null;
}
export function facadeDamage(material){
  const code=appearanceCode(material);
  return code>=0&&code<APPEARANCE_CODES?Math.floor(code/LOOKS):null;
}
