import * as THREE from 'three';
import { interiorPolygons } from './vision-polygons.js';

// Fragment-level concealment keeps long trails from revealing shots through gray zones.
export class InteriorVisibility {
  constructor() {
    this.materials = new WeakSet();
    this.entityMaterials = new WeakMap();
    this.entityDepth = new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
    this.entityDistance = new THREE.MeshDistanceMaterial();
    this.count = { value: 0 };
    this.points = { value: Array.from({ length: 40 }, () => new THREE.Vector2()) };
  }
  applyEntity(root) {
    // Entity meshes share masked copies, never the map's cached materials.
    root.traverse(o => {
      if(!o.material)return;
      const copy=m=>{
        if(!this.entityMaterials.has(m))this.entityMaterials.set(m,m.clone());
        return this.entityMaterials.get(m);
      };
      o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);
      if(o.isMesh && o.castShadow) {
        o.customDepthMaterial=this.entityDepth;
        o.customDistanceMaterial=this.entityDistance;
      }
    });
    this.apply(root);
  }
  update(sim) {
    if(this.lastRoom===sim.interior&&this.lastX===sim.player.x&&this.lastZ===sim.player.z)return;
    this.lastRoom=sim.interior;this.lastX=sim.player.x;this.lastZ=sim.player.z;
    const b = sim.interior; this.count.value = 0; // (an open shed too: renderer.js cameraRoom)
    if (!b) return;
    const polygons = interiorPolygons(b,sim.player).slice(0,10);
    this.count.value = polygons.length;
    polygons.flat().forEach((p,i) => this.points.value[i].set(p.x,p.z));
  }
  apply(root) {
    root?.traverse(o => {
      // The overwhelmingly common case is a single already-patched material, so
      // take it without building any array. This runs over every particle,
      // beam and effect group every frame — a couple of hundred throwaway
      // arrays a frame during an explosion, purely to then skip them all.
      const single = o.material;
      if (single && !Array.isArray(single) && this.materials.has(single)
        && !o.customDepthMaterial && !o.customDistanceMaterial) return;
      for (const m of [...(Array.isArray(single) ? single : [single]),o.customDepthMaterial,o.customDistanceMaterial]) {
        if (!m || this.materials.has(m) || m.isShaderMaterial) continue;
        this.materials.add(m);
        const before = m.onBeforeCompile, cache = m.customProgramCacheKey.bind(m);
        m.onBeforeCompile = shader => {
          before.call(m,shader);
          shader.uniforms.interiorCount = this.count; shader.uniforms.interiorPoints = this.points;
          shader.vertexShader = 'varying vec2 interiorWorld;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `vec4 interiorPosition = vec4(transformed,1.0);
            #ifdef USE_INSTANCING
            interiorPosition = instanceMatrix * interiorPosition;
            #endif
            interiorWorld = (modelMatrix * interiorPosition).xz;
            #include <project_vertex>`);
          shader.fragmentShader = `varying vec2 interiorWorld;
            uniform int interiorCount; uniform vec2 interiorPoints[40];
            bool interiorVisible() {
              if (interiorCount == 0) return true;
              for (int i=0;i<10;i++) {
                if(i>=interiorCount) break;
                bool positive=true; bool negative=true;
                for(int j=0;j<4;j++) {
                  vec2 a=interiorPoints[i*4+j], b=interiorPoints[i*4+(j+1)-((j+1)/4)*4];
                  vec2 edge=b-a, point=interiorWorld-a;
                  float crossValue=edge.x*point.y-edge.y*point.x;
                  positive=positive && crossValue>=-0.001; negative=negative && crossValue<=0.001;
                }
                if(positive || negative) return true;
              }
              return false;
            }\n` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('void main() {','void main() { if (!interiorVisible()) discard;');
        };
        const key = cache(); m.customProgramCacheKey = () => key + '|interior-conceal-v3'; m.needsUpdate = true;
      }
    });
  }
}
