import {limits,districts,districtAt,toGlobal,waterLevel,liquidAt,rioShore} from '../dist/geography.js';
import {airportZone} from '../dist/transport-layout.js';
import {roadTunnels,tunnelDistance} from '../dist/road-tunnels.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const roadsByCity={
  tokyo:[
    [[-10,122],[0,79],[0,43],[6,21],[3,-6],[15,-39],[4,-71],[5,-128]],
    [[-130,20],[-80,26],[-44,47],[0,43],[29,35],[45,12],[73,9],[128,22]],
    [[-84,94],[-58,71],[-42,39],[-35,7],[-52,-30],[-71,-66],[-56,-120]],
    [[5,-103],[42,-89],[69,-62],[85,-30],[73,9],[101,49],[121,76]],
    [[-86,-59],[-38,-37],[-9,-27],[15,-39],[39,-37],[66,-29]],
    [[-84,94],[-49,98],[-22,80],[0,79],[22,75],[53,60],[73,41]],
    [[-71,-66],[-48,-81],[-19,-85],[3,-83],[34,-66],[69,-62]]
  ],
  paris:[
    [[-8,112],[0,77],[0,55],[3,30],[0,15],[0,7],[0,-10],[-10,-25],[-16,-40],[-1,-55],[42,-69],[87,-58],[110,-39]],
    [[-119,62],[-85,51],[-56,41],[-31,46],[0,55],[31,68],[64,65],[113,48]],
    [[-128,-42],[-91,-52],[-66,-75],[-40,-81],[-16,-74],[-1,-55],[14,-30],[48,-24],[81,-31],[110,-39]],
    [[-89,121],[-58,93],[-56,60],[-56,41],[-38,31],[-8,30],[25,30],[66,25],[102,30]],
    [[-58,93],[-26,96],[0,77],[19,87],[48,94],[80,83],[111,64]],
    [[-91,-52],[-84,-36],[-60,-24],[-43,-27],[-22,-31],[-10,-25],[14,-30]]
  ],
  newyork:[
    [[0,127],[0,78],[0,47],[3,22],[-2,-5],[4,-31],[-1,-59],[0,-83]],
    [[-130,30],[-83,36],[-50,53],[-17,54],[0,47],[27,30],[53,9],[76,19],[128,38]],
    [[-87,107],[-67,80],[-62,47],[-58,18],[-46,-22],[-45,-49],[-31,-71],[0,-83],[24,-76],[67,-67],[105,-52]],
    [[65,109],[62,71],[69,40],[64,17],[71,-22],[75,-48],[67,-67]],
    [[-67,80],[-48,89],[-26,79],[0,78],[19,88],[42,79],[62,71]],
    [[-62,47],[-45,27],[-24,24],[3,22],[25,13],[39,22],[53,9]]
  ],
  cairo:[
    [[10,108],[0,81],[0,48],[6,22],[-6,-1],[-23,-26],[-36,-35],[-55,-53],[-80,-62],[-100,-87]],
    [[-129,22],[-94,26],[-67,37],[-34,44],[0,48],[28,34],[48,13],[74,14],[107,-7],[124,-28]],
    [[-76,99],[-65,75],[-52,53],[-61,26],[-80,4],[-101,-6],[-126,-3]],
    [[47,94],[49,61],[60,41],[74,14],[68,-12],[72,-34],[91,-65],[119,-89]],
    [[-65,75],[-47,84],[-23,72],[0,81],[24,75],[49,61],[75,64],[100,43]],
    [[-61,26],[-38,22],[-14,19],[6,22],[24,12],[42,16]]
  ],
  sydney:[
    [[-8,120],[0,78],[0,44],[-5,24],[-12,6],[-12,-4]],
    [[119,18],[91,33],[61,43],[37,31],[13,32],[-5,24],[-38,18],[-54,6],[-54,-12]],
    [[-112,77],[-80,67],[-53,47],[-36,42],[-8,51],[12,62],[56,75],[79,73],[115,62]],
    [[-119,30],[-86,29],[-72,19],[-54,6],[-25,7],[-12,6],[18,4],[43,10],[78,16]],
    [[-80,67],[-62,81],[-39,82],[-18,72],[0,78],[28,84],[56,75],[75,53],[91,33]]
  ],
  rio:[
    [[12,118],[0,77],[10,59],[23,38],[32,18],[51,1],[55,-19],[37,-41],[14,-39],[-17,-31],[-42,-28],[-69,-18],[-89,-5],[-122,18]],
    [[-111,87],[-78,72],[-55,45],[-25,41],[0,47],[23,38],[42,23],[60,22]],
    [[-118,58],[-93,37],[-68,24],[-48,4],[-28,-9],[-17,-31],[-14,-47],[-3,-65],[17,-83],[29,-97]],
    [[28,108],[27,82],[24,59],[23,38],[27,11],[24,-11],[37,-41],[42,-66],[53,-88]],
    [[-78,130],[-60,99],[-51,68],[-58,45],[-53,22],[-37,2],[-31,-16],[-17,-31]],
    [[-53,22],[-21,33],[-5,25],[9,13],[27,11],[42,19]],
    [[-43,120],[-24,101],[-8,101],[11,98],[27,82],[37,61],[46,46],[47,30]],
    [[-61,-20],[-46,-11],[-21,-6],[1,-15],[24,-11],[39,-22],[48,-24]]
  ]
};
const connections=[
  ['paris',[110,-39],[[ -431,-410],[-361,-414],[-294,-375],[-234,-342],[-170,-345]],'newyork',[-130,30]],
  ['paris',[-8,112],[[-619,-185],[-657,-116],[-685,-51],[-672,38],[-633,106],[-642,168]],'rio',[12,118]],
  ['newyork',[128,38],[[196,-322],[248,-287],[314,-285],[370,-314],[432,-314]],'cairo',[-129,22]],
  ['newyork',[0,127],[[23,-183],[70,-119],[93,-43],[72,39],[31,100],[14,150]],'tokyo',[5,-128]],
  ['cairo',[10,108],[[653,-155],[685,-89],[694,-34],[662,29],[624,85],[610,158]],'sydney',[-8,120]],
  ['rio',[-122,18],[[-454,287],[-399,247],[-331,240],[-257,274],[-187,306]],'tokyo',[-130,20]],
  ['tokyo',[128,22],[[180,343],[237,385],[293,396],[357,361],[425,317]],'sydney',[119,18]]
];
export function catmull(points,spacing=7){
  const line=[];
  for(let j=0;j<points.length-1;j++){
    const a=points[Math.max(0,j-1)],b=points[j],c=points[j+1],d=points[Math.min(j+2,points.length-1)];
    const n=Math.max(1,Math.ceil(Math.hypot(c[0]-b[0],c[1]-b[1])/spacing));
    for(let i=0;i<n;i++){
      const t=i/n,t2=t*t,t3=t2*t;
      line.push(b.map((v,k)=>.5*((2*v)+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t2+(-a[k]+3*v-3*c[k]+d[k])*t3)));
    }
  }
  line.push(points.at(-1));
  return line;
}
const oldOrigins={tokyo:[-12,303],paris:[-600,-350],newyork:[5,-370],cairo:[620,-326],sydney:[618,332],rio:[-640,333]};
function expandLink(a,p,m,b,q){
  const from=toGlobal(a,...p),to=toGlobal(b,...q),turnA=districts[a].turn,turnB=districts[b].turn;
  const oldA=oldOrigins[a].map((n,i)=>n+p[i]*turnA),oldB=oldOrigins[b].map((n,i)=>n+q[i]*turnB);
  const dx=oldB[0]-oldA[0],dz=oldB[1]-oldA[1],scale=dx*dx+dz*dz;
  const middle=m.map(([x,z])=>{
    const t=clamp(((x-oldA[0])*dx+(z-oldA[1])*dz)/scale,.04,.96);
    return [mix(from[0],to[0],t)+2.4*(x-mix(oldA[0],oldB[0],t)),mix(from[1],to[1],t)+2.4*(z-mix(oldA[1],oldB[1],t))];
  });
  return catmull([from,...middle,to],9);
}
function neighborhoodRoads(height,random,arterials){
  const spacing=122,rows=Math.floor((limits.south-limits.north-100)/spacing),cols=Math.floor((limits.east-limits.west-90)/spacing);
  const grid=new Map(),routes=[],key=(i,j)=>i+','+j;
  function clear(x,z){
    if(x<limits.west+26||x>limits.east-26||z<limits.north+26||z>limits.south-26)return false;
    if(airportZone(x,z,11)||openTrench(x,z,8))return false;
    const id=districtAt(x,z),c=districts[id];
    if(Math.hypot(x-c.x,z-c.z)<141)return false;
    if(id==='rio'&&height(x,z)>56)return false;
    return !liquidAt(x,z,height(x,z));
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const x=limits.west+56+(i+(j%2)*.45)*spacing+(random()-.5)*spacing*.72+43*Math.sin(j*.40);
    const z=limits.north+58+j*spacing+(random()-.5)*spacing*.74+44*Math.sin(i*.39+j*.17);
    if(clear(x,z))grid.set(key(i,j),[x,z]);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
    const a=grid.get(key(i,j));if(!a)continue;
    for(const [k,l] of [[i+1,j],[i,j+1],[i+(j%2===0?-1:1),j+1]]){
      const b=grid.get(key(k,l));if(!b)continue;
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length>230||random()<(j%2===0?.24:.30))continue;
      const variation=(random()-.5)*Math.min(42,length*.33);
      const way=[mix(a[0],b[0],.55)-dz/length*variation,mix(a[1],b[1],.55)+dx/length*variation];
      const points=catmull([a,way,b],12),id=districtAt(...way);
      if(points.some(p=>!clear(...p))||points.some((p,i)=>i>0&&Math.abs(height(...p)-height(...points[i-1]))>6.5))continue;
      const avenue=random()<.075;
      routes.push({id,local:false,main:avenue,arterial:false,width:avenue?8.1:4.5+random()*2.2,points});
    }
  }
  // Tie the collector grid to the landmark streets and long-distance arterials.
  const byCell=new Map();
  for(const a of grid.values()){
    const k=key(Math.floor(a[0]/spacing),Math.floor(a[1]/spacing));
    if(!byCell.has(k))byCell.set(k,[]);
    byCell.get(k).push(a);
  }
  const used=new Set();
  for(const route of arterials){
    const step=route.local?6:17;
    for(let i=2;i<route.points.length;i+=step){
      const a=route.points[i],u=Math.floor(a[0]/spacing),v=Math.floor(a[1]/spacing);
      let best=null,distance=147;
      for(let j=v-2;j<=v+2;j++)for(let k=u-2;k<=u+2;k++)for(const b of byCell.get(key(k,j))??[]){
        const d=Math.hypot(a[0]-b[0],a[1]-b[1]);
        if(d>25&&d<distance&&!used.has(b)){best=b;distance=d;}
      }
      if(!best)continue;
      const points=catmull([a,[mix(a[0],best[0],.51)+9,mix(a[1],best[1],.51)-7],best],10);
      if(points.some(p=>liquidAt(...p,height(...p))))continue;
      used.add(best);routes.push({id:route.id,local:false,main:false,arterial:false,width:6.3,points});
    }
  }
  return routes;
}
export function makeRoutes(height,random){
  const local=Object.entries(roadsByCity).flatMap(([id,list])=>list.map((points,i)=>({
    id,local:true,main:i<2,arterial:i<2,width:i===0?10.2:i===1?8.2:5.8,
    points:catmull(points.map(p=>toGlobal(id,...p)))
  })));
  const waterfront=[];
  for(let z=-147;z<=151;z+=15.4)waterfront.push(toGlobal('rio',rioShore(z)-24.4,z));
  local.push({id:'rio',local:true,main:true,arterial:false,width:7.6,points:catmull(waterfront,5.8),waterfront:true});
  const links=connections.map(([a,p,m,b,q])=>({id:a,local:false,main:true,arterial:true,width:12.3,points:expandLink(a,p,m,b,q)}));
  return [...local,...links,...neighborhoodRoads(height,random,[...local,...links])];
}
export function openTrench(x,z,margin=0){
  return roadTunnels.some(tunnel=>{
    const [along,side]=tunnelDistance(tunnel,x,z),edge=Math.min(along,tunnel.length-along);
    return edge>-margin&&edge<tunnel.ramp+margin&&Math.abs(side)<tunnel.half+margin;
  });
}
export function roadStyle(route){
  if(route.arterial)return {kind:'avenue',paint:'595f64',mat:2,walk:true,mark:true,rank:4};
  if(route.main)return {kind:'collector',paint:'626769',mat:2,walk:true,mark:true,rank:3};
  if(route.local||route.width>=6.15)return {kind:'street',paint:'676b6d',mat:2,walk:true,mark:false,rank:2};
  const [x,z]=route.points[0],hash=Math.abs(Math.round(x*.51+z*.71))%13;
  if(route.id==='cairo'&&hash<6)return {kind:'sand',paint:'c6a878',mat:36,walk:false,mark:false,rank:1};
  if(hash<3)return {kind:'gravel',paint:'949087',mat:35,walk:false,mark:false,rank:1};
  return {kind:'alley',paint:'858680',mat:38,walk:false,mark:false,rank:1};
}
function project(x,z,a,b){
  const dx=b[0]-a[0],dz=b[1]-a[1],k=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
  return [a[0]+k*dx,a[1]+k*dz];
}
export function makeRoadIndex(routes){
  const size=62,cells=new Map(),key=(x,z)=>Math.floor(x/size)+','+Math.floor(z/size);
  for(const r of routes)for(let i=1;i<r.points.length;i++){
    const a=r.points[i-1],b=r.points[i],radius=r.width*.5+34,segment={a,b,r};
    for(let x=Math.floor((Math.min(a[0],b[0])-radius)/size);x<=Math.floor((Math.max(a[0],b[0])+radius)/size);x++)
      for(let z=Math.floor((Math.min(a[1],b[1])-radius)/size);z<=Math.floor((Math.max(a[1],b[1])+radius)/size);z++){
        const id=x+','+z;
        if(!cells.has(id))cells.set(id,[]);
        cells.get(id).push(segment);
      }
  }
  const distance=(x,z,max=28,except=null)=>{
    let best=max;
    for(const {a,b,r} of cells.get(key(x,z))??[]){
      if(r===except||Math.abs(x-a[0])>max+15||Math.abs(z-a[1])>max+15)continue;
      const p=project(x,z,a,b);
      best=Math.min(best,Math.hypot(x-p[0],z-p[1])-r.width*.5);
    }
    return best;
  };
  distance.find=(x,z,max=26)=>{
    const matches=[];
    for(const {a,b,r} of cells.get(key(x,z))??[]){
      if(Math.abs(x-a[0])>max+25||Math.abs(z-a[1])>max+25)continue;
      const point=project(x,z,a,b),gap=Math.hypot(point[0]-x,point[1]-z)-r.width*.5;
      if(gap<max)matches.push({point,gap,route:r});
    }
    return matches.sort((a,b)=>a.gap-b.gap);
  };
  return distance;
}

