// Small synthesized sounds: no downloads, sample assets, or audio before a gesture.
export class Soundscape {
  constructor() { this.context = null; this.enabled = true; this.lastStep = 0; this.lastHit = 0; this.flights = new Set(); }

  async start() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = this.enabled ? .6 : 0;
      const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 5;
      this.master.connect(limiter); limiter.connect(ctx.destination);
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
      noise.connect(filter); filter.connect(this.wind); this.wind.connect(this.master); noise.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = .11;
      const depth = ctx.createGain(); depth.gain.value = .03; lfo.connect(depth); depth.connect(this.wind.gain); lfo.start();
    }
    await this.context.resume();
  }

  setEnabled(enabled) { this.enabled = enabled; if (this.context) this.master.gain.setTargetAtTime(enabled ? .6 : 0, this.context.currentTime, .03); }
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
    tone.connect(gain);gain.connect(this.master);
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

  updateHex(sim) {
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

  tone(start, end, duration, volume, type = 'sine', delay = 0) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), gain = ctx.createGain(); osc.type = type;
    osc.frequency.setValueAtTime(start, now); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .006); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(gain); gain.connect(this.master); osc.start(now); osc.stop(now + duration + .02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  noise(duration, volume, frequency = 700) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime;
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = frequency;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(this.master); noise.start(now, Math.random()); noise.stop(now + duration);
    noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  impact(duration, volume, frequency) {
    if (!this.context || !this.enabled || this.context.state !== 'running') return;
    const ctx = this.context, now = ctx.currentTime;
    const source = ctx.createBufferSource(); source.buffer = this.impactBuffer;
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7;
    const gain = ctx.createGain(); gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .003); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(now, Math.random() * .5); source.stop(now + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  rifleShot() {
    if(!this.context||!this.enabled||this.context.state!=='running')return;
    const ctx=this.context,now=ctx.currentTime;
    const source=ctx.createBufferSource(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.impactBuffer;high.type='highpass';high.frequency.value=140;
    low.type='lowpass';low.Q.value=.45;low.frequency.setValueAtTime(5200,now);low.frequency.exponentialRampToValueAtTime(850,now+.075);
    // A fast pressure crack, then a short decaying report; no pitched oscillator.
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.20,now+.001);
    gain.gain.exponentialRampToValueAtTime(.055,now+.013);gain.gain.exponentialRampToValueAtTime(.0001,now+.105);
    source.connect(high);high.connect(low);low.connect(gain);gain.connect(this.master);
    source.start(now,Math.random()*.5);source.stop(now+.11);
    source.onended=()=>{source.disconnect();high.disconnect();low.disconnect();gain.disconnect();};
    this.impact(.07,.11,380);
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

  event(e) {
    if(e.type==='outgoingDamage'){
      const now=this.context?.currentTime??0;
      if(now-(this.lastDamageDing??-1)>.065){this.tone(1250,1190,.075,.032,'sine');this.tone(1875,1785,.055,.012,'sine',.012);this.lastDamageDing=now;}return;
    }
    if(e.type==='playerDamage'){this.healthLoss(e.damage);return;}
    if(e.type==='playerDeath'){this.death();return;}
    if(e.type==='grenadeExplosion'){this.event({...e,type:'explosion',count:12});return;}
    if(e.type==='grenadeWindup'){this.impact(.035,.05,1800);}
    if(e.type==='grenadeThrow'){this.noise(.10,.07,700);}
    if(e.type==='shotgunShot'){const c=e.charge||0;this.impact(.12+c*.07,.20+c*.10,1100);this.tone(105,34,.20+c*.14,.15+c*.09,'triangle');this.tone(66,28,.20+c*.12,.06+c*.045,'sine');this.impact(.035+c*.02,.07+c*.04,3200);return;}
    if(e.type==='shotgunReload'){this.impact(.07,.07,1500);this.tone(260,140,.06,.03,'triangle');return;}
    if(e.type==='shotgunReloaded'){this.impact(.04,.10,1900);return;}
    if(e.type==='shotgunStored'){this.tone(300,440,.07,.025,'sine');return;}
    if(e.type==='rifleShot'){
      this.rifleShot();
    }
    if(e.type==='rifleReload'){this.impact(.045,.08,1400);this.tone(320,170,.05,.035,'triangle');}
    if(e.type==='launch')this.startFlight(e);
    if(e.type==='trailEnd')for(const voice of this.flights)if(voice.ids.delete(e.id)&&!voice.ids.size)this.stopFlight(voice);
    if (e.type === 'sprayStart') { this.tone(130, 900, .18, .085, 'sawtooth'); this.impact(.045, .08, 2300); }
    if (e.type === 'sprayArc') {
      this.impact(.065, e.firing ? .21 : .055, 1900);
      this.tone(e.firing ? 850 : 420, 170, .07, e.firing ? .08 : .025, 'sawtooth');
    }
    if (e.type === 'dodge') { this.noise(.12, .13, 750); this.tone(130, 65, .09, .04, 'triangle'); }
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

  clatter(type) {
    const now = this.context?.currentTime ?? 0;
    if (now - (this.lastClatter || 0) < .055) return;
    this.lastClatter = now;
    this.impact(.03, type === 'plant' ? .013 : .035, 1100 + Math.random() * 800);
    if (type !== 'plant') this.tone(170 + Math.random() * 100, 75, .045, .028, 'triangle');
  }

  update(player, time) {
    if (Math.hypot(player.vx, player.vz) > 1.5 && time - this.lastStep > .23) {
      this.noise(.06, .16, 900); this.tone(95, 45, .05, .025, 'triangle'); this.lastStep = time;
    }
  }
}
