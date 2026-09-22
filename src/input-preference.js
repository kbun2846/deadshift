export function detectedControls({coarsePointer=false,hoverAvailable=true}={}){
 return coarsePointer&&!hoverAvailable?'touch':'keyboard';
}

// Automatic detection is the default; an explicit selector choice wins for this visit.
//
// `mode` is the input last used, which is only ever a question of which prompts
// to print. `surface` is which set of controls is on screen, and it is
// deliberately stickier: once a device has been touched it keeps its on-screen
// controls for the rest of the visit. A tablet with a keyboard attached is the
// case that matters. There the two input methods get used within a second of
// each other, and taking the buttons away on every keypress -- then putting them
// back on every tap -- is what made the controls feel like they were fighting
// the player, quite apart from what it did to whatever was being held at the
// time.
export function createInputPreference(detected,override){
 let manual=['touch','keyboard'].includes(override)?override:null;
 let mode=manual||detected;
 let touched=detected==='touch';
 return {
  get mode(){return mode;},
  get surface(){return manual||(touched?'touch':'keyboard');},
  get touched(){return touched;},
  select(next){manual=next;mode=next;if(next==='touch')touched=true;},
  observe(next){
   if(!['touch','keyboard'].includes(next))return false;
   // Worth recording even under a manual override: the player may clear the
   // override later, and a device that has been touched has a touchscreen.
   if(next==='touch')touched=true;
   if(manual||mode===next)return false;
   mode=next;return true;
  }
 };
}
