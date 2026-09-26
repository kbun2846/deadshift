import { SURGE } from './config/gameplay.js';
import { hasBreakSound, playBreakSound } from './effects/breakable-sounds.js'; // s2-breakables
import { graveThud } from './world/graveyard.js'; // s2-graveyard
// Small synthesized sounds: no downloads, sample assets, or audio before a gesture.
// How far sound carries. Full volume out to `near` metres (about half the
// screen), then it fades, down to `far` of it at 3x that distance (barely
// there); quieter than `silent` is not played at all.
export const HEARING = Object.freeze({ near: 11, far: .05, silent: .012 });
export function hearingLevel(distance) {
  if (!(distance > HEARING.near)) return 1;
  const k = Math.log(1 / HEARING.far) / (2 * HEARING.near);
  return Math.exp(-k * (distance - HEARING.near));
}

export class Soundscape {
  constructor() {
    this.context = null; this.enabled = true; this.lastStep = 0; this.lastHit = 0; this.flights = new Set();
    // Mixer levels survive until audio actually starts, which cannot happen
    // before a gesture; they are applied to the graph the moment it exists.
    this.volume = { master: .6, ambient: .8, weapons: 1, effects: 1 };
    // Which bus an untagged sound lands on. Set for the span of one event so
    // individual emitters do not each need to name their channel.
    this.currentBus = 'effects';
  }

  // Gain node for a channel, or the master while the graph is still being built.
  // During a far-off event (event(e, level < 1)) everything goes through that
  // event's own quieter gain first.
  busFor(name) { const bus = this.buses?.[name ?? this.currentBus] ?? this.master; if (!this.distanceGain) return bus; this.distanceGain.connect(bus); return this.distanceGain; }

