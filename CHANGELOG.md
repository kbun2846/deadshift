# Changelog

Deadstab, newest first. Every version is an alpha, playable in the browser on mobile or PC.

## v0.1.8-alpha (2026-10-02)

### New
- **QUICK PLAY:** one button on the title screen. If someone else is looking for a game, you're put in an online FFA together. If not, you go straight into a 1v1 against a bot that quietly adjusts to how you're playing, and a "PLAYER FOUND — JOIN?" card pops up if someone turns up. PLAY and QUICK PLAY are now the big buttons.
- **Gun Game** (online and BOTS): every kill moves you to the next weapon, ending on the blades. The first kill with the last weapon wins. A blade kill knocks the victim back a weapon.
- **Killcam:** after you die, the camera shows who killed you and with what, with both of your health bars. It's quick and skippable and never adds to your respawn wait.
- **Choose your next weapon on the death screen** in FFA and practice, with a clear respawn countdown.
- **Your match:** every end screen shows your kills, best streak, damage, accuracy, favourite weapon and a highlight ("3 ONE SHOTS!").

### Feel
- **Kills hit harder:** a sharp kill sound, a tiny freeze and a screen kick; one-shot kills get their own boom and marker. The last kill of a round plays in brief slow motion.
- **Hit markers** grow with damage, with a red X for a kill.
- **Kill streaks:** SPREE at 3, RAMPAGE at 5, UNSTOPPABLE at 8, and SHUTDOWN when you end someone's streak.
- **Low health** pulses the screen edge with a heartbeat.
- **Reload sounds** for each weapon when the reload finishes.
- **Spawn protection:** 1.5 s after you spawn, ending as soon as you attack.
- **Shots pop:** every bullet, pellet, orb, round and slash has a bright core and a dark rim so it reads on every map. Fixed Nominal's rounds and Ballast's pellets not being drawn at all on fixed graphics presets.

### Menus
- **A live match plays behind the main menu** (off on slower devices).
- **The game remembers** your last weapon, mode and practice map, so you're a tap or two from playing.
- **New weapon tips:** the first time you use a weapon, a small card explains it in three lines.

### Lumen
- **Emptier streets:** about 40% of the small street obstacles are gone (crates, chairs, scooters, cones, bins, benches and more), so the streets are open lanes you can run through. Every car, bus and van is still there.
- **Brighter, easier to read:** the city is a little more lit up (still night), and the things you bump into are a shade lighter than the street, so you can tell what's what.
- **More things break:** podiums, crate tables, produce crates, rain drums, the fish tank, price boards, coolers, ticket machines, chargers and more can now be smashed. Cars, walls and other solid things still can't.
- **Doorways you can see:** light spills out of every door you can walk into, and the light strip over each door is brighter, so entrances stand out from above.

### Everywhere
- **Dodge charges redesigned:** bigger, clearer cells next to the weapon panel show how many dodges you have and how far the next one has refilled. A charge pops when it comes back, and the row flashes red if you try to dodge with none. On phones the DODGE button shows the same charges.
- **Arrow-key aiming is smoother:** a lock now stays right on a moving target instead of trailing it, switching targets glides, and an arrow picks the enemy you most likely mean (whoever just shot you, the one you were last on, never someone hidden in a building). Diagonals work, a target that ducks behind cover is picked back up when it reappears, and a kill no longer moves your lock to someone else. Tap an arrow twice to let go. Thin pink brackets show what you're locked onto.
- **Mobile joystick:** a little bigger and steadier. Small pushes now move you more gently and full speed comes just before the edge, so it's easier to control while still instant.
- **Ichor's guard blocks more:** each raise now soaks 28–32 damage (was 14–18), about five close Nominal bullets.
- **Bots against blades:** gun bots on Easy and Normal are slower to back away from a sword, back up less efficiently and are thrown off for a moment when a blade dashes at them. Ballast bots, the hardest matchup for a blade, now lose to Ichor and Sheath more often. Hard bots are unchanged.

## v0.1.7-alpha (2026-10-01)

### Lumen
- **Buildings in front of you fade cleanly:** their window frames, pillars, ledges, fire escapes and signs now go with them, instead of leaving stray bars floating over the street. Some signs that were hidden inside the building next door were moved to real walls, so a few signs are in new places.
- **No more seeing inside buildings from outside** on Extreme: roofs and walls no longer show a faint print of the rooms underneath.
- **About 20% less street clutter**, mostly the thin posts you couldn't see from above and kept running into (bollards, meters, poles). Street lights and the remaining decorative poles no longer block you, and there's still cover everywhere.

### Everywhere
- **Normal bots are less aggressive:** they no longer always chase you down. They sometimes hold a spot in cover and peek out, or hold their ground in the open, and push in when they have the upper hand or you get close. Easy and Hard bots are unchanged.
- **The storm shows on the map (M)** on every map and in every mode, online and against bots, and it moves while the map is open. It was missing on Lumen and frozen online.

## v0.1.6-alpha (2026-10-01)

