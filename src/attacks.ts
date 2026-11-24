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
export const WEAPONS: readonly [RegExp, string, boolean][] = [
  [/\b(?:long|short|great|oath)?bows?\b|\barrows?\b/, 'Generic/Weapon_Attacks/Ranged/Arrow01', true],
  [/\bcrossbows?\b|\bbolt launcher\b|\bboltgun\b|\bballista\b|\bharpoon gun\b/, 'Generic/Weapon_Attacks/Ranged/Bolt01', true],
  [/\bcannon\b/, 'Generic/Weapon_Attacks/Ranged/LaunchCannonBall01', true],
  [/\blaser\b|\bantimatter\b|\bblaster\b/, 'Generic/Weapon_Attacks/Ranged/LaserShot', true],
  [/\bhoopak, ranged\b|\bsling(?:shot)?\b|\bmusket\b|\bpistol\b|\brifle\b|\brevolver\b|\bshotgun\b|\bblunderbuss\b|\bfirearm\b|\bguns?\b|\bshot\b(?! put)/, 'Generic/Weapon_Attacks/Ranged/Bullet', true],
  [/\bbarrel\b/, 'Generic/Weapon_Attacks/Ranged/WoodenBarrelToss01', true],
  [/\bsnowball\b/, 'Generic/Weapon_Attacks/Ranged/SnowballToss', true],
  [/\bcards?\b/, 'Generic/RangedSpell/Card/', true],
  [/\bchakram\b|\bchatkcha\b|\bboomerang\b/, 'Generic/Weapon_Attacks/Melee/Group01/MeleeAttack01_Chakram01', false],
  [/\bgreatswords?\b|\bruneblade\b|\bclaymore\b/, 'Generic/Weapon_Attacks/Melee/GreatSword01', false],
  [/\bgreataxes?\b/, 'Generic/Weapon_Attacks/Melee/GreatAxe01', false],
  [/\bgreatclubs?\b|\bgreat ?bone\b/, 'Generic/Weapon_Attacks/Melee/GreatClub01', false],
  [/\bmauls?\b|\bgreathammer\b|\bsledgehammer\b|\bwrecking ball\b/, 'Generic/Weapon_Attacks/Melee/Maul01', false],
  [/\bbattle ?axes?\b/, 'Generic/Weapon_Attacks/Melee/Group02/MeleeAttack02_BattleAxe01', false],
  [/\bhandaxes?\b|\baxes?\b|\baxehand\b/, 'Generic/Weapon_Attacks/Melee/HandAxe02', false],
  [/\bhalberds?\b|\bpikes?\b|\bpolearm\b|\bpole\b|\bgythka\b|\bhoopak\b/, 'Generic/Weapon_Attacks/Melee/Halberd01', false],
  [/\bglaives?\b|\bnaginata\b|\bbardiche\b/, 'Generic/Weapon_Attacks/Melee/Glaive01', false],
  [/\bwarhammers?\b|\bhammers?\b|\bwar ?picks?\b|\bpick(?:axe)?\b|\bmattock\b|\bmallet\b/, 'Generic/Weapon_Attacks/Melee/Warhammer01', false],
  [/\bflails?\b|\bmorningstars?\b|\bchains?\b(?! lightning)|\banchor\b/, 'Generic/Weapon_Attacks/Melee/Group01/MeleeAttack01_Flail01', false],
  [/\bmaces?\b|\bscepter\b|\brod\b|\bcauldron\b/, 'Generic/Weapon_Attacks/Melee/Mace01', false],
  [/\bwrench\b/, 'Generic/Weapon_Attacks/Melee/Group02/MeleeAttack02_Wrench01', false],
  [/\bclubs?\b|\bbranch\b|\bcudgel\b|\bbludgeon\b|\bbanjo\b|\blute\b|\bshovel\b|\bbook\b|\boar\b|\bimprovised\b/, 'Generic/Weapon_Attacks/Melee/Club01', false],
  [/\bquarterstaff\b|\bstaff\b|\bcane\b|\bbroom(?:stick)?\b|\bwalking stick\b/, 'Generic/Weapon_Attacks/Melee/Quarterstaff01', false],
  [/\brapiers?\b|\bpin\b/, 'Generic/Weapon_Attacks/Melee/Rapier01', false],
  [/\bkatana\b/, 'Generic/Weapon_Attacks/Melee/Group04/MeleeAttack04_Katana01', false],
  [/\bscimitars?\b|\bcutlass\b/, 'Generic/Weapon_Attacks/Melee/Scimitar01', false],
  [/\bfalchion\b/, 'Generic/Weapon_Attacks/Melee/Falchion01', false],
  [/\bshortswords?\b/, 'Generic/Weapon_Attacks/Melee/Shortsword01', false],
  [/\bspears?\b|\btridents?\b|\blance\b|\bharpoon\b|\b(?:pitch|hay)?forks?\b|\bshortspear\b|\bspikes?\b|\bstab\b|\bdrill\b|\bimpaling\b/, 'Generic/Weapon_Attacks/Melee/Spear01', false],
  [/\bsickles?\b|\bhooks?\b|\bhooked\b|\bkama\b/, 'Generic/Weapon_Attacks/Melee/Group01/MeleeAttack01_Sickle01', false],
  [/\bdaggers?\b|\bknife\b|\bknives\b|\bscalpel\b|\bscissors?\b|\bshears\b|\bshiv\b|\bbottle\b|\bpaper cut\b/, 'Generic/Weapon_Attacks/Melee/Dagger02', false],
  [/\b(?:long)?swords?\b|\bblades?\b|\bbladed\b|\bsabers?\b|\bsabre\b|\barmblade\b|\bsaw\b|\bbonesaw\b|\bsteamsaw\b|\bslicer\b|\bslice\b|\bsharp edges\b/, 'Generic/Weapon_Attacks/Melee/Sword01', false],
  [/\bshields?\b/, 'Generic/Weapon_Attacks/Melee/Group06/MeleeAttack06_Shield01', false],
  [/\bscythes?\b/, 'Generic/Weapon_Attacks/Melee/Group05/MeleeAttack05_Scythe01', false],
  [/\bdarts?\b|\bjavelins?\b|\bneedles?\b|\bquills?\b|\bspine fling\b|\bblowgun\b|\bthrowing\b|\bfling\b|\bbolas\b/, 'Generic/Weapon_Attacks/Ranged/Dagger01', true],
  [/\b(?:rock|boulder|stone|brick|trash|lob|junk|mudball|shot put|anvil|debris)\b/, 'Generic/Weapon_Attacks/Ranged/BoulderToss02', true],
  [/\bflask\b|\bvial\b|\bbomb\b|\bjug\b|\bpotion\b|\bgrenade\b/, 'Generic/Weapon_Attacks/Ranged/ThrowFlask01', true],
  [/\bwhips?\b|\blash\b|\bscourge\b|\bvines?\b|\bbramble\b|\broots?\b|\btongues?\b|\bwebby\b/, 'Generic/Weapon_Attacks/Melee/Slash02/', false],
  [/\bfists?\b|\bpunch\b|\bunarmed\b|\bgauntlets?\b|\bknuckles\b|\bhaymaker\b|\bhammerfist\b|\bjab\b|\btouch\b|\bhands?\b|\bkick\b|\bhead ?butts?\b|\bstrike\b/, 'Generic/Unarmed_Attacks/Unarmed_Strike/', false],
  [/\bslams?\b|\bstomp(?:ing)?\b|\bbash\b|\bsmash\b|\bpummel\b|\bthrash\b|\bthwack\b|\btrample\b|\bflop\b|\bwings?\b|\bflippers?\b|\barms?\b|\blimbs?\b|\bhug\b|\bcrush(?:ing)?\b|\bram\b|\bhooves\b|\bhoof\b|\btail\b|\bfoot\b|\btrunk\b|\bpseudopods?\b|\bbody\b/, 'Generic/Creature/Fist/', false],
  [/\bpincers?\b|\bnippers?\b|\bchelae?\b|\bscissorhand\b/, 'Generic/Creature/Pincer/', false],
  [/\bbites?\b|\bjaws\b|\bfangs?\b|\bteeth\b|\btooth\b|\bmaw\b|\bbeaks?\b|\bpeck\b|\bproboscis\b|\bgnash\w*\b|\bblood drain\b|\bmandibles\b|\bswallow\b|\bengulf\b/, 'Generic/Creature/Bite', false],
  [/\bclaws?\b|\bclawed\b|\bscratch\b|\btalons?\b|\brake\b|\braking\b|\brend\b|\bgouge\b|\bswipe\b|\bslash\b|\bgore\b|\bhorns?\b|\bantlers\b|\btusks?\b|\bsting(?:er)?\b|\btentacles?\b|\btendrils?\b|\bconstrict\w*\b|\bgrasp\w*\b|\bgrab\w*\b|\bsmother\b|\battach\b|\bforelegs?\b|\blegs?\b|\bbeard\b|\bsnaky hair\b|\bsnake hair\b|\bravage\b/, 'Generic/Creature/Claw/', false],
];

