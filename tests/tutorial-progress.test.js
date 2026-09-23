import test from 'node:test';
import assert from 'node:assert/strict';
import { Tutorial } from '../src/tutorial.js';
import { readTutorialComplete, saveTutorialComplete } from '../src/tutorial-progress.js';

const finish=tutorial=>{while(!tutorial.complete){for(let n=0;n<tutorial.goal;n++)tutorial.credit(n);tutorial.advance();}return tutorial;};

test('only a finished course is saved, and basics is tracked apart from the weapons',()=>{
 const stored=new Map([['deadshift-tutorial-complete','1'],['deadshift-tutorial-complete-v2','1']]);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)}});
 try{
  assert.equal(readTutorialComplete(),false,'the old tutorial does not count as the new basics');
  const basics=new Tutorial('basics');
  assert.equal(saveTutorialComplete(basics),false);
  for(let n=0;n<basics.goal;n++)basics.credit(n);basics.advance();
  assert.equal(saveTutorialComplete(basics),false,'part way is not done');
  assert.equal(saveTutorialComplete(finish(basics)),true);
  assert.equal(readTutorialComplete(),true);assert.equal(readTutorialComplete('basics'),true);
  assert.equal(readTutorialComplete('rifle'),false);
  assert.equal(saveTutorialComplete(finish(new Tutorial('rifle'))),true);
  assert.equal(readTutorialComplete('rifle'),true);assert.equal(readTutorialComplete('static'),false);
 }finally{
  if(previous)Object.defineProperty(globalThis,'localStorage',previous);
  else delete globalThis.localStorage;
 }
});
