// The volumes use normalized center, width, depth, and floor intervals.
// Positive local depth faces the street.
const residence=(id,size,floors,facade,roof,finish,volumes)=>({id,size,floors,facade,roof,finish,volumes});
const concrete=[12,'c1c1b5','dbd8ca','536868','636a64'];
const steel=[19,'86a0aa','c7ccca','435b64','5d6766'];
const ceramic=[5,'ded3c2','b5aa99','785954','665f5c'];
const limestone=[8,'dfc7a6','e7d7b8','565c56','5a606a'];
const cream=[8,'e3d6be','b6a58d','52665f','646970'];
const brick=[13,'a97965','c4ad90','4e5353','665852'];
const brownstone=[13,'a8836e','d0b79f','4e4741','6b6258'];
const desert=[17,'d7b78b','ebd6ab','796449','a27d5a'];
const adobe=[17,'bb9674','e4c3a1','64746a','ab7f5f'];
const coast=[12,'d4d6c9','e0e0d2','4f7376','7b8981'];
const stucco=[5,'ddc29f','e9d6b7','627960','995c4b'];

export const apartmentPlans={
  tokyo:[
    residence('tokyo-split-balcony',[9.5,13.8,10.8,15.4],[5,8],'balcony','utility',concrete,[
      [0,-.06,1,.88,0,.22],[-.263,.014,.455,.88,.22,1],[.25,-.095,.45,.73,.22,.82]]),
    residence('tokyo-terrace-duplex',[13.4,19,10.2,14.6],[4,7],'belt','garden',ceramic,[
      [0,0,1,1,0,.45],[-.07,-.135,.83,.72,.45,.76],[-.15,-.23,.59,.51,.76,1]]),
    residence('tokyo-loggia-slab',[17.6,24.8,10.2,14.2],[7,11],'loggia','utility',concrete,[
      [0,-.025,1,.95,0,.14],[0,.04,.935,.89,.14,1]]),
    residence('tokyo-alley-maisonette',[6.2,8.9,8.4,12.2],[3,4],'fins','gable',ceramic,[
      [-.22,.064,.56,.86,0,1],[.28,-.115,.44,.76,0,.66]]),
    residence('tokyo-corner-condo',[12.3,17.6,12.2,17.2],[9,13],'ribbon','utility',steel,[
      [0,0,1,1,0,.22,'chamfer'],[.045,-.06,.85,.85,.22,.77,'chamfer'],[-.025,-.11,.70,.74,.77,1,'chamfer']])
  ],
  paris:[
    residence('paris-mansard-corner',[12.6,17.9,10.4,14.8],[5,7],'arch','mansard',limestone,[
      [0,0,1,1,0,.79,'chamfer'],[-.07,-.08,.80,.78,.79,1,'chamfer']]),
    residence('paris-open-courtyard',[16,22,14.6,19.5],[4,6],'shutters','hip',cream,[
      [0,-.31,1,.38,0,1],[-.355,.195,.29,.60,0,1],[.355,.185,.29,.58,0,.76]]),
    residence('paris-balconied-tenement',[8.1,11.9,9.7,14],[5,8],'gallery','mansard',cream,[
      [0,-.045,1,.91,0,1],[0,.434,.54,.048,.20,.76]]),
    residence('paris-terraced-penthouse',[12.4,18.1,11.9,16.5],[6,9],'belt','garden',limestone,[
      [0,0,1,1,0,.47],[.12,-.12,.75,.73,.47,.81],[.21,-.19,.52,.59,.81,1]]),
    residence('paris-stone-garden-wing',[13.3,18.5,11.6,16.4],[4,6],'bay','hip',limestone,[
      [-.16,-.035,.68,.93,0,1],[.34,-.215,.32,.57,0,.67]])
  ],
  newyork:[
    residence('newyork-bay-walkup',[7,10.3,9.2,13],[3,5],'bay','parapet',brownstone,[
      [0,-.067,1,.866,0,1],[.09,.404,.46,.072,.18,.83,'chamfer']]),
    residence('newyork-zoned-residence',[13.3,19.5,13.5,18.7],[9,15],'arch','utility',brick,[
      [0,0,1,1,0,.38],[-.04,-.08,.88,.83,.38,.72],[.13,-.20,.60,.59,.72,1]]),
    residence('newyork-courtyard-lofts',[17.8,25.4,13.6,18.2],[4,7],'ribbon','saw',brick,[
      [0,-.305,1,.39,0,.85],[-.34,.175,.32,.57,0,1],[.34,.123,.32,.47,0,.88]]),
    residence('newyork-slender-glass',[9.6,13.1,10.2,14.7],[9,14],'fins','utility',steel,[
      [0,0,1,1,0,.16,'chamfer'],[.09,.02,.80,.84,.16,1],[-.39,-.135,.16,.57,.16,.69]]),
    residence('newyork-corner-brick-row',[13.5,20.5,9.7,13.9],[4,7],'gallery','parapet',brownstone,[
      [-.26,.04,.48,.92,0,1],[.24,-.09,.52,.82,0,.80]])
  ],
  cairo:[
    residence('cairo-wind-court',[13.5,19.5,13.8,18.8],[3,5],'screen','parapet',adobe,[
      [0,-.33,1,.34,0,1],[-.36,.18,.28,.64,0,.83],[.36,.09,.28,.46,0,.64]]),
    residence('cairo-shaded-terraces',[11.6,16.7,12.1,16.9],[4,7],'loggia','garden',desert,[
      [0,0,1,1,0,.31],[.05,-.095,.84,.77,.31,.68],[-.09,-.26,.58,.47,.68,1]]),
    residence('cairo-stone-arcades',[12.7,18.8,10.4,15],[4,6],'arch','utility',desert,[
      [0,0,1,1,0,.22],[0,-.11,.96,.77,.22,1,'chamfer']]),
    residence('cairo-corner-maisonette',[7.2,10.7,9.1,12.9],[3,4],'shutters','parapet',adobe,[
      [.14,-.11,.72,.78,0,1],[-.36,.085,.28,.83,0,.70]]),
    residence('cairo-twin-screens',[15.5,22.9,12.4,16.6],[6,9],'screen','utility',desert,[
      [0,0,1,1,0,.18,'chamfer'],[-.274,-.04,.40,.86,.18,.79],[.247,.022,.45,.82,.18,1]])
  ],
  sydney:[
    residence('sydney-harbour-balconies',[13.8,20.2,11.3,16.3],[6,10],'gallery','utility',coast,[
      [0,0,1,1,0,.65,'chamfer'],[0,-.095,.79,.79,.65,1,'chamfer']]),
    residence('sydney-sawtooth-lofts',[13,19.4,14.2,18.9],[3,6],'ribbon','saw',brick,[
      [-.23,.037,.54,.92,0,1],[.27,-.112,.46,.77,0,.82]]),
    residence('sydney-sandstone-court',[15.4,21.1,12.8,17.7],[4,6],'shutters','hip',cream,[
      [0,-.30,1,.40,0,.82],[-.335,.18,.33,.56,0,1],[.355,.067,.29,.334,0,.63]]),
    residence('sydney-hillside-gardens',[12,18,12.9,18.3],[4,8],'balcony','garden',coast,[
      [0,0,1,1,0,.25],[.075,-.06,.85,.85,.25,.55],[-.085,-.16,.62,.68,.55,.81],[-.17,-.27,.42,.45,.81,1]]),
    residence('sydney-gabled-veranda',[8.6,13.1,10.3,15.1],[3,5],'loggia','gable',stucco,[
      [0,-.045,1,.91,0,.76],[-.17,-.1,.61,.73,.76,1]])
  ],
  rio:[
    residence('rio-beachfront-ribbon',[14.4,21.4,11.2,16],[7,11],'belt','utility',coast,[
      [0,0,1,1,0,.29,'chamfer'],[-.035,.03,.93,.86,.29,1,'chamfer']]),
    residence('rio-split-hillside',[9.1,13.7,10.1,14.4],[3,5],'balcony','gable',stucco,[
      [-.21,.03,.58,.94,0,.67],[.29,-.116,.42,.76,0,1]]),
    residence('rio-deep-verandas',[11.6,16.8,11.5,16.8],[5,8],'loggia','garden',coast,[
      [0,0,1,1,0,.23],[0,.058,.92,.86,.23,.80],[-.13,-.19,.65,.61,.80,1]]),
    residence('rio-ceramic-patio',[13.2,18.4,12.5,17.4],[3,5],'shutters','hip',stucco,[
      [0,-.28,1,.44,0,1],[-.33,.21,.34,.54,0,.72],[.33,.11,.34,.34,0,.55]]),
    residence('rio-breeze-block-tower',[12.3,17.3,11.2,15.8],[8,12],'screen','utility',concrete,[
      [0,0,1,1,0,.14],[.19,-.055,.54,.84,.14,1],[-.28,.03,.37,.89,.14,.84]])
  ]
};

