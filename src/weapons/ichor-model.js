import * as THREE from 'three';
import { compact } from '../effects/gore.js';
import { ICHOR_GUARD,ICHOR_BLOCK,ichorMotion } from './ichor-motion.js';
// Straight blackened steel, a single angled point, and a red inset in the dark wrap.
export function makeIchor(){
 const root=new THREE.Group();root.name='ichor-loadout';const blade=new THREE.Group();blade.name='ichor-blade';root.add(blade);
 const box=(x,y,z,w,h,d,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color,flatShading:true}));m.position.set(x,y,z);blade.add(m);return m;};
 box(0,0,.075,.09,.085,.36,'#201f24');box(0,0,-.13,.24,.045,.09,'#34353b');box(0,0,.27,.105,.095,.045,'#4b353d');
 box(0,.045,.085,.044,.009,.23,'#992b40');
 for(let i=0;i<7;i++){box(0,.053,-.04+i*.043,.096,.012,.013,'#363038').rotation.y=i%2?.22:-.22;}
 box(0,.045,-.075,.10,.015,.035,'#b63b4b');
 const shape=(points,color,y)=>{const outline=new THREE.Shape();points.forEach(([x,z],i)=>i?outline.lineTo(x,z):outline.moveTo(x,z));outline.closePath();const geo=new THREE.ExtrudeGeometry(outline,{depth:.032,bevelEnabled:false});geo.rotateX(Math.PI/2);const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color,flatShading:true}));mesh.position.y=y;blade.add(mesh);};
 shape([[-.058,-.16],[-.058,-1.63],[.074,-1.88],[.074,-.16]],'#34353d',.025);
 shape([[.048,-.16],[.048,-1.82],[.074,-1.88],[.074,-.16]],'#92908c',.032);
 box(-.037,.031,-.88,.012,.01,1.40,'#53515a');box(.012,.038,-.37,.02,.007,.36,'#742839');
 // Small faceted fittings and wear stay in the existing merged blade draw.
 box(0,0,-.115,.125,.11,.075,'#51444a');box(0,.062,-.115,.045,.01,.032,'#b24a55');
 for(const x of [-.095,.095]){box(x,.029,-.13,.032,.015,.055,'#797074');box(x,.040,-.13,.013,.009,.02,'#292a31');}
 for(let i=0;i<8;i++){const z=-.44-i*.14;box(-.015,.044,z,.022,.005,.045,i%2?'#3e3841':'#49414a').rotation.y=i%2?.45:-.45;}
 for(const x of [-.048,.048])box(x,.01,.10,.009,.07,.27,'#12151b');
 box(0,.05,.27,.036,.015,.035,'#af3148');
 compact(blade);
 // Blood is a surface coating in blade coordinates, not a scaled shell.
 // Both faces sit one millimetre above the steel and flip with the sharp edge.
 const positions=[],colors=[],shades=['#861421','#ae2531','#5a101b'].map(c=>new THREE.Color(c));
 for(let i=0;i<13;i++){const z=-.30-i*.104,w=.020+.015*(.5+.5*Math.sin(i*2.7)),x=.004+.010*Math.sin(i*1.9),c=shades[i%3];for(const y of [.026,-.008]){const points=[[x-w,y,z+.05],[x+w,y,z+.018],[x+w*.5,y,z-.075],[x-w*.6,y,z-.061]];for(const k of y>0?[0,1,2,0,2,3]:[2,1,0,3,2,0]){positions.push(...points[k]);colors.push(c.r,c.g,c.b);}}}
 const bloodGeo=new THREE.BufferGeometry();bloodGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bloodGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bloodGeo.computeVertexNormals();
 const channel=new THREE.Mesh(bloodGeo,new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,opacity:.94,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));channel.name='ichor-blood-channel';channel.visible=false;blade.add(channel);
 const tassel=new THREE.Group();tassel.name='ichor-tassel';tassel.position.set(0,0,.30);blade.add(tassel);
 for(const [x,z,len,color] of [[-.025,.09,.22,'#772435'],[.025,.12,.27,'#a53247']]){const m=new THREE.Mesh(new THREE.BoxGeometry(.026,.018,len),new THREE.MeshLambertMaterial({color,flatShading:true}));m.position.set(x,-.025,z);m.rotation.y=x*7;tassel.add(m);}compact(tassel);return root;
}
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function poseIchor(root,s,time){
 const pack=root.getObjectByName('ichor-loadout');if(!pack)return;
 const blade=pack.getObjectByName('ichor-blade'),active=s.swing>0,t=active?Math.max(0,Math.min(1,1-s.swing/(s.duration||.24))):1;
 let state=pack.userData.ichorMotion;
 if(!state||time<state.time)state=pack.userData.ichorMotion={time,serial:-1,value:[...ICHOR_GUARD],entry:[...ICHOR_GUARD]};
 const dt=Math.max(0,Math.min(.1,time-state.time));state.time=time;
 const guarding=!!s.guarding||s.guardFlash>0;
 if(guarding&&!state.guarding){state.guardAt=time;state.guardEntry=[...state.value];}state.guarding=guarding;
 if(active&&state.serial!==s.serial){state.serial=s.serial;state.entry=[...state.value];}
 const hasCut=active||s.serial>0,target=hasCut?ichorMotion(s.variant||0,active?t:1):[...ICHOR_GUARD];
 if(hasCut)target[5]+=(s.variant||0)%2===0?Math.PI:0;
 if(!active&&hasCut&&!guarding){target[1]*=.5;target[4]*=.55;target[6]=Math.atan2(Math.sin(target[6]),Math.cos(target[6]))*.45;target[7]*=.35;target[8]*=.35;target[9]*=.3;}
 if(guarding)target.splice(0,target.length,...ICHOR_BLOCK);
 if(s.guardFlash>0){const kick=Math.sin(s.guardFlash/.16*Math.PI);target[3]+=.16*kick;target[4]+=.09*kick;target[2]+=.045*kick;target[7]-=.055*kick;}
 if(s.moving){target[1]-=s.moving*.025;target[6]+=(s.moveSide||0)*s.moving*.055;target[7]-=(s.moveForward||0)*s.moving*.035;}
 if(guarding){const t=Math.max(0,Math.min(1,(time-state.guardAt)/.18)),q=t*t*(3-2*t);target[1]+=.055*Math.sin(t*Math.PI);state.value=target.map((n,i)=>{const from=state.guardEntry[i];return i===3||i===5||i===6?from+angle(from,n)*q:from+(n-from)*q;});}
 else if(active){const entry=Math.min(1,t*(s.duration||.24)/.032),q=entry*entry*(3-2*entry);state.value=target.map((n,i)=>{const start=state.entry[i];return i===3||i===5||i===6?start+angle(start,n)*q:start+(n-start)*q;});}
 else {const q=1-Math.exp(-dt*16);state.value=state.value.map((n,i)=>n+(i===3||i===5||i===6?angle(n,target[i]):target[i]-n)*q);}
 const [x,y,z,yaw,pitch,roll,bodySpin,lean,bank=0,dip=0]=state.value;
 blade.position.set(x,y,z);blade.rotation.set(pitch,yaw,roll,'YXZ');
 const channel=blade.getObjectByName('ichor-blood-channel'),blood=Math.max(0,Math.min(1,Math.max((s.blood||0)/100,channel.userData.wetLevel||0)));channel.visible=blood>.04;channel.geometry.setDrawRange(0,Math.ceil(blood*13)*12);channel.material.opacity=.55+blood*.39;
 const tassel=blade.getObjectByName('ichor-tassel');tassel.rotation.set(Math.sin(time*9)*.12+(active?.2:0),Math.sin(time*12)*.15-yaw*.2,-roll*.2);
 pack.userData.ichorPose={yaw,lift:y,thrust:.10-z,bodySpin,lean,bank,dip};return pack.userData.ichorPose;
}

export function applyIchorBody(body,pose){if(!pose)return;body.rotation.y=pose.bodySpin;body.rotation.x+=pose.lean;body.rotation.z+=pose.bank;body.position.y-=pose.dip;body.scale.y*=1-pose.dip*.45;}
