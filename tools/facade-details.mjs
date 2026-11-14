const detail=.25;
const glass=['435661','526b77','627781','536e78','6b8993','5e7e8c','456773','67828e'];

export function recessedWindows(part,{a,b,w,d,low,high,front,facing=front,paint,trim,material,look,rows,bays}){
  const [widthScale,storeyScale,reveal]=look.eraProfile;
  const [bayScale,,,rail]=look.windowProfile,height=high-low;
  const count=rows??Math.max(1,Math.round(height/(3.90*storeyScale)));
  const floor=height/count,levels=Math.min(5,count),bottomHeight=floor*levels;
  const recess=Math.min(reveal,d*.17),depth=b+front*d*.5;
  const columns=bays??Math.max(2,Math.min(9,Math.round(w/(2.36*widthScale*bayScale))));
  const bay=w/columns,turn=facing===1?0:Math.PI;
  part('box',a,low+bottomHeight*.5,b-front*recess*.5,w,bottomHeight,d-recess,paint,material);
  if(levels<count){
    const upper=height-bottomHeight;
    part('box',a,low+bottomHeight+upper*.5,b,w,upper,d,paint,material);
  }
  for(let row=0;row<levels;row++)for(let col=0;col<columns;col++){
    const y=low+floor*(row+.5),x=a-w*.5+bay*(col+.5);
    part('window',x,y,depth-front*recess*.5,bay,floor,recess,paint,look.surface(18+detail),turn);
    part('box',x,y+floor*.04,depth-front*(recess-.025),bay*.785,floor*.684,.041,
      glass[(look.window+row+col)%glass.length],look.surface(10+detail));
    const frameDepth=depth-front*recess*.54;
    part('box',x,y+floor*.04,frameDepth,look.era<3?.064:.049,floor*.675,.049,look.frame,25+detail);
    if(look.era<2||look.window%3===0)
      part('box',x,y+floor*(-.30+rail*.68),frameDepth,bay*.78,.061,.05,look.frame,25+detail);
    const sill=look.era<3?.105:.072,projection=look.era<3?.24:.16;
    part('chamfer',x,y-floor*.317,depth+front*.036,bay*.82,sill,projection,trim,look.surface(18+detail));
    if(row>=2||bay<1.20||floor<2.30)continue;
    const outer=depth-front*recess*.27,height=floor*.673,width=bay*.778;
    for(const side of [-1,1]){
      part('box',x+side*width*.492,y+floor*.04,outer,.037,height,.066,look.frame,25+detail);
      part('box',x,y+floor*.04+side*height*.485,outer,width,.040,.068,look.frame,25+detail);
    }
    if(look.era<3){
      part('chamfer',x,y+floor*.399,depth+front*.028,bay*.84,.091,.153,trim,look.surface(18+detail));
      part('box',x,y-floor*.331,depth+front*projection*.48,bay*.74,.030,.047,'776f63',18+detail);
    }
  }
}

export function entryPortal(part,{a=0,level,edge,front,width,height=2.31,trim,look,open=false,obstacle}){
  const modern=look.era>=4,stone=look.era<2;
  const depth=modern?.85:stone?.57:.68,post=width>3?.32:stone?.21:.14,top=level+height;
  for(const side of [-1,1]){
    const x=a+side*(width+post)*.5;
    part('box',x,level+height*.5,edge+front*depth*.47,post,height,depth,modern?look.frame:trim,18);
    part('box',x,level+.13,edge+front*depth*.46,post+.075,.26,depth+.038,trim,18+detail);
    obstacle?.(x,edge+front*depth*.47,post+.055,depth);
    part('box',x-side*post*.34,level+height*.52,edge+front*depth*.61,.048,height*.88,depth*.56,
      modern?'687a80':trim,25+detail);
    part('chamfer',x,top-.11,edge+front*depth*.48,post+.102,.16,depth+.085,trim,18+detail);
  }
  part(stone?'chamfer':'box',a,top+.095,edge+front*depth*.45,width+post*2+.18,.19,depth+.17,trim,18);
  if(modern||open){
    part('chamfer',a,top+.19,edge+front*depth*.59,width+post*2+.24,.13,depth+.55,look.frame,25);
    part('box',a,top+.103,edge+front*depth*.77,width*.78,.046,.087,'f2dfb8',7+detail);
    part('box',a,top+.14,edge+front*(depth*1.08+.18),width+post*2+.12,.074,.065,'a4a5a0',25+detail);
  }
  if(!open){
    const face=edge+front*.05;
    part('box',a,level+height*.46,face,width*.94,height*.91,.082,'526d78',10);
    part('box',a,level+height*.46,face+front*.050,.062,height*.91,.055,look.frame,25+detail);
    part('box',a,top-.126,face+front*.044,width*.94,.071,.050,look.frame,25+detail);
    for(const side of [-1,1])part('box',a+side*.107,level+.97,face+front*.095,.036,.22,.063,trim,25+detail);
    part('box',a,level+.034,edge+front*.16,width*.97,.068,.26,'a9a6a0',23+detail);
    for(const side of [-1,1])part('box',a+side*width*.438,level+height*.47,face+front*.06,
      .071,height*.89,.08,look.frame,25+detail);
  }
}
