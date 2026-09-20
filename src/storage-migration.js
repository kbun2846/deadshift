// Preserve saves made before the game was renamed. New Deadshift saves win.
export function migrateGameStorage(storage){
 for(const suffix of ['settings','input','tutorial-complete-v2','tutorial-complete-v2-rifle','tutorial-complete-v2-shotgun','native-thumbnail']){
  try{
   const key='deadshift-'+suffix;
   if(storage.getItem(key)!==null)continue;
   const previous=storage.getItem('dustshift-'+suffix);
   if(previous!==null)storage.setItem(key,previous);
  }catch{/* Storage restrictions must not prevent the game from starting. */}
 }
}
