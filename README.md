deadshift alpha v0.8 is a minimalist top down shooter with distinct weapons and explosive combat, playable in the browser on mobile or pc

- three distinct weapons: static, nominal and ballast
- online multiplayer for up to 4 players: host a game, share the room code, and play rounds from a lobby
  - free-for-all with a round clock and kill limit, or practice with targets where nothing counts
  - host settings: spawns, round length, kill limit, health, respawn wait
  - weapon pick at the start of each round, pings, kill feed and scoreboard
- weapon tutorials and solo practice
- built for multiple maps, with more to come; the alpha is tested on deadwater outpost, a desert town with enterable buildings, destructible props and a crop field that burns
- touch controls with an editable layout, five graphics presets

## what's new in v0.8

#### Title screen
- New main menu: the "deadshift" title fills with liquid blood. It pours into the letters, part-fills the holes in the d's and the a, drips from every letter (fast drips and double drips too) and pools on the buttons.
- The blood is attached to the text and buttons, so it never lags when you drag or resize, and it fits every screen, including vertical phones.
- Version above the title; a password-protected dev tools button under the menu.
- The loading screen now matches the title.

#### Gameplay
- Nominal: slight recoil in the hip-fire cone that affects aim and bullets; none while aiming down sights.
- Targets: bullet holes only appear from real bullets. Targets now break apart in stages and throw pieces on Quality and Extreme, and face different directions (never straight up).
- Death: the camera zooms in and holds on the body so you can see the gore, and the menu slides in after a few seconds.
- Walking through blood stains your gun and hat, and bloody footprints now cover the whole print.
- Roofs lift straight away when you walk in through a door, including the big building by the train.

#### Interface
- The top bar uses icons: a map, a speaker (pink with a slash when muted) and a pause button.
- Settings > Controls: General and Weapons are both dropdowns.
- Keyboard HUD hints no longer overlap on narrow windows.

#### Performance
- Static X no longer stutters: pulses and orb blasts reuse their effects instead of building new ones, and nothing new is compiled mid-fight (including on Extreme).
- Breaking props with the X is much cheaper.
- When the game lowers resolution to keep up on phones and laptops, it no longer freezes for a frame.
- The HUD skips work it doesn't need to do, and damage numbers and aim brackets move without re-laying out the page.
- Aim assist and target lock check sight lines more cheaply.

#### Extreme preset
- Cloud shadows drift slowly across the whole map.
- Now and then a dust devil whirls across open ground with the wind.
- Better-lit birds, and more detailed low-poly weapon pictures.

#### Mobile
- Redesigned touch layout editor: a clean toolbar with an icon legend and Swap / Reset / Done buttons, and buttons snap to the screen edge. Your phone gives a small tick when you pick up or drop a button.
- Settings > Mobile puts the layout tools first.
- New Vibration setting: a short buzz when you're hit and a double buzz on a kill.
- The screen stays on while you're playing.
- The grenade button now reads NADE and fits its slot, and every button label is centred in its segment.

full history in [CHANGELOG.md](CHANGELOG.md)
