import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cropSegments, CROP_FIRE } from './crops.js';

// Dense instanced stalks retain individual footprints without thousands of draw calls.
export class CropView {
  constructor(view) {
    this.view = view; this.parts = new Map(); this.dummy = new THREE.Object3D();
    this.beds = new Map();
    for (const field of view.map.crops || []) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(field.w, field.d), material);
      // Transparent ground must render before airborne effects, regardless of field center distance.
      mesh.renderOrder = -2;
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(field.x, .032, field.z); mesh.receiveShadow = true; view.scene.add(mesh);
      this.beds.set(field.id, { field, canvas, texture, signature: null });
    }
    this.updateBeds([]);
    const pieces = [new THREE.CylinderGeometry(.018, .029, 1.45, 4).translate(0, .725, 0), new THREE.ConeGeometry(.085, .38, 4).translate(0, 1.53, 0)];
    for (const side of [-1, 1]) {
      pieces.push(new THREE.ConeGeometry(.14, .8, 3).rotateZ(side * .95).translate(side * .2, .85, 0));
      pieces.push(new THREE.ConeGeometry(.1, .6, 3).rotateX(side * .9).translate(0, .5, side * .15));
    }
    const geometry = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
    for (const s of cropSegments(view.map)) {
      const stalks = [];
      for (let x = -s.w / 2 + .16; x < s.w / 2; x += .39) for (let z = -s.d / 2 + .16; z < s.d / 2; z += .43) {
        const seed = Math.sin((x + s.x) * 47 + (z + s.z) * 13);
        // Continuous world-space waviness avoids ruler-straight section boundaries.
        const wx=x+s.x,wz=z+s.z;
        stalks.push({ x: x + seed * .15 + Math.sin(wz*1.55)*.34 + Math.sin(wz*.63)*.18, z: z + Math.cos(seed * 19) * .14 + Math.sin(wx*1.37)*.32 + Math.cos(wx*.71)*.17, scale: .84 + (seed + 1) * .15, edgeScale:1, yaw: seed * 3, bend: 0, dirX: 0, dirZ: 0 });
      }
      const material = new THREE.MeshStandardMaterial({ color: '#a59e68', roughness: 1 });
      const mesh = new THREE.InstancedMesh(geometry, material, stalks.length);
      mesh.position.set(s.x, 0, s.z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      view.scene.add(mesh);
      const part = { mesh, stalks, shape: s }; this.parts.set(s.id, part); this.writeStalks(part);
    }
    this.flames = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: .88, depthWrite: false, blending: THREE.AdditiveBlending }), 672);
    this.smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#5b5348', transparent: true, opacity: .4, depthWrite: false }), 448);
    for (const mesh of [this.flames, this.smoke]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; view.scene.add(mesh); }
  }
  writeStalks(part) {
    const o = this.dummy;
    for (const [i, s] of part.stalks.entries()) {
      o.position.set(s.x, 0, s.z); o.rotation.set(s.dirZ * s.bend, s.yaw, -s.dirX * s.bend); o.scale.setScalar(s.scale*s.edgeScale); o.updateMatrix(); part.mesh.setMatrixAt(i, o.matrix);
    }
    part.mesh.instanceMatrix.needsUpdate = true;
    // Bounds include leaned stalks so culling cannot remove a trampled edge.
    part.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(part.shape.w, part.shape.d) / 2 + 2);
  }
  update(sim, dt) {
    const topology=sim.crops.map(s=>s.state==='gone'?'0':'1').join('');
    if(topology!==this.topology){
      this.topology=topology;
      const gone=sim.crops.filter(s=>s.state==='gone');
      for(const part of this.parts.values()){
        const neighbors=gone.filter(s=>Math.abs(s.x-part.shape.x)<(s.w+part.shape.w)/2+1.5&&Math.abs(s.z-part.shape.z)<(s.d+part.shape.d)/2+1.5);
        for(const stalk of part.stalks){
          const x=part.shape.x+stalk.x,z=part.shape.z+stalk.z;
          let distance=1;
          for(const s of neighbors)distance=Math.min(distance,Math.hypot(Math.max(0,Math.abs(x-s.x)-s.w/2),Math.max(0,Math.abs(z-s.z)-s.d/2)));
          const t=Math.min(1,distance/.65);
          stalk.edgeScale=.35+.65*t*t*(3-2*t);
        }
        this.writeStalks(part);
      }
    }
    // Scorch evolves slowly; avoid rebuilding/uploading a canvas every render frame.
    if(this.nextBedUpdate===undefined || sim.time>=this.nextBedUpdate){this.updateBeds(sim.crops);this.nextBedUpdate=sim.time+.125;}
    let flameCount = 0, smokeCount = 0;
    const o = this.dummy, color = new THREE.Color();
    for (const [index, s] of sim.crops.entries()) {
      const part = this.parts.get(s.id); if (!part) continue;
      part.mesh.visible = s.state !== 'gone';
      if (s.state === 'gone') continue;
      part.mesh.material.color.set('#a59e68').lerp(color.set('#30281d'), s.state === 'burning' ? Math.min(1, s.burnAge / (CROP_FIRE.duration * .87)) : 0);
      const near = Math.abs(sim.player.x - s.x) < s.w / 2 + 1 && Math.abs(sim.player.z - s.z) < s.d / 2 + 1;
      if (near && dt > 0) {
        let changed = false;
        for (const stalk of part.stalks) {
          const dx = s.x + stalk.x - sim.player.x, dz = s.z + stalk.z - sim.player.z;
          if (Math.hypot(dx, dz) > .85) continue;
          const length = Math.hypot(sim.player.vx, sim.player.vz);
          if (length < .2) continue;
          stalk.bend = Math.min(.65, stalk.bend + dt * 3); stalk.dirX = sim.player.vx / length; stalk.dirZ = sim.player.vz / length; changed = true;
        }
        if (changed) this.writeStalks(part);
      }
      if (s.state !== 'burning' || Math.hypot(s.x - sim.player.x, s.z - sim.player.z) > 45) continue;
      const count = this.view.qualityName === 'quality' ? 12 : this.view.qualityName === 'potato' ? 2 : this.view.qualityName === 'performance' ? 5 : 8;
      const fade = Math.min(1, s.burnAge * 6) * Math.min(1, (CROP_FIRE.duration - s.burnAge) * 3);
      for (let i = 0; i < count; i++) {
        const seed = index * 71 + i * 13, phase = (sim.time * 1.9 + i * .37) % 1;
        const x = s.x + Math.sin(seed) * s.w * .43, z = s.z + Math.cos(seed * 2) * s.d * .43;
        o.position.set(x + Math.sin(sim.time * 15 + seed) * .12, .3 + phase * 1.1, z);
        o.rotation.set(.1 * Math.sin(seed), seed, .18 * Math.sin(sim.time * 12 + seed));
        o.scale.set((.25 + .16 * Math.sin(seed) ** 2) * fade, (1.3 + Math.sin(sim.time * 19 + seed) * .4) * fade, .3 * fade); o.updateMatrix();
        this.flames.setMatrixAt(flameCount, o.matrix); this.flames.setColorAt(flameCount++, color.set(i % 3 ? '#ff9b28' : '#fff0a2'));
        if (i % 2 === 0) {
          o.position.set(x + phase * .8, 1.3 + phase * 2.5, z + phase * .3); o.rotation.set(seed, phase, 0); o.scale.setScalar((.25 + phase * .65) * fade); o.updateMatrix(); this.smoke.setMatrixAt(smokeCount++, o.matrix);
        }
      }
    }
    this.flames.count = flameCount; this.smoke.count = smokeCount;
    this.flames.instanceMatrix.needsUpdate = this.smoke.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
  }
  updateBeds(crops) {
    for (const bed of this.beds.values()) {
      const sections = crops.filter(s => s.fieldId === bed.field.id);
      const signature = sections.map(s => s.state+Math.round((s.scorch || 0) * 24)).join(',');
      if (signature === bed.signature) continue;
      bed.signature = signature;
      const ctx = bed.canvas.getContext('2d'), f = bed.field, size = bed.canvas.width;
      ctx.clearRect(0,0,size,size);
      if(!bed.base){
      ctx.fillStyle = '#7c7951'; ctx.fillRect(0, 0, size, size);
      // A continuous mat of fallen leaves hides exposed brown soil between stalks.
      for(let i=0;i<4200;i++) {
        const x=(Math.sin(i*43)*.5+.5)*size,y=(Math.sin(i*19+2)*.5+.5)*size;
        ctx.strokeStyle=i%3===0?'#aaa36c':i%3===1?'#918c5d':'#6e7049';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(i*7)*5,y+Math.cos(i*11)*6);ctx.stroke();
      }
      bed.base=document.createElement('canvas');bed.base.width=bed.base.height=size;
      bed.base.getContext('2d').drawImage(bed.canvas,0,0);
      }
      ctx.drawImage(bed.base,0,0);
      const clearedKey=sections.map(s=>s.state==='gone'?'1':'0').join('');
      if(clearedKey!==bed.clearedKey){
        bed.clearedKey=clearedKey;
        bed.cleared ||= document.createElement('canvas');bed.cleared.width=bed.cleared.height=size;
        bed.clearMask ||= document.createElement('canvas');bed.clearMask.width=bed.clearMask.height=size;
        const mask=bed.clearMask.getContext('2d');mask.fillStyle='white';
        // Union all cells before feathering, so no internal tile seams survive.
        for(const s of sections)if(s.state==='gone')mask.fillRect((s.x-s.w/2-f.x+f.w/2)/f.w*size-1,(s.z-s.d/2-f.z+f.d/2)/f.d*size-1,s.w/f.w*size+2,s.d/f.d*size+2);
        const cleared=bed.cleared.getContext('2d');cleared.filter='blur(7px)';cleared.drawImage(bed.clearMask,0,0);cleared.filter='none';
        cleared.globalCompositeOperation='source-in';cleared.fillStyle='#68543d';cleared.fillRect(0,0,size,size);cleared.globalCompositeOperation='source-over';
      }
      ctx.drawImage(bed.cleared,0,0);
      // One continuous bed texture: feather scorch fronts, with no tile outlines or gaps.
      for (const s of sections) if (s.scorch > 0) {
        const x = (s.x - s.w / 2 - f.x + f.w / 2) / f.w * size;
        const y = (s.z - s.d / 2 - f.z + f.d / 2) / f.d * size;
        const w=s.w/f.w*size,h=s.d/f.d*size;
        // Overlapping soft ash patches conceal the simulation's rectangular cells.
        for(let i=0;i<18;i++){
          const px=x+w*(.08+.84*((Math.sin(i*19+s.x)*437.1)%1+1)%1),py=y+h*(.08+.84*((Math.sin(i*31+s.z)*219.3)%1+1)%1);
          const r=Math.max(w,h)*(.28+(i%4)*.045);
          const gradient=ctx.createRadialGradient(px,py,0,px,py,r);
          gradient.addColorStop(0,`rgba(${i%3===0?'91,84,67':'43,39,31'},${s.scorch*.62})`);
          gradient.addColorStop(.5,`rgba(51,45,35,${s.scorch*.44})`);gradient.addColorStop(1,'rgba(51,45,35,0)');
          ctx.fillStyle=gradient;ctx.fillRect(px-r,py-r,r*2,r*2);
        }
      }
      ctx.strokeStyle = '#b69c6b18'; ctx.lineWidth = .7;
      for (let i = 0; i < 330; i++) {
        const x = (Math.sin(i * 43) * .5 + .5) * size, y = (Math.sin(i * 19 + 2) * .5 + .5) * size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1 + i % 5, y + (i % 3 - 1)); ctx.stroke();
      }
      // Irregular feathered perimeter blends the bed into surrounding soil.
      if(!bed.edge){
        bed.edge=document.createElement('canvas');bed.edge.width=bed.edge.height=size;
        const ec=bed.edge.getContext('2d'),pixels=ec.createImageData(size,size);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const distance=Math.min(x,y,size-1-x,size-1-y);
          const waviness=2+2*Math.sin(x*.13+y*.07)+1.5*Math.sin(y*.24-x*.09);
          const t=Math.max(0,Math.min(1,(distance-waviness)/12)),i=(y*size+x)*4;
          pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=255*t*t*(3-2*t);
        }
        ec.putImageData(pixels,0,0);
      }
      ctx.globalCompositeOperation='destination-in';ctx.drawImage(bed.edge,0,0);ctx.globalCompositeOperation='source-over';
      bed.texture.needsUpdate = true;
    }
  }
  reset() {
    this.topology=null;
    this.nextBedUpdate=undefined;
    this.updateBeds([]);
    for (const part of this.parts.values()) {
      for (const s of part.stalks) {s.bend = 0;s.edgeScale=1;}
      part.mesh.visible = true; part.mesh.material.color.set('#a59e68'); this.writeStalks(part);
    }
    this.flames.count = this.smoke.count = 0;
  }
}

