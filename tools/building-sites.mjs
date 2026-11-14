export function buildingSite(width,depth,height){
  const span=Math.sqrt(width*depth),load=Math.max(0,height-18);
  const spread=.06+.019*Math.max(0,span-9)+.0135*load;
  const clearance=.043*Math.max(0,span-11)+.0145*load;
  const foundationWidth=width+2*spread,foundationDepth=depth+2*spread;
  return {foundationWidth,foundationDepth,plotWidth:foundationWidth+2*clearance,
    plotDepth:foundationDepth+2*clearance,embed:.14+height*.009};
}

export function entryFoundation(plan,{foundation,triangle,platform,heightAt},stone,paving,width){
  const {x,z,angle,front,site,level,walk,curb}=plan;
  const {foundationWidth:w,foundationDepth:d,embed}=site;
  const c=Math.cos(angle),s=Math.sin(angle);
  const point=(a,y,b)=>[x+a*c+b*s,y,z-a*s+b*c];
  function surface(width,near,far,start,end,material){
    const left=point(-width*.5,start+.015,near),right=point(width*.5,start+.015,near);
    const outerRight=point(width*.5,end+.015,far),outerLeft=point(-width*.5,end+.015,far);
    triangle(left,right,outerRight,paving,material);
    triangle(left,outerRight,outerLeft,paving,material);
    const [px,,pz]=point(0,0,(near+far)*.5);
    platform(px,pz,width,Math.abs(far-near)+.026,angle,(start+end)*.5,(end-start)/(far-near));
  }
  foundation(x,z,w,d,angle,level+.015,stone,embed);
  surface(w,-d*.5,d*.5,level,level,23);
  const inner=d*.5*front,outer=(d*.5+walk)*front;
  surface(width,inner,outer,level,curb,1);
  for(const side of [-1,1]){
    const a=side*width*.5,top=point(a,level+.015,inner),edge=point(a,curb+.015,outer);
    const grade=p=>[p[0],Math.min(p[1],heightAt(p[0],p[2])-.09),p[2]];
    const low=grade(top),lowEdge=grade(edge);
    if(side===front){triangle(top,edge,lowEdge,stone,18);triangle(top,lowEdge,low,stone,18);}
    else{triangle(top,lowEdge,edge,stone,18);triangle(top,low,lowEdge,stone,18);}
  }
  const [px,,pz]=point(0,0,outer);
  return [px,pz];
}
