// The old unversioned flag cannot establish completion of the current lessons.
const key=weapon=>weapon==='shotgun'?'deadshift-tutorial-complete-v2-shotgun':weapon==='rifle'?'deadshift-tutorial-complete-v2-rifle':'deadshift-tutorial-complete-v2';
export function readTutorialComplete(weapon){
 try{return weapon?localStorage.getItem(key(weapon))==='1':['static','rifle','shotgun'].some(id=>localStorage.getItem(key(id))==='1');}catch{return false;}
}
export function saveTutorialComplete(tutorial){
 if(!tutorial?.complete)return false;
 try{localStorage.setItem(key(tutorial.weapon),'1');return true;}catch{return false;}
}
