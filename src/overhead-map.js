import { buildingPoint } from './maps.js';
import { BUILDING_FINISHES } from './building-finishes.js';
import {playableOutline} from './playable-area.js';

// Read the rendered road profile and current layout, never a hand-maintained image.
export function overheadMapSVG(map, view, player) {
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
    ${player ? `<circle cx="${player.x}" cy="${player.z}" r="3.8" fill="#a8e2ff" opacity=".18"/><circle cx="${player.x}" cy="${player.z}" r="1.65" fill="#c7efff" stroke="#203844" stroke-width=".65"/>` : ''}
  </svg>`;
}
