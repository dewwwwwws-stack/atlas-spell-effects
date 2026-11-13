# Spell Effects for AtlasVTT

Atlas now draws spell areas itself: kept measurements with a Fire, Frost, Lightning, Mist, Radiance or Shadow
look, light or darkness, and auras that follow a token. Atlas also rings and counts the tokens inside, and stops
areas at walls. This add-on builds on those areas rather than replacing them. Your spells become Atlas's own areas,
so they show on the map, the player view and Atlas Online like any other. On top of that, it adds:

- **Animations:** JB2A's free animations play over the area: Fireball's burst, Lightning Bolt's line, Spirit
  Guardians around the cleric. Bolts like Fire Bolt fly from the caster to each target.
- **Cast from statblocks:** a **Cast** button next to every spell in a creature's or player's statblock. The
  caster and range come from the token, and spells cast at creatures list everyone in range so you just pick one.
- **Your spell library:** spells come from your own spell notes and Bases. Save a spell's animation, colour, look
  and area once and it's used every time. You can also make your own spells.
- **Who it caught:** a card names the creatures an instant spell hit, and lasting spells put conditions on those
  inside, such as *In a spell* or *Blinded* in Darkness.
- **Rounds:** shows how long each lasting spell has been up, from Atlas's initiative, with round lengths for each
  game system.
- **Teleports:** Misty Step and Dimension Door move the caster's token, with an animation where they leave and
  where they arrive.
- **Walls and rings:** Wall of Fire and the like, drawn corner by corner (Atlas's areas are circles, cones,
  squares and lines).
- **Inside Atlas's own windows:** click a spell's area to **Edit** or **End** it, or **Animate…** any area you've
  drawn yourself.

Turn off *Spells as Atlas areas* in the settings and the add-on draws spells on its own, as it did before Atlas
0.15.

> A community add-on for [Atlas VTT](https://community.obsidian.md/users/atlas-vtt). It is not made, endorsed or
> supported by Atlas VTT, Atlas Online or JB2A.

## Needs
- **Atlas VTT** (tested with 0.15), on desktop. Atlas 0.15 or later for spells as Atlas areas.
- Obsidian 1.10 or later. Spell bases need the Bases core plugin on.

## Install
Settings → Community plugins → Browse → search **Spell Effects** → Install → Enable. Then open an Atlas map:
✨ is in Atlas's toolbar.

## What it reads, writes and downloads
- **Network:** the only thing it fetches is JB2A's free animations, from JB2A's public GitHub
  (`raw.githubusercontent.com/Jules-Bens-Aa/JB2A_DnD5e`). That happens when you first use an animation, when its
  preview picture shows in the cast window, or when you press *Download everything*. Turn *Offer every JB2A
  animation* off in the settings and it fetches nothing at all. No tracking, no accounts, nothing sent anywhere.
- **Your vault's file list:** to find your spells and animations it looks through the names of the vault's files
  and the properties of its notes: notes with saved spell settings, notes in the Bases you pick, spell notes (if
  *Also find spell notes anywhere* is on), and animations in the JB2A folder and any *Spell Effects* folder (or the
  folders you pick). Its folder and Base pickers in the settings list your folders and Bases. It only reads the
  notes it's found as spells.
- **Your vault:** it saves downloaded animations, and a JB2A credit and licence note, in the JB2A folder
  (`JB2A_DnD5e`). *Save* writes `effect-…` properties onto that spell's note (and *Delete* takes them off
  again). A spell of your own (*Save as new…*) gets a note, and a Base, in its own folder (*Spell Storage*);
  *Delete* puts that note in Obsidian's bin. It never deletes or changes anything else.
- **Atlas:** it reads the open map (grid, tokens, view) and adds lights and walls for lasting effects when you ask
  for them. It removes those again when the effect ends, and doesn't add them to your undo history. It relies on
  Atlas's internals, so an Atlas update can break something until this add-on is updated.