/**
 * A plain attack's animation (null: none fits, drawn instead): by its weapon's name; else, for a magical one (Force,
 * Fire… damage), its damage type's bolt (as `bolt` finds one); else the default for a melee or a ranged attack.
 */
export function attackFile(name: string, text: string, files: readonly EffectFile[], defaults: { melee: string; ranged: string }, bolt: (text: string) => EffectFile | null, ranged: boolean): EffectFile | null {
  // (a player's sheet writes "Hit: 1d6+3 Lightning.": read as "Lightning damage", as a statblock writes it)
  const said = /\bdamage\b/i.test(text) ? text : text.replace(/\b(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)\b(?!\s+damage)(?=\s*(?:[.,;]|$|\+|and\b|or\b))/gi, '$1 damage');
  const magical = elementsOf(name, said).length > 0;
  const pick = (prefix: string): EffectFile | null => {
    if (!prefix) return null;
    const p = `/Library/${prefix}`.toLowerCase();
    const all = files.filter((f) => f.path.toLowerCase().includes(p));
    // (a pack with a plain and a magical swing of one weapon (an Unarmed Strike's): the one that fits)
    const kind = all.filter((f) => (magical ? /magical/i : /physical/i).test(f.path));
    const from = kind.length ? kind : all;
    return from.find((f) => /_(?:30ft|15ft)_|800x600|_\d+x\d+\.webm$/i.test(f.path)) ?? from[0] ?? null;
  };
  const n = name.toLowerCase();
  // (a player's ranged weapon on their sheet: "*80/320 ft:*", no "Ranged" said)
  if (!ranged && /^[\s*_]*(?:[^:]*·\s*)?\d+\/\d+\s*ft\b/i.test(text)) ranged = true;
  // (a body's blow — a claw, a touch, a lash — is close up: a ranged attack named for one (a Chill Touch, a Snake
  // Hair spit) is told by what it's made of, or by the ranged default)
  const close = (prefix: string): boolean => /^Generic\/(?:Creature|Unarmed_Attacks)\/|\/Slash02\//.test(prefix);
  // a player's weapon named its own way (Blade of the Chosen, Focus Breaker): the character sheet puts what it is
  // first in its line ("*Greatsword · Melee:*"), and that comes first (a monster's "Melee Attack Roll:" names none)
  const lead = (/^[\s*_]*([^:]{1,60}?)[\s*_]*:/.exec(text)?.[1] ?? '').toLowerCase();
  let body = false;
  for (const said of [lead, n]) if (said) for (const [re, prefix] of WEAPONS) if (re.test(said) && !(ranged && close(prefix))) { const f = pick(prefix); if (f) return f; body ||= /^Generic\/Creature\//.test(prefix); }
  // (a bite or a pincer with no file of its own, in an older pack: a claw's)
  if (body) { const f = pick('Generic/Creature/Claw/'); if (f) return f; }
  // magical: what its damage is made of (a mage's Arcane Burst, a Force bolt): the bolt of that kind
  if (magical) { const b = bolt(said); if (b) return b; }
  return pick(ranged ? defaults.ranged : defaults.melee);
}
