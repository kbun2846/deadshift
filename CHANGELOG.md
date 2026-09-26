# Changelog

Deadshift, newest first. Every version is an alpha, playable in the browser on mobile or PC.

## alpha v0.965 (2026-09-26)

### Hollow Wick, stage 3: mechanics and style (developer tools > World > Map in progress)
- The woods' floor: a thick carpet of fallen leaves under the North and West Woods, litter browns with the yellows and oranges of the trees above, thickest under the crowns and thinning at the edges and along the tracks (sparse on Potato, lush on Extreme).
- Leaves fall from the canopies near you, spinning and swaying down (not on Potato; the reds never lie on the ground), and they kick up round anyone walking or dodging through the litter; a blast in the woods throws a burst of them.
- More to the land where it was bare: fieldstone piles, boulders and chopping blocks across the slopes between the town and the fork and elsewhere.
- Crows: perched on ridges, chimneys, the belfry, headstones, posts and the hanging tree; a few cross the sky. They burst up and circle off when shots, blasts or people come near, go quiet after gunfire, and come down to the dead a while after a kill.
- Its own sound: a cold gusting wind in place of the desert's, dry leaves near the woods, the stream's babble and the weir's rush, distant caws, the rope creaking on the hanging tree, the mill wheel groaning round, and now and then a single toll from the meetinghouse bell. Gunfire hushes it all for a moment. Wading splashes, and your steps in the water sound wet.
- Dusk: an overcast grey sky, a low weak sun with a warm glow in the west and haze over the far ground and the hollow, the ground still readable (Extreme adds its own colour grade); the ground's browns nudged so blood, team colours and coats stand out on every patch of it.
- The overhead map (pause > map) draws Hollow Wick properly: the ground by height, the woods, the stream at its real width with the ford, the paths, walls and fences, the crossings, the buildings on their pads, and the irregular fence.
- Its card for the map pick (a picture and one line), ready for when it leaves developer tools.

## alpha v0.960 (2026-09-26)

