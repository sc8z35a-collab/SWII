export const PHOTO_BYTES=180_000;
export const MAX_PHOTOS=9;
export const PHOTO_PREFIX='data:image/jpeg;base64,';

export function latestPhotos(current,incoming){
  if(!Array.isArray(incoming))return current??[];
  return (current?.[0]?.captured??-Infinity)>(incoming[0]?.captured??-Infinity)?current:incoming;
}

export function photograph(source,callback){
  let image=null;
  try{
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    const scale=Math.min(1,900/Math.max(source.width,source.height));
    for(const size of [scale,scale*.72,scale*.5]){
      canvas.width=Math.max(1,Math.round(source.width*size));
      canvas.height=Math.max(1,Math.round(source.height*size));
      context.drawImage(source,0,0,canvas.width,canvas.height);
      for(const quality of [.78,.63,.49,.34]){
        const candidate=canvas.toDataURL('image/jpeg',quality);
        if(candidate.startsWith(PHOTO_PREFIX)&&candidate.length>PHOTO_PREFIX.length&&
          (candidate.length-PHOTO_PREFIX.length)*.75<=PHOTO_BYTES){
          image=candidate;
          break;
        }
      }
      if(image)break;
    }
  }catch{}
  callback(image);
}
