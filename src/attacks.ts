// Animations for plain attacks (a sword, a bite, a longbow), optional: JB2A's free weapon animations, chosen by the
// attack's name, played from the attacker to the target. Magical attacks (a mage's Arcane Burst: Force damage) get
// the bolt their damage type has (as a spell of that kind would).
import type { EffectFile } from './library';
import { elementsOf } from './elements';

/** The default animations to choose from: for a melee attack, and a ranged one (paths in JB2A's library; '' none). */
export const MELEE_DEFAULTS: Readonly<Record<string, string>> = { slash: 'Generic/Weapon_Attacks/Melee/GenericSlash01', sword: 'Generic/Weapon_Attacks/Melee/Sword01', claw: 'Generic/Creature/Claw/', unarmed: 'Generic/Unarmed_Attacks/Unarmed_Strike/', none: '' };
export const RANGED_DEFAULTS: Readonly<Record<string, string>> = { arrow: 'Generic/Weapon_Attacks/Ranged/Arrow01', bolt: 'Generic/Weapon_Attacks/Ranged/Bolt01', bullet: 'Generic/Weapon_Attacks/Ranged/Bullet', dagger: 'Generic/Weapon_Attacks/Ranged/Dagger01', none: '' };
export const MELEE_NAMES: Readonly<Record<string, string>> = { slash: 'A slash', sword: 'A sword swing', claw: 'A claw strike', unarmed: 'A punch', none: 'None (drawn)' };
export const RANGED_NAMES: Readonly<Record<string, string>> = { arrow: 'An arrow', bolt: 'A crossbow bolt', bullet: 'A sling bullet', dagger: 'A thrown dagger', none: 'None (drawn)' };

// by its name: [what it's called, its animation, thrown or shot]
const WEAPONS: readonly [RegExp, string, boolean][] = [
  [/\b(?:long|short|great)?bow\b/, 'Generic/Weapon_Attacks/Ranged/Arrow01', true],
  [/\bcrossbow\b/, 'Generic/Weapon_Attacks/Ranged/Bolt01', true],
  [/\bsling\b|\bmusket\b|\bpistol\b/, 'Generic/Weapon_Attacks/Ranged/Bullet', true],
  [/\b(?:rock|boulder|stone|trash|lob)\b/, 'Generic/Weapon_Attacks/Ranged/BoulderToss02', true],
  [/\bflask\b|\bvial\b|\bbomb\b/, 'Generic/Weapon_Attacks/Ranged/ThrowFlask01', true],
  [/\bdart\b|\bjavelin\b/, 'Generic/Weapon_Attacks/Ranged/Dagger01', true],
  [/\bgreatsword\b/, 'Generic/Weapon_Attacks/Melee/GreatSword01', false],
  [/\bgreataxe\b/, 'Generic/Weapon_Attacks/Melee/GreatAxe01', false],
  [/\bgreatclub\b/, 'Generic/Weapon_Attacks/Melee/GreatClub01', false],
  [/\bhandaxe\b|\b(?:battle)?axe\b/, 'Generic/Weapon_Attacks/Melee/HandAxe02', false],
  [/\bhalberd\b|\bpike\b/, 'Generic/Weapon_Attacks/Melee/Halberd01', false],
  [/\bglaive\b/, 'Generic/Weapon_Attacks/Melee/Glaive01', false],
  [/\bmaul\b/, 'Generic/Weapon_Attacks/Melee/Maul01', false],
  [/\bwarhammer\b|\bhammer\b|\bwar pick\b|\bpick\b/, 'Generic/Weapon_Attacks/Melee/Warhammer01', false],
  [/\bmace\b|\bmorningstar\b|\bflail\b/, 'Generic/Weapon_Attacks/Melee/Mace01', false],
  [/\bclub\b/, 'Generic/Weapon_Attacks/Melee/Club01', false],
  [/\bquarterstaff\b|\bstaff\b/, 'Generic/Weapon_Attacks/Melee/Quarterstaff01', false],
  [/\brapier\b/, 'Generic/Weapon_Attacks/Melee/Rapier01', false],
  [/\bscimitar\b/, 'Generic/Weapon_Attacks/Melee/Scimitar01', false],
  [/\bfalchion\b/, 'Generic/Weapon_Attacks/Melee/Falchion01', false],
  [/\bshortsword\b/, 'Generic/Weapon_Attacks/Melee/Shortsword01', false],
  [/\bspear\b|\btrident\b|\blance\b|\bharpoon\b|\bfork\b/, 'Generic/Weapon_Attacks/Melee/Spear01', false],
  [/\bdagger\b|\bknife\b|\bsickle\b/, 'Generic/Weapon_Attacks/Melee/Dagger02', false],
  [/\b(?:long)?sword\b|\bblade\b|\bsaber\b|\bkatana\b/, 'Generic/Weapon_Attacks/Melee/Sword01', false],
  [/\bshield\b/, 'Generic/Weapon_Attacks/Melee/Group06/MeleeAttack06_Shield01', false],
  [/\bscythe\b/, 'Generic/Weapon_Attacks/Melee/Group05/MeleeAttack05_Scythe01', false],
  [/\bfist\b|\bstomp\b|\bslam\b|\bpunch\b|\bunarmed\b|\bkick\b|\bheadbutt\b/, 'Generic/Unarmed_Attacks/Unarmed_Strike/', false],
  [/\bbites?\b|\bscratch\b|\bconstrict\b|\bcrush\b|\bsmother\b|\brake\b|\bgrab\b|\battach\b|\bforeleg\b|\bgouge\b|\btendrils?\b|\bblood drain\b|\bbeard\b|\bbeaks?\b|\bclaws?\b|\btalons?\b|\brend\b|\bbeak\b|\bgore\b|\bhorns?\b|\btusks?\b|\bhooves\b|\bhoof\b|\btail\b|\bsting\b|\btentacles?\b|\bpincers?\b|\bpseudopod\b|\bmandibles\b|\bstinger\b|\bram\b/, 'Generic/Creature/Claw/', false],
];

/**
 * A plain attack's animation (null: none fits, drawn instead): by its weapon's name; else, for a magical one (Force,
 * Fire… damage), its damage type's bolt (as `bolt` finds one); else the default for a melee or a ranged attack.
 */
export function attackFile(name: string, text: string, files: readonly EffectFile[], defaults: { melee: string; ranged: string }, bolt: () => EffectFile | null, ranged: boolean): EffectFile | null {
  const pick = (prefix: string): EffectFile | null => {
    if (!prefix) return null;
    const p = `/Library/${prefix}`.toLowerCase();
    return files.find((f) => f.path.toLowerCase().includes(p) && /_(?:30ft|15ft)_|800x600|_\d+x\d+\.webm$/i.test(f.path)) ?? files.find((f) => f.path.toLowerCase().includes(p)) ?? null;
  };
  const n = name.toLowerCase();
  for (const [re, prefix] of WEAPONS) if (re.test(n)) { const f = pick(prefix); if (f) return f; }
  // magical: what its damage is made of (a mage's Arcane Burst, a Force bolt): the bolt of that kind
  if (elementsOf(name, text).length) { const b = bolt(); if (b) return b; }
  return pick(ranged ? defaults.ranged : defaults.melee);
}