- **New map: Lumen**, a deserted cyberpunk city at night. Rain on wet streets, neon signs and holograms still running, steam from the vents, abandoned cars and buses, and every building can be entered. Lots of new breakables (a broken hydrant sprays water you can't see through), new city sounds, and its own look on every graphics preset. Play it in practice, against bots, and online: it's in the map vote and the JOIN list.
- Online: everyone needs this version (reload if the game says it was just updated).

## v0.1.5-alpha (2026-10-01)

- **New settings:** redesigned to match the rest of the menus, and it works properly on phones (upright and sideways). Quality, frame limit, audio, key bindings, the controls reference and the touch layout editor are all still there, with less clutter. Resetting keys or the touch layout now asks for a second press.
- **Shadows no longer flicker while you move** on Performance, Balanced and Quality: moving things' shadows are now drawn every frame instead of lagging behind and snapping back. Balanced on Hollow Wick also does less shadow work than before.
- **Messages from the server** (announcements, room and private messages) now show as a card in the game's style instead of a plain line of text.
- Online: the server has better tools for keeping games running smoothly (maintenance mode, timed bans).

## v0.1.4-alpha (2026-09-30)

- **Nominal does about 10% less damage everywhere**: bullets 6 (6.8), 4.3 at long range (4.8); the grenade 36.8 on a direct hit (42) and 14.4 at its edge; Nova keeps its double damage, so its bullets are 10% lighter too.
- Nominal's hip fire is a little less accurate (aimed-in is unchanged), so aiming in matters more.

## v0.1.3-alpha (2026-09-30)

Online: everyone needs this version (the page and the server update together; reload if the game says it was just updated).

### No respawns near the end of FFA

- **FFA: no respawns in the last 45 seconds** (online and against bots). When the clock reaches 0:45, "NO RESPAWNS" comes up in the middle of the screen for everyone; from then on nobody comes back, bots included, and a NO RESPAWNS mark stays beside the clock.
- If only one player is left standing after that, the match ends right away (most kills still wins; a tie on kills goes to the one still standing).
- Online: players on an older version can no longer join (reload the page on both devices).
- The round modes (2V2, 2V2V2, 3V3, 4V4) already have no respawns inside a round and no match clock, so nothing changes there. (Their cutoff is set for when they get one: 45 seconds for 2V2 and 2V2V2, a minute for 3V3 and 4V4.) 1V1 has none.
- **The death screen shows the time left in the match**, counting down under your respawn. If your respawn would come after the cutoff it tells you straight away ("NO RESPAWN — respawns end at 0:45") instead of counting down to nothing, and after the cutoff it reads NO RESPAWNS.
- Out for the rest of an FFA match, you can watch anyone still standing (arrows, A / D, or click or tap to switch).
- Joining an FFA match after the cutoff, you watch until it ends.
- Fixed: in the round modes online, the top of the screen showed a red "0:00". It now shows the round and each side's points.
- Fixed: online, a weapon pick sent by a player waiting on the bench raised an error on the host. It is now ignored.
- On a phone held sideways, the spectating bar no longer sits over the death card. On an upright phone, the online match clock sits top left, clear of the SCORES button.

### Balance pass

Every weapon's numbers were retuned (2026-09-30) so fights end sooner and are decided by hitting your shots, dodging and timing your abilities. Nothing new was added: same weapons, same abilities, new numbers. Time to kill below is from full health (100) with every shot landing.

- **Nominal**: 6.8 a bullet (was 4.4), one every 0.2 s (0.165). 15 hits kill: about 2.9 s up close, 4 s at 22 m (was 5.5 / 6.8 s). A 20-round magazine now holds a kill with a third to spare. Aiming in is a touch less pin-point at range (still tighter than the Sidekick). Grenade core 42 (58). Nova lasts 4 s (5) and cuts damage taken by 15% (30%).
- **Ballast**: a tighter cone (hip and aimed) and pellets that keep their power much further: one hip shell at 5 m does about 41 (about 14 before), 6-8 m is a real fight, 12 m still isn't. Up to 70 a shell (60). Reload 2.2 s (2.5). The double shot kills out to about 4 m.
- **Omen**: diamonds 9.4 (7.2), full damage to 13 m, reload 1.35 s (1.8): about 6.3 s alone (9.8). The curse is still the payoff but lighter: primed shot 12, curse ticks 1.4-2.2, rupture 20 rising to 28 in the last second (27 to 34), so timing it late still pays; covenant diamonds 6 (9). Best curse + covenant combo about 3.2 s.
- **Sightline**: the stance rifle now always kills from full health (100-104; it was a coin flip at 98.6-101), paid for with a 4.8 s reload (4.2; Breach loads as long). Breach 158 direct (about 160). The sidekick sidearm: 7-7.8 a shot (4.6-5.4), 14 rounds (10), about 4 s to kill (8), a quarter slower than the Sidekick.
- **Sidekick**: 8.2-9 a shot (5.6-6.4), 12 rounds (10): 12 hits, about 3.2 s (6.3). Mines 24-36 (34-46) and refill in 25 s (30). Rush 6 s (8) at 1.6x fire rate (1.75x).
- **Sheath**: slashes 15-17 (12-14): 7 hits, about 2.9 s (3.4). Draw-cut and three slashes always kill now (it averaged 99). Gold Rush 45% faster (35%), every 10 s (12).
- **Ichor**: Frenzy now out-damages plain slashing: every strike 6.5-18 by blood (3-9; a slash is 6-17) and they come faster, 78-216 in all (36-108). It kills on its own from half blood (about 1.7 s); at full blood on its 6th strike, about 1.1 s (it needed all 12). Blood slash 16-20 (12-16) and still costs you about 7 health. The guard soaks 14-18 (8-12). Slashes unchanged.
- **Static**: the lightning stream back to full strength and fading less with distance, so a full orb bar kills at its whole 8 m reach. Orbs, volleys and the hex unchanged.
- Settings > Controls, the Sidekick's description and the tutorials now read the numbers this pass changed from the game, so those can't go out of date again (Ichor's slash range, Ballast's fall-off and the blood slash's health cost were wrong before).

### Bots fight like players

Bots fight like players now instead of walking after you forever.

- **They back off and come again.** A bot that is hurt and just got hit, reloading with you close, losing the trade (taking more than it deals), outnumbered, or chasing someone it can't catch now gives up the chase: it backs off to cover (still shooting), catches its breath or reloads, and comes back from a different side a few seconds later.
- **They pick their moment.** When you are low, reloading, just used your big ability or are alone, a bot presses in hard and uses its own ability. If it has held its range a while it takes the initiative too: it pushes in, or goes round to flank you. No more bot sitting at the edge of your screen waiting.
- **Every bot has a personality.** Aggressive bots press early and chase longer, cautious ones back off sooner, flankers come round the side, snipers hold their distance. Two bots of the same kind don't switch on the same beat.
- **They move better in a fight.** Varied strafes and quick side switches (hard bots), a little in-and-out peeking, and they walk in at an angle instead of straight at you. Closing on a longer gun that's aiming at them they jink side to side (otherwise they come straight in), and a chase that isn't really gaining on you is given up. They dodge a big ability they see coming (a charged Scatter, a Frenzy, a draw-cut, Surge) and dodge away to break a chase.
- **Each weapon fights at its own range.** Nominal holds 8-15 m, Ballast gets inside 5 m, Omen and Sidekick at mid range, Sightline far back. A gun bot kites a blade just out of its slash and dash now, not out past its blood wave (it couldn't be caught before).
- **Static bots actually throw volleys.** They used to keep their orb bar for a hex that rarely came, so they placed two orbs and only ever streamed. Now they fight at mid range, build 4-7 orbs and launch them, stream only when someone is on top of them (or is a blade or a Ballast), and step back while their orbs refill. Normal Static bots also save up for their hex and throw it from mid range.
- **Ichor and Sheath bots can close in.** They dash in from a dash or two away (saving a dash for it), at a good moment: you reloading, your aim off them, you backing away, or when they press. Ichor uses Frenzy once it is trading blows, and its cut is judged by its wide arc (it used to hold its swing right after dashing in). Sheath uses Gold Rush to close from 6-15 m, not to wander. Coming back from a reset, a blade hides a dash away from you to spring from.
- **Teams:** bots peel for a teammate who is nearly dead (they go for whoever is on top of them) and still spread out rather than all chasing one target.
- **Difficulty:** easy bots are more passive (press later, over-chase, back off late); normal is about as deadly as before and hard only a little more (under 10%), even though Static bots now actually fight. In hard bot-vs-bot duels Static bots went from winning about 1 in 9 to about 1 in 6 and Ichor bots to 1 in 4.
- Bots still never shoot you from off your screen, still keep out of the storm (their dodges too), and the FFA no-respawn cutoff is unchanged.

### Static's hex

- **Fixed: enemies could get into Static's hex and hit you inside it.** Anyone running, dodging or dashing at it (bots especially: Ichor, Sheath, Ballast up close) got through its wall, and once inside their hits landed. Now nobody on the other side can get in for the hex's whole life (spreading, full, holding, and spinning after the pulse): walking, dodges, dashes, Gold Rush, the Draw-cut and knockback all stop at its wall. Someone already inside when it grows over them is pushed out as before and can't go deeper, and nothing they do hurts you while you're inside. Slashes, blasts, curses and mines from outside don't reach in either.
- **The hex is a bit smaller:** at full size its corners reach 10 m from its centre (was 12), and it still takes the same time to spread out.
- **Bots understand the hex:** they stop firing into it, back off out of reach of its spinning sides and wait it out (or go after someone else), instead of running at its wall. They never back off into the storm to do it. Easy and normal bots wait close enough that its spinning sides still catch them now and then; hard ones keep clear.
- Someone else's knockback (a Ballast shell's shove) can't push you into another team's hex either.
- Online: right after a hex is pulsed, joiners no longer get pulled back out of it while it spins.

### Older browsers

- **Fixed: the game now starts on older Macs.** On Safari before 15.4 the title showed a giant, cut-off "deadsta" with no blood and the buttons did nothing. The game now fills in the missing browser features and is built for older browsers.
- If the game ever can't start, it now says so (with your browser version and a RELOAD button) instead of leaving a dead menu on screen.

## v0.1.2-alpha (2026-09-30)

- **HOST** no longer asks for a map: CREATE GAME opens the room on the map you're on, and everyone votes on the map when the round starts (PRACTICE still picks it in the lobby).
- **Robots are now called bots** everywhere you see them: BOT 1 in the lobby and scoreboard, + BOT, "bots fill seats", the BOTS page, match results, the developer tools (Bot lab) and the admin page.

## v0.1.1-alpha (2026-09-30)

### Online on the game server
- **Matches now run on Deadstab's own server** (play.deadstab.com) instead of in the host's browser: no host advantage, and a match no longer ends when the person who made the room leaves or switches tabs.
- **JOIN lists open rooms** for every map and mode. Pick one and you're in; they start by themselves a few seconds after someone joins, and robots fill the empty seats. Filter by map, by mode, and fewest or most players first.
- **HOST** makes your own room with a 5-number code to share. Whoever made it runs the lobby (mode, settings, robots, START).
- **Map vote**: when a round starts, everyone votes for the next map on its picture; most votes wins, a tie is a coin flip.
- **Robots fill seats**: an ON/OFF switch when you host (always on in listed rooms).
- Fixed: JOIN and HOST connected to the server but left the game after a few seconds without letting you in.

### Menus
- The JOIN filters are laid out like HOST's mode picker, and their lettering fits the buttons and matches the rest of the menus. The room list is shorter, so the page doesn't have to shrink as much on phones.

### Developer tools
- **Robot lab** (Robots > Robot lab): place robots on spots and watch them fight round after round from full health, with fixed, random or every-weapon-against-every-weapon line-ups, a free or follow camera, live health, ammo and ability readouts, and results by weapon and line-up (win %, K/D, damage, time to kill), with a CSV download.

## v0.1.0-alpha (2026-09-30)

### Deadstab
- **The game is now deadstab** (it was deadshift): the title, the loading screen, the app name and the GitHub page. Your settings, controls, tutorials and saved picks carry over by themselves.
- **New version numbers**: this is v0.1.0-alpha, after alpha v0.996. The title screen and the game show v0.1.0; the browser tab shows just "deadstab"; Settings shows the full version at the bottom.

### Menus
- **PLAY** replaces GAMEMODES on the title: bright white, its lettering drawn over the blood.
- After PLAY: **JOIN, HOST, BOTS, TUTORIAL, PRACTICE**. JOIN is the username and room code; HOST is the username, map, mode and one row (ROUNDS, or the match length in FFA); BOTS is the old SOLO page cut down to mode, map, your weapon, rounds and difficulty. Every other setting moved behind the developer tools.
- **ROUNDS: 3, 5, 10 or ∞** everywhere (online and bots): that many rounds, most wins, over as soon as nobody can catch up, a tie plays one more round at a time.
- Menus never scroll on phones; they fit the screen.
- **SKINS** on the title, under TUTORIAL (the page is ready for skins; nothing on it yet). The word stays where it was; the buttons grow downward.

### Modes
- **4V4** online and against bots (up to 8 players in a room).
- **FFA** ends when its clock runs out (5 or 10 minutes); most kills wins; respawns after 6 s.
- **FORFEIT**: in 1V1 it hands the match over; in team modes the whole team has to vote.
- **No friendly fire**: teammates can't hurt each other any more, online or against bots.

### Dying and the end of a match
- **1V1**: 3 s of aftermath zoomed in on the kill for both players, then a quick FORFEIT / QUIT card for the one who died while the killer's stats panel shows their score turning over; both back together about 5.6 s after the kill.
- **Team modes**: the card on the right has VIEW STATS, FORFEIT (a vote) and QUIT while you watch your teammates.
- **The end-of-match card**: everyone's name and stats; online READY or LEAVE (the next match starts as soon as everyone is ready; the host can go to the LOBBY), against bots PLAY, CHANGE SETTINGS or QUIT.
- **New scoreboard** (hold Tab, or SCORES / VIEW STATS on touch, also while you're down; the end card): bigger, in the game's stretched lettering, one list from most kills to least, each row in its team's colour; in FFA 1st and 2nd get gold and silver rows. Also against bots now. It never pops up by itself: the round's winner sees their score turn over at the top instead.
- Fixed: the death card sometimes not showing, players showing at their old spot for a moment when they respawn, and the ROUND popup (and other game pop-ups) staying on the main menu when you leave a game right away.

### 1V1 duel circle
- **Every 1V1** (online and against a bot) is fought inside a circle a little over a quarter of the map across, somewhere new each round and always inside the map's fences. You start on opposite sides of it and can't walk out; shots go through. Robots stay inside it too, and a circle always leaves room to fight (never mostly buildings).
- It's a thin, see-through wall of mist with a soft red foot, lower and thinner on the side toward the camera; where you walk up to it, it firms up and turns red. The map (M) shows the ring.

### Weapons, robots and health
- **Sniper under maintenance**: Sightline shows with an "under maintenance" sticker everywhere weapons are picked, and nobody can use it for now (robots included).
- **Nominal** holds 20 rounds (was 28).
- **Death screen**: just DEAD for the first second, then the buttons; "hold tab for the scoreboard" sits in the red where it's easy to read.
- Fixed: the winning point of a match now shows on the top score and its segments (it used to stop one short).
- **100 health**: every player has 100 health, and every weapon's damage, every heal and every health bar is scaled to match (a fifth of before), so fights play exactly the same; only the numbers changed.
- **Robots aim more like people**: normal robots miss more (most of all with Omen and with melee, where they now misjudge swings), easy robots are much easier, hard robots are sharper and quicker. Robots with Ichor now raise its guard against gunfire, and Static robots finish a nearly dead player with a quick shot.
- **Ballast**: after the first X, a timer at the cursor counts down the 3 seconds until Scatter is ready.
- Developer tools only: a prototype first-person view (Display > First-person view; keyboard and mouse). Players without the tools notice nothing. Files: src/fps-mode.js (new), main.js, render/renderer.js, ui/dev-options.js, tests/fps-mode.test.js. No protocol or golden-replay change.

### The storm
- **A red storm closes in** every round in 2V2, 3V3, 4V4 and 2V2V2 (online and against bots): 2 minutes to a new final circle, 30 seconds held there, then sudden death as it closes to nothing. In FFA it closes slowly over the whole match and holds a small final zone for the last 45 seconds, with the screen building tension.
- Out in it you lose 15 health a second in quick ticks, with a rising static drone (no damage numbers or hurt sound for it). It's drawn with red over everything outside, lightning crawling in at the edge and striking across it, and a readout under your health bar.
- Respawns always land inside the safe circle; robots keep out of it.

### Bots
- **FFA against robots**: BOTS has an FFA mode — you and five robots, everyone for themselves, for 5 or 10 minutes; most kills wins. Everyone comes back 6 s after dying, inside the storm.

### Syphon
- A kill now gives its killer **50 health in FFA** (online and against bots) and **25 in the other modes**, up to full health (it used to be half the health you had lost).

### Hollow Wick
- **The goat can be killed**: shoot it over its pen's hurdles, or cut it through them with a blade. It dies in a heap of gore, and its head drops onto the pile.

### Graphics
- **Fixed: shadows flickering while you walk on the hills** (Hollow Wick most of all, every preset): the shadow map used to be resized every few metres on hilly ground, which nudged every shadow edge at once. It now keeps one size for the whole map.

### Other
- **Bigger damage numbers** for the damage you deal.
- **On phones** the score against bots sits at the top left (it was hidden under the top buttons).
- Fixed: the first blood of a game could stutter for a moment while it prepared (it is now ready at load).

### Network
- PROTOCOL_VERSION 23: everyone in a room needs this version (older builds can't join).
- Online rooms now use deadstab's names, so v0.1.0-alpha players and older builds don't see each other's rooms.

## alpha v0.996 (2026-09-29)

- **Shorter address:** starting a game from the menus no longer fills the address bar with the map, weapon and robot settings; the page stays at its plain address (a reload opens the menu on the same map).
- **Extreme from the first second:** the loading screen now waits until the graphics card has finished preparing every shader, instead of opening the game while it was still working (which ran at about 20 fps for the first 20 seconds on a fast PC). The frame pacing can no longer hold a fast screen back either.

## alpha v0.995 (2026-09-28)

### Loading
- **Never stuck loading:** on some browsers (a MacBook here) the game waited for good for the graphics card to finish preparing, so the loading screen never left and the menu under it did nothing. Every wait now has a limit; the game always opens. The stretched title word is measured and fitted on browsers that drew it too wide.
- The loading screen shows just the word (no blood), its wheel turns red to pink and back, and it is gone the moment the game is ready (no minimum time).

### Players
- You still play the cowboy. A new rigged figure (white or light blue, in the developer menu for now) walks, runs, dashes, kneels and breathes with real limbs, holds every weapon in its hands, and bleeds and dies like the cowboy.
- Sightline: crouch with E any time, even moving or unloaded; the rifle reloads on the move.

### Modes
- **Every mode but FFA is now played by elimination**, in SOLO (1v1, 2v2, 3v3) and multiplayer (1v1, 2v2, 2v2v2, 3v3): nobody respawns alone; when a side has nobody left standing, the other side takes the point and everyone comes back at full health at fresh spots. FFA and practice are unchanged. The match ends at the score limit or the clock.
- **Spectating:** when you fall with teammates still up, a few seconds into the death screen the world behind it follows a teammate; switch with the arrow keys, the arrow buttons, or a click or tap. You can only watch your own side.
- Between rounds the score comes up big in the middle, the new point rolling in, with five seconds before everyone comes back.
- Each round starts with a "ROUND n" popup in the middle, and the round is on the scoreboard (and the VS ROBOTS score). While you are down, the game behind the death screen goes dull and grey until you are back.

### Crops
- Crops no longer hide anyone and no longer darken the screen; they still burn.
- Swords and Ichor cut the stalks their blade actually passes through (and a little past), which fall over along the cut, instead of whole square patches.

### Smoother play
- Firing and explosions no longer stutter: bullet holes and scorch marks find their surface and are cut many times faster (a blast's marks went from about 37 ms of work to about 4), Static's orbs and beams are reused instead of rebuilt, the Hex's spin checks only nearby props, and the game makes much less garbage each step.
- Effects send only what is drawn to the graphics card.
- **Faster frames everywhere:** the game no longer waits for the graphics card to finish one frame before starting the next; the sand and wood grain below Extreme are painted in instead of computed every frame (same look); Quality's shadows redraw a little less often; several on-screen overlays stopped redrawing every frame; the frame limit now defaults to your screen's rate. Potato is sharper and smoother, and its ground has grain.
- **Lighter graphics below Extreme, same look:** still things' shadows are drawn once and kept (only moving things redraw), matte surfaces use cheaper lighting that gives the same picture, Balanced and Quality draw the 3D smaller and bring it back with an FSR-style sharp upscale, fog is only drawn where there is fog, off-screen scenery is skipped in chunks, and iPhones and iPads use a cheaper anti-aliasing. Extreme is untouched.
- No more white flashes when loading into a game or changing graphics: any loading shows the spinning wheel, centred, on the dark loading screen.

### Online
- Much less lag on weak connections (phone hotspots): inputs are about a twelfth the size, positions travel on a fast channel that never waits for a lost packet, joiners buffer by how late updates really arrive and predict briefly when one is late, and the host smooths other players' movement. Joiners need the new version (protocol 19).

### Weapons
- **Sightline's rifle** now fires past every obstacle (trees, fences, stone walls, rocks, graves, furniture) except buildings and their walls; the laser and the robots follow the same rule.

### Maps
- **Hollow Wick:** roofs no longer vanish when you stand against a wall: the edge fades softly just where it covers you, with no ceilings showing; the four interior corner clippings are fixed; the meeting road now leads to the meetinghouse's east door.

### Menus and HUD
- SOLO and lobbies: just easy, normal and hard; the choice buttons match the other buttons; map and weapon lists open over the page and scroll instead of pushing it down.
- Full screen is now just the V key (in Controls); the screen settings are gone. Menus always show the normal mouse pointer.
- The team score at the top matches the rest of the game's look.
- Touching the screen switches to touch controls; switching graphics to Auto can no longer leave the game blank; the tab icon is the new one.

## alpha v0.994 (2026-09-28)

### Sheath, a new weapon
- A white broadsword in a black sheath. The first cut draws it (a little slower if you draw on the move); it goes back in when you stop. Heavy, wide cuts for 60–70 to everyone in the swing, about two a second, each swing flowing from where the last ended. You walk 2% faster with it sheathed and 12% slower with it out.
- **E Gold Rush:** three seconds of faster movement with a gold trail. The sword comes out with a see-through gold blade over it that doubles its length and its reach; it pops in with a white flash and dissolves into gold motes when the rush ends. No slowdown for having the sword out while it runs; keep attacking.
- **X Draw-cut:** a quick hop back, a split second set with a gold line showing where it will go, then a dash straight ahead the way you faced, up to 7.5 m. Everyone it passes through takes 290–310 and every breakable on the line is cut; step off the line during the set and it misses you. Walls stop it. It leaves a huge engraved gold slash along its path that lingers, then burns away. 35-second cooldown.
- Its kills take an arm off, sometimes both. Robots can use it too, and it has its own short tutorial.

### Menus
- The map pick is two across and scrolls, like the weapon menu, with the same card and text sizes.

## alpha v0.993 (2026-09-28)

### Graphics
- **Auto graphics:** Settings > Graphics has a new Auto choice, on by default. At each start it picks Performance, Balanced or Quality for the device from its graphics chip, cores and memory (phones Performance, flagship phones Balanced, gaming PCs Quality). If it runs well short of its frame target it takes the next preset down at the next start, and climbs back once things run smoothly. A preset picked by hand stays.
- **Changing preset no longer freezes the game:** the last frame stays up with an APPLYING GRAPHICS note while the new shaders build in the background, then play carries on.

### Loading
- Faster loads: the title's blood intro waits until the menu is on screen instead of running behind the loading screen, Deadwater's Quality-only dressing is only built for Quality and Extreme, and several textures (crop beds, sand and wood grain, Hollow Wick's drag trail) are made far faster.

### Menus
- The weapon menus show each weapon's picture and name only (no descriptions) and fit a phone either way up: three across upright, one row on its side. The in-game weapon pick fits the same way.

### Sightline
- The rifle reloads itself in the stance whenever it is empty; standing up or moving cancels that reload. No laser until a round is loaded.
- No more NO SCOPE text indoors or in crops: the scope simply doesn't come up there.

## alpha v0.992 (2026-09-28)

### Aiming on phones and keyboards
- **Sightline's stance without a mouse:** crouched, you can't walk, so the move stick (or WASD / the arrow keys) steers the laser: toward you or away is range, across is side to side, faster the further you push. It answers at once. With aim assist (Settings > Mobile), side to side only: the laser follows half of a target's sideways movement by itself and drifts onto it while you push; you do the rest, and moving targets still have to be led. A swipe on the right of the screen jumps the laser to the enemy that way; a tap anywhere fires along it.
- **AIM on phones:** a tap-on / tap-off switch for Sightline's rifle in the stance (it lights up while on); held everywhere else. The Sidekick, and Sightline's Sidekick, get the Nominal's AIM + FIRE slice at the bottom of FIRE; in the stance FIRE is whole again.
- **The laser is always there when it should be:** the rifle reloads itself after each shot, a reload no longer makes you let go of aim and press it again, the Sidekick's reload no longer blocks the rifle's scope, and the HUD says when there is no scope (indoors or in crops).
- The Sidekick's spread brackets no longer flicker on phones.

### Robots
- No more stalls the first time a robot's gun comes on screen (or its hidden parts, like a reload's magazine): every weapon's gun is prepared while loading.
- Robot skill, aim and temper open at normal every visit (SOLO and hosting); the developer tools' robots default to normal too. Robots leave footprints.

### Hollow Wick and Deadwater
- Ceilings under the colonial roofs: no more seeing into rooms from against a wall. Roofs lift whole from a doorstep.
- More fog over Hollow Wick's stream; Deadwater's dust is a drier ochre. Hollow Wick's lobby shows the meetinghouse; its map card no longer has a line of text over the picture.
- People in crop fields are hidden from others and from robots.

### Weapons
- Ichor cuts through crops, its guard turns only rounds that meet the blade's side, its E wave costs you half its hit in blood, and its slashes draw over footprints and blood.
- A hex's wall stops rounds. Omen's curse marks move smoothly. Blood flecks on a held gun stay drop-sized (they were huge squares on some guns, often in multiplayer).

### Multiplayer
- Pick the map when hosting; the host can change it from the lobby (everyone moves with the room).

### Look
- The in-game corner shows just the version (like v0.992a). A new pink blood-splatter icon.

## alpha v0.990 (2026-09-27)

### Hollow Wick is out
- Hollow Wick is in the menus: the second map card on the Practice page, on the SOLO page and in the lobby's map list, no developer tools needed. Deadwater is still the default.
- Its card picture is new: the meetinghouse and its belfry, the burying ground below it with the hearse house, and the woods' autumn line down its side.
- A stronger dusk: the light is about a quarter lower, the glow warmer, the haze and fog darker. Coats, team colours and blood still stand out on every ground (the burnt-orange leaves lying on the ground are a shade brighter so blood never hides in them).
- Standing under a roof's edge now lifts that whole front section of the roof, not a small circle, and the see-through patch walls open round people is bigger.
- Nobody inside a building, open sheds included, can be seen from outside it, and their roof never opens a patch that would show where they stand. Inside a shed, its roof lifts for you as your room.

### New weapons: Omen, Sightline, Sidekick and Ichor
- **Omen:** orange diamonds and a creeping curse. Prime a shot, then rupture its mark just before it fades.
- **Sightline:** a long rifle and a modest Sidekick pistol. Press E to crouch and set up for precise, slow, hard-hitting rounds with a public laser and a narrow scoped view; X loads the explosive Breach round.
- **Sidekick:** a quick sidearm on its own. E plants hidden mines (two at a time), X is Rush: eight seconds with a second gun, running faster and firing both.
- **Ichor:** a blood-fed katana. Flowing cuts that hit harder the more blood it holds, a dash slash, a guard on right mouse / left shift that soaks 40-60 damage, and Frenzy at full blood. Fresh blood trails speed you up.
- Each has its deaths, sounds, tutorial, robot tactics (robots use Sightline's lanes and scans, and fight indoors only with what they have seen), and a menu picture; Ichor's now fills its card.
- A damage indicator shows where hits come from.

### Robots
- Robots pick their firing spots correctly on every map (Deadwater's robots included).

### Performance
- No more small hitches the first time a roof comes into view, the first Static orb flies, or a new tumbleweed rolls in: their shaders are built while loading again. Hollow Wick's town is still 71 draws a frame on Potato and 162 on Performance.

## alpha v0.985 (2026-09-26)

### Hollow Wick (developer tools > World > Map in progress)
- Walking under a tree turns that whole tree see-through: its leaves nearly vanish and its branches fade away above you, easing back to solid toward the trunk, so nobody hides under a tree and the trunk is still cover you can see. Standing behind a tree from the camera's side does the same.
- No more speckled noise: the see-through patches that roofs, walls and trees open round people are smooth fades now.
- The body pile by the stream is solid where its bodies are, instead of stopping you short on its dry side while you walked into it from the others.

### Performance
- The smooth fades cost an extra draw only while a patch is actually open, and each building's walls fade on their own rather than a whole street's at once: Hollow Wick's town stays at 72 draws a frame on Potato and 163 on Performance.

## alpha v0.980 (2026-09-26)

### Hollow Wick: the stage 5 review (developer tools > World > Map in progress)
- Rounds fly over knee-high things, as they already flew over stumps and logs: washtubs, chopping blocks, troughs, headstone stumps, the stocks, the plough, the cairns. Someone standing behind a knee-high tub can be hit, and robots shoot over them too.
- No more squeezes a player can slip through but a robot can't: the grindstone, the hay wagon (now drawn up against the barn) and the plough moved.
- The coffin lid leaning on the hearse house is solid, the rowboat's whole dry hull is solid, and you can walk right up to a stone pile's stones.
- Nobody hides behind a building any more: the eaves on the north sides of the roofs are shorter, the see-through patch a roof opens over someone now sits exactly between your camera and them (it fell short toward the top of the screen), and the walls of the village's buildings open the same way from the waist up, so someone pressed against a north wall shows.
- Wading under the bridge, the log or the footbridge, you can no longer walk straight up out through its end: the abutments stop you, and you go out from under a side and up the bank round the end.
- The forge, the horse sheds and the woodshed bring the camera in and grey out what their walls hide, like every other room.
- Inside a building, its own walls are never greyed out: no more grey patches on the walls, the window heads or the pulpit where no window was.
- The loose shutters now bang against their walls in the gusts and the tavern sign's hooks squeal at the end of a wide swing, even behind you; the chimney smoke fades with its roof when you go in.
- A missing shingle is a gap of one or two, not a long black slot; chopping blocks stand only by woodpiles and troughs only on level ground; the barrels' and the washtub's water sits in them, not over the rim; puddles by the troughs only where the ground is level; the rails' churned mud lies on the ground; the straw and spilled grain are faded so they never pass for an Amber hat.

### Performance (every map)
- The same picture for fewer draw calls: each patch of scenery and each roof is drawn once where it was drawn twice (the shadows still come only from what casts them). Hollow Wick's town, shadows included: Potato 80 draws a frame down to 71, Performance 165 down to 162, even with the village walls' new see-through batches.
- Roofs are drawn before whatever stands under them, so the floors, tables and hearths of closed houses are no longer shaded and then painted over.
- The see-through patch that roofs and tree limbs open over players costs a fraction of what it did, and nothing about it is allocated a frame.
- Every map loads a little faster: the chimneys that stand over a room's fire are placed from saved numbers instead of laying out every room when the game starts (190 ms to 110 ms).

## alpha v0.975 (2026-09-26)

### Hollow Wick, stage 4: development (developer tools > World > Map in progress)
- Wading under a bridge or the log, what you make stays down there with you: your orbs, their beams and streaks, casings, shells, dropped magazines, smoke, sparks and blood are drawn under the deck, not on its top. Someone up on the deck keeps theirs on the deck.
- The owner's additions to the soundscape: now and then every sound simply stops for a few seconds and comes back; a faint scraping and digging by the open grave, in runs, that stops dead when you come near and waits until you have gone; the crows sometimes fall silent all at once after a last few caws.
- Crows sit on the body pile by the stream and fly off when someone comes near, drifting back once it is quiet again; the crows that come down to the dead caw as they land.
- Roofs never hide someone standing outside under them: the meetinghouse's portico, the hoods over the doors and the eaves open a small see-through patch over anyone standing there, yours and theirs, so a hat is never lost under a roof.
- Under the open forge, the horse sheds and the woodshed you stay outdoors: no indoor camera and no grey shroud, only the roof lifting over you.
- The tomb vault is fieldstone all round, and the body in the rocking chair now sits on the gambrel's stoop, which runs on past the door for it.
- Props sit on the land properly: stone piles, boulders, tombs, crates and sacks no longer hang off slopes, and the graveyard's walls step down the hill stone by stone instead of sinking into it.
- You can no longer walk into the hanged man or through the well sweep's stone; boulders are no bigger than they look; the fork's walls are no longer doubled, and field walls no longer run through a stalk patch or a corn shock.
- The corn crib has a proper shingled roof with a hole in it, and the troughs are open with dark water standing in them. Pumpkins come in their sizes.
- More breakables where the land was bare: lanterns, crates, grain and crocks at the crossings, windfall crates by the old orchard, cordwood at the woods' edges.
- Robots no longer hide and fight from under the bridge, and when anyone is under a bridge or the log it turns see-through for everyone, not only for whoever is under it. Robots walk across the mill dam, and no longer stand still for a minute at a spot they cannot shoot from.
- Every house now tells its own story inside: a laying-out room with a coffin on two chairs and the candles burnt down, a weaver's room with the cloth half woven on the loom, a kitchen with the stew left in the kettle and bare footprints in the spilled flour that stop at the hearth, a parlour laid for the whole family with the chairs pushed back, a nursery with the cradle rocked to one side and tiny shoes by the door, and a farmhouse with the cellar thrown open and its back door barred from inside. Salt across a threshold, a witch mark burnt into a beam, a cloak still on its peg.
- The horse sheds have their stalls and mangers, the hearse house its bier, the woodshed its stacks; furniture no longer stands in front of open windows (a round through a window now flies on into the room), the fire inside the tavern and the smithy is under their chimneys, and robots can reach every corner of every room.
- Team respawns at a base never come up in sight of an enemy standing in it while another spot will do, and base A's spawns are off the main street. Free-for-all respawns spread over the map instead of piling up behind Church Hill. Practice robots added from developer tools no longer come in in the water or on steep banks.

### Hollow Wick, stage 5: detail (developer tools > World > Map in progress)
- Puritan justice by the meetinghouse: the stocks with a pair of worn shoes still in the holes, the pillory with its board left lifted a crack, a whipping post worn pale at shoulder height beside the west door, and a granite mounting block by the portico.
- Things left where they were used: hitching rails and a cast shoe before the tavern and the smithy, the grindstone, the forge's raked-out slag, a hay wagon at the barn, rain barrels under the eaves, a plough stopped mid-furrow and a harrow, a scythe on the pasture fence.
- By the graveyard, the parish bier with an open, empty coffin (a strip of shroud caught on the rim), its lid against the hearse house and the digger's barrow by the open grave; on the water, a skiff half pulled out with water in it, an eel pot, a washtub of wet linen, spare millstones against the mill.
- In the woods: a ring of blackened stones round a long-dead fire, two cairns where the back trail enters, and a collapsed lean-to beside a deer's carcass. Whoever camped there never came back.
- The ground tells what went on here: wagon ruts down the street, the slope and the bridge road (older, grassed ones up Church Hill), puddles in their low spots and by the well and troughs, hoofprints where horses stood and cart tracks into the barn, boot prints round the open grave, straw at the barn and sheds, chips at every woodpile and chopping block, the forge's ash and cinders, spilled grain at the mill, leaves drifted against the walls, and bare footprints from the body pile down into the stream that never come out the other side.
- A few things move: a black billy goat in its wattle pen behind the farm that stops grazing to turn and stare at you as you pass, washing flapping on the line, stick figures turning slowly on their strings along the woods' track, loose shutters swinging and banging in the gusts, the tavern's sign creaking, and a thin wisp from one chimney. Someone is home.
- Tree limbs no longer hide anyone behind a trunk: they thin out round a character like the leaves and roofs do, above the shoulders only, so the trunk is still cover you can see.
- Every roof has its own weathered shingle (silvered, brown-grey, mossy, one newer cedar, the smiths' sooty), lighter than the one dark slab the town was.
- More fieldstone piles, boulders and chopping blocks where the land was still bare, spread out rather than heaped together.
- The retaining walls are capped stone by stone in weathered and mossy greys instead of one pale kerb.
- The town's yards have their scatter: trodden grass at the edges, gravel, twigs and leaves blown in from the village trees.
- Leaves on the ground no longer swallow an Amber hat or a rust coat: the yellows lying in the woods are faded, and the darkest litter is a wet brown.
- The overhead map shows every retaining wall, the mill dam as a walkway (it read as open water), the fenced orchard and the hanging tree.
- The map's card picture looks over the meetinghouse and its burying ground, without the practice targets.
- Extreme no longer hitches the first time a slow device has to lighten its shading.

## alpha v0.970 (2026-09-26)

### Hollow Wick, stage 3 finished (developer tools > World > Map in progress)
- Crows never give away someone you cannot see, never sit on the roof over your head, and never come down to a body indoors.
- A body gets one visit: a player's next death takes the crows off their old body, and a robot dying elsewhere leaves yours alone. The crows fly on while you wait on the death screen.
- A broken headstone or post is no perch until it is back (a restart, a restore or joining late all come right), and a crow coming back from off the map glides in rather than appearing on its perch.
- Another player's Static stream hushes the crows like any other gunfire.
- Your own steps in the stream no longer sound twice.
- The hanging tree's three frozen crows are gone: every crow on it is a live one that can fly.

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
