// Heights are measured from the entrance floor to the highest roof or crown.
export const heights=[4.5,5.4,6.2,7.1,8.2,9.4,10.8,12.3,13.9,15.5,17.4,19.2,21,23.1,25.4,27.6,30.1,
  32.5,35.2,37.8,41.2,44.4,48,52,56,61,66,72,79,86,94,103,113,124,136,149,163,179,196,214,234,256,280,305,329,354,378,406];
export function fitHeight(target){
  let best=heights[0];
  for(let i=1;i<heights.length;i++){
    const h=heights[i];
    if(Math.abs(h-target)>=Math.abs(best-target))break;
    best=h;
  }
  return best;
}

// Type, base height range, massing, roof and wall cladding.
const streets={
  tokyo:[
    ['machiya',4,12,'plain','gable',5],['corner-izakaya',5,17,'bay','lean',5],
    ['narrow-apartment',9,24,'setback','parapet',5],['concrete-atelier',6,19,'wing','saw',5],
    ['station-office',18,37,'chamfer','plant',19],['department-store',14,48,'stack','terrace',21]
  ],
  paris:[
    ['mansard-tenement',8,30,'plain','mansard',8],['cut-corner-hotel',10,28,'chamfer','mansard',8],
    ['covered-market',5,16,'wing','gable',8],['courtyard-house',5,17,'court','hip',8],
    ['limestone-boulevard',8,27,'bay','pavilion',8],['stepped-penthouse',12,32,'setback','lean',20]
  ],
  newyork:[
    ['brick-walkup',4,24,'plain','parapet',13],['brownstone-bay',4,22,'bay','parapet',13],
    ['warehouse-loft',8,34,'wing','saw',13],['beveled-flatiron',15,60,'chamfer','plant',20],
    ['zoned-office',20,90,'setback','pavilion',20],['glass-condominium',19,90,'stack','terrace',19]
  ],
  cairo:[
    ['adobe-court',4,16,'court','parapet',17],['whitewash-house',4,12,'plain','terrace',17],
    ['old-souk',4,13,'wing','hip',17],['shaded-loggia',5,19,'bay','pavilion',17],
    ['sandstone-corner',6,23,'chamfer','parapet',20],['desert-apartment',6,26,'setback','plant',17]
  ],
  sydney:[
    ['sandstone-terrace',4,15,'plain','gable',8],['harbour-townhouse',5,21,'bay','hip',5],
    ['former-warehouse',8,26,'wing','saw',13],['stepped-apartment',10,38,'setback','terrace',12],
    ['maritime-hotel',11,40,'chamfer','pavilion',12],['harbour-office',18,52,'stack','plant',19]
  ],
  rio:[
    ['hillside-brick-house',4,11,'plain','lean',13],['courtyard-villa',4,14,'court','hip',5],
    ['tiled-townhouse',5,17,'bay','gable',5],['beachfront-apartment',12,34,'chamfer','plant',12],
    ['terraced-concrete',9,30,'setback','terrace',12],['coastal-hotel',15,38,'stack','pavilion',12]
  ]
};
const modernStreets=[
  ['glass-office',12,103,'plain','plant',19],['beveled-workplace',12,103,'chamfer','plant',19],
  ['setback-commercial',12,103,'setback','terrace',19],['civic-office',12,103,'wing','plant',21],
  ['terraced-residence',12,103,'stack','terrace',19],['shaded-business-center',12,103,'bay','plant',21],
  ['open-court-office',12,103,'court','parapet',19],['slim-louvered-office',12,103,'setback','plant',21]
];
export function streetStyle(id,h,x,z,modern=false){
  const hash=(Math.imul(Math.round(x*100),1597334677)^Math.imul(Math.round(z*100),3812015801))>>>0;
  const catalog=modern?modernStreets:streets[id],choices=catalog.filter(([,min,max])=>min<=h&&h<=max);
  const [name,,,mass,roof,material]=(choices.length?choices:catalog)[hash%(choices.length||catalog.length)];
  return {name,mass,roof,material,variation:(hash%127)/127};
}

// Target position in the district, height, street width/depth of the podium, and structure.
// Lots are fitted to actual roads and validated against slopes, water and existing footprints.
export const towerPlans={
  newyork:[
    [-20,-19,406,32,29,'spire'],[43,-72,354,37,28,'crown'],[-80,2,305,36,32,'needle'],
    [113,33,280,32,29,'slot'],[-70,133,256,39,29,'stepped'],[32,119,214,28,24,'ribbon'],
    [-122,-47,163,29,27,'fluted']
  ],
  tokyo:[
    [-58,-15,378,35,30,'terraced'],[76,-43,329,33,28,'prism'],[123,43,280,36,29,'offset'],
    [-91,111,234,32,28,'skybridge'],[30,-96,196,29,25,'pinwheel'],[91,140,149,26,24,'blade']
  ],
  paris:[
    [164,-116,196,35,29,'beveled'],[205,-61,149,31,25,'arc'],[197,90,113,26,23,'pavilion']
  ],
  cairo:[
    [150,21,234,37,29,'obelisk'],[111,126,179,35,26,'paired'],[171,-85,136,29,24,'screen'],
    [52,151,86,26,23,'lantern']
  ],
  sydney:[
    [23,52,256,33,27,'sail'],[71,70,214,33,27,'rotunda'],[-77,105,179,31,25,'fold'],
    [115,111,124,30,24,'loggia']
  ],
  rio:[
    [-68,122,149,30,26,'veranda'],[-39,-112,113,28,23,'balconies'],
    [15,152,86,24,21,'brise-soleil'],[23,-146,66,24,21,'portico']
  ]
};
