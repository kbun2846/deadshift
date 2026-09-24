import test from 'node:test';
import assert from 'node:assert/strict';
import {PingMonitor,PING_INTERVAL,createPerfReadout,formatFPS,formatPing,pingGrade} from '../src/ui/perf-readout.js';

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

test('readouts format as fixed-width figures with a placeholder when unknown',()=>{
 assert.equal(formatFPS(60),'60 FPS');
 assert.equal(formatFPS(0),'— FPS');
 assert.equal(formatFPS(null),'— FPS');
 assert.equal(formatPing(23.7),'24 MS');
 assert.equal(formatPing(null),'— MS');
 // A stalled connection must not blow the layout out.
 assert.equal(formatPing(99999),'999 MS');
 assert.equal(formatFPS(4000),'999 FPS');
});

test('grades colour the number without changing it',()=>{
 assert.equal(pingGrade(20),'good');
 assert.equal(pingGrade(120),'fair');
 assert.equal(pingGrade(400),'poor');
 assert.equal(pingGrade(null),'unknown');
});

test('the monitor probes on its own interval, never concurrently',async()=>{
 let started=0,release;
 const monitor=new PingMonitor(()=>{started++;return new Promise(r=>{release=r;});},PING_INTERVAL);
 monitor.update(1/60);
 assert.equal(started,1,'first frame should probe immediately');
 for(let i=0;i<600;i++)monitor.update(1/60); // ten seconds, probe still outstanding
 assert.equal(started,1,'must not stack probes while one is in flight');
 release(42);await settle();
 assert.equal(monitor.value,42);
 for(let i=0;i<Math.ceil(PING_INTERVAL*60)+2;i++)monitor.update(1/60);
 assert.equal(started,2,'should probe again once the interval elapses');
});

test('a failed probe reads as unknown rather than a stale number',async()=>{
 let fail=false;
 const monitor=new PingMonitor(()=>fail?Promise.reject(new Error('offline')):Promise.resolve(30),PING_INTERVAL);
 monitor.update(1/60);await settle();
 assert.equal(monitor.value,30);
 fail=true;
 for(let i=0;i<Math.ceil(PING_INTERVAL*60)+2;i++)monitor.update(1/60);
 await settle();
 assert.equal(monitor.value,null,'a dropped connection must be visible, not frozen');
});

test('a non-numeric probe result is treated as unknown',async()=>{
 const monitor=new PingMonitor(()=>Promise.resolve(NaN),PING_INTERVAL);
 monitor.update(1/60);await settle();
 assert.equal(monitor.value,null);
});

test('the element only touches the DOM when its text changes',async()=>{
 const writes=[];
 const node=()=>({className:'',dataset:{},_text:'',children:[],
  set textContent(v){this._text=v;writes.push(v);},get textContent(){return this._text;},
  setAttribute(){},append(...c){this.children.push(...c);}});
 const doc={createElement:node};
 const parent=node();
 const readout=createPerfReadout(parent,{probe:()=>Promise.resolve(50),document:doc});
 readout.update(1/60,60);await settle();
 readout.update(1/60,60);
 readout.update(1/60,60);
 const afterSteady=writes.length;
 readout.update(1/60,59);
 assert.equal(writes.length,afterSteady+1,'only the changed line should be rewritten');
 assert.ok(writes.includes('60 FPS'));
 assert.ok(writes.includes('50 MS'));
});

test('the readout is decorative, not announced',()=>{
 const attributes={};
 const node=()=>({className:'',dataset:{},textContent:'',children:[],
  setAttribute(k,v){attributes[k]=v;},append(...c){this.children.push(...c);}});
 const parent=node();
 createPerfReadout(parent,{probe:()=>Promise.resolve(10),document:{createElement:node}});
 assert.equal(attributes['aria-hidden'],'true');
});