const facility=(id,label,size,height,paint,trim,sign,roof,frontage)=>
  ({id,label,size,height,paint,trim,sign,roof,frontage});
export const facilityPlans=[
  facility('kiosk','KIOSK',[3.2,4.3,3.4,4.2],3.2,'bdafa1','5c6e65','315c56','booth','counter'),
  facility('convenience','MART',[8.6,11.1,6.8,8.5],4.0,'d2cdbd','e5e0cc','327668','flat','shelves'),
  facility('corner-convenience','MART',[12,17,9.5,12.5],4.5,'d9ded5','efeddf','3f7682','flat','shelves'),
  facility('supermarket','SUPERMARKET',[18.5,26,13.3,18.7],5.6,'b4b5ac','dad6c5','405b72','warehouse','shelves'),
  facility('shopping-center','MALL',[47,60,28,38],10.5,'bbbab0','d8ded7','455d6a','warehouse','mall'),
  facility('bakery','BAKERY',[6.6,9.4,6.5,8.9],4.7,'caaa82','ede0c6','805c4b','gable','bread'),
  facility('pharmacy','PHARMACY',[6.9,9.7,7,9.2],4.2,'cbd3c3','e3dfd3','39775a','parapet','medicine'),
  facility('cafe','CAFE',[8.2,11.9,8.5,11.4],4.6,'b39a81','d9cab0','684943','awning','tables'),
  facility('produce-market','PRODUCE',[11.8,16.9,9.1,13.1],4.6,'a7977b','e3d6b3','9b694c','canvas','produce'),
  facility('post-office','POST',[8.8,12.9,8.8,11.8],5.0,'c6b18f','e6d4b5','974a45','hip','postboxes'),
  facility('bicycle-shop','CYCLES',[7.7,10.6,6.8,9.6],4.5,'969d99','cbd0c7','52616e','saw','cycles'),
  facility('bookshop','BOOKS',[7.5,10.9,7.5,10.3],4.9,'c1ab93','d7c2a5','514d63','gable','books'),
];

export function neighborhoodSize(plan,index){
  const [minWidth,maxWidth,minDepth,maxDepth]=plan.size;
  const scale=plan.floors?1.34:1.16;
  const width=scale*(minWidth+(maxWidth-minWidth)*((index*7+3)%11)/10);
  const depth=scale*(minDepth+(maxDepth-minDepth)*((index*3+5)%11)/10);
  const floors=plan.floors?plan.floors[0]+index%(plan.floors[1]-plan.floors[0]+1):1;
  const roofHeight={gable:1.25,hip:1.35,mansard:1.55,saw:1.25,garden:.73,parapet:.42,utility:1.24}[plan.roof];
  const height=plan.height?plan.height+.54:floors*(plan.finish[0]===8?4.05:3.77)+roofHeight;
  return {width,depth,height,floors,roofHeight};
}
