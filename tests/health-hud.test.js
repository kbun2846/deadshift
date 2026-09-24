import test from 'node:test';
import assert from 'node:assert/strict';
import {HealthBarMotion,trembleOffset,TREMBLE_DECAY,TREMBLE_FLOOR} from '../src/ui/health-hud.js';
test('damage segment swells, holds, then smoothly contracts to current health',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);
 const hit=bar.update(300,500,.1);assert.equal(hit.fraction,.6);assert.equal(hit.loss,.4);assert.ok(hit.scale>1);
 const held=bar.update(300,500,.2);assert.equal(held.loss,.4);
 const sliding=bar.update(300,500,.4);assert.ok(sliding.loss>0&&sliding.loss<held.loss);assert.ok(sliding.scale<hit.scale);
 const done=bar.update(300,500,2);assert.equal(done.loss,0);assert.ok(done.scale<1.001);
});
test('repeated hits preserve the trail, pause freezes it, healing and reset clear it',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);bar.update(400,500,.1);
 const next=bar.update(300,500,.15);assert.equal(next.loss,.4);
 assert.deepEqual(bar.update(300,500,.15),next);
 assert.equal(bar.update(500,500,.2).loss,0);
 bar.update(100,500,.3);assert.equal(bar.update(100,500,0).loss,0);
});

test('the losing segment trembles on the hit and settles once the bar catches up',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);
 const hit=bar.update(300,500,.1);
 assert.ok(hit.tremble>.9,`a fresh hit should shake hard, got ${hit.tremble}`);
 const later=bar.update(300,500,.35);
 assert.ok(later.tremble<hit.tremble,'the shake should bleed off');
 assert.ok(later.tremble>0,'but not vanish while the gap is still open');
 const settled=bar.update(300,500,2);
 assert.equal(settled.loss,0);
 assert.equal(settled.tremble,0,'no gap, no shake');
});

test('a burn keeps the shake alive without re-jolting it every frame',()=>{
 const bar=new HealthBarMotion();bar.update(500,500,0);
 let hp=500,time=0,peaks=0,previous=0;
 for(let i=0;i<60;i++){time+=1/60;hp-=25/60;const {tremble}=bar.update(hp,500,time);if(tremble>previous+.2)peaks++;previous=tremble;}
 assert.ok(peaks<=1,`a steady burn re-jolted the bar ${peaks} times`);
 assert.ok(bar.update(hp,500,time).tremble>.2,'but the segment should still be trembling');
});

test('the tremble is a real wobble, not a drift, and stops dead at zero',()=>{
 const zero=trembleOffset(1.23,0);
 assert.equal(Math.abs(zero.x),0);assert.equal(Math.abs(zero.y),0);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let i=0;i<240;i++){
  const {x,y}=trembleOffset(i/60,1);
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 assert.ok(minX<-1&&maxX>1,`horizontal swing was ${minX}..${maxX}`);
 assert.ok(minY<-1&&maxY>1,`vertical swing was ${minY}..${maxY}`);
 // Small enough to read as a tremble rather than the bar coming apart.
 assert.ok(maxX<=5+1e-9&&maxY<=3.6+1e-9,'the shake is larger than intended');
 // Big enough to catch the eye on an 11px bar, which is the whole point.
 assert.ok(maxX>=4&&maxY>=3,`the shake is too timid to notice: ${maxX}, ${maxY}`);
});

test('the tremble timings are set where the effect is actually readable',()=>{
 // Long enough that a burn keeps the bar alive between ticks, short enough
 // that the bar settles well inside the popup lifetime.
 assert.ok(TREMBLE_DECAY>.25&&TREMBLE_DECAY<1,`decay ${TREMBLE_DECAY}`);
 // A sliver a pixel wide jittering reads as a rendering fault, so the shake
 // ramps in over a gap this size rather than switching on at any loss.
 assert.ok(TREMBLE_FLOOR>0&&TREMBLE_FLOOR<.1,`floor ${TREMBLE_FLOOR}`);
 const bar=new HealthBarMotion();bar.update(500,500,0);
 // A loss below the floor trembles proportionally, not fully.
 const small=bar.update(500-500*TREMBLE_FLOOR*.4,500,.1);
 assert.ok(small.tremble>0&&small.tremble<.6,`a hairline loss shook at ${small.tremble}`);
 const big=new HealthBarMotion();big.update(500,500,0);
 assert.ok(big.update(300,500,.1).tremble>.9,'a real hit shakes hard');
});
