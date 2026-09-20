// Visual budgets only: accuracy, damage, projectile speed and debris lifetime
// are identical on every graphics preset.
export const RIFLE_QUALITY=Object.freeze({
 potato:{detail:0,radialSegments:4,sparks:0,smoke:0,impact:0,trail:false,flashCore:false},
 performance:{detail:1,radialSegments:5,sparks:1,smoke:0,impact:1,trail:true,flashCore:false},
 balanced:{detail:2,radialSegments:6,sparks:5,smoke:2,impact:3,trail:true,flashCore:true},
 quality:{detail:3,radialSegments:8,sparks:9,smoke:5,impact:6,trail:true,flashCore:true},
});
export const CASING_LIFETIME=30;
export const CASING_CAPACITY=192; // More than 30 seconds of uninterrupted fire.
export function casingPose(casing,time){
 const age=Math.max(0,time-casing.born),flight=(casing.vy+Math.sqrt(casing.vy*casing.vy+19.6*(casing.y-.022)))/9.8;
 const t=Math.min(age,flight),landed=age>=flight;
 return {x:casing.x+casing.vx*t,z:casing.z+casing.vz*t,y:landed?.022:casing.y+casing.vy*t-4.9*t*t,
  rx:landed?Math.PI/2:casing.rx+t*casing.spinX,ry:landed?0:casing.ry,rz:landed?casing.landingAngle:casing.rz+t*casing.spinZ,
  expired:age>=CASING_LIFETIME-1e-8};
}
