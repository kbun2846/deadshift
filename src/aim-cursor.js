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
 // Static is a placement weapon, not a reflex one: orbs are set down and the
 // beam is turn-rate locked anyway. A little weight suits it, so it sits
 // between the rifle's hipfire and its sights rather than tracking loosely.
 static: { rate: 40, maxSpeed: 4800 },
});
export function advanceAimCursor(cursor,target,dt,aiming,weapon='rifle'){
 const dx=target.x-cursor.x,dy=target.y-cursor.y,distance=Math.hypot(dx,dy);
 if(distance<.01){cursor.x=target.x;cursor.y=target.y;return;}
 const {rate,maxSpeed}=aiming?AIM_CURSOR.focused:AIM_CURSOR[weapon]||AIM_CURSOR.hip;
 const travel=Math.min(distance*(1-Math.exp(-rate*dt)),maxSpeed*dt);
 cursor.x+=dx/distance*travel;cursor.y+=dy/distance*travel;
}
