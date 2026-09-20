// Damage effects choose death presentation independently of the equipped weapon.
// Add a profile here when introducing a weapon with a new damage effect.
export const DEATH_REACTIONS=Object.freeze({
 explosion:{mode:'scatter'},
 electric:{mode:'corpse',charred:true},
 fire:{mode:'skeleton',charred:true},
 gunshot:{mode:'corpse',headWound:true},
 ballast:{mode:'corpse',headWound:true},
 ballastFatal:{mode:'corpse',headless:true,kneeling:true},
 impact:{mode:'corpse'},
});
export const deathReaction=type=>DEATH_REACTIONS[type]||DEATH_REACTIONS.impact;
