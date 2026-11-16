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
// Sixty further types: ten new massings and eleven new roofs, eight per city and twelve modern ones.
const additions={
  tokyo:[
    ['pencil-building',12,40,'podium','billboard',19],['capsule-tower',14,44,'cluster','mast',12],
    ['shotengai-arcade',5,14,'ell','barrel',5],['temple-hall',5,13,'plain','pagoda',5],
    ['karaoke-block',10,30,'turret','billboard',21],['manshon-slab',12,44,'fins','solar',12],
    ['sento-bathhouse',5,12,'wing','pagoda',5],['zakkyo-stack',9,32,'ziggurat','tank',19]
  ],
  paris:[
    ['haussmann-rotunda',10,28,'drum','dome',8],['passage-gallery',6,18,'gate','barrel',8],
    ['beaux-arts-pavilion',9,26,'turret','dome',20],['atelier-verriere',6,20,'ell','solar',8],
    ['belle-epoque-store',12,30,'podium','dome',20],['left-bank-studio',8,24,'cluster','garden',8],
    ['institut-arcade',9,27,'cantilever','garden',20],['quai-warehouse',7,22,'twin','barrel',13]
  ],
  newyork:[
    ['art-deco-setback',20,90,'ziggurat','crown',20],['cast-iron-loft',8,34,'fins','tank',13],
    ['tenement-twin',8,30,'twin','tank',13],['corner-bank',10,36,'drum','dome',20],
    ['meatpacking-shed',5,18,'ell','barrel',13],['armory-turret',9,32,'turret','spire',13],
    ['highline-cantilever',14,60,'cantilever','garden',19],['midtown-podium',22,90,'podium','helipad',19]
  ],
  cairo:[
    ['mosque-quarter-hall',5,16,'drum','dome',17],['minaret-house',6,20,'turret','spire',17],
    ['caravanserai',4,13,'gate','parapet',17],['mashrabiya-block',6,22,'fins','garden',17],
    ['nile-villa',5,16,'ell','dome',20],['khan-arcade',5,15,'twin','barrel',17],
    ['citadel-step',7,24,'ziggurat','parapet',20],['bazaar-cluster',4,14,'cluster','solar',17]
  ],
  sydney:[
    ['federation-turret',6,22,'turret','spire',13],['wharf-shed',5,16,'ell','barrel',5],
    ['surf-club',5,14,'cantilever','solar',5],['harbour-twin',14,50,'twin','helipad',19],
    ['terrace-ziggurat',10,38,'ziggurat','garden',12],['rotunda-pavilion',6,20,'drum','dome',8],
    ['quay-podium',16,52,'podium','mast',19],['sandstone-gatehouse',7,24,'gate','crown',8]
  ],
  rio:[
    ['favela-stack',4,14,'cluster','tank',13],['colonial-sobrado',5,16,'turret','dome',5],
    ['modernist-pilotis',10,34,'cantilever','garden',12],['samba-hall',5,15,'ell','barrel',5],
    ['copacabana-twin',12,38,'twin','solar',12],['art-deco-cinema',8,24,'ziggurat','crown',5],
    ['hillside-gate',6,20,'gate','garden',13],['carioca-drum',8,26,'drum','mast',12]
  ]
};
for(const [city,list] of Object.entries(additions))streets[city].push(...list);
const modernStreets=[
  ['glass-office',12,103,'plain','plant',19],['beveled-workplace',12,103,'chamfer','plant',19],
  ['setback-commercial',12,103,'setback','terrace',19],['civic-office',12,103,'wing','plant',21],
  ['terraced-residence',12,103,'stack','terrace',19],['shaded-business-center',12,103,'bay','plant',21],
  ['open-court-office',12,103,'court','parapet',19],['slim-louvered-office',12,103,'setback','plant',21],
  ['twin-core-office',12,103,'twin','helipad',19],['podium-tower',12,103,'podium','mast',19],
  ['stepped-ziggurat-hq',12,103,'ziggurat','garden',21],['cylinder-office',12,103,'drum','mast',19],
  ['cantilever-studio',12,103,'cantilever','solar',21],['finned-lab',12,103,'fins','solar',21],
  ['gateway-office',12,103,'gate','helipad',19],['clustered-campus',12,103,'cluster','garden',19],
  ['corner-turret-bank',12,103,'turret','crown',21],['l-wing-institute',12,103,'ell','solar',19],
  ['sky-garden-tower',12,103,'podium','garden',21],['media-tower',12,103,'cluster','billboard',19]
];
export const streetStyleCount=Object.values(streets).reduce((n,list)=>n+list.length,0)+modernStreets.length;
export const addedStreetStyles=Object.values(additions).reduce((n,list)=>n+list.length,0)+12;
export function streetStyle(id,h,x,z,modern=false){
  const hash=(Math.imul(Math.round(x*100),1597334677)^Math.imul(Math.round(z*100),3812015801))>>>0;
  const catalog=modern?modernStreets:streets[id],choices=catalog.filter(([,min,max])=>min<=h&&h<=max);
  const [name,,,mass,roof,material]=(choices.length?choices:catalog)[hash%(choices.length||catalog.length)];
  return {name,mass,roof,material,variation:(hash%127)/127};
}

// Twenty further towers use the ten newer forms, twice each, to thicken the skylines.
// A lot that cannot be fitted is left out instead of stopping the build.
export const denseTowerPlans={
  tokyo:[
    [150,-110,300,32,28,'helix'],[-150,55,262,31,27,'pagoda-tower'],[175,120,220,29,25,'bundle'],
    [-140,-95,190,28,24,'lens'],[20,200,170,27,24,'crystal']
  ],
  newyork:[
    [165,-55,336,33,29,'campanile'],[-155,95,292,32,28,'bundle'],[70,60,250,30,26,'monolith'],
    [-30,70,214,29,25,'helix'],[150,130,178,28,24,'tripod']
  ],
  paris:[[120,150,170,29,25,'lens'],[230,10,140,27,23,'crystal']],
  cairo:[[205,95,214,33,28,'campanile'],[95,-60,164,28,24,'lighthouse'],[215,-20,150,29,24,'cascade']],
  sydney:[[-20,130,236,31,27,'lighthouse'],[140,40,200,29,25,'tripod'],[40,170,160,28,24,'pagoda-tower']],
  rio:[[-100,60,130,27,23,'cascade'],[-15,-60,104,25,22,'monolith']]
};

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
