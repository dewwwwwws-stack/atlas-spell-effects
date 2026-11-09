# Atlas Spell Effects

Animated spell areas on your Atlas VTT maps: Fireball's burst, Burning Hands' cone, Lightning Bolt's line,
Spirit Guardians around the cleric. They show on your screen and on the player window (the TV), in the right
place and at the right size, and follow the players' own view. A bridge until Atlas has effects of its own.

> A community add-on for [Atlas VTT](https://community.obsidian.md/users/atlas-vtt). It is not made, endorsed or
> supported by Atlas VTT, Atlas Online or JB2A.

## Needs
- **Atlas VTT** (tested with 0.12), on desktop.
- Obsidian 1.10 or later. Spell bases need the Bases core plugin on.

## Install
Settings → Community plugins → Browse → search **Atlas Spell Effects** → Install → Enable. Then open an Atlas map:
✨ is in Atlas's toolbar.

## What it reads, writes and downloads
- **Network:** the only thing it fetches is JB2A's free animations, from JB2A's public GitHub
  (`raw.githubusercontent.com/Jules-Bens-Aa/JB2A_DnD5e`). That happens when you first use an animation, when its
  preview picture shows in the cast window, or when you press *Download everything*. Turn *Offer every JB2A
  animation* off in the settings and it fetches nothing at all. No tracking, no accounts, nothing sent anywhere.
- **Your vault:** it saves downloaded animations, and a JB2A credit and licence note, in the JB2A folder
  (`JB2A_DnD5e`). *Save as defaults* writes `effect-…` properties onto that spell's note. An effect of your own gets
  a note, and a Base, in its own folder (*Spell Storage*). It never deletes or changes anything else.
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
Pick **Spell bases** in the settings (start typing a `.base` file's name), as you pick loot bases in Atlas. Every
note a Base shows, in any of its views, is a spell. Your compendium's spell pages, homebrew notes, anything.
Its area, light and walls are read from its text (and from "**Range:**" and "**Duration:**" lines).

Without a Base, any note whose properties have a `school` and a `level`, or that has a "spell" tag, is offered
(turn *Also find spell notes anywhere* off to use only your Bases).

**Saved defaults.** In the cast window, **Save as defaults** writes the area, animation, colour, light and walls
onto the spell's own note as `effect-…` properties. Nothing else in the note is touched, and no copies are made.
Spells with saved defaults are listed first (★). Add the `effect-…` columns to your Base to see and edit them all
in one table. An effect of your own (not a spell note) gets a note in the folder for them (*Spell Storage* unless
you change it), with a Base of its own.

| Property | What it does | Example |
|---|---|---|
| `effect-area` | sphere `radius`, `emanation` (around the caster), `cone`, `cube`, `line`, `wall` | `radius` |
| `effect-size` | radius / side / length in feet | `15` |
| `effect-width` | a line's width, or a wall's thickness, in feet | `5` |
| `effect-origin` | `point` or `caster` (spheres and cubes) | `point` |
| `effect-lasting` | stays until ended | `true` |
| `effect-attach` | follows the caster's token | `true` |
| `effect-animation` | the animation file | `[[Darkness_01_Black_600x600.webm]]` |
| `effect-colour` | colour for a drawn effect | `#6a3cff` |
| `effect-ring` | a wall's ring form: its diameter in feet | `20` |
| `effect-round` | make the wall as that ring | `true` |
| `effect-walls` | a wall's real Atlas walls: `none`, `sight`, `movement` or `solid` | `sight` |
| `effect-light` | `light`, `darkness` or `none` | `darkness` |
| `effect-bright` / `effect-dim` | the light's bright and dim range in feet | `20` / `40` |
| `effect-light-colour` | the light's colour | `#ffd28a` |
| `image` (or `effect-image`) | card art, shown in the cast window | `[[Darkness card.png]]` |

Notes saved by older versions (plain `area`, `size`… and a `spell-effect` tag) still work. They move to the new
properties the next time you save them.

## Cast
✨ in Atlas's main toolbar (or Ctrl+P → **Cast a spell effect…**):
1. Pick a spell on the left: ones with saved defaults (★) first, then the others. Or **+ An effect of your own**.
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
- ✨'s arrow: **Cast <spell> again**, **End** each lasting effect, **End them all**.

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
- Effects are drawn over the map, so they also show over fog of war: cast where players can see.
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
- Darkness covers the effect's area and grows or shrinks with it.
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
- the **size** in feet, with **+** and **−** for 5 ft more or less;
- on a wall, a **dot on each corner**: drag one to reshape the wall (its Atlas walls and lights follow).

With snapping on, sizes go in 5 ft steps, turns in 15° steps, and wall corners land on grid corners. Hold Alt for the
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
kept with saved defaults (`effect-colour`, `effect-colour-outer`, `effect-opacity`).

## Presets
Set a spell up as you like it, then press **Save as preset…** in the cast window and give it a name, for example
"Big blue Fireball". A spell can have as many presets as you like. Presets show:
- at the top of the cast window, under **Presets** (pick one to change it, then **Update preset**, or **Delete preset**);
- in ✨'s menu, where one click casts it;
- in Ctrl+P → **Cast a preset…**.

## Casting from Atlas statblocks
In Atlas's statblocks (Ctrl / ⌘ + hover a token, the side panel, or a statblock note), the names of spells this
add-on can cast are highlighted. That means spells with an area or saved defaults, matched by name to your spells and presets.
Only spell lists, Spellcasting text, spell cards (*Casting Time… Range… Components…*), and spell names in bold or
italics count, so "dim light" in a description isn't a link. A statblock opened from a token (Ctrl / ⌘ + hover) knows
its creature. In the side panel, the token selected on the map is the caster.
- **Click** a name to cast it straight away with its saved defaults or presets. If the statblock was opened from a
  token on the map, that creature is the caster: an aura lands on it at once, and a cone or line starts from it,
  so you just aim.
- **Shift-click** opens the cast window with that spell picked, so you can change it first.
- **Ctrl / ⌘-click** does what Atlas would do (opens a linked note, for example).

The statblock itself isn't changed: the underline is drawn over it.

## Spells cast at creatures
Spells with no area are cast by clicking their targets. Click the spell (in a statblock or the cast window's
**Place on the map**), then click each target token. Keep clicking for more targets, and press Esc, Enter or
right-click when done.
- **On a creature** (Hold Person, Bless, Cure Wounds…): the effect plays on each creature you click, the size of
  its space (or bigger, with "plus N ft"). If the spell lasts, it stays on that creature and moves with it.
- **A bolt at a creature** (Fire Bolt, Ray of Frost, Magic Missile, Disintegrate…): the effect shoots from the
  caster to each creature you click. From a creature's statblock, that creature is the caster. Otherwise, click
  the caster first.

Which kind a spell is gets read from its text (ranged spell attacks, rays, bolts and darts are bolts; spells naming a
creature or target play on it). Change it in the cast window: *A bolt at creatures* on a Line, *On creatures* on
an "Around caster" area. It's kept with saved defaults as `effect-target` (`on` or `bolt`).

## Licence
The add-on's code: MIT (see `LICENSE`). JB2A's animations are not part of it. They're downloaded from JB2A and
stay under JB2A's own licence, CC BY-NC-SA 4.0, which is also why this add-on is and stays free.

## Building
`npm install`, then `npm run build` (makes `main.js`). `npm run check` type-checks, and `npm run lint` runs
Obsidian's own code rules. Pushing a tag such as `1.0.1` makes a GitHub release with `main.js`, `manifest.json` and
`styles.css` (see `.github/workflows/release.yml`). Set the same version in `manifest.json` and `versions.json`
first.
