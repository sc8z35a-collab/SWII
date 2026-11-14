// The low fraction carries appearance without changing the integer
// material ID or the .25 distance-based detail flag.
export const APPEARANCE_SCALE=8192;
export const eraProfiles=[
  [.91,1.16,.34,.22],[.96,1.09,.31,.19],[1.10,.98,.26,.14],
  [1.16,.96,.30,.16],[1.02,1.02,.23,.10],[.92,1.04,.20,.08]
];
export const windowProfiles=[
  [.84,.052,.025,.57],[1.11,-.021,.006,.45],[.93,.018,.052,.62],
  [1.19,-.040,-.032,.51],[.98,.006,-.014,.69],[1.27,-.046,.027,.43],
  [.88,.035,-.022,.74],[1.06,-.019,.032,.54]
];
export function appearanceMaterial(material,era,wear,window){
  return material+(1+era*64+wear*8+window)/APPEARANCE_SCALE;
}
const appearances=eraProfiles.flatMap((eraProfile,era)=>
  Array.from({length:8},(_,wear)=>windowProfiles.map((windowProfile,window)=>
    ({era,wear,window,eraProfile,windowProfile}))).flat());
export function facadeAppearance(material){
  const code=Math.round((material-Math.floor(material))*APPEARANCE_SCALE)%(APPEARANCE_SCALE/4);
  return appearances[code-1]??null;
}
