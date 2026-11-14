const epsilon=1e-7;

function area(points){
  const [x,z]=points[0]??[0,0];
  let sum=0;
  for(let i=1;i+1<points.length;i++){
    const a=points[i],b=points[i+1];
    sum+=(a[0]-x)*(b[1]-z)-(a[1]-z)*(b[0]-x);
  }
  return sum*.5;
}

function bounds(points){
  let west=Infinity,east=-Infinity,north=Infinity,south=-Infinity;
  for(const [x,z] of points){
    west=Math.min(west,x);east=Math.max(east,x);
    north=Math.min(north,z);south=Math.max(south,z);
  }
  return {west,east,north,south};
}

function side(a,b,p){
  const value=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  return Math.abs(value)<epsilon?0:value;
}

function split(points,a,b){
  const inside=[],outside=[];
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];
    const dp=side(a,b,p),dq=side(a,b,q);
    if(dp>=0)inside.push(p);
    if(dp<=0)outside.push(p);
    if(dp*dq<0){
      const t=dp/(dp-dq),crossing=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
      inside.push(crossing);outside.push(crossing);
    }
  }
  return {inside,outside};
}

// Both the asphalt and the mask use these vertices, including at curved joins.
export const roadPoint=(edge,offset)=>[edge.x+edge.nx*offset,edge.z+edge.nz*offset];
export const capPoints=({point:[x,z],radius})=>Array.from({length:12},(_,i)=>{
  const angle=i*Math.PI/6;
  return [x+Math.cos(angle)*radius,z+Math.sin(angle)*radius];
});

export function makeRoadMask(routes,edges,caps){
  const cells=new Map(),size=28;
  function visit(box,action){
    const x0=Math.floor(box.west/size),x1=Math.floor(box.east/size);
    const z0=Math.floor(box.north/size),z1=Math.floor(box.south/size);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)action(x+','+z);
  }
  function add(points,route){
    const signed=area(points);
    if(Math.abs(signed)<epsilon)return;
    const box=bounds(points);
    const entry={points:signed<0?points.slice().reverse():points,route,box};
    visit(box,key=>{
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(entry);
    });
  }
  for(const route of routes){
    const list=edges.get(route),half=route.width*.5;
    for(let i=1;i<list.length;i++){
      const left=roadPoint(list[i-1],-half),right=roadPoint(list[i-1],half);
      const nextLeft=roadPoint(list[i],-half),nextRight=roadPoint(list[i],half);
      add([left,nextLeft,right],route);
      add([right,nextLeft,nextRight],route);
    }
  }
  for(const cap of caps)add(capPoints(cap),null);

  function nearby(box,except){
    const result=new Set();
    visit(box,key=>{
      for(const entry of cells.get(key)??[]){
        if(except&&entry.route===except)continue;
        const other=entry.box;
        if(other.west<=box.east&&other.east>=box.west&&other.north<=box.south&&other.south>=box.north)result.add(entry);
      }
    });
    return result;
  }

  function clip(points,keepInside=false){
    let remaining=[points];
    const paved=[];
    for(const {points:cutter} of nearby(bounds(points))){
      const next=[];
      for(const polygon of remaining){
        let inside=polygon;
        const outside=[];
        for(let i=0;i<cutter.length;i++){
          const part=split(inside,cutter[i],cutter[(i+1)%cutter.length]);
          if(Math.abs(area(part.outside))>epsilon)outside.push(part.outside);
          inside=part.inside;
          if(inside.length<3)break;
        }
        if(Math.abs(area(inside))<epsilon)next.push(polygon);
        else{
          next.push(...outside);
          if(keepInside)paved.push(inside);
        }
      }
      remaining=next;
      if(!remaining.length)break;
    }
    return keepInside?paved:remaining;
  }

  function contains(x,z,except){
    const point=[x,z],box={west:x,east:x,north:z,south:z};
    for(const {points} of nearby(box,except)){
      if(points.every((p,i)=>side(p,points[(i+1)%points.length],point)>=0))return true;
    }
    return false;
  }

  function exposed(a,b,except){
    const covered=[];
    for(const {points} of nearby(bounds([a,b]),except)){
      let start=0,end=1;
      for(let i=0;i<points.length&&start<end;i++){
        const p=points[i],q=points[(i+1)%points.length];
        const first=side(p,q,a),last=side(p,q,b);
        if(first<0&&last<0){end=0;break;}
        if(first>=0&&last>=0)continue;
        const crossing=first/(first-last);
        if(first<0)start=Math.max(start,crossing);
        else end=Math.min(end,crossing);
      }
      if(start+epsilon<end)covered.push([start,end]);
    }
    covered.sort((a,b)=>a[0]-b[0]);
    const visible=[];
    let last=0;
    for(const [start,end] of covered){
      if(start>last+epsilon)visible.push([last,start]);
      last=Math.max(last,end);
    }
    if(last<1-epsilon)visible.push([last,1]);
    return visible;
  }

  return {clip,contains,exposed};
}
