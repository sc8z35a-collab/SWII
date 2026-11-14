export const SIGNAL_GREEN=29;
export const SIGNAL_RED=31;
export const STREET_LAMP=32;
export const SIGNAL_COLORS=['6ddbac','e6b94b','f76658'];

export function signalAt(seconds){
  const phase=((seconds%29)+29)%29;
  return phase<13?SIGNAL_GREEN:phase<16?SIGNAL_GREEN+1:SIGNAL_RED;
}

// The atlas-8 files contain these exact colors before the lamps had their own material.
const legacyColors=new Map([
  ...SIGNAL_COLORS.map((color,index)=>[parseInt(color,16),SIGNAL_GREEN+index]),
  [0xffe6ae,STREET_LAMP],[0xd6ddc7,STREET_LAMP]
]);
export function tagLegacyLights(boxes){
  for(let i=0;i<boxes.length;i+=16){
    const material=boxes[i+15],base=Math.floor(material);
    if(base!==0&&base!==7)continue;
    const color=(Math.round(boxes[i+12]*255)<<16)|(Math.round(boxes[i+13]*255)<<8)|Math.round(boxes[i+14]*255);
    const lamp=legacyColors.get(color);
    if(lamp!==undefined)boxes[i+15]=lamp+material-base;
  }
}
