// Damage effects choose death presentation independently of the equipped weapon.
// Add a profile here when introducing a weapon with a new damage effect.
export const DEATH_REACTIONS=Object.freeze({
 ichorSlash:{mode:'scatter',organs:true},
 ichorWave:{mode:'scatter',organs:true},
 ichorFrenzy:{mode:'scatter',organs:true},
 ichorCost:{mode:'corpse'},
 sidekickShot:{mode:'corpse',headWound:true},
 sidekickMine:{mode:'scatter'},
 sightlineShot:{mode:'corpse',headWound:true},
 sightlinePistol:{mode:'corpse',headWound:true},
 sightlineBlast:{mode:'scatter'},
 omenShot:{mode:'corpse',headWound:true},
 omenCurse:{mode:'corpse',charred:true},
 omenBlast:{mode:'scatter'},
 explosion:{mode:'scatter'},
 electric:{mode:'corpse',charred:true},
 fire:{mode:'skeleton',charred:true},
 gunshot:{mode:'corpse',headWound:true},
 ballast:{mode:'corpse',headWound:true},
 ballastFatal:{mode:'corpse',headless:true,kneeling:true},
 impact:{mode:'corpse'},
});
export const deathReaction=type=>DEATH_REACTIONS[type]||DEATH_REACTIONS.impact;
