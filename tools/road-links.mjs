const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function connectStreets(routes,heightAt,clear){
  const size=120,grid=new Map(),cell=(x,z)=>Math.floor(x/size)+','+Math.floor(z/size);
  function index(route){
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],segment={a,b,route};
      for(let x=Math.floor((Math.min(a[0],b[0])-156)/size);x<=Math.floor((Math.max(a[0],b[0])+156)/size);x++)
        for(let z=Math.floor((Math.min(a[1],b[1])-156)/size);z<=Math.floor((Math.max(a[1],b[1])+156)/size);z++){
          const key=x+','+z;
          if(!grid.has(key))grid.set(key,[]);
          grid.get(key).push(segment);
        }
    }
  }
  routes.forEach(index);
  const links=[],ends=[],seen=new Set();
  for(const route of routes)for(const start of [true,false]){
    const point=start?route.points[0]:route.points.at(-1),key=point.map(n=>Math.round(n*10)).join(',');
    if(seen.has(key))continue;
    seen.add(key);
    const previous=start?route.points[1]:route.points.at(-2);
    ends.push({point,previous,route});
  }
  for(const {point,previous,route} of ends){
    const candidates=[];
    let connected=false;
    for(const {a,b,route:other} of grid.get(cell(...point))??[]){
      if(other===route)continue;
      const dx=b[0]-a[0],dz=b[1]-a[1],s=dx*dx+dz*dz;
      const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(s||1)));
      const target=[a[0]+dx*t,a[1]+dz*t],d=distance(point,target);
      if(d<other.width*.5+1.1){connected=true;break}
      if(d<12||d>146)continue;
      const reach=distance(point,previous)||1,out=point.map((n,i)=>(n-previous[i])/reach);
      const dot=((target[0]-point[0])*out[0]+(target[1]-point[1])*out[1])/d;
      if(dot<-.62)continue;
      candidates.push({target,other,d,out,score:d+(1-dot)*24});
    }
    if(connected)continue;
    candidates.sort((a,b)=>a.score-b.score);
    for(const {target,other,d,out} of candidates.slice(0,22)){
      const control=point.map((n,i)=>n+out[i]*Math.min(d*.30,24)),count=Math.ceil(d/3);
      const points=[];
      for(let j=0;j<=count;j++){
        const t=j/count,u=1-t;
        points.push(point.map((n,i)=>u*u*n+2*u*t*control[i]+t*t*target[i]));
      }
      const width=Math.min(route.width,other.width,6.3);
      if(points.some((p,i)=>!clear(p,width*.5+1.8)||i>0&&
        Math.abs(heightAt(...p)-heightAt(...points[i-1]))/Math.max(.1,distance(p,points[i-1]))>.36))continue;
      const link={id:route.id,points,width,local:false,main:false,arterial:false,repair:true};
      links.push(link);index(link);break;
    }
  }
  return links;
}