## Animations
- **JB2A's free pack is built in.** All of its animations and colours (about 2,100) show in the cast window from
  the start, marked ⤓. Each is fetched from JB2A's own GitHub the first time you use it and saved in your vault
  (in `JB2A_DnD5e`, which you can change), so after that it works offline.
- **Download everything:** Settings → Atlas Spell Effects → *Download everything* fetches the whole pack at once
  (about 1.2 GB), for a game with no internet. You can stop it and carry on later. If your vault syncs, it syncs too.
- **Already have JB2A in your vault?** It's used as it is. Nothing is fetched twice.
- **Your own**: put `.webm` (best: video with see-through background), `.gif`, `.webp` or `.png` files in a
  folder called **Spell Effects** (or pick folders in the settings). Name them after the spell ("Moonbeam.webm")
  and they're picked for it.
- Or none at all: the add-on draws the area itself (a glowing circle, cone, line, square or wall in a colour you pick).

**Credit:** JB2A — Jules & Ben's Animated Assets (free pack), by Jules, Ben, gazkhan and wassily, licensed
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). A credit and licence note is saved beside
the downloaded files. Support them on [Patreon](https://www.patreon.com/jb2a) for the full pack. Because of their
licence, this add-on is and stays free.

## Spells: your Bases
The add-on finds your spells through **Obsidian Bases**: every note a Base shows is a spell it can cast. Its area,
light and walls are read from the note's text (and from "**Range:**" and "**Duration:**" lines). It works like
picking loot bases in Atlas.

### Setting up a spell Base, step by step
1. **Turn Bases on.** Settings → Core plugins → **Bases** (it's on by default in Obsidian 1.10 and later).
2. **Have your spells as notes**, one note per spell, with the spell's text in the note (the bit that says
   "20-foot-radius sphere", "60-foot cone", "Duration: Concentration, up to 10 minutes"…). Imported compendium
   pages, a 5e.tools or Plutonium export, or your own homebrew notes all work. Properties aren't needed, but
   `level` and `school` help.
3. **Make a Base that shows them.** Right-click the folder your spells are in → **New base**. Or use the command
   palette: **Bases: Create new base**. Give it a name, for example `Spells.base`.
4. **Filter it to your spells.** Open the Base, click **Filter** and add one that matches only spell notes, for example:
   - *the folder:* `file.inFolder("Compendium/Spells")`;
   - *a tag:* `file.hasTag("spell")`;
   - *a property:* `level` *is not empty*.

   The table should now list your spells and nothing else. A Base made by right-clicking a folder already has the
   folder filter.
5. **Pick it in the add-on.** Settings → Atlas Spell Effects → **Spell bases**: start typing the Base's name and
   pick it. The line under it says how many notes it found (for example "312 notes"). "Bases is off" means step 1,
   and "Not found" means the Base was moved or renamed.
6. **Check it.** Open ✨ → **Cast a spell effect…**. Your spells are listed, and the ones whose text names an area
   are under **Spells with an area**. Search for any of them by name.

Good to know:
- You can pick several Bases (core spells, homebrew, a setting's spells…). A Base with several views counts every
  view.
- A spell whose text names no area (Shield, Mage Hand) is still listed when you search for it. Set its area in the
  cast window and press **Save**.
- Without any Base, notes whose properties have a `school` and a `level`, or that have a `spell` tag, are still
  found. Turn *Also find spell notes anywhere* off to use only your Bases.
- **Optional:** add the `effect-…` columns (below) to your Base's table to see and change every saved spell in one
  place.

### Saved spells
Set a spell up as you like it in the cast window (its area, animation, colours, light, walls), then:
- **Save** keeps it as how that spell is cast from now on: the next time you cast it, from the cast window or a
  statblock, it's just like that. It's written onto the spell's own note as `effect-…` properties. Nothing else in
  the note is touched, and no copies are made. **Save changes** updates it.
- **Save as new…** keeps it as a spell of its own under a new name ("Big blue Fireball", "Darkness (small)"). It
  gets a note in the folder for them (*Spell Storage* unless you change it), with a Base of its own. Use it for a
  second version of a spell, or for an effect that isn't a spell at all.
- The **star** at the top of the cast window puts a saved spell in the menu of the map's ✨ button, to cast in one click. It's also in Ctrl+P →
  **Cast a saved spell…**.
- **Delete** (the bin at the top of the cast window) asks "Are you sure?" first. A spell of your own goes to Obsidian's bin, note and all. On one of your
  spell pages, only the `effect-…` properties come off and the rest of the note stays, so the spell is cast from its
  text again.

Saved spells are listed first in the cast window, under **Saved spells** (★). Presets from versions before 1.4
become saved spells of their own automatically, still in ✨'s menu.

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

Notes saved by older versions (plain `area`, `size`… and a `spell-effect` tag) still work. They move to the new
properties the next time you save them.

## Cast
✨ in Atlas's main toolbar (or Ctrl+P → **Cast a spell effect…**):
1. Pick a spell on the left: your saved spells (★) first, then the others. Or **+ An effect of your own**.
2. On the right: its **area** (Sphere, Around caster, Cone, Cube, Line; size; at a point or from the caster;
   lasts until ended; follows the caster), its **animation** (pictures to pick from; hover to play; ⤓ ones are fetched from JB2A when you place them; or search all),
   its **colour**.
3. **Place on the map**, then on your Atlas map:
   - an area at a point (Fireball): click where it lands (it centres on a grid corner);
   - a cone or a line (Burning Hands, Lightning Bolt): click the caster's token, then aim and click;
   - around the caster (Spirit Guardians): click the caster's token; it follows them.
   - Esc or right-click stops.
- "Follows the caster" on a cone or line keeps it on the caster's token as it moves (a beholder's antimagic eye).
- Instant spells play once and go. Lasting ones stay until ended, also after you restart Obsidian.
- ✨'s arrow: **Cast <spell> again**, your starred saved spells, **Spell AoE player preview**, **End** each
  lasting effect, **End them all**.
- **Spell AoE player preview** (✨'s menu, or the settings; off unless you turn it on): while you place a spell,
  the players' screen shows its area, so they can see what it will cover before you cast it. Choose its look in
  the settings (*Player preview style*): **Outline** (its edge, dashed, over a faint wash of its colour), **Filled**, or **Animation** (the
  spell's own, a little see-through).

## Moving and changing effects
- **Drag** an effect like a token to move it. Tokens come first: pressing a token inside an aura moves the token.
  Grab the aura away from its token to move the aura itself (it then stays where you put it).
- **Shift-drag** a cone, line or cube to turn it about its point (15° steps with snapping on).
- **Double-click** an effect (or right-click → Edit) to change it as it stands, live on your map and the TV:
  name, size, width, turn, lasts until ended, animation and colour, and its token:
  - **Attach to a token…** then click the token: it keeps its place and moves with that token;
  - **Turns with them**: it also turns as the token turns (a beholder's antimagic eye);
  - **Detach** leaves it where it is.
- **Right-click** an effect: Edit or End.

## Snapping
**Snap to grid** (✨'s menu, the cast and edit windows, or Ctrl+P → "Snap effects to the grid on or off"):
spheres and cubes centre on grid corners, cones and lines start from one when placed on empty ground, and Shift-
turning goes in 15° steps. Hold **Alt** to do the other for one placing or drag. Auras around a creature stay
centred on it.

## Good to know
- Effects are drawn inside Atlas's map, under every token (whatever its size), its bars and handles, and under
  Atlas's lighting and fog of war, which light and hide them like the floor. A token the players can't see (hidden,
  or in darkness) leaves no trace. Effects on a creature (Shield) sit just over their token, and only where the
  players can see that creature.
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
- Darkness covers the effect's area and grows or shrinks with it. It also puts up a ring of Atlas walls that block
  sight round its edge: no one sees into, out of or through it, and light doesn't pass, but tokens can walk in.
- The light moves with the effect: drag it, or let it ride on a token. A wall glows along each of its stretches,
  and a line along its whole length.
- Ordinary lights follow live as you drag. Darkness, and lights over a whole area (walls, lines, cubes), move once
  you let go: Atlas works those out again in full each time, so moving them live would slow it down.
- Ending the effect removes its light. If you delete the light in Atlas yourself, the add-on leaves it deleted.
- The add-on's light changes aren't undo steps, so Ctrl+Z stays for your own edits.
- Scene lighting must be on in Atlas to see them.

## Picking and adjusting
Click an effect on your map to pick it. It shows Atlas's own controls for a picked token, on your screen only (never
on the TV):
- an **outline** in your accent colour, round its actual shape;
- the round **rotate** button: drag it to turn the effect (a cone or line turns about its point, keeping its length);
- **‹ ›**: drag them to change the size (a cone or line has › at its far end, for its length);
- the **size** (in your game's unit), with **+** and **−** for one square more or less;
- on a wall, a **dot on each corner**: drag one to reshape the wall (its Atlas walls and lights follow).

With snapping on, sizes go in steps of one square, turns in 15° steps, and wall corners land on grid corners. Hold Alt for the
other way. Drag the effect itself to move it. **Esc** lets go, and **Delete** ends what's picked. Effects on a token
(a beholder's antimagic cone) keep their token.

**Several at once:** drag Atlas's selection box (or lasso) across the map and the effects inside it are picked along
with the tokens. Shift-click adds or removes one. Drag one of them and they all move. Delete ends them all.

## Undo and redo
**Ctrl+Z** undoes casting, ending, moving, resizing, turning and editing effects, and **Ctrl+Y** or **Ctrl+Shift+Z**
redoes. It's interleaved with Atlas's own history: whichever was done last is undone first, whether that's an effect
or something in Atlas. Atlas's Undo and Redo buttons work the same way. Everything changed in the double-click editor,
from opening it to closing it, is one step.

## Inner and outer colours
Effects drawn without an animation have an **Inner** colour (the heart) and an **Outer** colour (the edge and glow),
and every effect has an **Opacity** slider. They're in the cast window and the double-click editor, and they're
kept with saved spells (`effect-colour`, `effect-colour-outer`, `effect-opacity`).

## Casting from Atlas statblocks
In Atlas's statblocks (Ctrl / ⌘ + hover a token, the side panel, or a statblock note), every spell this
add-on knows gets a small **Cast** button in front of its name, written as its note writes it ("fire bolt" reads
"Fire Bolt"), and spell lists show one spell a line: every spell in your spell notes and saved spells, by its name, its note's `aliases`,
and its name without its inventor ("Hideous Laughter" for "Tasha's Hideous Laughter", as 2024 names it). They're
found in:
- spell lists (Atlas's, in a list or in tabs, and Fantasy Statblocks');
- text about spellcasting: a 2024 *Spellcasting* action's "At Will:" and "1/Day Each:" lines, Pathfinder's
  "Arcane Prepared Spells", "casts *Fireball*", spell cards (*Casting Time… Range… Components…*);
- a spell name standing on its own in bold, italics or a link: an action called ***Cone of Cold (Recharge 5–6).***,
  or `[[Shield]]`;
- anything under a heading, label or tab about spells (*Spells*, *Cantrips*, *Prepared*, *Magic*…), such as a
  player's spells shown as chips or as entries of their own;
- in a statblock that has spells anywhere: a spell that is the whole of its line, chip or cell; a run of spells
  after a label (*Magic Initiate (Wizard): Fire Bolt, Mage Hand, Shield*); and a spell of two words or more
  anywhere in its text (*Misty Step*, *Cure Wounds*).

Other text doesn't count, so "dim light" in a description, or a trait called *Light Sensitivity*, gets no button.
Nor does anything under a heading or label about gear (*Equipment*, *Inventory*, *Magic Items*…), so a shield
there stays a shield.
A spell whose text names no area can be cast too: on its caster when its range is Self (Shield, *On a creature*), otherwise on a
square at a point within range (Mage Hand).

**Who's casting.** The add-on finds the creature casting it from the statblock:
- a statblock opened from a token (Ctrl / ⌘ + hover) is that token's;
- in Atlas's side panel, it's the token selected on the map;
- in a statblock note open in a tab, it's the one token on the map linked to that note.

If it can't tell, it asks you to click the caster's token first.

**Cast** opens a small menu:
- the caster and the spell's range (*Archmage · 150 ft*), or *No caster on the map*;
- how it's cast, as you saved it (or as its text says): *Click where it goes on the map*, *Aim it on the map*,
  *Click a token on the map*, *Click a target on the map*, *Draw it on the map*, or *Cast on Archmage*. With the
  caster known:
  - an aura lands on them at once;
  - a cone or line (Lightning Bolt, Burning Hands) starts from them, so you just aim;
  - an area cast at a point (Fireball) shows its **range** as a dashed ring round them (150 ft, from the edge of
    their space), and can't be placed beyond it;
- for a spell cast at creatures (Fire Bolt, Hold Person): **each creature in its range**, nearest first, with how
  far away they are (*Goblin · 25 ft*). Pick one and it's cast on them at once, from the caster, no clicking on
  the map. (More than twelve: the rest are clicked on the map.)
- **Cast with no target**: its animation once on the caster;
- **Open in the cast window…**, with that spell picked, so you can change it first.

The buttons only sit beside the statblock's text; nothing in it is changed. Where Atlas draws a statblock's text
itself rather than as markdown, the name is underlined instead and a click on it casts it (Shift-click: the cast
window).

### Statblocks with spells: where to get them, and a template
- **Ready-made:** the [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin comes with the 5e
  SRD's creatures, spellcasters among them (Mage, Archmage, Priest, Lich…). With it installed, a note holding a
  `statblock` code block that names one (`creature: Archmage`) is a statblock Atlas can link tokens to.
- **Your own:** copy [`examples/Battle Mage (statblock with spells).md`](examples/Battle%20Mage%20(statblock%20with%20spells).md)
  into your vault and change it. It's an Atlas statblock (5E 2014 template) with a spell list and spells named in
  its actions. The parts that matter:
  - `statblock: true` and `atlas-template` make the note an Atlas statblock;
  - `spells:` is the spell list: a first line ending in a colon (the heading), then one line per level,
    `1st level (4 slots): burning hands, magic missile, shield`;
  - in actions, traits and reactions, spell names in *italics* (or after "casts") are clickable too.
- Or in Atlas's statblock editor, add spells to the **Spellcasting** part of any statblock in the same way.

Only spells the add-on knows (your spell notes, see *Spells: your Bases*) are clickable.

## Your game system
The add-on reads the game system of the map's collection from Atlas (**Settings → Atlas Spell Effects** shows what it
found, by name), so there's nothing to set up. It works with every system built into Atlas: D&D 5e, Pathfinder 2e,
Daggerheart, Shadowdark, Old-School Essentials, Cairn, Call of Cthulhu, Cyberpunk RED and Draw Steel, and with your
own.
- **Units:** sizes and ranges are in your game's own unit, as Atlas's rulers and lights are: feet, yards (Call of
  Cthulhu), metres (Cyberpunk RED) or squares (Draw Steel). Steps, and things that default to "one square" (a
  line's width), follow your grid.
- **Spell text** is read the way Atlas reads statblocks, and converted into your unit: "60 ft.", "18 m", "20'",
  "10 yards", "12 squares". A D&D spell's 20 ft is 6 m in a metric game, 6.67 yd in Call of Cthulhu, and 4 squares
  in Draw Steel.
- **Other games' wording:** Pathfinder's "20-foot burst", "30-foot emanation" and "**Range** 500 feet";
  Old-School Essentials' "20' radius"; Cyberpunk RED's "10m square"; Draw Steel's "3 burst", "3 cube within 10",
  "5 × 1 line".
- **Range bands** (Daggerheart, Shadowdark), at the squares Atlas gives them: "all adversaries within Very Close
  range" is an area round the caster, "a Near-sized cube" a cube, and a range of "Far" shows as a ring.
- **Cone angle:** 53° in D&D 5e, 90° in most others. Leave *Cone angle* empty in the settings to follow Atlas, or
  enter one to override it.

Saved spells keep their sizes in the unit they were saved in, so save them again if you change a collection's
system.

## Spells cast at creatures
Spells with no area are cast by clicking their targets. Click the spell (in a statblock or the cast window's
**Place on the map**), then click each target token. Keep clicking for more targets, and press Esc, Enter or
right-click when done.
- **On a creature** (Shield, Hold Person, Bless, Cure Wounds…): the effect plays on the creature, round its token
  and over it, a little bigger than its space (or bigger still, with "reaching N ft past its space"). If the spell
  lasts, it stays on that creature and moves with it. Choose who it's on: **The caster** (Shield, and any spell
  with a range of Self: from a statblock it lands on that creature at once, otherwise one click on the caster), or
  **Each creature you click**.
- **A bolt at a creature** (Fire Bolt, Ray of Frost, Magic Missile, Disintegrate…): the effect shoots from the
  caster to each creature you click. From a creature's statblock, that creature is the caster. Otherwise, click
  the caster first.

Which kind a spell is gets read from its text (ranged spell attacks, rays, bolts and darts are bolts; spells naming a
creature or target play on it). Change it in the cast window: **On a creature** in the Area row, or *A bolt at creatures* on a Line. It's
kept with a saved spell as `effect-target` (`self`, `on` or `bolt`).

## Spells as Atlas areas (Atlas 0.15 or later)
Each spell you cast is one of Atlas's own areas too (the kind its Measure tool keeps), and the animation plays over
it. So Atlas:
- **draws its area**, in the spell's colour, with one of its looks: *Fire*, *Frost*, *Lightning*, *Mist*,
  *Radiance* or *Shadow*. The look is picked from the spell's damage or name (Fireball: Fire, Cone of Cold: Frost,
  Darkness: Shadow, Fog Cloud: Mist); change it with **Atlas area look** in the cast window (kept as `effect-look`);
- **lights it**: a spell's light, or its magical darkness, is the area's (a darkness only round a point: in another
  shape, the add-on puts up its own);
- **counts the creatures in it** as far as walls let it, as it rings them: the add-on's conditions and its "hit"
  cards go by that count;
- **saves it with the scene and shows it to online players** (they see Atlas's area and its look; the animation
  only on your screens).

It works both ways. Move, resize or recolour the area with Atlas's handles and the spell follows; delete it in Atlas
and the spell ends; end the spell and its area goes. A cone, a line or a cube is Atlas's; a creature's aura (Spirit
Guardians) is an aura on that creature in Atlas too. Walls, bolts and effects on a creature stay the add-on's alone.

**Atlas's choices in the cast window** (its **Atlas area** part, on an Atlas map that has areas):
- **Drawn as**: the animation over Atlas's area (as above), *Atlas's area only* (no animation: just Atlas's look), or
  *Animation only* (no Atlas area: the add-on's own way, as before);
- **Look**, **Light** (*the spell's*, *Atlas's for its look*: Fire and Lightning flicker, Radiance shines, Shadow
  darkens, or *none*), **Stops at walls** and **Players see it**, as Atlas's area popover has them;
- **Place with Atlas's Measure tool**: the tool is picked with the spell's shape, colour and look, you draw the area
  with it (its snapping, its cone), and the spell goes on that area; the tool goes back as it was. Esc stops.

All of it is kept with a saved spell (`effect-draw`, `effect-area-light`, `effect-walls`, `effect-players`,
`effect-tool`).

**Atlas's own area window:** click an area's handle and Atlas's window for it opens as usual, with a small
**Spell Effects** part above its last row:
- a spell's area: its name, **Edit spell…** (the add-on's edit window for it) and **End spell**;
- one of your own areas, drawn with Atlas's Measure tool: **Animate…**, which opens the cast window to pick a
  spell for it. Its animation, conditions and so on go on that area, where it lies; ending the spell leaves your
  area as it was.

A burst's animation (Fireball's explosion) is grown so the blast itself reaches the edge of its circle; JB2A's
art leaves empty room round it. Stray sparks may go a little past the edge.

A cone is drawn the way Atlas draws cones (your game's cone angle, with a rounded end unless its rules make cones
flat), so where you aim it is exactly where its area lands.

A spell's area takes its look's own colour (Frost pale blue, Fire orange…), not the spell's colour. Change it in
Atlas's window and your colour is kept.

Turn it off with **Spells as Atlas areas** in the settings (the add-on then draws spells alone, as before Atlas
0.15).

**Lasting spells.** A creature inside a lasting spell (Darkness, Silence, Spirit Guardians, Web…) gets Atlas's
**In a spell** condition, plus the conditions the spell gives, for as long as it's inside. They come off again when
it leaves or the spell ends. The add-on adds *In a spell* to your collection's conditions the first time it's
needed. Only what the add-on put on is taken off: a condition the creature had already stays, and one you take off a
creature that saved stays off while it's still inside. An aura round its caster marks the others in it, not the
caster.

**Instant spells.** The creatures an instant spell hits (Fireball, Thunderwave…) are listed on a small card beside
the map, on your screen only, and are *In a spell* while it shows. Close it with **×** when you've dealt with them.
A line, cone or aura from a caster never catches the caster.

**A spell's conditions** are read from its text ("has the Restrained condition", "falls Prone"; not the ones it ends
or guards against), and Darkness gives Blinded. Change them in the cast window's **Conditions** row, which shows
your collection's conditions (lasting spells). They're kept with a saved spell as `effect-conditions`.

Turn it all off with **Mark creatures in spells** in the settings.

## The spell turn tracker
During a fight in Atlas's initiative tracker, each lasting spell shows how many rounds it has been up beside it
(*Round 3*), on your screen only. It counts from the round the spell was cast in, or from the first round of a fight
that started later. Spells never end on their own. Turn it off with **Spell turn tracker** in the settings.

It also shows the time (*Round 3 · 12 s*) where the game system's round has a length: 6 seconds in D&D 5e and
Pathfinder 2e, 10 in Old-School Essentials and Cairn, 3 in Cyberpunk RED. Daggerheart, Call of Cthulhu, Shadowdark
and Draw Steel have no fixed round, so they count rounds only, as do your own systems until you set one. Change any
of them with **Round length** in the settings (*6 seconds*, *10 s*, *1 minute*…; empty: rounds only). It's kept for
each game system.

## Teleporting
Spells that teleport their caster (Misty Step, Far Step, Dimension Door, Thunder Step: "you teleport…") move the
token. Cast it, click the caster (if it isn't known from their statblock or selected), and how far they can go shows
round them; click where they go. Its animation plays where they leave and where they arrive, and the token lands in
the grid's squares, never further than it can go. It's Atlas's own move, so Ctrl+Z puts it back. Turn it on or off
for any spell, and set how far, with **Teleports the caster** in the cast window (kept as `effect-teleport`).

## Recent spells, and casting with no target
- The last five spells you cast are at the top of ✨'s menu (*Cast Fireball again*) and of the cast window.
- In a statblock's **Cast** menu, **Cast with no target** plays the spell's animation once on its caster.
- A saved spell keeps its range (`effect-range`), so its range ring shows, and the units its sizes are in
  (`effect-unit`). In a collection with another game system (metres, say), its sizes are read as the same number of
  squares.

## Licence
The add-on's code: MIT (see `LICENSE`). JB2A's animations are not part of it. They're downloaded from JB2A and
stay under JB2A's own licence, CC BY-NC-SA 4.0, which is also why this add-on is and stays free.

## Building
`npm install`, then `npm run build` (makes `main.js`). `npm run check` type-checks, and `npm run lint` runs
Obsidian's own code rules. Pushing a tag such as `1.0.1` makes a GitHub release with `main.js`, `manifest.json` and
`styles.css` (see `.github/workflows/release.yml`). Set the same version in `manifest.json` and `versions.json`
first.
