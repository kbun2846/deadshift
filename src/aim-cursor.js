// Smooth the rendered aim point itself; gameplay and spread use this same point.
export function advanceAimCursor(cursor,target,dt,aiming){
 const dx=target.x-cursor.x,dy=target.y-cursor.y,distance=Math.hypot(dx,dy);
 if(distance<.01){cursor.x=target.x;cursor.y=target.y;return;}
 const travel=Math.min(distance*(1-Math.exp(-(aiming?12:35)*dt)),(aiming?800:3600)*dt);
 cursor.x+=dx/distance*travel;cursor.y+=dy/distance*travel;
}
