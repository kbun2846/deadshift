import test from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial, lessons } from '../src/tutorial.js';
import { readTutorialComplete, saveTutorialComplete } from '../src/tutorial-progress.js';

test('only finishing every current lesson persists tutorial completion',()=>{
 const stored=new Map([['deadshift-tutorial-complete','1']]);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}});
 try{
  assert.equal(readTutorialComplete(),false);
  const tutorial=new Tutorial();
  for(let i=0;i<lessons.length;i++){
   tutorial.begin();
   assert.equal(saveTutorialComplete(tutorial),false);
   for(let n=0;n<tutorial.goal;n++)tutorial.credit(n);
   assert.equal(saveTutorialComplete(tutorial),false);
   tutorial.advance();
  }
  assert.equal(saveTutorialComplete(tutorial),true);
  assert.equal(readTutorialComplete(),true);
  assert.equal(readTutorialComplete('static'),true);
  assert.equal(readTutorialComplete('rifle'),false);
  const rifle=new Tutorial('rifle');
  for(let i=0;i<rifle.lessons.length;i++){rifle.begin();for(let n=0;n<rifle.goal;n++)rifle.credit(n);rifle.advance();}
  assert.equal(saveTutorialComplete(rifle),true);assert.equal(readTutorialComplete('rifle'),true);
  assert.equal(saveTutorialComplete(new Tutorial()),false);
  assert.equal(readTutorialComplete(),true);
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);
  else delete globalThis.localStorage;
 }
});
