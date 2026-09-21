// Shared by movement, the overhead map and the visible world perimeter.
export function roundPlayableOutline(anchors,rounding=14){
 const outline=[];
 for(let i=0;i<anchors.length;i++){
  const a=anchors[(i+anchors.length-1)%anchors.length],b=anchors[i],c=anchors[(i+1)%anchors.length];
  const ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]);
  const trim=Math.min(rounding,ab*.35,bc*.35);
  const enter=b.map((v,j)=>v+(a[j]-v)*trim/ab),leave=b.map((v,j)=>v+(c[j]-v)*trim/bc);
  for(let step=0;step<=12;step++){
   const t=step/12,u=1-t;
   outline.push(b.map((v,j)=>u*u*enter[j]+2*u*t*v+t*t*leave[j]));
  }
 }
 return outline;
}
export function playableOutline(map){
 return map.playableArea||[[-map.width/2,-map.depth/2],[map.width/2,-map.depth/2],[map.width/2,map.depth/2],[-map.width/2,map.depth/2]];
}
export function isPlayable(map,x,z,radius=0){
 if(!map.playableArea)return Math.abs(x)<=map.width/2-radius&&Math.abs(z)<=map.depth/2-radius;
 const points=map.playableArea;let inside=false;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [ax,az]=points[j],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
  if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  if(radius>0){const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
   if((x-ax-dx*t)**2+(z-az-dz*t)**2<(radius-1e-8)**2)return false;}
 }
 return inside;
}
export function confinePlayableMovement(map,player,previousX,previousZ,radius){
 if(!map.playableArea||isPlayable(map,player.x,player.z,radius))return;
 const x=player.x,z=player.z;
 if(isPlayable(map,x,previousZ,radius)){player.z=previousZ;player.vz=0;}
 else if(isPlayable(map,previousX,z,radius)){player.x=previousX;player.vx=0;}
 else{player.x=previousX;player.z=previousZ;player.vx=player.vz=0;}
}
