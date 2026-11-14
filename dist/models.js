const a=[-.5,-.5,.5],b=[.5,-.5,.5],c=[.5,-.5,-.5],d=[-.5,-.5,-.5],e=[-.28,.5,0],f=[.28,.5,0];
export const roofFaces=[[a,b,f,e],[b,c,f],[c,d,e,f],[d,a,e],[d,c,b,a]];
const ring=[[-.36,.5],[.36,.5],[.5,.36],[.5,-.36],[.36,-.5],[-.36,-.5],[-.5,-.36],[-.5,.36]];
const lower=ring.map(([x,z])=>[x,-.5,z]),upper=ring.map(([x,z])=>[x,.5,z]);
export const chamferFaces=lower.map((p,i)=>{
  const j=(i+1)%lower.length;
  return [p,lower[j],upper[j],upper[i]];
});
chamferFaces.push(upper,[...lower].reverse());

const tip=ring.map(([x,z])=>[x*.57,.5,z*.57]);
export const taperFaces=lower.map((p,i)=>{
  const j=(i+1)%lower.length;
  return [p,lower[j],tip[j],tip[i]];
});
taperFaces.push(tip,[...lower].reverse());

export const paneFaces=[[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]]];
const face=(left,right,bottom,top)=>[[left,bottom,.5],[right,bottom,.5],[right,top,.5],[left,top,.5]];
// One sill, head and two jambs. The glass or room behind this opening is a separate mesh.
const l=-.39,r=.39,lowerSill=-.30,upperSill=.38;
export const windowFaces=[
  face(-.5,l,-.5,.5),face(r,.5,-.5,.5),face(l,r,-.5,lowerSill),face(l,r,upperSill,.5),
  [[l,lowerSill,.5],[l,lowerSill,-.5],[l,upperSill,-.5],[l,upperSill,.5]],
  [[r,lowerSill,-.5],[r,lowerSill,.5],[r,upperSill,.5],[r,upperSill,-.5]],
  [[l,lowerSill,.5],[r,lowerSill,.5],[r,lowerSill,-.5],[l,lowerSill,-.5]],
  [[l,upperSill,-.5],[r,upperSill,-.5],[r,upperSill,.5],[l,upperSill,.5]]
];
