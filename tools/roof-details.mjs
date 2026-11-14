const detail=.25;
const boxRing=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
const chamferRing=[[-.36,-.5],[.36,-.5],[.5,-.36],[.5,.36],[.36,.5],[-.36,.5],[-.5,.36],[-.5,-.36]];

export function roofParapet(part,{kind,a,b,width,depth,y,height,stone,metal,facing=1}){
  const ring=kind==='chamfer'?chamferRing:boxRing;
  const points=ring.map(([x,z])=>[a+x*(width-.20),b+z*(depth-.20)]);
  for(const [i,[x,z]] of points.entries()){
    const [nx,nz]=points[(i+1)%points.length];
    const length=Math.hypot(nx-x,nz-z),turn=Math.atan2((z-nz)*facing,nx-x);
    const cx=(x+nx)*.5,cz=(z+nz)*.5;
    part('box',cx,y+height*.5,cz,length+.08,height,.16,stone,18,turn);
    part('box',cx,y+height-.028,cz,length+.105,.056,.22,metal,25+detail,turn);
  }
}

export function roofFlashing(part,{a,b,width,depth,y,height,type,metal}){
  if(width<2.6||depth<2.0)return;
  for(const side of [-1,1]){
    const edge=b+side*(depth*.5+.033);
    part('box',a,y-.045,edge,width+.21,.092,.146,metal,25+detail);
    part('box',a,y-.10,edge-side*.061,width+.12,.036,.092,'626564',25+detail);
  }
  if(type==='gable'){
    part('box',a,y+height-.026,b,width*.56,.097,.181,metal,25+detail);
  }
  if(type==='hip'||type==='mansard'){
    part('chamfer',a,y+height-.014,b,width*.574,.070,depth*.574,metal,25+detail);
  }
}

export function roofEquipment(part,{a,b,width,depth,y,height,look}){
  if(width<4.2||depth<4.3||height<.53)return;
  const unit=Math.min(1.31,width*.235),h=Math.min(.62,height*.73),d=Math.min(1.07,depth*.26);
  const x=a+(look.window%2===0?1:-1)*width*.26,z=b-depth*.23;
  part('box',x,y+.036,z,unit+.13,.072,d+.12,'6e716e',18+detail);
  part('chamfer',x,y+.07+h*.5,z,unit,h,d,'9ba3a4',25+detail);
  part('box',x,y+.07+h*.51,z+d*.5+.014,unit*.84,h*.66,.045,'455058',15+detail);
  for(const offset of [-.27,0,.27])
    part('box',x+unit*offset,y+.07+h*.51,z+d*.5+.04,.031,h*.66,.029,'adb6b4',25+detail);
  part('tube',x,y+h+.091,z,Math.min(unit,d)*.59,.039,Math.min(unit,d)*.59,'3d4548',15+detail);
}
