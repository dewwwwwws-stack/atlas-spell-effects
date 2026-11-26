# Combat+ 1.13.16

Combat+ now follows more of your collection's and scene's Atlas settings:

- **Grid off:** on a map with Atlas's grid turned off, nothing snaps.
- **Snap to grid:** a creature that moves, teleports or is pushed lands where Atlas would put it down. With Atlas's **Snap to grid** off, it lands where you click (Alt for the other way). Areas still snap as Combat+'s own snap setting says.
- **Hex grids:** areas and tokens snap to a hex's middle, and distances (moves, teleports, ranges, reach, pushes) count hex steps, as Atlas's ruler does.
- **When an area catches a creature** (Grid and measurement → an area covers a cell when): half of a square covered (Atlas's default, and the 2024 rule), its middle, or any of it. This is for areas Combat+ draws itself; Atlas's own areas already used it.
- **Custom units:** a custom unit shows its own name ("mi", "ly"), the scene's where it sets one.
- **Hit points:** damage and healing go to the collection's own hit point resource, whatever it's called. Hit points that fill as they're marked (as Daggerheart's do) go up with damage and down with healing.
- **A creature with no speed:** a creature whose statblock states no speed moves as far as the collection's movement rules give such creatures.

**Difficult terrain on the way:**

- A creature whose ability moves it ("moves up to half its Speed") now pays for difficult terrain on the way, as Atlas's movement ruler counts it: each square of rubble or Spike Growth costs double. Atlas's own difficult terrain counts where the collection's rules price it (Grid and measurement → Difficult terrain).
- **Spells that cost more than double** are read from their text: Plant Growth and Transmute Rock (each foot costs 4), Wall of Sand (3), Druid Grove's fog ("2 extra feet": 3), and Pathfinder's greater difficult terrain (3). Where terrains overlap, the dearest counts. A teleport pays nothing.
- **Who ignores it:**
  - **Flying:** a flying move (or a token raised above the floor, or airborne) ("fly up to half its flying speed") passes over difficult terrain on the ground (rubble, Spike Growth, Plant Growth, Grease), but still pays for terrain that fills the air (Web, Insect Plague, fog, wind, a wall). Which one a spell makes is read from its text, and can be changed in the cast window (**Fills the air**).
  - **The creature's statblock:** a creature whose statblock or note says it ignores difficult terrain ("ignores difficult terrain", "isn't slowed by difficult terrain", Land's Stride) pays nothing. "The target ignores difficult terrain" doesn't count: that's another creature.
  - **Spider Climb and Web Walker:** webs cost nothing; other terrain still does.
  - **Freedom of Movement:** with it on the creature, nothing.
  - **By hand:** the cast window's Movement section has **How it moves** (on foot, flies, swims, climbs, burrows) and **Ignores difficult terrain**.
- The hint says when difficult terrain is costing more. The outline round the creature still shows its full reach.
- In the cast window, **Difficult terrain** (under Also) now has a choice of how much each foot costs: 2, 3 or 4.
- **Dragging a token by hand:** Atlas's movement ruler now counts the same way. Plant Growth costs 4 a foot there too, and a token that's flying pays nothing for terrain on the ground. A token counts as flying when it's raised above the floor (its height) or has a condition that makes it airborne. A creature whose statblock ignores difficult terrain, a spider in webs and Freedom of Movement count too. Combat+ only adds the difference to what Atlas counts, so the ruler's label, its movement colours and the distance counted for the turn all agree. (A player dragging over Atlas Online sees Atlas's own count.)
- A spell that says something "doesn't count as difficult terrain" (Kinetic Jaunt) or turns it "into ordinary terrain" (Speak with Plants) no longer makes difficult terrain.
