export const airport={
  x:950,z:2100,elevation:16,west:292,east:1608,north:1940,south:2156,
  terminal:[930,1967],entrance:[930,1943],runway:[950,2100],watch:[795,1998],name:'ATLANTIS国際空港'
};
export const airportZone=(x,z,margin=0)=>x>=airport.west-margin&&x<=airport.east+margin&&
  z>=airport.north-margin&&z<=airport.south+margin;

export const roadTunnelPlans=[
  {id:'hill-tunnel',name:'東京丘陵トンネル',city:'tokyo',start:[-414,1399],end:[260,1399],ramp:128,depth:-12,half:5.55},
  {id:'river-tunnel',name:'セーヌ川水底トンネル',city:'paris',start:[-2575,-1520],end:[-2575,-1045],ramp:139,depth:-16,half:5.55}
];

export const metroStops=[
  {id:'tokyo',city:'tokyo',name:'東京中央',x:-90,z:1317},
  {id:'airport',city:'tokyo',name:'国際空港',x:966,z:1943},
  {id:'sydney',city:'sydney',name:'シドニー港',x:2308,z:1270},
  {id:'cairo',city:'cairo',name:'カイロ中央',x:2300,z:-1061},
  {id:'newyork',city:'newyork',name:'ニューヨーク中央',x:25,z:-1323},
  {id:'paris',city:'paris',name:'パリ中央',x:-2358,z:-1168},
  {id:'rio',city:'rio',name:'リオ海岸',x:-2392,z:1172}
];