### Hollow Wick, stage 2: the village (developer tools > World > Map in progress while it is being built)
- Sixteen colonial New England buildings on their pads: capes, saltboxes and a gambrel, the tavern with its hanging sign, the white meetinghouse with its belfry and portico, the smithy and open forge with a glowing hearth, the barn, the gristmill on the stream with its turning undershot wheel, the horse sheds, the hillside tomb, the hearse house, a farm and a woodshed. Steep shingled roofs, big chimneys, clapboard, 9-over-6 windows (dark, broken or shuttered), plank doors standing open; roofs fade when you go in.
- Every room furnished for 1790 and left mid-task, the eerie way: centre chimneys with hearth, crane and pot, trestle tables with apples half pared, rope beds, dressers with pewter, spinning wheels and cradles; the tavern's bar cage, settle and casks; box pews and a raised pulpit under its sounding board; the smithy's banked coals; millstones and the pit wheel; stalls with a dead horse's ribs; coffins on stone shelves and one fallen open; one house still lit by a pierced-tin lantern, a place laid with food gone to mould and a chair on its back. You bump into all of it, and no doorway is ever blocked.
- The woods: an autumn North Woods and West Woods in clumps and gaps, an old orchard, bare village elms, willows on the banks, the fork's great maple on its orange carpet, stumps and fallen logs. Trunks are cover; canopies thin out round anyone under them.
- The burying ground on Church Hill's terraces (slate and fieldstone headstones, table tombs, an open grave beside fresh mounds) and low fieldstone walls across the land.
- The field and the set pieces: corn shocks and dead standing stalks to hide in, scarecrows, an ox cart, a corn crib, a haystack, woodpiles, the well and its sweep, rail fences, boulders, reeds on the banks; the hanging tree, a drag trail of old blood into the woods, the body pile by the stream, skeletons, and a body in a rocking chair that still rocks.
- Ten new breakables, each breaking its own way: pumpkins (seeds and pulp), cider kegs (a spray of cider and a stain), apple crates (the apples roll downhill), grain sacks (the grain pours out), chicken coops (feathers drift down), bee skeps (a swarm circles off), stoneware crocks (the lid spins down like a coin), tin lanterns (the candle burns on in the dirt, then gutters out), cordwood (the logs tumble and roll) and wheelbarrows of squash.
- The crossings built for real: an open timber bridge on stone abutments, a mossy fallen tree trunk, and a plank footbridge on trestles; stones in the stream.
- Bases and spawn points for every mode (the town yard, the graveyard's foot and the south bank), and robots on the map.

### The stream
- See-through water on every preset: the bed, the ford's pebbles and a wader's legs show through it, darker the deeper.
- It reacts to you: rings and a splash at every step, a bigger splash on a dodge, slow rings while you stand still, and water dripping off you for a moment after you climb out (Balanced and up). Shots, orb volleys and grenades splash and throw up spray instead of dust; blood spreads on the water and drifts downstream (Quality and up); leaves float by; the weir churns white below the mill dam; Extreme adds a gentle swell and shimmer.

### Every map
- Furniture in every room is solid now (Deadwater's counters, stools, stoves, shelves and woodpiles too), and the doors it used to block are clear: the sheriff's and the boarding house's back doors, the farmhouse's side door and Test Hill's plateau house.
- Shadows reach the edge of the screen on every preset and screen shape (they used to stop short in a corner, and at the top and bottom of a phone).

### Performance
- Fewer draws on maps with hills (bigger scenery batches), and idle effect pools skip their draws.

## alpha v0.955 (2026-09-26)

### Hollow Wick, stage 1: the ground (developer tools > World > Map in progress while it is being built)
- The whole map's ground: the town's plateau, the terraced slope, the fork, Church Hill, the stream hollow, the south terrace and field, and the woods' knolls, joined by earth banks (only a few stone walls), inside an irregular fence that follows the land. Darker brown ground, only the main road, its field branch and the bridges' paths drawn, hill shade under a low west-south-west sun, and grass, stones, twigs and leaf litter scattered per preset.
- The stream: wade anywhere, at depths that vary. It runs west: slower against it, quicker with it, a little slower across; dodges go shorter and stamina refills slower in water, and water kicks up no dust and keeps no footprints.
- The bridge, the fallen log and the footbridge: walk onto them from their ends, step off their sides into the water, or wade in underneath (the deck turns see-through while you are under it). The mill dam's stone top is a walk across the stream. Online and against robots, a player under a bridge is hit where they wade, never through the planks from the deck above.
- The fence follows the ground and reaches down to each bank.
- Fog drifts over the hollow, clears unevenly round you and your aim, and stays up on a hilltop instead of cutting through it. Every map's fog clearing is uneven now, not a perfect circle.

### Hills (every map with hills)
- Rounds, pellets, Scatter's shells and Static's spray fly over the ground: up and over any slope you can walk, across narrow dips, down with the ground. Only walls and rises too steep to climb stop them, so a round hits whoever it reaches, even just past a brow you cannot see over; walls are cover.
- Static's lightning, the orb beams and the volley beams bend over the ground instead of cutting through hills.

### Multiplayer
- Protocol 11: players wading under a deck are shown there.

## alpha v0.95 (2026-09-26)

### Hills (the ground can rise and fall)
- A map can now have hills: slopes, plateaus, hollows and dry-stone retaining walls, from one shared height grid every player and the host read exactly alike. Deadwater stays exactly flat and plays byte for byte as before (a recorded replay of every weapon, a robot fight and a hosted match checks it).
- Sight follows the ground and is always mutual: a crest or a retaining wall hides you both ways. Rounds (Nominal's bullets, Ballast's pellets, Scatter's shells) only hit what their shooter could see and end in the ground where the rest of their path is hidden; they are drawn over the ground and glide down a wall's edge.
- Static: a volley launches only the orbs you can see; orbs stop against a steep rise and do not drift off a ledge; orbs are not placed up a wall. Blasts (orbs, grenades, Scatter) are measured in 3D and stop at a crest; grenades arc over the lip they are thrown over.
- Walking is a little slower uphill and quicker downhill. Robots take cover behind slopes, see by the ground and prefer gentler routes.
- Effects, blood, marks, rings and shadows lie on the slopes. The ground is drawn in fine detail on every preset, finer as the preset rises.
- Test Hill (developer tools) is the proving ground; the first real hilly map, Hollow Wick, is next.

### PC
- Settings > Graphics > SCREEN: Fullscreen or Windowed. Fullscreen works in any browser that allows it and now stays on through the menus; Windowed never goes full screen. (A saved "lock browser shortcuts: off" becomes Windowed.)

### Robots
- On a phone or tablet held upright, robots never shoot from off your real screen (they used a landscape box before). Multiplayer joiners send their screen shape to the host for this.

### Multiplayer
- Protocol 10 (hills). The host now sends a fingerprint of the map; a joiner with a different build of it is turned away. Every number in it is rounded first, so browsers whose maths differ in the last digit (Firefox's) always agree.
- A mirrored Nominal round no longer keeps a previous round's Surge glow or ground stop.

## alpha v0.94 (2026-09-25)

- Performance: collisions only check nearby walls and props (a grid over the map's ~830 colliders), for bodies, orbs, bullets, pellets, blast shells and grenades. A solo 3V3 used about a third of the CPU it did.
- iPad with a keyboard: a finger on the screen fired Nominal and never let go, even through reloads. The finger's lift now releases it; key releases are matched more reliably and switching apps releases everything.
- The aim dot no longer jitters while moving (the smoothed cursor is drawn between steps; aim from the game is placed from the drawn body).
- The death screen's red splash is centred behind the panel again (on iPad it drifted off to the lower right).

## alpha v0.93 (2026-09-25)

### Robots
- Rebalanced after robot-vs-robot trials. Normal is easier: slower to react, looser aim, a shakier hand, fewer tricks; easy and rookie a little softer too. Rookie, easy and normal are calmer by default; hard and up are not held back.
- Normal and easier robots mostly hold fire until you notice them (your aim swings their way, you hurt them, or you come close), and start fights themselves a few seconds after spotting you.
- No robot shoots anyone from off their screen; they close in first.
- X abilities are used less often (a wait after they are ready, longer on easier skills).
- Smoother movement: eased turns, calmer side-to-side weaves. Ballast and Static robots sometimes dash in at a Nominal.

### Controls
- Dodge is Q (was Left Ctrl).
- Settings > Controls > KEYBOARD: change any game key (move, dodge, fire, aim in, weapon action, X ability, stream, reload, arrow aiming, map, mute). Taking a used key swaps; Esc cancels; RESET TO DEFAULTS. Key names in the tutorial and HUD follow your keys.

### Multiplayer
- One ROBOTS box in host setup and the lobby; robot skill, + ROBOT and TUNE show only while it is ticked (unticking removes added robots).

### Fixes
- A page load always opens the main menu (on phones, coming back from full screen reloaded straight into the last game).
- Walking along a building's wall past a door no longer lifts its roof; only standing in the doorway does.

## alpha v0.92 (2026-09-25)

### Solo
- Gamemodes > SOLO (was 1V1): 1V1, 2V2 or 3V3 against robots, with your own robot teammates. Enemy robots and your robots are set separately (weapon or random, skill, aim, temper); first to 3, 5, 10 or endless; friendly fire; spawns scattered or with team. Your weapon can be random.
- Weapons and maps are dropdowns with a scrolling picture grid. The page fits phones.

### Multiplayer
- Every mode works: FFA, PRACTICE, 1V1, 2V2, 2V2V2 and 3V3. Robots fill empty seats (setting), + ROBOT adds one by hand, and a late joiner takes a robot's seat.
- Players pick their side in the lobby. Sides are AMBER, CYAN and VIOLET, worn on hats, scarves and base rings, and on the lobby, scoreboard and results.
- TUNE a robot in the lobby (weapon, skill, aim, temper), or APPLY TO ALL, which also sets up robots added later.
- Friendly fire (on by default in team games) does half damage. Spawns scattered (nobody within a screen of anyone) or with team.
- The host setup and lobby fit phones; the lobby map is a dropdown.

### Robots
- New skill: perfect. Robots play as squads: some stay with you, some go help a teammate in a fight, some roam; a side splits up or sometimes moves as a group.

### Weapons
- Aim lines up through the muzzle, so shots land on the cursor.
- Static: volleys launch slow then fast and leave a short beam; placed orbs drift faster; the stream does 8% less and uses orbs 20% faster; enemy orbs are darker blue. The hex lets teammates in, blocks shots from outside and spins at its edge for a moment if not pulsed.
- Nominal: the nova gives 15% more speed, tighter shots and 18% less damage taken.
- Ballast: the red cone shows full power up close and a fifth at 6.8 m, then fades out over 4 m more, to about 10 a hit at the very end; aimed shots do about 20 more point blank. The blast must charge 3 s before it fires (a pulsing ring, embers and a countdown show it), its small shells land scattered, and its explosions burn crops. Bigger blast effects.

### Other
- CHANGE WEAPON after a death picks what you respawn with. Ctrl+W no longer closes the game while playing (key lock).
- Blood no longer floats on the player. The sheriff's office has a door on every side. Bigger solo score with the health bar centred.
- Tutorials updated for all of the above. Lots of bug fixes.

## alpha v0.9 (2026-09-24)

### 1V1
- Gamemodes > 1V1 works: you against one robot. Pick the map, your weapon, the robot's weapon (or random), its skill (rookie, easy, normal, hard, expert), its aim (sloppier, as its skill, sharper), its temper (calm, shifting, aggressive), and first to 3, 5, 10 or endless.
- No practice targets; the score sits at the top; at the end, REMATCH or MAIN MENU. Your last picks are remembered.

### Robots
- Two new skills: rookie and expert. Robots mix two or three play styles, and their mood shifts during a fight: pushing and hunting when fired up, keeping their distance and taking cover when calm. Getting hurt calms them; a badly hurt enemy fires them up.
- They read the fight (push, kite, close in, fall back), dodge shots they see coming, and use every weapon's tricks. Their aim is a little worse, with the odd miss; they see only ahead and hear by distance; they spawn further away and fight each other as often as you.
- Real robot heads (no hats); armour plates fall off as they take damage, and exposed wiring sparks and smokes.

### Weapons
- Nominal: 28 rounds, faster reload. New X: the nova, 2 s to power up, then 5 s of double damage, no ammo use, a little extra speed and armour, white beams, a full magazine after; 50 s cooldown.
- Ballast: no more charging; one press, one shell. New X: the blast, five big red shells that each split into four and end in small explosions (up to 460 damage), 40 s cooldown. Two dodges.
- Static: the hex hits 15 harder; the orb bar marks the tenth orb; bigger volleys.
- X abilities are named hex, nova and blast everywhere, and the X button shows its state by colour (red cooling down, pink ready, yellow charging, blue in use). Tutorials redone to match.

### Aim and screen
- Target lock: turn to face someone, or use the arrow keys (or swipes) to switch between targets; no auto-lock. Smooth, accurate tracking that lets go behind walls, indoors and off screen.
- Every screen shape sees about the same amount of the map. Pink ring shows where gunfire you hear comes from. KILL / ONE SHOT popups. Numbers from your last life no longer show after you respawn.
- Menus show pictures of the weapons and maps, and every weapon and map list has a coming-soon slot.
- Touch: see-through buttons that fade at the edges, evenly inset with rounded corners.

### Multiplayer and fixes
- Fixed games freezing when Static's stream was busy. Syphon (FFA option): a kill heals half your missing health.
- Online players no longer run the nova or blast twice; shells keep flying after you die; many smaller fixes.
- Faster loading; fewer draws on busy maps; no stutter on the first death.
- Dev tools: freeze game, many more options, a larger O window with a quick bar and search.

## alpha v0.82 (2026-09-24)

### Robots (a test build, from the dev tools)
- Robots you can add from the dev tools (solo games): they play like a player, using every weapon with the same moves, ammo and reloads.
- They find real routes round the map, take cover to reload, hunt you down, walk round cover to get a shot, and keep their aim on the corner you went round.
- Robots never bleed: hits throw sparks, and a dead robot falls over and smokes.
- Sides: free for all, an enemy team, or allies. Allies stay next to you, keep out of your line of fire, go after whoever is hurting you and step in front of you when you're nearly dead. No friendly fire.
- Eight robot skins (steel, copper, brass, gunmetal, rust, enamel, black iron, teal), never two the same in a game; allies have a green eye, flag and ring.
- Each robot has a skill (easy, normal, hard) and a style (balanced, rusher, marksman, flanker, cautious), with small differences of its own.
- Robots are the same size and shape as players.

### Menus
- Previews of robots in multiplayer: robot options when hosting, "empty slot" rows in the lobby, and a 1V1 page for you against a robot. Not working yet.

## alpha v0.8 (2026-09-24)

### Title screen
- New main menu: the "deadshift" title fills with liquid blood. It pours into the letters, part-fills the holes in the d's and the a, drips from every letter (fast drips and double drips too) and pools on the buttons.
- The blood is attached to the text and buttons, so it never lags when you drag or resize, and it fits every screen, including vertical phones.
- Version above the title; a password-protected dev tools button under the menu.
- The loading screen now matches the title.

### Gameplay
- Nominal: slight recoil in the hip-fire cone that affects aim and bullets; none while aiming down sights.
- Targets: bullet holes only appear from real bullets. Targets now break apart in stages and throw pieces on Quality and Extreme, and face different directions (never straight up).
- Death: the camera zooms in and holds on the body so you can see the gore, and the menu slides in after a few seconds.
- Walking through blood stains your gun and hat, and bloody footprints now cover the whole print.
- Roofs lift straight away when you walk in through a door, including the big building by the train.

### Interface
- The top bar uses icons: a map, a speaker (pink with a slash when muted) and a pause button.
- Settings > Controls: General and Weapons are both dropdowns.
- Keyboard HUD hints no longer overlap on narrow windows.

### Performance
- Static X no longer stutters: pulses and orb blasts reuse their effects instead of building new ones, and nothing new is compiled mid-fight (including on Extreme).
- Breaking props with the X is much cheaper.
- When the game lowers resolution to keep up on phones and laptops, it no longer freezes for a frame.
- The HUD skips work it doesn't need to do, and damage numbers and aim brackets move without re-laying out the page.
- Aim assist and target lock check sight lines more cheaply.

### Extreme preset
- Cloud shadows drift slowly across the whole map.
- Now and then a dust devil whirls across open ground with the wind.
- Better-lit birds, and more detailed low-poly weapon pictures.

### Mobile
- Redesigned touch layout editor: a clean toolbar with an icon legend and Swap / Reset / Done buttons, and buttons snap to the screen edge. Your phone gives a small tick when you pick up or drop a button.
- Settings > Mobile puts the layout tools first.
- New Vibration setting: a short buzz when you're hit and a double buzz on a kill.
- The screen stays on while you're playing.
- The grenade button now reads NADE and fits its slot, and every button label is centred in its segment.

## alpha v0.7 (2026-09-23)

### Multiplayer rounds from a lobby
- Host setup page, then a live lobby: players, colours and ping. The host picks the mode (free-for-all or practice), the map and the settings, then starts the round. 1V1, 2V2 and 3V3 are listed but not built yet.
- Round settings: spawns (random or together), round length, kill limit, health and respawn wait.
- A 10-second weapon pick over a top-down camera. Weapons only change after dying. Free-for-all ends on a results screen, then back to the lobby; practice has shared targets and nothing is counted.
- A lobby page in the pause menu (ping and settings; the host can remove players, reset the map and end the round).
- One death screen for solo and online, with a respawn countdown. One body and bloodstain per player, per-player colours, and ping on the scoreboard.
- Fixed: another player's Static stream drew from your own gun.

### Also
- Aim assist, target lock and faster aiming without a mouse.
- Nominal holds 20 rounds (40 with the extended magazine).
- Damage numbers add up into running totals.
- No more mid-fight stutter from shaders being built; about 25% fewer draw calls and cheaper shadows.
- Roof fixes, and roofs show wear.
- Menu text is fitted before it first appears. New 1V1 gamemode button.

## alpha v0.65 (2026-09-23)
- Multiplayer menu: username, room code and JOIN, or HOST A GAME. The room code is the password, and the code box is always in capitals.
- Two windows of the same browser can play each other on one PC.
- Players still loading the map get 45 seconds before being dropped; a freeze on your own side no longer counts as the other player going quiet.
- The multiplayer pause menu and death card match the original pause menu's style.

## alpha v0.6 (2026-09-23): multiplayer
- Free-for-all for up to 4 players, peer to peer. Every weapon works against players.
- Pick a weapon after loading in; change it from the pause menu or the death card.
- Spawn inside a random building, 500 HP, 5-second respawn.
- Kill feed (multi-kills on one line; you in blue, others in pink) and a Tab scoreboard (kills, deaths, damage dealt and taken, time, most-used weapon).
- The host can remove players. Broken props and crop fires are shared with everyone, and players can't walk through each other.
- Blood splatter on the floor at every player death.
- Edit the mobile layout from the menus over a still frame of the map.
- Kill feed bottom left (top right on touch); a bigger health bar.

## alpha v0.55 (2026-09-22)
- Orb blasts grow with every orb that lands: small at 2-3, medium at 4-7, full size around 10.
- Warmer light on each map.
- New Extreme preset: ambient occlusion, bloom and colour grading, weathered surfaces, sharper shadows.
- A detail-effects layer (sparks, embers, smoke, rings) on every weapon and blast.
- Optimisation pass, including stand-in shadows on Potato.
- Ballast shells bounce and roll; pellets past the red zone keep flying for show.
- Mobile layout: reset a single dragged button back to its corner.
- Menu click sounds; indoor shadow and roof fade fixes.
- Settings > Controls groups weapons in one Weapons dropdown.
- Dev tools: hidden until unlocked, with new tools (game speed, one-hit kills, freeze and respawn targets, and more).

## alpha v0.5 (2026-09-22)
- Fixed the published game getting stuck on the menu (a page file was missing from the release).
- The darkening outside the room you're in no longer flickers and is much cheaper (indoor frame times roughly halved on Performance). The crop-field view was rebuilt the same way.
- On a tablet with a keyboard, touch and keyboard no longer fight: the on-screen controls stay put and shots aren't lost when you switch between them.

### Between v0.5 and v0.55
- Fixed glitched interiors (a shelf clipping through cover in several buildings).
- Pots look like pottery, and pots, potted plants and broken chairs break when you walk over them, throwing shards instead of dust.
- Worn paths at doorways blend into the road.
- The dev window lists the Extreme preset.

## alpha v0.4 (2026-09-20)
- Better mobile performance, controls and menus; Static rebalanced.
- Fixed: moving with the joystick and pressing a button at the same time.

## alpha v0.3 (2026-09-20)
- First published version, playable in the browser (hosted on GitHub Pages).
