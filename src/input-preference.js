export function detectedControls({coarsePointer=false,hoverAvailable=true}={}){
 return coarsePointer&&!hoverAvailable?'touch':'keyboard';
}

// Automatic detection is the default; an explicit selector choice wins for this visit.
export function createInputPreference(detected,override){
 let manual=['touch','keyboard'].includes(override)?override:null;
 let mode=manual||detected;
 return {
  get mode(){return mode;},
  select(next){manual=next;mode=next;},
  observe(next){if(manual||!['touch','keyboard'].includes(next)||mode===next)return false;mode=next;return true;}
 };
}
