const clampByte=n=>Math.min(255,Math.max(0,Math.round(n)));
export const packedColor=([r,g,b])=>clampByte(r*255)|(clampByte(g*255)<<8)|(clampByte(b*255)<<16);

export function rasterizer(){
  const layer=document.createElement('canvas'),ctx=layer.getContext('2d');
  let image,pixels,depth,width,height,coverage,shaded=false;
  function begin(w,h){
    if(w!==width||h!==height){
      width=layer.width=w;height=layer.height=h;
      image=ctx.createImageData(w,h);
      pixels=new Uint32Array(image.data.buffer);
      depth=new Float32Array(w*h);
      coverage=null;
    }else{
      pixels.fill(0);depth.fill(0);
      if(shaded)coverage?.fill(0);
    }
    shaded=false;
  }
  function triangle(a,b,c,color,alpha,bias,shadow=0,surface=null){
    if(a[1]>b[1])[a,b]=[b,a];
    if(b[1]>c[1])[b,c]=[c,b];
    if(a[1]>b[1])[a,b]=[b,a];
    const [ax,ay,az]=a,[bx,by,bz]=b,[cx,cy,cz]=c;
    const dy=cy-ay,area=(bx-ax)*dy-(cx-ax)*(by-ay);
    if(Math.abs(area)<.015||cy<0||ay>=height)return false;
    const slope=(cx-ax)/dy;
    const zX=((bz-az)*dy-(cz-az)*(by-ay))/area;
    const zY=((bx-ax)*(cz-az)-(cx-ax)*(bz-az))/area;
    const smooth=a.length===6||a.length===8;
    let texture,size,mask,uSlot,vSlot,uX=0,uY=0,vX=0,vY=0;
    if(surface){
      uSlot=smooth?6:3;vSlot=uSlot+1;
      uX=((b[uSlot]-a[uSlot])*dy-(c[uSlot]-a[uSlot])*(by-ay))/area;
      uY=((bx-ax)*(c[uSlot]-a[uSlot])-(cx-ax)*(b[uSlot]-a[uSlot]))/area;
      vX=((b[vSlot]-a[vSlot])*dy-(c[vSlot]-a[vSlot])*(by-ay))/area;
      vY=((bx-ax)*(c[vSlot]-a[vSlot])-(cx-ax)*(b[vSlot]-a[vSlot]))/area;
      if(!surface.map){
        const {mipmaps}=surface;
        const invMid=(az+bz+cz)/3,centerU=(a[uSlot]+b[uSlot]+c[uSlot])/(3*invMid);
        const centerV=(a[vSlot]+b[vSlot]+c[vSlot])/(3*invMid);
        const span=Math.max(Math.abs(uX-centerU*zX),Math.abs(uY-centerU*zY),
          Math.abs(vX-centerV*zX),Math.abs(vY-centerV*zY))*mipmaps[0].size/invMid;
        const level=Math.max(0,Math.min(mipmaps.length-1,Math.floor(Math.log2(Math.max(1,span))+.34)));
        surface.map=mipmaps[level];
      }
      ({size,bytes:texture}=surface.map);mask=size-1;
    }
    let rx=0,ry=0,gx=0,gy=0,bx1=0,by1=0;
    if(smooth){
      rx=((b[3]-a[3])*dy-(c[3]-a[3])*(by-ay))/area;
      ry=((bx-ax)*(c[3]-a[3])-(cx-ax)*(b[3]-a[3]))/area;
      gx=((b[4]-a[4])*dy-(c[4]-a[4])*(by-ay))/area;
      gy=((bx-ax)*(c[4]-a[4])-(cx-ax)*(b[4]-a[4]))/area;
      bx1=((b[5]-a[5])*dy-(c[5]-a[5])*(by-ay))/area;
      by1=((bx-ax)*(c[5]-a[5])-(cx-ax)*(b[5]-a[5]))/area;
    }
    const first=Math.max(0,Math.ceil(ay-.5)),last=Math.min(height,Math.ceil(cy-.5));
    const opaque=0xff000000|color,r=color&255,g=(color>>>8)&255,b0=(color>>>16)&255;
    const blendR=r*alpha,blendG=g*alpha,blendB=b0*alpha,remaining=1-alpha;
    let visible=false;
    for(let y=first;y<last;y++){
      const sy=y+.5,edge=ax+(sy-ay)*slope;
      const other=sy<by?ax+(bx-ax)*(sy-ay)/(by-ay):bx+(cx-bx)*(sy-by)/(cy-by);
      const left=Math.max(0,Math.ceil(Math.min(edge,other)-.5)),right=Math.min(width,Math.ceil(Math.max(edge,other)-.5));
      let inv=az+(left+.5-ax)*zX+(sy-ay)*zY+bias;
      const row=y*width;
      if(shadow){
        for(let i=row+left;i<row+right;i++,inv+=zX){
          if(!depth[i]||inv<depth[i]||coverage[i]>=shadow)continue;
          const weight=(shadow-coverage[i])/(255-coverage[i]),dest=pixels[i];
          const red=dest&255,green=(dest>>>8)&255,blue=(dest>>>16)&255;
          pixels[i]=0xff000000|Math.round(red+(r-red)*weight)|(Math.round(green+(g-green)*weight)<<8)|
            (Math.round(blue+(b0-blue)*weight)<<16);
          coverage[i]=shadow;
        }
      }else if(alpha!==1){
        for(let i=row+left;i<row+right;i++,inv+=zX){
          if(inv<depth[i])continue;
          visible=true;
          const dest=pixels[i];
          const keep=(dest>>>24)/255*remaining,mixed=alpha+keep;
          pixels[i]=(Math.round(mixed*255)<<24)|Math.round((blendR+(dest&255)*keep)/mixed)|
            (Math.round((blendG+((dest>>>8)&255)*keep)/mixed)<<8)|(Math.round((blendB+((dest>>>16)&255)*keep)/mixed)<<16);
        }
      }else if(texture){
        let u=a[uSlot]+(left+.5-ax)*uX+(sy-ay)*uY;
        let v=a[vSlot]+(left+.5-ax)*vX+(sy-ay)*vY;
        let red=smooth?a[3]+(left+.5-ax)*rx+(sy-ay)*ry:r;
        let green=smooth?a[4]+(left+.5-ax)*gx+(sy-ay)*gy:g;
        let blue=smooth?a[5]+(left+.5-ax)*bx1+(sy-ay)*by1:b0;
        for(let i=row+left;i<row+right;i++,inv+=zX,u+=uX,v+=vX,red+=rx,green+=gx,blue+=bx1){
          if(inv<depth[i])continue;
          visible=true;depth[i]=inv;
          const z=1/inv,at=(((Math.floor(v*z*size)&mask)*size)+(Math.floor(u*z*size)&mask))*4;
          const albedo=.50+texture[at]*.00372,warm=(texture[at+3]-128)*.00074;
          const gain=smooth?z*255:1;
          pixels[i]=0xff000000|clampByte(red*gain*albedo*(1+warm))|
            (clampByte(green*gain*albedo)<<8)|(clampByte(blue*gain*albedo*(1-warm*.75))<<16);
        }
      }else if(smooth){
        let red=a[3]+(left+.5-ax)*rx+(sy-ay)*ry;
        let green=a[4]+(left+.5-ax)*gx+(sy-ay)*gy;
        let blue=a[5]+(left+.5-ax)*bx1+(sy-ay)*by1;
        for(let i=row+left;i<row+right;i++,inv+=zX,red+=rx,green+=gx,blue+=bx1){
          if(inv<depth[i])continue;
          visible=true;
          depth[i]=inv;
          pixels[i]=0xff000000|clampByte(red/inv*255)|(clampByte(green/inv*255)<<8)|(clampByte(blue/inv*255)<<16);
        }
      }else{
        for(let i=row+left;i<row+right;i++,inv+=zX){
          if(inv<depth[i])continue;
          visible=true;
          depth[i]=inv;pixels[i]=opaque;
        }
      }
    }
    return visible;
  }
  function fill(points,color,alpha=1,bias=0,texture=null){
    let visible=false;
    const surface=texture&&{mipmaps:texture,map:null};
    for(let i=1;i<points.length-1;i++)visible=triangle(points[0],points[i],points[i+1],color,alpha,bias,0,surface)||visible;
    return visible;
  }
  function shade(points,color,opacity){
    const shadow=clampByte(opacity*255);
    if(!shadow)return;
    coverage??=new Uint8Array(width*height);
    shaded=true;
    for(let i=1;i<points.length-1;i++)triangle(points[0],points[i],points[i+1],color,opacity,0,shadow);
  }
  function present(target){
    ctx.putImageData(image,0,0);
    target.drawImage(layer,0,0);
  }
  return {begin,fill,shade,present};
}
