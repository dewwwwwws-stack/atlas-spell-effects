# Combat+ for Atlas VTT

Spells, attacks and a bit of flair for your Atlas VTT maps.

Hit **Cast** on a statblock, point at the map, and Fireball goes off. The area's drawn, the animation plays, and if you like, everyone caught in it rolls their save and the damage is ready to apply in one click. A goblin's scimitar or a dragon's breath works the same way.

It's a homebrew side project, so expect the odd rough edge. Bug reports and ideas are very welcome.

## What you get

- **Spells on the map.** Fireballs, Lightning Bolts, Spirit Guardians following the cleric around. Spells become Atlas's own areas, so your players see them too, in the player view and on Atlas Online. Click one to edit or end it.
- **Animations.** JB2A's free pack is built in and picked for you, for attacks too (a sword's swing, an arrow's flight) if you want them. Not using JB2A? Spells get a matching colour and look instead.
- **Rolling, if you want it (D&D 5e and 2024).** Attacks, saves and damage rolled against each target's AC and saves, with resistances, advantage and crits sorted for you. Sneak Attack, Agonizing Blast and the like get added in. Apply the damage with a click, or **Apply all** for a whole turn. Players can roll their own saves instead.
- **Buttons on your statblocks.** Cast, Attack and Use next to spells, weapons, breath weapons and Multiattacks, even on Atlas's DM screen.
- **Your own spell library.** Tweak a spell's look once and it sticks. Make up your own spells too.
- **The fiddly bits.** Walls of fire, magical darkness, Misty Step teleports, Thunderwave's push, Chain Lightning leaping between targets, Spiritual Weapon as its own token, difficult terrain, a round counter for lasting spells, and conditions on whoever's standing inside.
- **Pick your look.** Settings → **Animation style**: Atlas areas only (exactly what Atlas Online players see), Combat+'s own drawn animations on top of Atlas's areas (no downloads), or JB2A's animations.
- **Hotkeys** for nearly everything: apply damage, reroll, end a spell, toggle the effects…
- **The SRD, built in** (optional). The free 5e spells and monsters, ready to drop into your vault.

The effects work with any game system; the rolling is D&D 5e only. Only want the eye candy? Turn rolling off. Only want the rolls? Turn the effects off.

*This used to be called **Spell Effects for AtlasVTT**. Same plugin, same settings, new name.*

