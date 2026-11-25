# Combat+ 1.13.11

- **Less work when a note changes.** When a note changes and no creature's statblock did, the list of creatures' abilities is no longer sorted all over again (with a big bestiary that is thousands of names), and names are put in order faster when it is.
- **Smoother with effects on the map.** To show a move cursor over an effect, Combat+ asked the browser what was under the pointer once a frame. That made the browser lay out the whole window again every frame, even while a token was being dragged. It now uses what the browser already knows about the pointer, and doesn't look at all while a button is held.
