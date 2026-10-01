import { buildingPoint } from '../maps.js';
import { BUILDING_FINISHES } from '../world/building-finishes.js';
import {playableOutline} from '../playable-area.js';
import { hillsOverheadMapSVG } from './overhead-hills.js'; // s3-look: maps with hills
import { cityOverheadMapSVG, OVERHEAD_CITY } from './overhead-city.js'; // Lumen stage 4: the night city
import { NO_ZONES, LIVE_LAYER_ID, overheadLiveLayer, overheadLiveSVG, overheadLiveKey } from './overhead-zones.js';

// Read the rendered road profile and current layout, never a hand-maintained image.
// `zones` (overhead-zones.js overheadZones): the storm or 1V1's duel circle,
// from the same state the world draws them from; every map draws them in its
// live layer (on top, with you).
export function overheadMapSVG(map, view, player, zones = NO_ZONES) {
  if (map.terrain) return hillsOverheadMapSVG(map, view, player, zones); // s3-look: Hollow Wick's own drawing
  if (map.city) return cityOverheadMapSVG(map, view, player, zones); // Lumen stage 4: a city map's own drawing
  const points=items=>items.map(p=>`${p.x},${p.z}`).join(' ');
  const perimeter=playableOutline(map).map(p=>p.join(',')).join(' ');
  const road=[...view.roadProfile.map(p=>({x:p.left,z:p.z})),...view.roadProfile.slice().reverse().map(p=>({x:p.right,z:p.z}))];
  const branches=[...(map.sideRoads||[])];
  if(view.farmRoadPoints)branches.push({points:view.farmRoadPoints});
  return `<svg viewBox="${-map.width/2} ${-map.depth/2} ${map.width} ${map.depth}" role="img" aria-label="Overhead map showing roads, buildings and your location" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="overhead-playable"><polygon points="${perimeter}"/></clipPath></defs>
    <g clip-path="url(#overhead-playable)">
    <polygon points="${perimeter}" fill="#302d26"/>
    <g fill="#717747" stroke="#9c9e68" stroke-width=".45">${(map.crops||[]).map(f=>`<rect x="${f.x-f.w/2}" y="${f.z-f.d/2}" width="${f.w}" height="${f.d}" rx="1.2"/>`).join('')}</g>
    <g stroke="#b3ae71" stroke-width=".3" opacity=".4">${(map.crops||[]).flatMap(f=>Array.from({length:Math.max(1,Math.floor(f.w/2))},(_,i)=>`<path d="M${f.x-f.w/2+1+i*2} ${f.z-f.d/2+1.5}v${f.d-3}"/>`)).join('')}</g>
    <g fill="#8d8065"><polygon points="${points(road)}"/>${branches.map(b=>`<polygon points="${b.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}</g>
    <g fill="none" stroke="#8d8065" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${(view.approachPaths||[]).map(p=>`<polyline points="${points(p.points)}"/>`).join('')}</g>
    <g fill="none" stroke="#b1a489" stroke-width=".65" stroke-dasharray="1.5 .6">${(map.railways||[]).map(line=>`<polyline points="${line.map(p=>p.join(',')).join(' ')}"/>`).join('')}</g>
    <g fill="#666b60" stroke="#a19880" stroke-width=".3">${map.props.filter(p=>['boxcar','locomotive'].includes(p.type)).map(p=>`<rect x="${p.x-2.2}" y="${p.z-4.5}" width="4.4" height="9" transform="rotate(${-((p.angle||0)*180/Math.PI)} ${p.x} ${p.z})"/>`).join('')}</g>
    <g stroke="#d3c4a6" stroke-width=".35">${map.buildings.map(b=>{
      const ridge=[buildingPoint(b,0,-b.d/2+.4),buildingPoint(b,0,b.d/2-.4)];
      return `<polygon fill="${BUILDING_FINISHES[b.id]?.roofColor||b.roofColor||'#938774'}" points="${points([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>buildingPoint(b,x*b.w/2,z*b.d/2)))}"/><polyline fill="none" opacity=".35" points="${points(ridge)}"/>`;
    }).join('')}</g>
    </g>
    <polygon points="${perimeter}" fill="none" stroke="#b0a087" stroke-width=".65" opacity=".9"/>
    ${overheadLiveLayer(zones, player)}
  </svg>`;
}

// The open map kept live (main.js): `draw` when it opens (or after a
// teleport); `refresh` every frame while it is open rewrites only the live
// layer (the storm, the duel circle, you), and only when it changed. Online
// the match runs on while the map is open, and a storm or circle can start
// after it opened (a new round).
export function overheadMapLive(root) {
  let key = null, look;
  return {
    draw(map, view, player, zones = NO_ZONES) { root.innerHTML = overheadMapSVG(map, view, player, zones); key = overheadLiveKey(zones, player); look = map.city ? OVERHEAD_CITY : undefined; },
    refresh(player, zones = NO_ZONES) {
      const next = overheadLiveKey(zones, player); if (next === key) return false;
      const layer = root.querySelector('#' + LIVE_LAYER_ID); if (!layer) return false;
      layer.innerHTML = overheadLiveSVG(zones, player, look); key = next; return true;
    },
  };
}