  setVolumes(mix = {}) {
    for (const channel of ['master', 'ambient', 'weapons', 'effects']) {
      const level = Number(mix[channel]);
      if (Number.isFinite(level)) this.volume[channel] = Math.min(1, Math.max(0, level));
    }
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? this.volume.master : 0, now, .03);
    for (const channel of ['ambient', 'weapons', 'effects'])
      this.buses[channel].gain.setTargetAtTime(this.volume[channel], now, .03);
  }

  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? this.volume.master : 0;
      const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 5;
      this.master.connect(limiter); limiter.connect(ctx.destination);
      // One bus per channel between the sources and the master, so a slider is
      // a single gain change rather than a rule every emitter has to remember.
      this.buses = {};
      for (const channel of ['ambient', 'weapons', 'effects']) {
        const bus = ctx.createGain(); bus.gain.value = this.volume[channel];
        bus.connect(this.master); this.buses[channel] = bus;
      }
      this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + Math.random() * .04 - .02) / 1.02; data[i] = last * 3.5; }
      this.impactBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const impact = this.impactBuffer.getChannelData(0);
      for (let i = 0; i < impact.length; i++) impact[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuffer; noise.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 550;
      this.wind = ctx.createGain(); this.wind.gain.value = .09;
      noise.connect(filter); filter.connect(this.wind); this.wind.connect(this.buses.ambient); noise.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = .11;
      const depth = ctx.createGain(); depth.gain.value = .03; lfo.connect(depth); depth.connect(this.wind.gain); lfo.start();
    }
    await this.context.resume();
  }

  setEnabled(enabled) { this.enabled = enabled; if (this.context) this.master.gain.setTargetAtTime(enabled ? this.volume.master : 0, this.context.currentTime, .03); }
  suspend(paused) { if (!this.context) return; if (paused) void this.context.suspend(); else void this.context.resume(); }

  startFlight(e) {
    if(!this.context || !this.enabled || this.context.state!=='running' || !e.paths?.length)return;
    const ctx=this.context,now=ctx.currentTime,duration=Math.max(.18,e.duration||.4);
    // One layered voice per volley keeps twelve orbs full without twelve loud loops.
    const tone=ctx.createOscillator(),gain=ctx.createGain();
    const hiss=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),hissGain=ctx.createGain();
    // A smooth, restrained rising sweep; no pitch wobble or brassy harmonics.
    tone.type='sine';tone.frequency.setValueAtTime(170,now);
    tone.frequency.exponentialRampToValueAtTime(850,now+duration);
    gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.028+Math.sqrt(e.paths.length/12)*.023,now+.018);
    tone.connect(gain);gain.connect(this.busFor('weapons'));
    hiss.buffer=this.impactBuffer;hiss.loop=true;filter.type='bandpass';filter.Q.value=.75;
    filter.frequency.setValueAtTime(1700,now);filter.frequency.exponentialRampToValueAtTime(3800,now+duration);
    hissGain.gain.setValueAtTime(.045,now);
    // Brief irregular noise accents add a little crackle underneath the clean sweep.
    for(let t=.035;t<duration-.02;t+=.045+Math.random()*.075){
      hissGain.gain.setValueAtTime(.045,t+now);
      hissGain.gain.linearRampToValueAtTime(.14+Math.random()*.06,t+now+.002);
      hissGain.gain.exponentialRampToValueAtTime(.045,t+now+.012);
    }
    hiss.connect(filter);filter.connect(hissGain);hissGain.connect(gain);
    const voice={ids:new Set(e.paths.map(p=>p.id)),gain,sources:[tone,hiss],nodes:[tone,gain,hiss,filter,hissGain],stopped:false};
    this.flights.add(voice);
    tone.onended=()=>{voice.nodes.forEach(n=>n.disconnect());this.flights.delete(voice);};
    for(const source of voice.sources){source.start(now);source.stop(now+duration+.12);}
  }

  stopFlight(voice) {
    if(voice.stopped)return;voice.stopped=true;
    const now=this.context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);voice.gain.gain.linearRampToValueAtTime(.0001,now+.025);
    voice.sources.forEach(s=>s.stop(now+.03));
  }

  clearFlights() { for(const voice of this.flights)this.stopFlight(voice); this.hexAudioStage=null;this.hexReturnUntil=0;this.hexAudioNext=0; }

  // The hex state machine runs outside event dispatch, so it names its channel.
  updateHex(sim) {
    this.currentBus = 'weapons';
    try { return this.hexVoice(sim); } finally { this.currentBus = 'effects'; }
  }

  hexVoice(sim) {
    const time=sim.time;
    if(this.hexAudioStage==='spin'&&!sim.hexSpin)this.hexReturnUntil=time+.6;
    const stage=sim.hexSpin?'spin':sim.hexOrbs.length?'charge':time<(this.hexReturnUntil||0)?'return':null;
    if(stage!==this.hexAudioStage)this.hexAudioNext=0;
    this.hexAudioStage=stage;
    if(!stage||!this.context||!this.enabled||this.context.state!=='running'||time<(this.hexAudioNext||0))return;
    this.hexAudioNext=time+(stage==='charge'?.13:.075);
    if(stage==='charge'){
      const age=sim.hexOrbs[0].age,pitch=150+Math.min(1,age/5)*260;
      this.tone(pitch,pitch*1.13,.17,.035,'sine');
      this.impact(.035,.035+Math.random()*.025,2400+Math.random()*1800);
    }else if(stage==='spin'){
      const phase=sim.hexSpin.age;
      this.tone(240+phase*280,380+phase*350,.12,.065,'triangle');
      this.impact(.055,.09,1700+Math.sin(phase*Math.PI*12)*500);
    }else{
      const progress=1-(this.hexReturnUntil-time)/.6;
      this.tone(420+progress*1000,620+progress*1200,.12,.055*(1-progress),'sine');
      this.impact(.06,.06*(1-progress),3200+progress*1600);
    }
  }

  tone(start, end, duration, volume, type = 'sine', delay = 0, bus) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = type;
    osc.frequency.setValueAtTime(start, now); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .006); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(gain); gain.connect(this.busFor(bus)); osc.start(now); osc.stop(now + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  noise(duration, volume, frequency = 700, bus) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime;
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = frequency;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(this.busFor(bus)); noise.start(now, Math.random()); noise.stop(now + duration);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  // `delay` comes last so the existing three- and four-argument calls are
  // untouched; tone() takes its delay earlier for the same reason.
  impact(duration, volume, frequency, bus, delay = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime + Math.max(0, delay);
    const source = ctx.createBufferSource(); source.buffer = this.impactBuffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .003); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.busFor(bus)); source.start(now, Math.random() * .5); source.stop(now + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  // `surge`: a Surge bullet is louder and heavier: a harder crack, a longer
  // lower report and a bright electric zing on top.
  rifleShot(surge = false) {
    if(!this.context||!this.enabled||this.context.state!=='running')return;
    const ctx=this.context,now=ctx.currentTime;
    const source=ctx.createBufferSource(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.impactBuffer;high.type='highpass';high.frequency.value=140;
    low.type='lowpass';low.Q.value=.45;low.frequency.setValueAtTime(5200,now);low.frequency.exponentialRampToValueAtTime(850,now+.075);
    // A fast pressure crack, then a short decaying report; no pitched oscillator.
    const peak=surge?.34:.20,tail=surge?.16:.105;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(peak,now+.001);
    gain.gain.exponentialRampToValueAtTime(surge?.1:.055,now+.013);gain.gain.exponentialRampToValueAtTime(.0001,now+tail);
    source.connect(high);high.connect(low);low.connect(gain);gain.connect(this.busFor('weapons'));
    source.start(now,Math.random()*.5);source.stop(now+tail+.01);
    source.onended=()=>{source.disconnect();high.disconnect();low.disconnect();gain.disconnect();};
    this.impact(surge?.12:.07,surge?.16:.11,surge?300:380);
    if(surge){this.tone(1800,520,.07,.045,'sawtooth');this.tone(90,45,.12,.07,'sine');}
  }

  healthLoss(damage) {
    if(!(damage>0))return;
    // A tight, urgent crack; small continuous damage ticks remain quiet.
    const weight=Math.min(1,Math.sqrt(damage/240));
    this.impact(.045,.11*weight,1450);
    this.tone(250-35*weight,105,.06,.055*weight,'triangle');
  }

  death() {
    // A dry snap followed by a short two-step low drop: decisive, without a long whoosh.
    this.impact(.055,.16,1650);
    this.impact(.12,.13,420);
    this.tone(145,68,.10,.115,'triangle');
    this.tone(68,32,.14,.12,'sine',.065);
    this.impact(.085,.045,2900);
  }

  // Sounds a weapon makes, as opposed to sounds the world makes.
  static WEAPON_EVENTS = new Set(['shotgunShot','shotgunReload','shotgunReloaded','scatterArm','scatterPrimed','scatterFire','scatterSplit','scatterBurst',
    'rifleShot','rifleReload','cock','grenadeWindup','grenadeThrow',
    'sprayStart','sprayArc','hexDeploy','hexPulse','hexZap','hexFizzle','seed','launch','surgeCharge','surgeStart','surgeEnd']);

  // `level`: how loud from where you are (hearingLevel), 1 close by.
  event(e, level = 1) {
    if (!(level > HEARING.silent)) return;
    this.currentBus = Soundscape.WEAPON_EVENTS.has(e.type) ? 'weapons' : 'effects';
    if (level < .999 && this.context) {
      const g = this.context.createGain(); g.gain.value = level; this.distanceGain = g;
      setTimeout(() => g.disconnect(), 15000); // long enough for a stream's voice
    }
    try { this.dispatch(e); } finally { this.currentBus = 'effects'; this.distanceGain = null; }
  }

  dispatch(e) {
    if(e.type==='outgoingDamage'){
      const now=this.context?.currentTime??0;
      if(now-(this.lastDamageDing??-1)>.065){this.tone(1250,1190,.075,.032,'sine');this.tone(1875,1785,.055,.012,'sine',.012);this.lastDamageDing=now;}return;
    }
    if(e.type==='playerDamage'){this.healthLoss(e.damage);return;}
    // Surge: a rising whine and rumble for the power-up, a bright boom as it
    // lands, a falling fizz when it ends.
    if(e.type==='surgeCharge'){this.tone(90,620,SURGE.charge,.06,'sawtooth');this.tone(180,1240,SURGE.charge,.025,'triangle');this.noise(SURGE.charge,.05,300);return;}
    if(e.type==='surgeStart'){this.impact(.35,.2,500);this.tone(820,1500,.25,.07,'triangle');this.tone(60,40,.5,.14,'sine');this.impact(.12,.1,3600);return;}
    if(e.type==='surgeEnd'){this.tone(900,200,.4,.05,'triangle');this.noise(.3,.05,2500);return;}
    if(e.type==='syphon'){this.tone(520,880,.18,.05,'sine');this.tone(780,1320,.18,.03,'sine',.06);return;}
    if(e.type==='playerDeath'){this.death();return;}
    if(e.type==='grenadeExplosion'){this.event({...e,type:'explosion',count:12});return;}
    if(e.type==='grenadeWindup'){this.impact(.035,.05,1800);}
    if(e.type==='grenadeThrow'){this.noise(.10,.07,700);}
    if(e.type==='shotgunShot'){const c=e.charge||0;this.impact(.12+c*.07,.20+c*.10,1100);this.tone(105,34,.20+c*.14,.15+c*.09,'triangle');this.tone(66,28,.20+c*.12,.06+c*.045,'sine');this.impact(.035+c*.02,.07+c*.04,3200);return;}
    if(e.type==='shotgunReload'){this.impact(.07,.07,1500);this.tone(260,140,.06,.03,'triangle');return;}
    if(e.type==='shotgunReloaded'){this.impact(.04,.10,1900);return;}
    // Scatter (Ballast X): a rising click readied, a deep red boom, a crack as
    // each big shell splits, a small pop for each little explosion.
    if(e.type==='scatterArm'){this.tone(220,520,.12,.04,'square');this.tone(440,660,.08,.02,'sine');return;}
    if(e.type==='scatterPrimed'){this.tone(330,880,.16,.05,'square');this.tone(660,990,.12,.03,'sine');return;}
    if(e.type==='scatterFire'){this.impact(.3,.28,900);this.tone(80,30,.4,.16,'triangle');this.tone(160,60,.25,.07,'sawtooth');return;}
    if(e.type==='scatterSplit'){this.impact(.05,.06,2600);return;}
    if(e.type==='scatterBurst'){const now=this.context?.currentTime??0;if(now-(this.lastBurst||-1)<.035)return;this.lastBurst=now;this.impact(.07+Math.random()*.03,.1,700+Math.random()*500);this.tone(120,50,.12,.035,'sine');return;}
    if(e.type==='rifleShot'){
      this.rifleShot(!!e.surge);
    }
    if(e.type==='rifleReload'){this.impact(.045,.08,1400);this.tone(320,170,.05,.035,'triangle');}
    if(e.type==='launch')this.startFlight(e);
    if(e.type==='trailEnd')for(const voice of this.flights)if(voice.ids.delete(e.id)&&!voice.ids.size)this.stopFlight(voice);
    if (e.type === 'sprayStart') { this.tone(130, 900, .18, .085, 'sawtooth'); this.impact(.045, .08, 2300); }
    if (e.type === 'sprayArc') {
      this.impact(.065, e.firing ? .21 : .055, 1900);
      this.tone(e.firing ? 850 : 420, 170, .07, e.firing ? .08 : .025, 'sawtooth');
    }
    if (e.type === 'dodge') this.dodgeWhoosh();
    if (e.type === 'hexZap') {
      const now = this.context?.currentTime ?? 0;
      if (now - (this.lastZap ?? -1) > .04) {
        this.tone(1700, 450, .045, .04, 'triangle'); this.noise(.025, .045, 2800); this.lastZap = now;
      }
    }
    if (e.type === 'hexDeploy') {
      this.tone(150, 620, .22, .11, 'sine'); this.tone(300, 1240, .18, .035, 'triangle'); this.noise(.06, .09, 3200);
      for(let i=0;i<6;i++)this.tone(650+i*110,1300+i*80,.06,.022,'sine',i*.018);
      this.impact(.09,.13,2100);
    }
    if (e.type === 'hexPulse') {
      this.tone(880, 95, .3, .12, 'sawtooth'); this.tone(120, 40, .25, .16, 'sine');
      for (let i = 0; i < 4; i++) this.tone(1500 + i * 230, 380, .035, .035, 'square', i * .035);
      this.noise(.2, .24, 2800);
    }
    if (e.type === 'hexFizzle') this.noise(.06, .025, 3800);
    if (e.type === 'cock') {
      this.noise(.035, .12, 1600);
      this.tone(480, 140, .035, .055, 'triangle');
      this.tone(760, 230, .025, .04, 'square', .065);
    }
    if (e.type === 'seed') { this.tone(420 + e.count * 22, 280 + e.count * 16, .08, .065, 'sine'); this.tone(1800, 900, .025, .02, 'triangle'); this.noise(.02, .045, 3400); }
    if (e.type === 'launch') { this.impact(.025,.055,1800); this.noise(.035,.055,2300); }
    if (e.type === 'hit' || e.type === 'propHit') {
      const now = this.context?.currentTime ?? 0;
      if (now - this.lastHit > .025) { this.tone(950, 370, .09, .09, 'triangle'); this.noise(.055, .35, 1200); this.lastHit = now; }
    }
    if (e.type === 'kill') {
      this.impact(.1, .13, 1100); this.tone(145, 70, .1, .06, 'triangle');
      // A soft consonant interval tucked under the wooden impact.
      this.tone(740, 735, .10, .040,'sine'); this.tone(1110, 1100, .15, .030, 'sine', .045);
      if(e.oneShot){this.tone(1480,1470,.17,.027,'sine',.075);this.tone(1850,1840,.20,.020,'sine',.115);this.impact(.035,.025,3500);}
    }
    if (e.type === 'wall' && e.launched) this.noise(.055, .15, 1500);
    if (e.type === 'propBreak') {
      const now = this.context?.currentTime ?? 0;
      if (now - (this.lastBreak ?? -1) < .028) return;
      this.lastBreak = now;
      if (hasBreakSound(e.propType)) { playBreakSound(this, e); return; } // s2-breakables: Hollow Wick's breakables
      if (graveThud(this, e)) return; // s2-graveyard
      if (e.propType === 'pot' || e.propType === 'pottedPlant') { this.pottery(e.dashed, e.propType === 'pottedPlant'); return; }
      if (e.dashed) { this.dashSmash(e.propType); return; }
      if (e.propType === 'brokenChair') {
        // Dry joinery giving way: a crack, then the sticks landing.
        this.impact(.05, .17, 2600); this.tone(340, 150, .06, .05, 'triangle');
        this.impact(.04, .09, 1500, 'effects', .04);
        for (let i = 0; i < 3; i++) this.impact(.03, .045, 900 + i * 400, 'effects', .07 + i * .05);
        if (e.dashed) { this.impact(.09, .24, 430); this.tone(104, 44, .2, .1, 'triangle'); }
        return;
      }
      if (e.propType === 'barrel') {
        this.impact(.095, .19, 1100); this.tone(125, 65, .15, .1, 'triangle');
        this.tone(520, 360, .13, .04); this.tone(760, 520, .09, .02, 'sine', .032);
      } else if (e.propType === 'cactus' || e.propType === 'hay') {
        this.impact(.09, .075, 1600); this.tone(140, 55, .08, .035, 'triangle');
      } else {
        this.impact(.065, .22, 1400); this.impact(.16, .07, 3400);
        this.tone(185, 95, .09, .075, 'triangle'); this.tone(430, 180, .05, .027, 'triangle', .035);
      }
    }
    if (e.type === 'cropIgnite' || e.type === 'cropDust') {
      const now = this.context?.currentTime ?? 0;
      if (now - (this.lastCrop ?? -1) > .12) {
        this.lastCrop = now; this.impact(.19, .07, e.type === 'cropDust' ? 1800 : 850); this.noise(.2, .06, 2400);
      }
    }
    if (e.type === 'explosion') {
      const power = e.count / 12;
      this.tone(145, 35, .2 + power * .18, .12 + power * .24, 'triangle');
      this.tone(72, 28, .28 + power * .16, .08 + power * .16);
      this.impact(.16 + power * .18, .2 + power * .32, 650);
      this.impact(.1 + power * .12, .1 + power * .18, 2200);
    }
  }

  // Pottery, which sounds like nothing else in the game: a hard ceramic ping
  // rather than a thud, then the shards. The ping is a pair of high, close
  // partials with almost no decay — clay is stiff and thin, so it rings and
  // stops. Every other break here is a filtered noise burst with a low body
  // under it, which is why they all read as wood or metal.
  pottery(dashed = false, planted = false) {
    const now = this.context?.currentTime ?? 0;
    if (now - (this.lastPot ?? -1) < .03) return;
    this.lastPot = now;
    // The break itself: two inharmonic partials, struck and gone.
    this.tone(2350, 1780, .045, .055, 'sine');
    this.tone(3120, 2460, .035, .032, 'sine', .004);
    this.tone(1480, 1180, .06, .04, 'triangle', .002);
    // The crack: a short, bright, dry burst, not a woody snap.
    this.impact(.035, .22, 3400);
    this.impact(.055, .12, 2100);
    // Just enough body that it sits on the floor rather than in the air.
    this.tone(196, 132, .09, .035, 'sine', .01);
    // The shards, scattering and settling. Randomised so two pots in a row
    // never land identically.
    for (let i = 0; i < 5; i++) {
      const delay = .05 + i * .042 + Math.random() * .03;
      this.impact(.022, .05 - i * .006, 2600 + Math.random() * 1700, 'effects', delay);
      if (i < 3) this.tone(1900 + Math.random() * 900, 1300, .03, .018, 'sine', delay);
    }
    // A planted pot spills dry soil and brittle stems with it.
    if (planted) { this.noise(.22, .07, 2400, 'effects'); this.impact(.07, .05, 1200, 'effects', .05); }
    // Walked through rather than shot: the body arrives first.
    if (dashed) { this.impact(.08, .2, 460); this.tone(98, 42, .17, .07, 'triangle'); this.noise(.24, .05, 760, 'effects'); }
  }

  // The dash reads as one stride's worth of effort rather than a separate
  // effect: the same filtered-noise scuff as a footfall and the same low
  // triangle under it, only longer, swept downward and given a scrape of grit
  // on the tail. Played over the footfalls it sits with them instead of
  // cutting across them.
  dodgeWhoosh() {
    this.noise(.2, .15, 620, 'effects');
    this.noise(.1, .07, 1500, 'effects');
    this.tone(150, 58, .17, .05, 'triangle');
    this.tone(88, 42, .13, .035, 'sine', .035);
    // The grit that gets kicked out behind the heel.
    this.noise(.13, .05, 2600, 'effects');
  }

  // Dashing through something: the body arriving first, then the thing coming
  // apart around it. A low thump lands before the debris, which is what makes
  // it read as the player doing the breaking rather than a shot landing.
  dashSmash(propType) {
    const plant = propType === 'cactus' || propType === 'hay';
    // Contact: the shoulder, not the projectile.
    this.impact(.09, .3, 420);
    this.tone(108, 46, .22, .13, 'triangle');
    this.tone(64, 32, .26, .07, 'sine', .01);
    if (plant) {
      this.impact(.14, .12, 1500, 'effects');
      this.noise(.16, .07, 2300, 'effects');
      this.tone(210, 80, .11, .04, 'triangle', .03);
    } else {
      // Staves letting go, then the pieces landing a beat later.
      this.impact(.1, .26, 1500);
      this.tone(230, 120, .08, .06, 'triangle', .02);
      this.tone(520, 300, .07, .03, 'triangle', .05);
      // The pieces landing, a beat behind the break. Written out rather than
      // routed through clatter(), which is rate-limited for debris showers and
      // would swallow these.
      for (let i = 0; i < 3; i++) {
        this.impact(.035, .05, 1300 + i * 520, 'effects', .09 + i * .055);
        this.tone(200 + i * 70, 90, .04, .022, 'triangle', .09 + i * .055);
      }
    }
    // The dust that comes up afterwards, under everything else.
    this.noise(.3, .06, 700, 'effects');
  }

  // Barely there: a breath of air, no pitch. A bird crossing overhead should be
  // noticed at the edge of hearing, never mixed as an event.
  wingbeat(species='finch'){
   const now=this.context?.currentTime??0;
   if(now-(this.lastWing||0)<.07)return;
   this.lastWing=now;
   const heavy=species==='vulture'||species==='crow';
   this.noise(heavy?.12:.07,heavy?.016:.0105,heavy?520:1050,'ambient');
   if(heavy)this.impact(.06,.006,190,'ambient');
  }
  clatter(type) {
    const now = this.context?.currentTime ?? 0;
    if (now - (this.lastClatter || 0) < .055) return;
    this.lastClatter = now;
    // A clay shard landing tings; a stave thuds. Same rate limit, different
    // material, so a pot breaking keeps sounding like pottery as it settles.
    if (type === 'clay') {
      this.impact(.018, .028, 3000 + Math.random() * 1600);
      this.tone(2100 + Math.random() * 800, 1500, .028, .016, 'sine');
      return;
    }
    this.impact(.03, type === 'plant' ? .013 : .035, 1100 + Math.random() * 800);
    if (type !== 'plant') this.tone(170 + Math.random() * 100, 75, .045, .028, 'triangle');
  }

  update(player, time) {
    if (Math.hypot(player.vx, player.vz) > 1.5 && time - this.lastStep > .23) {
      this.noise(.06, .16, 900); this.tone(95, 45, .05, .025, 'triangle'); this.lastStep = time;
    }
  }
}
