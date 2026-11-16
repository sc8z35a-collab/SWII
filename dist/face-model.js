import {clamp,polygonize,sdCapsule,sdEllipsoid,sdRoundCone,smin,smoothstep} from './mesh-builder.js';

// Three large faces, each about one unit tall, facing +Z with +X on the face's left.
// 0: a hollow porcelain mask, 1: a skull, 2: a horned hannya mask.
// Vertex data after the normal: surface part, jaw weight, baked occlusion, depth inside a cavity.
export const FACE_PART={skin:0,hollow:1,teeth:2,horn:3,eye:4};
export const FACE_KINDS=3;
export const JAW_HINGE=[0,-.13,-.06];

const E=(c,r)=>p=>sdEllipsoid(p,c,r);
const C=(a,b,r1,r2=r1)=>r1===r2?p=>sdCapsule(p,a,b,r1):p=>sdRoundCone(p,a,b,r1,r2);
const mirror=shape=>p=>shape([Math.abs(p[0]),p[1],p[2]]);
const smax=(a,b,k)=>-smin(-a,-b,k);

function hollowMask(){
  const skin=[
    [E([0,.02,-.02],[.36,.5,.3]),0],
    [E([0,.3,.06],[.3,.2,.24]),.1],
    [mirror(E([.2,-.07,.15],[.13,.12,.13])),.09],
    [E([0,-.37,.1],[.17,.13,.15]),.1],
    [C([0,.12,.27],[0,-.1,.35],.034,.05),.045],
    [mirror(E([.04,-.115,.33],[.03,.024,.03])),.02],
    [mirror(E([.15,.2,.26],[.12,.035,.06])),.05],
    [mirror(E([.36,.0,-.04],[.035,.09,.06])),.03]
  ];
  // Narrow drooping eye slits and a grin that reaches the cheekbones.
  const grin=[];
  for(let i=-6;i<=6;i++){
    const x=i*.036,lift=1.55*x*x;
    grin.push(E([x,-.275+lift,.31-Math.abs(x)*.42],[.03,.021+.016*(1-Math.abs(i)/6),.085]));
  }
  const hollow=[
    mirror(p=>sdEllipsoid([p[0],p[1]+(p[0]-.15)*.34,p[2]],[.15,.1,.27],[.088,.03,.11])),
    mirror(E([.026,-.118,.36],[.012,.01,.03])),
    ...grin
  ];
  const teeth=[];
  for(let i=-5;i<=5;i++){
    const x=i*.034+.017*(i%2?1:-1)*.2,lift=1.55*x*x,z=.262-Math.abs(x)*.42;
    teeth.push(C([x,-.262+lift,z],[x,-.286+lift,z+.004],.0125,.009));
  }
  return {skin,hollow,teeth,lower:[],horn:[],eye:[mirror(E([.15,.1,.205],[.03,.03,.03]))],
    jaw:()=>0,min:[-.47,-.56,-.4],max:[.47,.6,.46]};
}

function skull(){
  const skin=[
    [E([0,.14,-.04],[.37,.38,.37]),0],
    [E([0,.2,.12],[.3,.24,.24]),.1],
    [mirror(E([.25,-.03,.16],[.105,.075,.13])),.07],
    [mirror(C([.3,-.02,.1],[.34,.02,-.12],.035,.03)),.04],
    [E([0,-.19,.17],[.19,.13,.17]),.08],
    [mirror(E([.15,.2,.27],[.13,.045,.07])),.05],
    [E([0,-.4,.13],[.2,.085,.17]),.0],
    [mirror(C([.19,-.38,.08],[.27,-.14,-.05],.05,.042)),.05],
    [E([0,-.46,.2],[.1,.05,.08]),.05]
  ];
  const hollow=[
    mirror(p=>sdEllipsoid([p[0],p[1]-(p[0]-.15)*.2,p[2]],[.152,.065,.29],[.115,.105,.15])),
    mirror(p=>sdEllipsoid([p[0]-p[1]*.3,p[1],p[2]],[.062,-.105,.33],[.036,.075,.09])),
    mirror(E([.31,-.16,.1],[.06,.08,.12])),
    E([0,-.315,.2],[.17,.018,.16])
  ];
  const teeth=[],lower=[];
  for(let i=0;i<7;i++){
    const x=.014+i*.027,z=.315-x*x*2.4-(i>4?.03:0),r=i>3?.015:.0125;
    teeth.push(mirror(C([x,-.25,z],[x,-.3,z+.006],r,r*.8)));
    lower.push(mirror(C([x*.96,-.375,z-.012],[x*.96,-.33,z-.006],r*.92,r*.74)));
  }
  // The chin follows the jaw completely; the branches of the jaw bend toward the hinge.
  const jaw=p=>Math.max(smoothstep(-.31,-.322,p[1])*smoothstep(-.12,.0,p[2]),
    smoothstep(.17,.21,Math.abs(p[0]))*smoothstep(-.15,-.33,p[1]));
  return {skin,hollow,teeth,lower,horn:[],eye:[],jaw,min:[-.47,-.58,-.46],max:[.47,.58,.48]};
}