> Fan-made and unofficial: not made or endorsed by [Atlas VTT](https://community.obsidian.md/users/atlas-vtt), Atlas Online or JB2A.

## Needs
- **Atlas VTT** (tested with 0.15), on desktop. Atlas 0.15 or later for spells as Atlas areas.
- Obsidian 1.10 or later. Spell bases need the Bases core plugin on.

## Install
Settings → Community plugins → Browse → search **Combat+** (or *Atlas*) → Install → Enable. Then open an Atlas map: ✨ is in Atlas's toolbar.

## What it reads, writes and downloads
- **Network:** the only thing it fetches is JB2A's free animations (the built-in SRD is inside the plugin, not downloaded), from JB2A's public GitHub (`raw.githubusercontent.com/Jules-Bens-Aa/JB2A_DnD5e`). That happens when you first use an animation, when its preview picture shows in the cast window, or when you press *Download everything*. Turn *Offer every JB2A animation* off in the settings and it fetches nothing at all. No tracking, no accounts, nothing sent anywhere.
- **Your vault's file list:** to find your spells and animations it looks through the names of the vault's files and the properties of its notes: notes with saved spell settings, notes in the Bases you pick, spell notes (if *Also find spell notes anywhere* is on), and animations in the JB2A folder and any *Spell Effects* folder (or the folders you pick). Its folder and Base pickers in the settings list your folders and Bases. It only reads the notes it's found as spells.
- **Your vault:** it saves downloaded animations, and a JB2A credit and licence note, in the JB2A folder (`JB2A_DnD5e`). *Save* writes `effect-…` properties onto that spell's note (and *Delete* takes them off again). A spell of your own (*Save as new…*) gets a note, and a Base, in its own folder (*Spell Storage*); *Delete* puts that note in Obsidian's bin. **Add SRD notes** (only when you ask) writes SRD creature and spell notes into its own folder (*Combat+ SRD*), never over a note that's there. It never deletes or changes anything else.
- **Atlas:** it reads the open map (grid, tokens, view) and adds lights and walls for lasting effects when you ask for them. It removes those again when the effect ends, and doesn't add them to your undo history. A spell that is difficult terrain adds a map feature of its shape, and a summoned thing adds a token (its picture, a small coloured disc, is saved in `Spell Effects/Summoned`); both go when the spell ends. Spells that push, pull or teleport move tokens with Atlas's own move, so Ctrl+Z puts each back. It relies on Atlas's internals, so an Atlas update can break something until this add-on is updated.

## Animations
- **JB2A's free pack is built in.** All of its animations and colours (about 2,100) show in the cast window from the start, marked ⤓. Each is fetched from JB2A's own GitHub the first time you use it and saved in your vault (in `JB2A_DnD5e`, which you can change), so after that it works offline.
- **Download everything:** Settings → Combat+ for Atlas VTT → *Download everything* fetches the whole pack at once (about 1.2 GB), for a game with no internet. You can stop it and carry on later. If your vault syncs, it syncs too.
- **Already have JB2A in your vault?** It's used as it is. Nothing is fetched twice.
- **Your own**: put `.webm` (best: video with see-through background), `.gif`, `.webp` or `.png` files in a folder called **Spell Effects** (or pick folders in the settings). Name them after the spell ("Moonbeam.webm") and they're picked for it.
- Or none at all (turn off *Offer every JB2A animation*): the add-on draws the area itself, a glowing circle, cone, line, square or wall, coloured to match the spell. Fire spells are orange and flicker, cold ones pale blue and shimmering, lightning bright blue, acid and poison green, radiant gold, necrotic dark purple, thunder, force and psychic in their own colours, and healing green. A spell with no damage type uses its school's colours. With *Spells as Atlas areas* on, Atlas's own Fire, Frost, Lightning, Radiance and Shadow looks match it too. Change any colour or motion in the cast window, and *Save* keeps it for that spell.

**Credit:** JB2A — Jules & Ben's Animated Assets (free pack), by Jules, Ben, gazkhan and wassily, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). A credit and licence note is saved beside the downloaded files. Support them on [Patreon](https://www.patreon.com/jb2a) for the full pack. Because of their licence, this add-on is and stays free.

## Spells: your Bases
The add-on finds your spells through **Obsidian Bases**: every note a Base shows is a spell it can cast. Its area, light and walls are read from the note's text (and from "**Range:**" and "**Duration:**" lines). It works like picking loot bases in Atlas.

### Setting up a spell Base, step by step
1. **Turn Bases on.** Settings → Core plugins → **Bases** (it's on by default in Obsidian 1.10 and later).
2. **Have your spells as notes**, one note per spell, with the spell's text in the note (the bit that says "20-foot-radius sphere", "60-foot cone", "Duration: Concentration, up to 10 minutes"…). Imported compendium pages, a 5e.tools or Plutonium export, or your own homebrew notes all work. Properties aren't needed, but `level` and `school` help.
3. **Make a Base that shows them.** Right-click the folder your spells are in → **New base**. Or use the command palette: **Bases: Create new base**. Give it a name, for example `Spells.base`.
4. **Filter it to your spells.** Open the Base, click **Filter** and add one that matches only spell notes, for example:
   - *the folder:* `file.inFolder("Compendium/Spells")`;
   - *a tag:* `file.hasTag("spell")`;
   - *a property:* `level` *is not empty*.

   The table should now list your spells and nothing else. A Base made by right-clicking a folder already has the folder filter.
5. **Pick it in the add-on.** Settings → Combat+ for Atlas VTT → **Spell bases**: start typing the Base's name and pick it. The line under it says how many notes it found (for example "312 notes"). "Bases is off" means step 1, and "Not found" means the Base was moved or renamed.
6. **Check it.** Open ✨ → **Cast a spell effect…**. Your spells are listed, and the ones whose text names an area are under **Spells with an area**. Search for any of them by name.

Good to know:
- You can pick several Bases (core spells, homebrew, a setting's spells…). A Base with several views counts every view.
- A spell whose text names no area (Shield, Mage Hand) is still listed when you search for it. Set its area in the cast window and press **Save**.
- Without any Base, notes whose properties have a `school` and a `level`, or that have a `spell` tag, are still found. Turn *Also find spell notes anywhere* off to use only your Bases.
- **Optional:** add the `effect-…` columns (below) to your Base's table to see and change every saved spell in one place.

### Saved spells
Set a spell up as you like it in the cast window (its area, animation, colours, light, walls), then:
- **Save** keeps it as how that spell is cast from now on: the next time you cast it, from the cast window or a statblock, it's just like that. It's written onto the spell's own note as `effect-…` properties. Nothing else in the note is touched, and no copies are made. **Save changes** updates it.
- **Save as new…** keeps it as a spell of its own under a new name ("Big blue Fireball", "Darkness (small)"). It gets a note in the folder for them (*Spell Storage* unless you change it), with a Base of its own. Use it for a second version of a spell, or for an effect that isn't a spell at all.
- The **star** at the top of the cast window puts a saved spell in the menu of the map's ✨ button, to cast in one click. It's also in Ctrl+P → **Cast a saved spell…**.
- **Delete** (the bin at the top of the cast window) asks "Are you sure?" first. A spell of your own goes to Obsidian's bin, note and all. On one of your spell pages, only the `effect-…` properties come off and the rest of the note stays, so the spell is cast from its text again.

Saved spells are listed first in the cast window, under **Saved spells** (★). Presets from versions before 1.4 become saved spells of their own automatically, still in ✨'s menu.

| Property | What it does | Example |
|---|---|---|
| `effect-area` | sphere `radius`, `emanation` (around the caster), `cone`, `cube`, `line`, `wall` | `radius` |
| `effect-size` | radius / side / length in feet | `15` |
| `effect-width` | a line's width, or a wall's thickness, in feet | `5` |
| `effect-origin` | `point` or `caster` (spheres and cubes) | `point` |
| `effect-lasting` | stays until ended | `true` |
| `effect-attach` | follows the caster's token | `true` |
| `effect-animation` | the animation file | `[[Darkness_01_Black_600x600.webm]]` |
| `effect-colour` | colour for a drawn effect (its heart) | `#6a3cff` |
| `effect-colour-outer` | a drawn effect's edge colour | `#2a0f7a` |
| `effect-opacity` | how see-through, from 0 to 1 | `0.8` |
| `effect-angle` | a cone's angle in degrees | `90` |
| `effect-ring` | a wall's ring form: its diameter in feet | `20` |
| `effect-round` | make the wall as that ring | `true` |
| `effect-walls` | a wall's real Atlas walls: `none`, `sight`, `movement` or `solid` | `sight` |
| `effect-light` | `light`, `darkness` or `none` | `darkness` |
| `effect-bright` / `effect-dim` | the light's bright and dim range in feet | `20` / `40` |
| `effect-light-colour` | the light's colour | `#ffd28a` |
| `effect-menu` | in ✨'s menu | `true` |
| `image` (or `effect-image`) | card art, shown in the cast window | `[[Darkness card.png]]` |

Notes saved by older versions (plain `area`, `size`… and a `spell-effect` tag) still work. They move to the new properties the next time you save them.

## Cast
✨ in Atlas's main toolbar (or Ctrl+P → **Cast a spell effect…**):
1. Pick a spell on the left: your saved spells (★) first, then the others. Or **+ An effect of your own**.
2. On the right: its **area** (Sphere, Around caster, Cone, Cube, Line; size; at a point or from the caster; lasts until ended; follows the caster), its **animation** (pictures to pick from; hover to play; ⤓ ones are fetched from JB2A when you place them; or search all), its **colour**.
3. **Place on the map**, then on your Atlas map:
   - an area at a point (Fireball): click where it lands (it centres on a grid corner);
   - a cone or a line (Burning Hands, Lightning Bolt): click the caster's token, then aim and click;
   - around the caster (Spirit Guardians): click the caster's token; it follows them.
   - Esc or right-click stops.
- "Follows the caster" on a cone or line keeps it on the caster's token as it moves (a beholder's antimagic eye).
- Instant spells play once and go. Lasting ones stay until ended, also after you restart Obsidian.
- ✨'s arrow: **Cast <spell> again**, your starred saved spells, **Spell AoE player preview**, **End** each lasting effect, **End them all**.
- **Spell AoE player preview** (✨'s menu, or *Show players the area while you aim* in the settings; off unless you turn it on): while you place a spell, the players' screen shows its area, so they can see what it will cover before you cast it. Choose its look in the settings (*Preview style*): **Outline** (its edge, dashed, over a faint wash of its colour), **Filled**, or **Animation** (the spell's own, a little see-through).

## Moving and changing effects
- **Drag** an effect like a token to move it. Tokens come first: pressing a token inside an aura moves the token. Grab the aura away from its token to move the aura itself (it then stays where you put it).
- **Shift-drag** a cone, line or cube to turn it about its point (15° steps with snapping on).
- **Double-click** an effect (or right-click → Edit) to change it as it stands, live on your map and the TV: name, size, width, turn, lasts until ended, animation and colour, and its token:
  - **Attach to a token…** then click the token: it keeps its place and moves with that token;
  - **Turns with them**: it also turns as the token turns (a beholder's antimagic eye);
  - **Detach** leaves it where it is.
- **Right-click** an effect: Edit or End.

## Snapping
**Snap to grid** (✨'s menu, the cast and edit windows, or Ctrl+P → "Snap effects to the grid on or off"): spheres and cubes centre on grid corners, cones and lines start from one when placed on empty ground, and Shift- turning goes in 15° steps. Hold **Alt** to do the other for one placing or drag. Auras around a creature stay centred on it.

## Good to know
- Effects are drawn inside Atlas's map, under every token (whatever its size), its bars and handles, and under Atlas's lighting and fog of war, which light and hide them like the floor. A token the players can't see (hidden, or in darkness) leaves no trace. Effects on a creature (Shield) sit just over their token, and only where the players can see that creature.
- Several Atlas tabs: it casts on the one you used last.

## Walls
Wall spells (Wall of Fire, Wall of Stone, Blade Barrier, Wind Wall and the like) are drawn on the map.

- The cast window reads the wall from the spell text: how long it can be, how thick it is, and whether it can be a ring.
- **Straight:** click the corners one after another. They land on grid corners when snapping is on. The hint counts the feet used, and you can't go past the spell's length. Finish with Enter, a double-click or a right-click. Backspace takes the last corner back, and Esc stops.
- **Ring:** click the ring's centre.
- An animation repeats along each stretch at its own proportions. Without one, the wall is a glowing line in its colour.
- **Atlas walls** puts real Atlas walls along it while it lasts:
  - **None:** drawn only.
  - **Blocks sight:** for Wall of Fire or Wall of Thorns.
  - **Blocks movement:** for Wall of Force.
  - **Solid:** for Wall of Stone or Wall of Ice.
- The Atlas walls move when you drag the wall and disappear when the spell ends.
- Double-click a wall to change its thickness, a ring's size, or what its Atlas walls stop.

## Light and darkness
Lasting effects can give off real Atlas light, or spread Atlas's magical darkness, so your scene lighting and the players' view on the TV treat them like any other light.

- The cast window reads it from the spell: Light, Daylight, Moonbeam, Flaming Sphere and the like give light; Darkness, Hunger of Hadar, Maddening Darkness and the like spread darkness. Change it under **Light** (None / Gives light / Magical darkness), with bright and dim feet and a colour for light.
- Darkness covers the effect's area and grows or shrinks with it. It also puts up a ring of Atlas walls that block sight round its edge: no one sees into, out of or through it, and light doesn't pass, but tokens can walk in.
- The light moves with the effect: drag it, or let it ride on a token. A wall glows along each of its stretches, and a line along its whole length.
- Ordinary lights follow live as you drag. Darkness, and lights over a whole area (walls, lines, cubes), move once you let go: Atlas works those out again in full each time, so moving them live would slow it down.
- Ending the effect removes its light. If you delete the light in Atlas yourself, the add-on leaves it deleted.
- The add-on's light changes aren't undo steps, so Ctrl+Z stays for your own edits.
- Scene lighting must be on in Atlas to see them.

## Picking and adjusting
Click an effect on your map to pick it. It shows Atlas's own controls for a picked token, on your screen only (never on the TV):
- an **outline** in your accent colour, round its actual shape;
- the round **rotate** button: drag it to turn the effect (a cone or line turns about its point, keeping its length);
- **‹ ›**: drag them to change the size (a cone or line has › at its far end, for its length);
- the **size** (in your game's unit), with **+** and **−** for one square more or less;
- on a wall, a **dot on each corner**: drag one to reshape the wall (its Atlas walls and lights follow).

With snapping on, sizes go in steps of one square, turns in 15° steps, and wall corners land on grid corners. Hold Alt for the other way. Drag the effect itself to move it. **Esc** lets go, and **Delete** ends what's picked. Effects on a token (a beholder's antimagic cone) keep their token.

**Several at once:** drag Atlas's selection box (or lasso) across the map and the effects inside it are picked along with the tokens. Shift-click adds or removes one. Drag one of them and they all move. Delete ends them all.

## Undo and redo
**Ctrl+Z** undoes casting, ending, moving, resizing, turning and editing effects, and **Ctrl+Y** or **Ctrl+Shift+Z** redoes. It's interleaved with Atlas's own history: whichever was done last is undone first, whether that's an effect or something in Atlas. Atlas's Undo and Redo buttons work the same way. Everything changed in the double-click editor, from opening it to closing it, is one step.

## Inner and outer colours
Effects drawn without an animation have an **Inner** colour (the heart) and an **Outer** colour (the edge and glow), and every effect has an **Opacity** slider. They're in the cast window and the double-click editor, and they're kept with saved spells (`effect-colour`, `effect-colour-outer`, `effect-opacity`).

**Motion:** a drawn area that stays on the map can move as you like: **Gentle glow** (as ever), **Still**, **Breathing** (swelling and sinking), **Pulsing** (fading in and out), **Shimmering** or **Flickering**, each **Slow**, **Normal** or **Fast**. Pick it beside the colours; the sample tile shows it. Kept as `effect-motion` (`breathe`, `pulse-fast`, `shimmer-slow`…).

## Casting from Atlas statblocks
In Atlas's statblocks (Ctrl / ⌘ + hover a token, the side panel, or a statblock note), every spell this add-on knows gets a small **Cast** button in front of its name, written as its note writes it ("fire bolt" reads "Fire Bolt"), and spell lists show one spell a line: every spell in your spell notes and saved spells, by its name, its note's `aliases`, and its name without its inventor ("Hideous Laughter" for "Tasha's Hideous Laughter", as 2024 names it). They're found in:
- spell lists (Atlas's, in a list or in tabs, and Fantasy Statblocks');
- text about spellcasting: a 2024 *Spellcasting* action's "At Will:" and "1/Day Each:" lines, Pathfinder's "Arcane Prepared Spells", "casts *Fireball*", spell cards (*Casting Time… Range… Components…*);
- a spell name standing on its own in bold, italics or a link: an action called ***Cone of Cold (Recharge 5–6).***, or `[[Shield]]`;
- anything under a heading, label or tab about spells (*Spells*, *Cantrips*, *Prepared*, *Magic*…), such as a player's spells shown as chips or as entries of their own;
- in a statblock that has spells anywhere: a spell that is the whole of its line, chip or cell; a run of spells after a label (*Magic Initiate (Wizard): Fire Bolt, Mage Hand, Shield*); and a spell of two words or more anywhere in its text (*Misty Step*, *Cure Wounds*).

Other text doesn't count, so "dim light" in a description, or a trait called *Light Sensitivity*, gets no button. Nor does anything under a heading or label about gear (*Equipment*, *Inventory*, *Magic Items*…), so a shield there stays a shield. A spell whose text names no area can be cast too: on its caster when its range is Self (Shield, *On a creature*), otherwise on a square at a point within range (Mage Hand).

**Who's casting.** The add-on finds the creature casting it from the statblock:
- a statblock opened from a token (Ctrl / ⌘ + hover) is that token's;
- in Atlas's side panel, it's the token selected on the map;
- in a statblock note open in a tab, it's the one token on the map linked to that note.

If it can't tell, it asks you to click the caster's token first.

**Cast** opens a small menu:
- the caster and the spell's range (*Archmage · 150 ft*), or *No caster on the map*;
- how it's cast, as you saved it (or as its text says): *Click where it goes on the map*, *Aim it on the map*, *Click a token on the map*, *Click a target on the map*, *Draw it on the map*, or *Cast on Archmage*. With the caster known:
  - an aura lands on them at once;
  - a cone or line (Lightning Bolt, Burning Hands) starts from them, so you just aim;
  - an area cast at a point (Fireball) shows its **range** as a dashed ring round them (150 ft, from the edge of their space), and can't be placed beyond it;
- for a spell cast at creatures (Fire Bolt, Hold Person): **each creature in its range**, nearest first, with how far away they are (*Goblin · 25 ft*). Pick one and it's cast on them at once, from the caster, no clicking on the map. (More than twelve: the rest are clicked on the map.)
- **Cast with no target**: its animation once on the caster;
- **Edit look…**: the cast window, with that spell or ability picked, to change its animation, colours and so on (and save them).

Press the button **a second time** (instead of picking from its menu) and it's cast straight away in its usual way: a dragon's breath to aim from the dragon, a blast to click where it goes. **Point at the button** and a small card beside it shows what it will look like: its animation playing (or its area's shape in its colour), its area and its look.

The buttons only sit beside the statblock's text; nothing in it is changed. Where Atlas draws a statblock's text itself rather than as markdown, the name is underlined instead and a click on it casts it (Shift-click: the cast window).

### Statblocks with spells: where to get them, and a template
- **Ready-made:** the [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin comes with the 5e SRD's creatures, spellcasters among them (Mage, Archmage, Priest, Lich…). With it installed, a note holding a `statblock` code block that names one (`creature: Archmage`) is a statblock Atlas can link tokens to.
- **Your own:** copy [`examples/Battle Mage (statblock with spells).md`](examples/Battle%20Mage%20(statblock%20with%20spells).md) into your vault and change it. It's an Atlas statblock (5E 2014 template) with a spell list and spells named in its actions. The parts that matter:
  - `statblock: true` and `atlas-template` make the note an Atlas statblock;
  - `spells:` is the spell list: a first line ending in a colon (the heading), then one line per level, `1st level (4 slots): burning hands, magic missile, shield`;
  - in actions, traits and reactions, spell names in *italics* (or after "casts") are clickable too.
- Or in Atlas's statblock editor, add spells to the **Spellcasting** part of any statblock in the same way.

Only spells the add-on knows (your spell notes, see *Spells: your Bases*) are clickable.

**Abilities that aren't spells:** an ability whose text names an area gets a **Use** button in front of its name: a dragon's Fire Breath (*60-foot Cone*), a beholder's Antimagic Cone, *a 30-foot-radius Sphere centered on a point … within 120 feet*, an Emanation, a Cube, a Line, a Cylinder (drawn as its circle), or *each creature within 120 feet of the dragon*. The button works like Cast: aim or place it from the creature's token, or open it in the cast window to pick its animation and save it. What's read from the ability's own text in the statblock:
- its shape and size, and how far away it can be put (*within 120 feet*, *range 120 ft.*);
- its look and its first animation, from its damage, as your game system writes it: *Fire damage*, Pathfinder's *electricity* and *void*, Draw Steel's *holy* and *corruption*; or, where damage has no kind (Old-School Essentials, Shadowdark, Cairn…), from the words round it (*a cone of fire*, *Frost Breath*);
- whether it stays on the map (*lasts for 1 minute*, *Until the start of its next turn, that area…*);
- a list of effects in one ability (*1: Clinging Flames. … 2: Freezing Waves. …*): a button for each.

**In the cast window:** creatures' statblock notes aren't spells, so they're kept out of the spell list. Their abilities with an area are listed apart, under **Creature abilities**, each by its own name with its creature beside it (*Fire Breath · Adult Red Dragon*).

**Saving an ability:** open it in the cast window, pick its animation, colours and so on, and press **Save**. It's kept as an *ability*, by its name, with the add-on's settings: not as a spell, so it makes no spell note and isn't in your spell lists. From then on every statblock with an ability of that name uses what you saved (an adult dragon's Fire Breath and a young one's alike), each with its own shape and size from its own text. The bin in the cast window deletes what's saved.

Nothing else about the ability is worked out: saves and damage are yours to run.

## Your game system
The add-on reads the game system of the map's collection from Atlas (**Settings → Combat+ for Atlas VTT** shows what it found, by name), so there's nothing to set up. It works with every system built into Atlas: D&D 5e, Pathfinder 2e, Daggerheart, Shadowdark, Old-School Essentials, Cairn, Call of Cthulhu, Cyberpunk RED and Draw Steel, and with your own.
- **Units:** sizes and ranges are in your game's own unit, as Atlas's rulers and lights are: feet, yards (Call of Cthulhu), metres (Cyberpunk RED) or squares (Draw Steel). Steps, and things that default to "one square" (a line's width), follow your grid.
- **Spell text** is read the way Atlas reads statblocks, and converted into your unit: "60 ft.", "18 m", "20'", "10 yards", "12 squares". A D&D spell's 20 ft is 6 m in a metric game, 6.67 yd in Call of Cthulhu, and 4 squares in Draw Steel.
- **Other games' wording:** Pathfinder's "20-foot burst", "30-foot emanation" and "**Range** 500 feet"; Old-School Essentials' "20' radius"; Cyberpunk RED's "10m square"; Draw Steel's "3 burst", "3 cube within 10", "5 × 1 line".
- **Range bands** (Daggerheart, Shadowdark), at the squares Atlas gives them: "all adversaries within Very Close range" is an area round the caster, "a Near-sized cube" a cube, and a range of "Far" shows as a ring.
- **Cone angle:** 53° in D&D 5e, 90° in most others. Leave *Cone angle* empty in the settings to follow Atlas, or enter one to override it.

Saved spells keep their sizes in the unit they were saved in, so save them again if you change a collection's system.

## Spells cast at creatures
Spells with no area are cast by clicking their targets. Click the spell (in a statblock or the cast window's **Place on the map**), then click each target token. Keep clicking for more targets, and press Esc, Enter or right-click when done.
- **On a creature** (Shield, Hold Person, Bless, Cure Wounds…): the effect plays on the creature, round its token and over it, a little bigger than its space (or bigger still, with "reaching N ft past its space"). If the spell lasts, it stays on that creature and moves with it. Choose who it's on: **The caster** (Shield, and any spell with a range of Self: from a statblock it lands on that creature at once, otherwise one click on the caster), or **Each creature you click**.
- **A bolt at a creature** (Fire Bolt, Ray of Frost, Magic Missile, Disintegrate…): the effect shoots from the caster to each creature you click. From a creature's statblock, that creature is the caster. Otherwise, click the caster first.

Which kind a spell is gets read from its text (ranged spell attacks, rays, bolts and darts are bolts; spells naming a creature or target play on it). Change it in the cast window: **On a creature** in the Area row, or *A bolt at creatures* on a Line. It's kept with a saved spell as `effect-target` (`self`, `on` or `bolt`).

## Spells as Atlas areas (Atlas 0.15 or later)
Each spell you cast is one of Atlas's own areas too (the kind its Measure tool keeps), and the animation plays over it. So Atlas:
- **draws its area**, in the spell's colour, with one of its looks: *Fire*, *Frost*, *Lightning*, *Mist*, *Radiance* or *Shadow*. The look is picked from the spell's damage or name (Fireball: Fire, Cone of Cold: Frost, Darkness: Shadow, Fog Cloud: Mist); change it with **Atlas area look** in the cast window (kept as `effect-look`);
- **lights it**: a spell's light, or its magical darkness, is the area's (a darkness only round a point: in another shape, the add-on puts up its own);
- **counts the creatures in it** as far as walls let it, as it rings them: the add-on's conditions and its "hit" cards go by that count;
- **saves it with the scene and shows it to online players** (they see Atlas's area and its look; the animation only on your screens).

It works both ways. Move, resize or recolour the area with Atlas's handles and the spell follows; delete it in Atlas and the spell ends; end the spell and its area goes. A cone, a line or a cube is Atlas's; a creature's aura (Spirit Guardians) is an aura on that creature in Atlas too. Walls, bolts and effects on a creature stay the add-on's alone.

**Atlas's choices in the cast window** (its **Atlas area** part, on an Atlas map that has areas):
- **Drawn as**: the animation over Atlas's area (as above), *Atlas's area only* (no animation: just Atlas's look), or *Animation only* (no Atlas area: the add-on's own way, as before);
- **Look**, **Light** (*the spell's*, *Atlas's for its look*: Fire and Lightning flicker, Radiance shines, Shadow darkens, or *none*), **Stops at walls** and **Players see it**, as Atlas's area popover has them;
- **Place with Atlas's Measure tool**: the tool is picked with the spell's shape, colour and look, you draw the area with it (its snapping, its cone), and the spell goes on that area; the tool goes back as it was. Esc stops.

All of it is kept with a saved spell (`effect-draw`, `effect-area-light`, `effect-walls`, `effect-players`, `effect-tool`).

**Atlas's own area window:** click an area's handle and Atlas's window for it opens as usual, with a small **Spell Effects** part above its last row:
- a spell's area: its name, **Edit spell…** (the add-on's edit window for it) and **End spell**;
- one of your own areas, drawn with Atlas's Measure tool: **Animate…**, which opens the cast window to pick a spell for it. Its animation, conditions and so on go on that area, where it lies; ending the spell leaves your area as it was.

A burst's animation (Fireball's explosion) is grown so the blast itself reaches the edge of its circle; JB2A's art leaves empty room round it. Stray sparks may go a little past the edge.

**Walls:** Atlas stops an area at walls. To have one spell go through them, turn off *Stops at walls* for it in the cast window. To have every spell's and ability's area go through them, turn on **Areas go through walls** in the add-on's settings.

A cone is drawn the way Atlas draws cones (your game's cone angle, with a rounded end unless its rules make cones flat), so where you aim it is exactly where its area lands.

A spell's area takes its look's own colour (Frost pale blue, Fire orange…), not the spell's colour. Change it in Atlas's window and your colour is kept.

Turn it off with **Spells as Atlas areas** in the settings (the add-on then draws spells alone, as before Atlas 0.15).

**Lasting spells.** A creature inside a lasting spell (Darkness, Silence, Spirit Guardians, Web…) gets Atlas's **In a spell** condition, plus the conditions the spell gives, for as long as it's inside. They come off again when it leaves or the spell ends. The add-on adds *In a spell* to your collection's conditions the first time it's needed. Only what the add-on put on is taken off: a condition the creature had already stays, and one you take off a creature that saved stays off while it's still inside. An aura round its caster marks the others in it, not the caster.

**Instant spells.** The creatures an instant spell hits (Fireball, Thunderwave…) are listed on a small card beside the map, on your screen only. Close it with **×** when you've dealt with them. (Only lasting spells put *In a spell* on a creature; an instant spell or an attack doesn't.) A line, cone or aura from a caster never catches the caster.

**A spell's conditions** are read from its text ("has the Restrained condition", "falls Prone"; not the ones it ends or guards against), and Darkness gives Blinded. Change them in the cast window's **Conditions** row, which shows your collection's conditions (lasting spells). They're kept with a saved spell as `effect-conditions`.

Turn it all off with **Mark creatures in spells** in the settings.

## The spell turn tracker
During a fight in Atlas's initiative tracker, each lasting spell shows how many rounds it has been up beside it (*Round 3*), on your screen only. It counts from the round the spell was cast in, or from the first round of a fight that started later. Spells never end on their own. Turn it off with **Count rounds on lasting spells** in the settings.

It also shows the time (*Round 3 · 12 s*) where the game system's round has a length: 6 seconds in D&D 5e and Pathfinder 2e, 10 in Old-School Essentials and Cairn, 3 in Cyberpunk RED. Daggerheart, Call of Cthulhu, Shadowdark and Draw Steel have no fixed round, so they count rounds only, as do your own systems until you set one. Change any of them with **Round length** in the settings (*6 seconds*, *10 s*, *1 minute*…; empty: rounds only). It's kept for each game system.

## Teleporting
Spells that teleport their caster (Misty Step, Far Step, Dimension Door, Thunder Step: "you teleport…") move the token. Cast it, click the caster (if it isn't known from their statblock or selected), and how far they can go shows round them; click where they go. Its animation plays where they leave and where they arrive, and the token lands in the grid's squares, never further than it can go. It's Atlas's own move, so Ctrl+Z puts it back. Turn it on or off for any spell, and set how far, with **Teleports the caster** in the cast window (kept as `effect-teleport`).

## Under or over the tokens
By default spells are drawn under the tokens, so every creature stays in view. **Spells over tokens** in the settings draws them on top instead: **Instant spells and bolts** (a Fireball bursting over the creatures, an Eldritch Blast flying over them, while lasting areas like Spirit Guardians stay under), or **All**. Tokens' bars, names and Atlas's handles stay on top either way.

## Animations picked for you (D&D 5e)
On a D&D 5e map, a spell with no animation saved picks the best fitting one from the JB2A free pack:
- its own (Fireball, Cone of Cold…), or one made for it under another name (Evard's Black Tentacles, Bigby's Hand, the smites, Meteor Swarm);
- else by what it does: healing, teleporting, summoning, a boon on a friend or a curse on a foe;
- else by what it's made of and its shape: a fire cone gets the fire breath, a cold burst the snowflakes, a necrotic touch Toll the Dead's skull, a psychic spell the dizzy stars or the horror circle, and so on;
- else its school's sign (an Abjuration circle, an Illusion rune…).

Only the pack's own animations are picked. Anything you pick and save for a spell stays yours. Other game systems pick by the spell's name, as before.

## Atlas Online view
Animations and the add-on's drawn shapes show on your screen and the player window, but never reach Atlas Online: online players only see Atlas's own areas, lights, conditions, terrain and tokens. Turn on **Atlas Online view** (at the top of the settings, or its hotkey command) to see exactly what they see. Spells are then made as Atlas areas, with their Fire, Frost… looks, and nothing else is drawn. You still see where you're aiming. In this view, spells on a creature also get an Atlas circle that follows it, bolts an Atlas line from caster to target, and walls an Atlas line along them (a circle for a ring), so online players see them too.

## Rolling attacks, saves and damage (D&D 5e and 2024 only)
Rolling is for **D&D 5e (2014) and D&D 2024 only**. Other game systems aren't supported yet: their effects work, but leave rolling off.

Set **Rolling** at the top of the settings: **Off**, **NPCs only** (player characters' own attacks and spells are left to their players, and their saves get **Saved** and **Failed** buttons on the card), or **Everyone**. Player characters are the tokens marked as such in Atlas's token library. It and **Spell effects** are separate switches: use either or both. When a spell or ability is cast, its card rolls:
- **an attack** against each target's AC: a natural 20 is a crit (its damage dice doubled), a natural 1 a miss;
- **or each creature's save** against the DC, with its damage rolled once for all and halved on a save where the text says so;
- **its damage**, by type: halved for a resistance, none for an immunity, doubled for a vulnerability. A cantrip's dice go up with the caster's level.

Everything comes from the spell's or ability's own text and from statblocks: the targets' AC, saves and resistances, and the caster's spell save DC and attack bonus (from its text, "spell save DC 16, +8 to hit", or worked out from its proficiency and best casting ability). An ability gives its own ("Dexterity Saving Throw: DC 21", "Ranged Attack Roll: +10"). Anything that can't be read shows as **?**, for you to judge.

On the card, change any damage, then **Apply damage** takes it off each creature's hit points in Atlas (Ctrl+Z puts it back). **Reroll**, **Adv** and **Dis** roll again, normally or with advantage or disadvantage. **Post rolls to the table log** also sends each card's results to Atlas's table log when an online table is running.

When two or more cards have damage waiting (a Multiattack, or a whole turn's attacks), **Apply all** at the top of the cards applies every one at once, and shows what each creature takes in total.

**D&D's own rules, handled for you:**
- **Upcasting:** a spell that does more at a higher slot ("increases by 1d6 for each slot level above 3") gets a **Slot** picker on its card; pick a slot and it's rolled again. Temporary hit points that grow by slot too.
- **Advantage and disadvantage from conditions:** attacks on a Paralyzed, Stunned, Unconscious, Petrified, Restrained or Blinded creature have advantage; on a Prone one, advantage within 5 feet and disadvantage beyond; an Invisible target, or a caster who is Blinded, Poisoned, Prone or Restrained, disadvantage. Both at once cancel. The card says why.
- **Automatic crits:** a hit on a Paralyzed or Unconscious creature within 5 feet of the caster.
- **Failing saves:** Paralyzed, Stunned, Unconscious and Petrified creatures fail Strength and Dexterity saves; Restrained ones have disadvantage on Dexterity saves.
- **Magic Resistance:** advantage on saves against spells (not against a creature's abilities, like a breath).
- **Evasion:** on a Dexterity save for half damage, none on a success and half on a failure.
- **Legendary Resistance:** a creature that has it and fails a save gets a **Use Legendary Resistance** button on its row: it saves instead, and one use is gone for the day (its "3/Day" is read from its statblock). The command *Reset Legendary Resistance (a new day)* gives them all back.
- **Resistances, immunities and vulnerabilities** by damage type, from the statblock. Resistances "from nonmagical attacks" count against a creature's own attacks, not against spells.
- **Temporary hit points:** a spell that gives them (False Life, Heroism…) has a **Give temp HP** button; damage takes them first, and new ones replace old ones if higher, as the rules say. They're kept on each token as an Atlas resource named **Temp HP** (change the name in the settings). Atlas has no temporary hit points of its own, so to see them as a bar, add a resource called *Temp HP* in Atlas's resources for your game system: it fills when they're given and empties as damage takes them.

**Healing** (Cure Wounds, Healing Word, Mass Cure Wounds…) is rolled once, with the caster's spellcasting modifier where the spell says so and more for a higher slot. **Apply healing** raises hit points, never past the maximum. Damage that comes later (Moonfire's next turn, Acid Arrow's) isn't added to the first roll, and where you choose a type (Spirit Guardians, Fire Shield) one is rolled. Boosts to your hits (Hex, Hunter's Mark) and weapon cantrips (Booming Blade) go in an attack card's extra damage box.

Still yours to run: concentration checks, damage from lasting spells each turn (Spirit Guardians, Moonbeam), extra darts or beams from a higher slot, and other game systems. Statblocks are read from notes (their properties, or a `statblock` block); a token with no note gives "?".

**Cards.** A card closes itself a few seconds after its damage is applied, once the pointer's off it, and a card with nothing to apply a little later (Settings → Rolling → *Close cards once applied*). To apply the newest card's damage from the keyboard, give the command *Apply damage from the latest card* a hotkey in Settings → Hotkeys. On a card, a hit, a crit or a failed save is green, and a miss or a successful save is red.

**Hotkeys.** Every command can have a key: Settings → Combat+ → **Set hotkeys** opens Obsidian's hotkeys showing only Combat+'s. There are commands to apply the latest damage, close the latest card or every card, reroll the latest card (normally, with advantage or with disadvantage), apply every card's damage at once, mark the next player's save as saved or failed, use Legendary Resistance, cast the last effect again, end the newest or every lasting effect, and switch rolling, rolling for NPCs only, spell effects, the players' preview, areas through walls, spells over tokens, cards closing themselves and the built-in SRD spells. None has a key until you give it one.

**From Atlas's DM screen.** A statblock's Cast, Use or Attack button on the DM screen works too: its creature is the caster (when one token on the map uses that statblock, or you've selected it). Picking how to cast puts the DM screen away so you can see the map, and it comes back by itself once you're done: nothing left to aim, and its cards' damage applied (or nothing to apply). The menu says at the top what you're casting, using or attacking with.

**Shift+click** (or middle-click) a statblock's Cast, Use or Attack button to go straight to clicking a token on the map, without the menu. In the menu, clicking the top line ("Attack: Multiattack", "Cast: Fireball") does the same, as does clicking the button a second time.

**Ranges.** Distances count as D&D counts them: next to you is 5 ft, and diagonals count the same as straight lines. An attack reaches as far as its farthest range ("reach 5 ft. or range 150 ft.": 150 ft). Past its normal range it has disadvantage, and past its long range it's marked out of range ("range 150/600 ft."). A ranged attack at a creature next to the attacker has disadvantage, unless that creature can't act.

**Attacks followed by a save.** Ice Knife's attack is rolled on its target, then, hit or miss, a second card rolls the Dexterity save for the target and every creature within 5 feet. A monster's attack with a damaging rider (a spider's poison) rolls its save on a hit only.

**Weapon attacks and one-target abilities.** With rolling on, a statblock's attacks get an **Attack** button (a monster's *Bite*, a player's *Longsword*, "Melee: +2 to hit. Hit: 1d6-1 Bludgeoning"), and abilities that make one creature save get a **Use** button (*Stunning Strike*, *Dreadful Glare*). Click it, then click the target, or pick one from its menu: the hit or save is rolled with its damage, and nothing is drawn on the map. Where a hit or a failed save gives a condition (*Stunned*, *Grappled*, *Prone*), its row has a **Give** button that puts it on the token; take it off yourself.

**Multiattack.** A statblock's Multiattack gets a **Use** button: click it, then click a target for each attack it makes, in turn. Where it offers a choice (*three attacks, using Greatsword or Longbow in any combination*), each attack is picked by how far the target is, counted from the edge of each creature's space as Atlas measures it: within reach, the melee one; further off, the ranged one. To pick one yourself, click its button under the hint at the top of the map, press its number key (**0** goes back to by distance), or press **Tab** to step through them. While it's going by distance, the first button shows which attack the creature under the pointer would get.

**Animations for attacks** (optional, Settings → On the map): plain attacks play an animation from the attacker to the target, by the attack's name: weapons (a greatsword's swing, a flail, a sickle, a longbow's arrow, a thrown rock) and body parts (a bite, a claw, a slam, a pincer, a whip or vine lash, a touch). Every attack in the SRD and the 5e bestiary was checked against these. A magical one, like a mage's Arcane Burst, gets the bolt of its damage type. Attacks with no named weapon use the default you choose for melee and for ranged. To change one, click the attack's button, pick **Edit animation…**, choose the animation in the cast window and press **Save**. It's used for every statblock's attack of that name from then on, including when a Multiattack makes it.

**What a save does besides damage** shows on the card, in the ability's own words: "Failed: The target has Disadvantage on Strength-based D20 Tests…".

**Extra damage on a hit** (Sneak Attack, Divine Smite, Hex, Hunter's Mark): type it in the box on an attack's card, like `3d6` or `2d8 radiant`, and press **Add** (or Enter). It's rolled for each creature hit, doubled on a crit, and resisted like the rest. With no type given, it's the attack's own. If the attacker's statblock has **Sneak Attack**, **Martial Advantage** or another trait that deals extra damage when it hits, the card has a button for it (**Sneak Attack +3d6**): press it when its rules are met (once a turn, with advantage or an ally beside the target…). A player's Sneak Attack is worked out from their Rogue level. A Genie warlock's **Genie's Wrath** gets a button too (its proficiency bonus, in its patron's damage type).

**Bonuses to spell damage**, found by name on the caster's statblock and added for you:

- **Agonizing Blast:** Charisma modifier to Eldritch Blast.
- **Empowered Evocation:** Intelligence modifier to Evocation spells.
- **Elemental Affinity:** Charisma modifier to spells of its dragon's damage type. If the statblock doesn't say which type (*Elemental Affinity (Fire)*, *Draconic Ancestry: Red*, or a resistance to it), you're asked once, the first time that character casts a spell it could apply to. The command *Forget chosen damage types* clears the answers.
- **Potent Spellcasting:** Wisdom modifier to cantrips.

The card shows each one: *8d6 fire + 4 (Empowered Evocation)*. They're added to spells only, not to a creature's own abilities or to attack lines that already include them.

**Magic weapons:** every damage part is rolled with its own type (*Hit: 2d6+6 Slashing plus 1d8 Cold*). A weapon named with a bonus or a rarity (*+2 Greatsword*, *Frost Brand (Very Rare)*) counts as magical, so its hit gets past resistances to nonmagical attacks.

**Spell effects** can be turned off in the settings: no animations, and spells, breath weapons and attacks are still placed and rolled.

## Built-in SRD (D&D 5e)
Every spell in the D&D System Reference Document is built in, so spells in a statblock's list can be cast, and rolled, with no spell notes in your vault. Pick the **SRD edition** in the settings: **D&D 2024 (SRD 5.2.1)** or **D&D 2014 (SRD 5.1)**. It's off until you turn on **Built-in SRD spells** in the settings. A spell note or saved spell of yours with the same name is always used instead.

**Add SRD notes to your vault** (in the settings, or the commands *Add SRD creatures to the vault…* and *Add the SRD spells to the vault as notes*) writes:
- **Creatures** as Atlas statblock notes (Atlas's built-in 5E 2024 or 2014 Monster template), one at a time or all of them. Link a token to one in Atlas, and its attacks, saves, Multiattack and breath weapons have buttons.
- **Spells** as spell notes you can edit, change the look of, or add to a Base.

Notes already in the folder are never overwritten.

With **Built-in SRD spells** on, every SRD creature's breath weapons, auras and bursts are also in the cast window's *Creature abilities*, with no notes needed. Your own note for a creature always comes first.

*This plugin includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") and the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd and https://dnd.wizards.com/resources/systems-reference-document. Both are licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. The text was taken from the 5e-bits 5e-database project's transcription (https://github.com/5e-bits/5e-database).*

## Writing statblocks and spells it reads well
Combat+ reads plain statblock and spell text, the way the official books and the SRD write it. You don't need any special fields. If you write your own (homebrew, or a monster typed in by hand), these are the patterns it looks for. Anything it can't read is shown as **?** on the card, for you to decide.

**Imported notes.** 5e.tools' tags (as notes imported from it, or for Fantasy Statblocks, write them) are read as plain text: `{@damage 8d6}`, `{@dc 14}`, `{@hit 6}`, `{@atk mw}`, `{@h}`, `{@scaledamage 8d6|3-9|1d6}`. So are the Dice Roller plugin's inline dice (`` `dice: 8d6` ``) and dice in bold (`**8d6**`).

**An entry's name.** Each action, trait or reaction is a name, then a full stop, then its text: `Bite. Melee Attack Roll: …`. In Atlas's statblock editor, that's an entry's *Name* and *Description*. Uses go in brackets after the name and are ignored when matching: `Fire Breath (Recharge 5–6)`, `Misty Step (3/Day)`.

**Attacks** (an **Attack** button):
- The 2024 form: `Melee Attack Roll: +7, reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage.`
- The 2014 form: `Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage.`
- A player's sheet: `Melee: +5 to hit. Hit: 1d8+3 Slashing.`
- Several damage types: `Hit: 13 (2d6 + 6) Slashing damage plus 4 (1d8) Cold damage.` Each is rolled and resisted on its own.
- Reach and range: `reach 10 ft.`, `range 80/320 ft.` (disadvantage past 80, out of range past 320), or both: `reach 5 ft. or range 20/60 ft.`
- A save that follows a hit: `Hit: 4 (1d4 + 2) Piercing damage, and the target must make a DC 11 Constitution saving throw, taking 10 (3d6) Poison damage on a failed save, or half as much damage on a successful one.` Write `Hit or miss` to roll the save on a miss too.
- A magic weapon: put its bonus or rarity in its name (`+2 Greatsword`, `Frost Brand (Very Rare)`), and its hits count as magical.

**Saves at one creature** (a **Use** button): `Wisdom Saving Throw: DC 11, one creature the mummy can see within 60 feet. Failure: …`, or `the target must succeed on a DC 15 Constitution saving throw or …`.

**Areas** (a **Use** button that places it): name the shape and size, as the books do: `a 60-foot Cone`, `a 30-foot-radius Sphere`, `a 100-foot-long, 5-foot-wide Line`, `a 20-foot Cube`, `a 10-foot Emanation`. Then the save and damage: `Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: 59 (17d6) Fire damage. Success: Half damage.`

**Multiattack** (a **Use** button): name its attacks by their entry names: `The ogre makes one Bite attack and two Claw attacks.` Also read: `makes three Rend attacks`, `one with its bite and one with its claws` (2014), `two Greatsword or Heavy Crossbow attacks` and `three attacks, using Greatsword or Longbow in any combination` (each picked by distance, or Tab), and `…and it uses Dreadful Glare`.

**Conditions:** `the target has the Prone condition`, `is Restrained`, `falls Prone`. They're offered as a **Give** button on a hit or a failed save, using your collection's condition names.

**Extra damage on a hit** (a button on the attacker's cards): a trait that says `deals an extra 7 (2d6) damage when it hits`, like Sneak Attack or Martial Advantage. A player's Sneak Attack that says it grows with Rogue levels is worked out from their level.

**The creature itself** (for being hit or saving):
- **AC, hit points and ability scores** come from Atlas's statblock fields.
- **Saving throws** come from its saves list. Otherwise its ability modifiers are used.
- **Resistances, immunities and vulnerabilities** are read from their fields. `from nonmagical attacks` is read too.
- **Traits that change rolls** are found by name: `Legendary Resistance (3/Day)`, `Magic Resistance`, `Evasion`.
- **Its spell save DC and attack bonus** come from its text (`spell save DC 15, +7 to hit with spell attacks`), or are worked out from its proficiency and casting ability.
- **Its level** (for cantrips and beams) comes from `level: 5`, `class: Warlock 5`, `a 9th-level spellcaster`, or else its challenge rating.

**Spells** are read from their own text, the same way: their area, attack or save, damage and its type, `half as much damage on a successful one`, `increases by 1d6 for each spell slot level above 3`, cantrip upgrades (`levels 5 (2d10), 11 (3d10), and 17 (4d10)`), healing (`regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier`), and temporary hit points. Damage that lands later (`at the end of its next turn`) or instead (`If the target is missing any of its Hit Points, it instead takes 1d12`) isn't added to the first roll.

## What else a spell can do
Each of these is read from the spell's or ability's own text and can be changed, and saved, under **Also** in the cast window. Only the ones that fit the spell's kind are shown.

- **Pushes or pulls** (Thunderwave: "pushed 10 feet away"; Thorn Whip: "pull … up to 10 feet"). When it's cast, the creatures in its area (or its target) are moved that far straight away from where it comes from (the caster, or a blast's middle), or towards it, no nearer than touching. Tokens land in the grid's squares. Walls and other tokens aren't checked, and neither are saves: Ctrl+Z puts back anyone who shouldn't have moved. `effect-push` (a minus number pulls).
- **How many** (Magic Missile's three darts, Scorching Ray's three rays, Meteor Swarm's four points). Click that many targets, the same one twice for two on it; it stops by itself after the last. Areas are placed one after another. `effect-count`.
- **More with the caster's level** (Eldritch Blast: "two beams at level 5, three beams at level 11…"). Cast from a statblock, the caster's level is read from its note's properties (`level`, or `class: Warlock 5`), and it makes that many. Where no level is found it makes one; set **How many** by hand.
- **Leaps on** (Chain Lightning: "leap from that target to as many as three other targets … within 30 feet"). After the bolt reaches its target, bolts go on from it to the nearest other creatures in reach (not back to the caster). They're picked for you, nearest first. `effect-chain`, `effect-chain-range`.
- **A thing that can be moved** (Spiritual Weapon, Flaming Sphere, Mage Hand: "you can move the weapon up to 20 feet"). It's put on the map as a token of its own, named after the spell, with the spell's animation and light on it. Drag it like any token (players can, online). Ending the spell takes the token away; deleting the token ends the spell. `effect-summon`.
- **Difficult terrain** (Spike Growth, Entangle, Web, Grease). While it lasts, its area is a map feature in Atlas marked as difficult terrain, named after the spell: Atlas's movement ruler counts it by your game's rule. It follows the area if you move it and goes when the spell ends. Map features are the GM's alone. Needs Atlas 0.15. `effect-terrain`.

## Recent spells, and casting with no target
- The last five spells you cast are at the top of ✨'s menu (*Cast Fireball again*) and of the cast window.
- In a statblock's **Cast** menu, **Cast with no target** plays the spell's animation once on its caster.
- A saved spell keeps its range (`effect-range`), so its range ring shows, and the units its sizes are in (`effect-unit`). In a collection with another game system (metres, say), its sizes are read as the same number of squares.

## Licence
The add-on's code: MIT (see `LICENSE`). JB2A's animations are not part of it. They're downloaded from JB2A and stay under JB2A's own licence, CC BY-NC-SA 4.0, which is also why this add-on is and stays free. The built-in SRD (`src/srd-data.ts`, made by `tools/srd/build.py`) is the System Reference Documents 5.2.1 and 5.1 by Wizards of the Coast LLC, under CC-BY-4.0, not MIT: see *Built-in SRD* above for its attribution.

## Building
`npm install`, then `npm run build` (makes `main.js`). `npm run check` type-checks, and `npm run lint` runs Obsidian's own code rules. Pushing a tag such as `1.0.1` makes a GitHub release with `main.js`, `manifest.json` and `styles.css` (see `.github/workflows/release.yml`). Set the same version in `manifest.json` and `versions.json` first.