// A lane leaves and rejoins a street, opening a second frontage inside the block.
export function blockLanes(routes,height){
  const distance=makeRoadIndex(routes),lanes=[],spacing=32,claimed=new Map();
  const key=(x,z)=>Math.floor(x/spacing)+','+Math.floor(z/spacing);
  function room(x,z){
    const a=Math.floor(x/spacing),b=Math.floor(z/spacing);
    for(let i=a-1;i<=a+1;i++)for(let j=b-1;j<=b+1;j++)
      if((claimed.get(i+','+j)??[]).some(p=>Math.hypot(x-p[0],z-p[1])<23))return false;
    return true;
  }
  for(const route of routes){
    if(route.local||route.arterial||route.repair||route.points.length<9)continue;
    const points=route.points,first=points[0],last=points.at(-1);
    const [x,z]=points[Math.floor(points.length*.5)],id=districtAt(x,z),d=districts[id];
    if(Math.hypot(x-d.x,z-d.z)<186)continue;
    const length=Math.hypot(last[0]-first[0],last[1]-first[1]);
    if(length<94)continue;
    const nx=(first[1]-last[1])/length,nz=(last[0]-first[0])/length;
    const preferred=(Math.round(x+z)%2===0?1:-1);
    for(const side of [preferred,-preferred]){
      const setback=28+Math.abs(Math.round(x*.09+z*.13))%8;
      const offset=(t,n)=>[mix(first[0],last[0],t)+nx*n*side,mix(first[1],last[1],t)+nz*n*side];
      const line=catmull([points[1],offset(.29,setback),offset(.59,setback*1.08),offset(.78,setback*.86),points.at(-2)],8.5);
      if(line.some((p,i)=>{
        const [x,z]=p,h=height(x,z),middle=i>=line.length*.22&&i<=line.length*.79;
        return x<limits.west+12||x>limits.east-12||z<limits.north+12||z>limits.south-12||
          airportZone(x,z,9)||openTrench(x,z,9)||liquidAt(x,z,h)||
          middle&&(distance(x,z,25,route)<13||!room(x,z))||
          i>0&&Math.abs(h-height(...line[i-1]))>Math.hypot(x-line[i-1][0],z-line[i-1][1])*.29;
      }))continue;
      for(const p of line.slice(3,-3)){
        const id=key(...p);
        if(!claimed.has(id))claimed.set(id,[]);
        claimed.get(id).push(p);
      }
      lanes.push({id,width:id==='cairo'?4.5:4.35,local:false,main:false,arterial:false,backstreet:true,points:line});
    }
  }
  return lanes;
}