function hannya(){
  const skin=[
    [E([0,.06,-.03],[.36,.45,.31]),0],
    [E([0,.3,.08],[.29,.19,.23]),.1],
    // A knotted brow that drops toward the nose.
    [mirror(C([.03,.13,.31],[.25,.24,.2],.062,.05)),.05],
    [mirror(E([.24,-.02,.17],[.12,.1,.12])),.07],
    [mirror(E([.27,-.1,.12],[.07,.05,.07])),.04],
    [C([0,.1,.27],[0,-.07,.36],.045,.075),.05],
    [mirror(E([.062,-.085,.33],[.045,.032,.04])),.025],
    [E([0,-.44,.15],[.13,.11,.13]),.09],
    [mirror(C([.17,-.36,.1],[.3,-.12,-.02],.06,.05)),.06],
    [mirror(E([.36,.03,-.05],[.04,.11,.07])),.03]
  ];
  const mouth=[];
  for(let i=-5;i<=5;i++){
    const x=i*.045,lift=1.25*x*x;
    mouth.push(E([x,-.262+lift,.3-Math.abs(x)*.5],[.044,.05+.022*(1-Math.abs(i)/5),.1]));
  }
  const hollow=[
    mirror(p=>sdEllipsoid([p[0],p[1]-(p[0]-.15)*.42,p[2]],[.155,.075,.275],[.085,.047,.085])),
    mirror(E([.045,-.09,.375],[.016,.013,.03])),
    ...mouth
  ];
  const teeth=[mirror(C([.075,-.215,.275],[.082,-.33,.292],.021,.004))];
  const lower=[mirror(C([.135,-.325,.24],[.128,-.215,.262],.019,.004))];
  for(let i=0;i<4;i++){
    const x=.018+i*.03+(i>1?.035:0),z=.285-x*.55;
    teeth.push(mirror(C([x,-.212+1.25*x*x,z],[x,-.25+1.25*x*x,z+.004],.013,.009)));
    lower.push(mirror(C([x,-.325+.9*x*x,z-.016],[x,-.292+.9*x*x,z-.012],.012,.008)));
  }
  const horn=[
    mirror(p=>smin(sdRoundCone(p,[.17,.36,.08],[.27,.58,.05],.066,.043),
      sdRoundCone(p,[.27,.58,.05],[.3,.82,-.03],.043,.008),.03))
  ];
  const jaw=p=>Math.max(smoothstep(-.272,-.29,p[1]-1.1*p[0]*p[0])*smoothstep(-.1,.02,p[2]),
    smoothstep(.2,.25,Math.abs(p[0]))*smoothstep(-.14,-.34,p[1]));
  return {skin,hollow,teeth,lower,horn,eye:[mirror(E([.155,.077,.225],[.052,.047,.045]))],jaw,
    min:[-.5,-.6,-.4],max:[.5,.88,.5]};
}

const recipes=[hollowMask,skull,hannya];
export function buildFace(kind,detail=1){
  const {skin,hollow,teeth,lower,horn,eye,jaw,min,max}=recipes[kind]();
  const center=[(min[0]+max[0])*.5,(min[1]+max[1])*.5,(min[2]+max[2])*.5];
  const reach=Math.hypot(max[0]-min[0],max[1]-min[1],max[2]-min[2])*.5;
  const least=list=>p=>{let d=1e9;for(const shape of list)d=Math.min(d,shape(p));return d;};
  const cavity=least(hollow),upper=least(teeth),under=least(lower),horns=least(horn),eyes=least(eye);
  const tooth=p=>Math.min(upper(p),under(p));
  const flesh=p=>{
    let d=1e9;
    for(const [shape,k] of skin)d=smin(d,shape(p),k);
    return d;
  };
  const field=p=>{
    const far=Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])-reach;
    if(far>.08)return far;
    const carved=smax(flesh(p),-cavity(p),.016);
    return Math.min(smin(carved,horns(p),.03),tooth(p),eyes(p));
  };
  const label=(p,n=[0,0,1])=>{
    const s=flesh(p),c=cavity(p),t=tooth(p),h=horns(p),e=eyes(p);
    let part=FACE_PART.skin;
    if(t<.006&&t<=e)part=FACE_PART.teeth;
    else if(e<.006)part=FACE_PART.eye;
    else if(h<s+.004&&h<.012)part=FACE_PART.horn;
    else if(c<.014)part=FACE_PART.hollow;
    // Occlusion: how much free space lies in front of the surface.
    const open=reachOut=>clamp(field([p[0]+n[0]*reachOut,p[1]+n[1]*reachOut,p[2]+n[2]*reachOut])/reachOut,0,1);
    const ao=.25*open(.03)+.4*open(.08)+.35*open(.18);
    const hinge=part===FACE_PART.teeth?(under(p)<upper(p)?1:0):clamp(jaw(p),0,1);
    // The last value is 1 at the rim of an opening and fades over five centimetres of the model.
    return [part,hinge,ao,clamp(1-c/.05,0,1)];
  };
  return polygonize(field,label,min,max,detail>.5?.0175:.036);
}
