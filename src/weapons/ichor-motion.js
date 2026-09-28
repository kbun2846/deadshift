// Hilt x/y/z, blade yaw/pitch/roll, hip turn, forward lean, side bank, knee dip.
// Hands remain close to the chest: shoulders and hips commit to the cut.
const R=[-.18,.025,.13,-1.36,.20,-.09,-.22,-.02,-.035,.01];
const L=[-.29,-.04,.13,1.36,-.18,.09,.24,.035,.035,.02];
export const ICHOR_GUARD=[-.23,.005,.11,-.48,.12,-.03,-.03,0,0,0];
// Hilt at the right chest: the edge crosses left across the front of the body.
export const ICHOR_BLOCK=[-.17,.12,.16,1.45,.13,-.06,-.035,.025,-.015,.035];
const FORMS=[
 // High right diagonal, drop across the body, roll out of the follow-through.
 [[0,[-.19,.08,.12,-1.18,.48,-.18,-.30,.07,-.10,.025]],[.17,[-.17,.10,.12,-1.34,.55,-.12,-.36,.09,-.12,.04]],[.43,[-.27,-.09,.09,1.05,-.35,.16,.40,-.19,.10,.085]],[.72,[-.27,-.055,.12,1.32,-.10,.42,.27,-.09,.055,.04]],[1,L]],
 // Long left-to-right waist cut, ending lower and farther to the right.
 [[0,L],[.18,[-.30,.02,.13,1.49,.08,.10,.33,.09,.08,.025]],[.43,[-.16,-.065,.09,-1.20,-.12,-.13,-.38,-.17,-.07,.07]],[1,[-.18,-.04,.12,-1.13,.06,-.06,-.16,-.02,-.015,.01]]],
 [[0,[-.20,-.09,.12,-1.12,-.30,-.16,-.20,-.10,-.07,.05]],[.18,[-.18,-.10,.14,-1.32,-.35,-.12,-.29,-.14,-.10,.075]],[.42,[-.27,.095,.12,1.31,.41,.16,.36,.075,.08,.01]],[1,[-.28,.05,.13,1.03,.30,.1,.14,.02,.025,.015]]],
 [[0,[-.28,.075,.12,1.13,.44,.18,.24,.075,.075,.025]],[.18,[-.29,.1,.11,1.37,.53,.14,.34,.09,.11,.04]],[.43,[-.18,-.095,.07,-1.32,-.38,-.15,-.38,-.21,-.09,.09]],[1,R]],
];
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const keysAt=(keys,t)=>{for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,p]=keys[i-1],[b,q]=keys[i],f=ease((t-a)/(b-a));return p.map((v,j)=>v+(q[j]-v)*f);}return [...keys.at(-1)[1]];};
export function ichorCutProgress(variant,t){return variant===4||variant===5?ease((t-.12)/.74):ease((t-.17)/.26);}
export function ichorMotion(variant,t){
 t=Math.max(0,Math.min(1,t));const q=ichorCutProgress(variant,t);
 if(variant===4||variant===5){const sign=variant%2?-1:1,k=Math.sin(t*Math.PI);return [-.24,-.075+k*.03,.10,sign*(-.25+.5*q),.12*Math.sin(t*Math.PI*2),sign*.10,sign*Math.PI*2*q,-.13*k,sign*.075*Math.sin(t*Math.PI*2),.06*k];}
 if(variant===6)return [-.22,-.10,.045,-1.48+2.96*q,-.16+Math.sin(q*Math.PI)*.28,-.08+.16*q,-.29+.58*q,-.18,-.065+.13*q,.075];
 // Tight rising slice with a two-handed rolling recovery; feeds the waist cut.
 if(variant===7)return keysAt([[0,L],[.17,[-.27,-.08,.12,.83,-.36,.2,.20,-.14,.09,.07]],[.43,[-.18,.09,.10,-.76,.47,-.32,-.34,.10,-.085,.02]],[.75,[-.23,.06,.12,.05,.20,-2.5,-.04,-.06,-.04,.045]],[1,[-.28,.02,.13,1.10,.14,-Math.PI*2,.17,.02,.03,.015]]],t);
 // Short overhead diagonal and a compact returning backhand, separate end guards.
 if(variant===8)return keysAt([[0,[-.19,.08,.11,-.78,.54,-.10,-.18,.12,-.09,.02]],[.17,[-.18,.105,.10,-1.02,.60,-.15,-.28,.13,-.12,.045]],[.43,[-.28,-.085,.10,.90,-.39,.12,.31,-.20,.08,.08]],[1,[-.27,-.035,.12,.79,-.14,.09,.11,-.055,.025,.025]]],t);
 if(variant===9)return keysAt([[0,[-.28,-.04,.12,.82,-.18,.12,.19,-.06,.045,.035]],[.17,[-.29,-.07,.13,1.03,-.25,.16,.30,-.12,.08,.06]],[.43,[-.18,.04,.11,-.91,.24,-.12,-.33,.065,-.07,.025]],[1,[-.22,.05,.13,-.69,.20,-.10,-.11,.015,-.02,.015]]],t);
 return keysAt(FORMS[variant]||FORMS[0],t);
}
