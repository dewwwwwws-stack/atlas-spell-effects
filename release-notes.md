## Improvements

- **Cards close themselves.** Once a card's damage is applied, it closes a few seconds later, after the pointer has moved off it. A card with nothing to apply (everyone missed or saved) closes too, a little later so there's time to read it. You can turn this off in Settings → Rolling.
- **Apply damage from the keyboard.** A new command, *Apply damage from the latest card*, applies the newest card's damage. Give it a hotkey in Settings → Hotkeys.
- **Lots more hotkeys**, with a **Set hotkeys** button at the top of the settings that opens Obsidian's hotkeys showing only Combat+'s commands. Commands you can give a key to:
  - **Cards:** apply the latest damage, close the latest card or every card, reroll the latest card (normally, with advantage or with disadvantage), mark the next player's save as saved or failed, and use Legendary Resistance.
  - **Effects:** end the newest lasting effect (as well as cast again, end every lasting effect and the others already there).
  - **Switches:** rolling on or off, rolling for everyone or NPCs only, spell effects, the players' area preview, areas through walls, spells over tokens, cards closing themselves, and the built-in SRD spells.
- **Middle-click to cast straight away.** Middle-click a statblock's Cast, Use or Attack button to go straight to clicking a token on the map, without the menu.
- **Hit and miss colours swapped:** a hit, a crit or a failed save is green, and a miss or a successful save is red, as seen by whoever's attacking.
- **Matching colours without JB2A.** A spell with no animation (JB2A's turned off, or none fits) is now drawn in colours that suit it, by damage type or school, with a fitting motion (fire flickers, frost shimmers), instead of always orange.
- **Animations for more creature abilities.** Abilities that do no damage (a stench, an ink cloud, a fear aura, a roar, a song, a glow) now get a fitting JB2A animation. A few SRD spells get better ones too (summons, wards, Wish, Power Word Kill, Incendiary Cloud).

## Fixes

- **Notes imported from 5e.tools** (or with Fantasy Statblocks' tags) are read properly. Damage like `{@damage 8d6}`, DCs like `{@dc 14}`, attack bonuses like `{@hit 6}` and higher-slot damage are now picked up, so spells like Fireball roll their damage. So are the Dice Roller plugin's inline dice (`` `dice: 8d6` ``) and dice in bold.
- **The built-in SRD's 2024 Mule** no longer has the Octopus's traits and attacks, which were copied onto it by mistake in the source data.
