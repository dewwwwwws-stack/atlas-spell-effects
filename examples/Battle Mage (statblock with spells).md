---
statblock: true
atlas-template: builtin:5e-2014-monster
name: Battle Mage
size: Medium
type: humanoid
alignment: any alignment
ac: 15
hp: 66
hit_dice: 12d8+12
speed: 30 ft.
stats: [9, 14, 12, 18, 12, 11]
senses: passive Perception 11
languages: Common, Draconic
cr: 7
traits:
  - name: War Caster
    desc: The battle mage has advantage on saving throws to keep its concentration.
actions:
  - name: Staff
    desc: "*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) bludgeoning damage."
  - name: Arcane Barrage
    desc: The battle mage casts *Fireball* or *Lightning Bolt*, using a spell slot as normal.
reactions:
  - name: Counter
    desc: When a creature it can see casts a spell within 60 feet, the battle mage casts *Counterspell*.
spells:
  - "The battle mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 15, +7 to hit with spell attacks). It has the following wizard spells prepared:"
  - Cantrips (at will): fire bolt, light, mage hand, shocking grasp
  - 1st level (4 slots): burning hands, magic missile, shield, thunderwave
  - 2nd level (3 slots): darkness, misty step, shatter
  - 3rd level (3 slots): counterspell, fireball, lightning bolt
  - 4th level (3 slots): ice storm, wall of fire
  - 5th level (1 slot): cone of cold
---

A template for an Atlas statblock whose spells Spell Effects for AtlasVTT can cast. Copy this note, rename it,
and change what you like. The parts that matter:

- `statblock: true` and `atlas-template` make it an Atlas statblock (the 5E 2014 template here; any template with
  a Spells field works).
- `spells:` is the spell list. Its first line, ending in a colon, is the heading. Each line after it is
  `<level>: <spell>, <spell>, …`, and every spell name there that matches one of your spells is clickable.
- In actions, traits and reactions, write spell names in *italics* (or after "casts") and they are clickable too.

Link a token to this note in Atlas, then Ctrl / ⌘ + hover the token on the map, and click a spell.
