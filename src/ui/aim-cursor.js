// Smooth the rendered aim point itself; gameplay and spread use this same point.
// Two constants shape the feel. The rate sets how fast the last few pixels are
// closed, but the cap is what a mid-length move actually runs into: past about
// rate/cap pixels the exponential term is larger than the cap, so the whole
// sweep is spent travelling at the ceiling. Hipfire therefore reads as heavy
// when the cap is low, however quick the rate is. Focused aim keeps its weight
// deliberately — the inertia is the cost of looking down the sights.
export const AIM_CURSOR = Object.freeze({
 focused: { rate: 12, maxSpeed: 800 },
 hip: { rate: 44, maxSpeed: 5400 },
 sightline: { rate: 28, maxSpeed: 3400 },
 // Static is a placement weapon, not a reflex one: orbs are set down and the
 // beam is turn-rate locked anyway. A little weight suits it, so it sits
 // between the rifle's hipfire and its sights rather than tracking loosely.
 // (v0.9b: quicker, so the cursor never seems to drift on its own.)
 static: { rate: 43, maxSpeed: 5300 },
});
export function advanceAimCursor(cursor,target,dt,aiming,weapon='rifle',sniper=true){
 const dx=target.x-cursor.x,dy=target.y-cursor.y,distance=Math.hypot(dx,dy);
 if(distance<.01){cursor.x=target.x;cursor.y=target.y;return;}
 // A scoped Sightline has a light hand weight, separate from its slow camera.
 const profile=weapon==='sightline'?(aiming&&sniper?AIM_CURSOR.sightline:AIM_CURSOR.hip):aiming?AIM_CURSOR.focused:AIM_CURSOR[weapon]||AIM_CURSOR.hip;
 const {rate,maxSpeed}=profile;
 const travel=Math.min(distance*(1-Math.exp(-rate*dt)),maxSpeed*dt);
 cursor.x+=dx/distance*travel;cursor.y+=dy/distance*travel;
}
