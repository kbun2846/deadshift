import { OMEN } from '../config/gameplay.js';

// The HUD and cursor read the very same clocks, with the game's standard
// ready / charging / active / cooldown colours and filling progress rings.
export function omenReadouts(s){
 const mark=s.marks.find(m=>m.kind==='e'&&m.left>1e-8),prime=s.primed&&s.primeLeft>0;
 const primary=mark?{remaining:mark.left,duration:OMEN.curseDuration,binding:'E',state:'active',label:'Press E again to rupture before the curse expires',live:true}
  :prime?{remaining:s.primeLeft,duration:OMEN.primeWindow,binding:'E',state:'charging',label:'Fire before the primed round expires',live:true}
  :{remaining:s.primeCooldown,duration:OMEN.primeCooldown,binding:'E',state:s.primeCooldown>1e-8?'cooldown':'ready',label:'Prime curse',live:false};
 const live=s.volleyLeft>1e-8;
 const secondary={remaining:live?s.volleyLeft:s.volleyCooldown,duration:live?OMEN.volleyDuration:OMEN.volleyCooldown,binding:'X',state:live?'active':s.volleyCooldown>1e-8?'cooldown':'ready',label:live?'Press X to rupture covenant':'Covenant volley',live};
 // Signal the actual damage-bonus window, never an unfired prime or a volley
 // that missed. All three presentations use this same landed-curse check.
 primary.optimal=!!mark&&mark.left<=OMEN.lateWindow;
 secondary.optimal=live&&s.volleyLeft<=OMEN.lateWindow&&s.marks.some(m=>m.kind==='x'&&m.left>1e-8&&m.left<=OMEN.lateWindow);
 if(primary.optimal)primary.label='Strong rupture window — press E again before zero';
 if(secondary.optimal)secondary.label='Strong covenant rupture window — press X again before zero';
 primary.text=primary.live?primary.remaining.toFixed(1):primary.state==='ready'?'CURSE':undefined;
 secondary.text=live?secondary.remaining.toFixed(1):secondary.state==='ready'?'COVENANT':undefined;
 return {primary,secondary};
}
