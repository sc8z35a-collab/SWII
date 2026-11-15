// Procedural sound. Every sound is synthesized with Web Audio from noise and oscillators, so
// nothing is downloaded. The context starts on the first user gesture (browsers require one).
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

export function createAudio(){
  let ctx=null,master=null,noise=null,volume=.7,paused=false;
  let traffic,wind,hum,road,whoosh,rumble,engine,jet,rail,nextClack=0;

  function noiseBuffer(){
    const length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<length;i++)data[i]=Math.random()*2-1;
    return buffer;
  }
  // A looping noise source through a filter into its own gain, silent until update() raises it.
  function layer(type,frequency,q=.7){
    const source=ctx.createBufferSource();
    source.buffer=noise;source.loop=true;
    const filter=ctx.createBiquadFilter();
    filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
    const gain=ctx.createGain();gain.gain.value=0;
    source.connect(filter).connect(gain).connect(master);
    source.start(0,Math.random()*1.9);
    return {filter,gain};
  }
  function start(){
    if(ctx)return true;
    const Context=globalThis.AudioContext??globalThis.webkitAudioContext;
    if(!Context)return false;
    try{ctx=new Context();}catch{return false;}
    master=ctx.createGain();master.gain.value=volume*volume;
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-10;limiter.ratio.value=8;
    master.connect(limiter).connect(ctx.destination);
    noise=noiseBuffer();
    traffic=layer('lowpass',320);
    wind=layer('bandpass',700,.5);
    hum=layer('lowpass',140);
    road=layer('bandpass',420,.6);
    whoosh=layer('bandpass',900,2.2);
    rumble=layer('lowpass',85);
    jet=layer('bandpass',1500,.4);
    rail=layer('lowpass',260);
    // Engine: two detuned sawtooth oscillators through a lowpass that opens with the revs.
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=260;filter.Q.value=1.6;
    const gain=ctx.createGain();gain.gain.value=0;
    const oscillators=[0,7].map(detune=>{
      const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=40;o.detune.value=detune;
      o.connect(filter);o.start();return o;
    });
    filter.connect(gain).connect(master);
    engine={filter,gain,oscillators};
    return true;
  }
  const ease=(param,value,seconds=.18)=>param.setTargetAtTime(value,ctx.currentTime,seconds);

  // One-shot helpers.
  function burst({at=0,duration=.12,frequency=1800,q=.8,type='bandpass',gain=.2,sweep=null}){
    const t=ctx.currentTime+at;
    const source=ctx.createBufferSource();source.buffer=noise;
    const filter=ctx.createBiquadFilter();filter.type=type;filter.frequency.setValueAtTime(frequency,t);filter.Q.value=q;
    if(sweep)filter.frequency.exponentialRampToValueAtTime(sweep,t+duration);
    const amp=ctx.createGain();
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(gain,t+.004);
    amp.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t,Math.random()*1.5,duration+.05);
  }
  function tone({at=0,frequency=440,to=null,duration=.3,gain=.1,type='sine'}){
    const t=ctx.currentTime+at,o=ctx.createOscillator(),amp=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(frequency,t);
    if(to)o.frequency.exponentialRampToValueAtTime(to,t+duration);
    amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(gain,t+.006);
    amp.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(amp).connect(master);o.start(t);o.stop(t+duration+.05);
  }
  const live=()=>ctx&&!paused&&ctx.state==='running';

  return {
    // Call from a user gesture (click, key or touch) to create or resume the audio context.
    unlock(){
      if(!start())return;
      if(ctx.state==='suspended'&&!paused)void ctx.resume().catch(()=>{});
    },
    setVolume(value){
      volume=clamp(value,0,1);
      if(master)ease(master.gain,volume*volume,.05);
    },
    setPaused(value){
      if(paused===value)return;
      paused=value;
      if(!ctx)return;
      if(value)void ctx.suspend().catch(()=>{});else void ctx.resume().catch(()=>{});
    },
    // Continuous layers. state: active, underground, altitude above the ground, speed (m/s),
    // vehicle and throttle, missile (distance to the nearest one) and thrust (launch engines, 0-1).
    update(state){
      if(!live())return;
      const on=state.active?1:.55,outside=state.underground?0:1;
      const speed=state.speed??0,height=clamp((state.altitude??0)/120,0,1);
      ease(traffic.gain.gain,.05*on*outside*(1-height*.7));
      ease(wind.gain.gain,(.012+.03*height+clamp(speed/30,0,1)*.035)*outside*on);
      ease(wind.filter.frequency,500+speed*28+height*500,.6);
      ease(hum.gain.gain,state.underground?.07:0);
      const driving=state.vehicle&&state.active;
      ease(road.gain.gain,driving?clamp(speed/30,0,1)*.08:0);
      ease(road.filter.frequency,300+speed*16);
      const revs=38+Math.abs(speed)*3.1+Math.max(0,state.throttle??0)*14;
      for(const o of engine.oscillators)ease(o.frequency,revs,.12);
      ease(engine.filter.frequency,220+Math.abs(speed)*34+Math.max(0,state.throttle??0)*260,.12);
      ease(engine.gain.gain,driving?.035+Math.abs(state.throttle??0)*.03:0,.12);
      const missile=clamp(1-(state.missile??Infinity)/280,0,1);
      ease(whoosh.gain.gain,missile*missile*.3,.08);
      ease(whoosh.filter.frequency,600+missile*1300,.1);
      ease(rumble.gain.gain,clamp(state.thrust??0,0,1)*.45,.3);
      // An airliner taking off: a broad roar that rises with the engines and fades with distance.
      const roar=clamp(state.jet??0,0,1);
      ease(jet.gain.gain,roar*.3,.35);
      ease(jet.filter.frequency,900+roar*1100,.5);
      // Metro: the train's rumble, with the rail joints clicking past while it runs.
      const train=clamp(state.train??0,0,1);
      ease(rail.gain.gain,train*.32,.4);
      if(state.trainRunning&&ctx.currentTime>=nextClack){
        nextClack=ctx.currentTime+.42+Math.random()*.08;
        burst({frequency:420,q:1.2,duration:.09,gain:.07*train});
        burst({at:.11,frequency:380,q:1.2,duration:.08,gain:.06*train});
      }
    },
    // A footstep; strength is about 1 when walking and 1.6 when running.
    step(strength=1){
      if(!live())return;
      burst({frequency:1300+Math.random()*900,q:.9,duration:.07+.03*strength,gain:.05*strength});
      tone({frequency:85+Math.random()*20,to:50,duration:.06,gain:.05*strength});
    },
    pickup(){
      if(!live())return;
      tone({frequency:1046.5,duration:.35,gain:.09,type:'triangle'});
      tone({at:.08,frequency:1568,duration:.5,gain:.08,type:'triangle'});
      tone({at:.08,frequency:3136,duration:.3,gain:.015});
    },
    hit(){
      if(!live())return;
      tone({frequency:120,to:38,duration:.5,gain:.35});
      burst({type:'lowpass',frequency:1400,sweep:120,duration:.45,gain:.4});
    },
    // An explosion heard from a distance in meters: later, quieter and duller further away.
    blast(distance){
      if(!live()||!(distance<900))return;
      const at=distance/343,level=clamp(28/(distance+14),.03,1);
      burst({at,type:'lowpass',frequency:clamp(5200-distance*5,500,5200),sweep:90,duration:1.6,gain:.55*level,q:.5});
      tone({at,frequency:58,to:32,duration:1.1,gain:.5*level});
    },
    // A short mechanical click, for doors and buttons.
    click(){
      if(!live())return;
      burst({frequency:2600,q:3,duration:.04,gain:.06});
      tone({frequency:180,to:90,duration:.08,gain:.05});
    },
    get started(){return ctx!==null;}
  };
}
