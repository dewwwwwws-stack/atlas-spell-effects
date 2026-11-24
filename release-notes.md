## New

- **Explain the buttons on open statblocks** (a command). Lists every open statblock's entries, whether each got a Cast, Attack or Use button, and if not, why: rolling off, attack animations off, no attack found in its text, and so on. Copy it to send with a bug report.

## Fixes

- **Attack animations now download before they play.** A melee attack's JB2A animation (a spear's thrust, a greatsword's swing) that wasn't in the vault yet played as a plain coloured square. It's now fetched from JB2A first.
- **Statblocks on Atlas's DM screen** find their own creature by their note. Before, with rolling set to NPCs only, a statblock there could be taken for whichever token was selected (a player's), and its attacks got no buttons.
- **One awkward entry no longer stops a statblock's other buttons.** If something goes wrong reading one entry, the rest still get their buttons, and the problem is shown in the console and in the Explain command.
