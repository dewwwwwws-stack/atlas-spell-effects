# Combat+ 1.13.10

- **No more long freezes when a note changes.** Whenever any note in the vault changed (Atlas saving, a character synced, a pip pressed), Combat+ read every spell note and every creature's statblock again. With a big bestiary that could freeze Atlas for a second or more, over and over while you played. It now reads again only the notes that changed, and leaves the open statblocks alone unless what can be cast changed.
- **Find what slows Atlas down, more telling.** It now counts every change of Atlas's map (it missed most before) and how many notes changed in the vault while it measured, and it times Combat+'s reading of notes too.
