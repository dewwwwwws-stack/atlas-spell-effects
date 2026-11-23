// The JB2A free pack's best animation for a D&D 5e spell with none named after it: by what the spell is (its name,
// school and text: what it's made of, whether it heals, teleports, summons…) and its area. Only for 5e maps, and
// only among the pack's own animations (those in the vault, or to fetch from JB2A's free pack); none fitting: none.
import type { EffectFile } from './library';
import type { Area } from './areas';
import { elementsOf } from './elements';

/** Spells the pack has an animation for under another name. */
const ABILITY_LOOKS: readonly [RegExp, string][] = [
  [/\billumination\b|\bluminous|\bglow/, 'Generic/Particles/ParticlesOutward01'],
  [/\bstench\b|\bfetid\b|\bnoxious\b|\bspores?\b/, 'Generic/Template/Circle/TemplatePoisonCircle'],
  [/\bink\b|\bsmoke\b|\bsoot\b/, 'Generic/Template/Circle/Smoke/'],
  [/\bdarkness\b|\bshadow/, '2nd_Level/Darkness/'],
  [/\bfear\b|\bfrightful\b|\bhorrif|\bterrify|\bunsettling\b|\bvile appearance\b|\bhorrific\b|\bmoan\b|\bwail\b/, 'Generic/Template/Circle/TemplateFearCircle'],
  [/\broar\b|\bbellow\b|\bscreech\b|\bshriek\b|\bhowl\b/, 'TMFX/OutPulse/'],
  [/\bsong\b|\bgibbering\b|\bchant\b|\bmelody\b/, 'Generic/Music_Notation/'],
  [/\baura of authority\b|\bleadership\b|\bcommand\b/, 'Generic/Magic_Signs/EnchantmentCircleComplete'],
  [/\bshaking\b|\btremor\b|\bstomp\b|\bquake\b/, 'Generic/Impact/GroundCrackImpact_01'],
  [/\baberrant ground\b|\bmire\b|\bmud\b/, '1st_Level/Grease/'],
  [/\bdestroy metal\b|\brust\b/, 'Generic/Impact/Impact_01'],
  [/\bwhirlwind\b/, '7th_Level/Whirlwind/'],
  [/\bdeath burst\b|\bexplodes?\b|\bdeath throes\b/, 'Generic/Explosion/'],
  [/\bspittle\b|\bdust\b|\bsand\b/, 'Generic/Smoke/SmokePuff01'],
  [/\bblasphemous\b|\bhorror\b|\bnimbus\b/, 'Generic/Template/Circle/TemplateHorrorCircle'],
];

const ALIASES: Record<string, string> = {
  // summoned helpers and companions: a puff of smoke where they appear
  'find steed': 'Generic/Smoke/SmokePuff01', 'find familiar': 'Generic/Smoke/SmokePuff01', 'giant insect': 'Generic/Smoke/SmokePuff01', "mordenkainen's faithful hound": 'Generic/Smoke/SmokePuff01',
  'faithful hound': 'Generic/Smoke/SmokePuff01', 'conjure fey': 'Generic/Creature/FairiesOutwardBurst01', 'simulacrum': 'Generic/Smoke/SmokePuffRing01', 'conjure animals': 'Generic/Smoke/SmokePuff01',
  // wards and circles drawn on the ground: their school's circle
  'hallow': 'Generic/Magic_Signs/AbjurationCircleComplete', 'magic circle': 'Generic/Magic_Signs/AbjurationCircleComplete', 'glyph of warding': 'Generic/Magic_Signs/Runes/AbjurationRuneComplete',
  'forbiddance': 'Generic/Magic_Signs/AbjurationCircleComplete',
  // the rest named
  'wish': 'Generic/Particles/ParticleBurstStar01', 'power word kill': 'Generic/Template/Circle/TemplateSkullCircle', 'storm of vengeance': 'Generic/Template/Circle/Lightning/',
  'incendiary cloud': 'Generic/Fire/Flame/Flames04', 'meld into stone': 'Generic/Smoke/SmokePuff01', 'contact other plane': 'Generic/Portals/', 'harm': 'Generic/Template/Circle/TemplateSkullCircle',
  'starry wisp': 'Generic/RangedSpell/02/', 'power word heal': 'Generic/Healing/HealingAbility_02', 'mass heal': 'Generic/Healing/HealingAbility_02', 'heal': 'Generic/Healing/HealingAbility_02',
  "evard's black tentacles": '4th_Level/Black_Tentacles', "bigby's hand": '5th_Level/Arcane_Hand', "hunter's mark": '1st_Level/Hunters_Mark',
  "jim's magic missile": '1st_Level/Magic_Missile', 'delayed blast fireball': '3rd_Level/Fireball', 'meteor swarm': '3rd_Level/Fireball',
  "mordenkainen's sword": '2nd_Level/Spiritual_Weapon', 'thunderclap': '2nd_Level/Shatter', 'thunderous smite': '2nd_Level/Shatter',
  'dust devil': '7th_Level/Whirlwind', 'shield of faith': '1st_Level/Shield', 'blade ward': '1st_Level/Shield', 'mage armor': '1st_Level/Shield',
  'searing smite': '2nd_Level/Divine_Smite', 'wrathful smite': '2nd_Level/Divine_Smite', 'blinding smite': '2nd_Level/Divine_Smite',
  'staggering smite': '2nd_Level/Divine_Smite', 'branding smite': '2nd_Level/Divine_Smite', 'banishing smite': '2nd_Level/Divine_Smite', 'shining smite': '2nd_Level/Divine_Smite',
  'ice knife': 'Generic/Impact/ImpactIceShard', 'ice storm': 'Generic/Ice/IceSpikesRadialBurst', "otiluke's freezing sphere": 'Generic/Ice/SnowflakeBurst',
  'wall of ice': 'Generic/Ice/IceSpikesWallLoop', 'wall of thorns': 'Generic/Nature/GroupVineNatureLoop', 'grasping vine': 'Generic/Nature/GroupVineNature',
  'plant growth': 'Generic/Nature/PlantGrowthRing', 'spike growth': 'Generic/Traps/Spike_Trap/', 'healing spirit': 'Generic/Healing/HealingAbility_02_Regular_GreenOrange_Loop',
  'fire storm': 'Generic/Fire/Eruption', 'flame strike': 'Generic/Lava/Spout001/LavaSpoutComplete', 'eruption': 'Generic/Fire/Eruption', 'immolation': 'Generic/Fire/Flame/Flames04',
  'create bonfire': 'Generic/Fire/Campfire', 'continual flame': 'Generic/Fire/Brazier', 'control flames': 'Generic/Fire/Flame/Flames_01', 'produce flame': 'Generic/Fire/Flame/Flames_01',
  'fire shield': 'Generic/Fire/ShieldFireBelow', 'investiture of flame': 'Generic/Fire/ShieldFireBelow', 'investiture of ice': 'Generic/Ice/ShieldIceBelow', 'investiture of stone': 'Generic/Fire/ShieldMoltenEarthBelow',
  'investiture of wind': '7th_Level/Whirlwind', 'whirlwind': '7th_Level/Whirlwind', 'control winds': 'Generic/Wind/WindLines', 'warding wind': 'Generic/Wind/WindLines', 'gust': 'Generic/Wind/WindLines',
  'tidal wave': 'Generic/Liquid/WaterSplashConeLoop', 'tsunami': 'Generic/Liquid/WaterSplashLoop', 'wall of water': 'Generic/Liquid/WaterSplashLoop', 'control water': 'Generic/Liquid/WaterSplashLoop',
  'shape water': 'Generic/Liquid/LiquidSplash01', 'watery sphere': 'Generic/Liquid/Bubble/BubbleLoop', "otiluke's resilient sphere": 'Generic/Liquid/Bubble/BubbleLoop', 'air bubble': 'Generic/Liquid/Bubble/BubbleLoop',
  'globe of invulnerability': 'Generic/Marker/MarkerBubbleLoop', "leomund's tiny hut": 'Generic/Marker/MarkerBubbleLoop', 'antimagic field': 'Generic/Marker/MarkerBubbleLoop', 'forcecage': 'Generic/Marker/MarkerBubbleLoop',
  'maelstrom': 'Generic/Template/Circle/Vortex_01', 'reverse gravity': 'Generic/Celestial_Bodies/Black_Hole/', 'gravity sinkhole': 'Generic/Celestial_Bodies/Black_Hole/', 'ravenous void': 'Generic/Celestial_Bodies/Black_Hole/',
  'dark star': 'Generic/Celestial_Bodies/Black_Hole/', 'collapsing star': 'Generic/Celestial_Bodies/Black_Hole/', 'void star': 'Generic/Celestial_Bodies/Black_Hole/', 'magnify gravity': 'Generic/Celestial_Bodies/Black_Hole/',
  'earthquake': 'Generic/Impact/GroundCrackImpact_03', 'earth tremor': 'Generic/Impact/GroundCrackImpact_01', 'erupting earth': 'Generic/Impact/GroundCrackImpact_02', 'upheaval': 'Generic/Impact/GroundCrackImpact_03',
  'bones of the earth': 'Generic/Impact/GroundCrackImpact_02', "maximilian's earthen grasp": 'Generic/Impact/GroundCrackImpact_01',
  'storm sphere': 'Generic/Template/Circle/Lightning/', 'lightning ring': 'Generic/Template/Circle/Lightning/', 'lightning lure': 'Generic/Lightning/ElectricArc', 'shocking grasp': 'Generic/Lightning/StaticElectricity',
  'hypnotic pattern': 'Generic/Butterflies/ButterfliesLoop', 'faerie fire': 'Generic/Twinkling_Stars/TwinklingStars_05', 'pyrotechnics': 'Generic/Fireworks/', 'daylight': 'Generic/Particles/ParticleBurstStar', 'dawn': 'Generic/Particles/ParticleBurstStar',
  'vicious mockery': 'Generic/Music_Notation/', 'dissonant whispers': 'Generic/Music_Notation/', 'dirge': 'Generic/Music_Notation/', "otto's irresistible dance": 'Generic/Music_Notation/', 'insidious rhythm': 'Generic/Music_Notation/',
  'fear': 'Generic/Template/Cone/001/TemplateCone5e001', 'cause fear': 'Generic/Template/Circle/TemplateFearCircle', 'phantasmal killer': 'Generic/Template/Circle/TemplateHorrorCircle', 'weird': 'Generic/Template/Circle/TemplateHorrorCircle',
  'psychic scream': 'Generic/Template/Circle/TemplateHorrorCircle', 'synaptic static': 'Generic/Template/Circle/TemplateHorrorCircle', 'hold person': 'Generic/Template/Circle/TemplateStunCircle', 'hold monster': 'Generic/Template/Circle/TemplateStunCircle',
  'power word stun': 'Generic/Conditions/Dizzy_Stars/', 'command': 'Generic/Conditions/Dizzy_Stars/', 'confusion': 'Generic/Conditions/Dizzy_Stars/', 'befuddlement': 'Generic/Conditions/Dizzy_Stars/', 'feeblemind': 'Generic/Conditions/Dizzy_Stars/',
  'charm person': 'Generic/Template/Circle/TemplateHeartCircle', 'charm monster': 'Generic/Template/Circle/TemplateHeartCircle', 'fast friends': 'Generic/Template/Circle/TemplateHeartCircle', 'friends': 'Generic/Template/Circle/TemplateHeartCircle',
  'stinking cloud': 'Generic/Template/Circle/TemplatePoisonCircle', 'cloudkill': 'Generic/Template/Circle/TemplatePoisonCircle', 'poison spray': 'Generic/RangedSpell/04/', 'ray of sickness': 'Generic/RangedSpell/04/',
  'circle of death': 'Generic/Template/Circle/TemplateSkullCircle', 'wail of the banshee': 'Generic/Template/Circle/TemplateSkullCircle', 'negative energy flood': 'Generic/Template/Circle/TemplateSkullCircle', 'finger of death': 'Generic/RangedSpell/04/',
  'gate': 'Generic/Portals/', 'arcane gate': 'Generic/Portals/', 'teleportation circle': 'Generic/Portals/', 'plane shift': 'Generic/Portals/', 'demiplane': 'Generic/Portals/', 'word of recall': 'Generic/Energy/Teleport/',
  'arcane eye': 'Generic/Eyes/Eyes_Single', 'clairvoyance': 'Generic/Eyes/Eyes_Single', 'scrying': 'Generic/Eyes/Eyes_Single', 'eyebite': 'Generic/Eyes/Eyes_Many', 'true seeing': 'Generic/Eyes/Eyes_Single', 'see invisibility': 'Generic/Eyes/Eyes_Single',
  'fog cloud': '1st_Level/Fog_Cloud', 'darkness': '2nd_Level/Darkness', 'insect plague': 'Generic/Particles/ParticlesInward', 'sickening radiance': 'Generic/Template/Circle/TemplatePoisonCircle', 'sunburst': 'Generic/Explosion/Explosion_03_Regular_BlueYellow',
  'word of radiance': 'Generic/Explosion/Explosion_03_Regular_BlueYellow', 'destructive wave': 'Generic/Template/Circle/OutPulse/OutPulse_02', 'holy nova': 'Generic/Explosion/Explosion_03_Regular_BlueYellow',
  'magic stone': 'Generic/RangedSpell/02/', 'catapult': 'Generic/RangedSpell/02/', 'melf\'s minute meteors': 'Generic/RangedSpell/01/', 'chromatic orb': 'Generic/RangedSpell/03/', 'chaos bolt': 'Generic/RangedSpell/03/',
};

/** A kind of damage's animation for each kind of area (folder and file start, under Library/). */
const BY_ELEMENT: Record<string, Partial<Record<'cone' | 'line' | 'burst' | 'aura' | 'square' | 'bolt' | 'on', string>>> = {
  fire: { cone: 'Generic/Template/Cone/Breath_Weapon/BreathWeapon_Fire01', line: 'Generic/Template/Line/Breath_Weapon/BreathWeapon_Fire01', burst: 'Generic/Explosion/Explosion_01_Orange', aura: 'Generic/Fire/FireRing_01', square: 'Generic/Template/Square/TemplateRunesSquare', bolt: 'Cantrip/Fire_Bolt/', on: 'Generic/Impact/ImpactFire01' },
  cold: { cone: 'Generic/Template/Cone/Breath_Weapon/BreathWeapon_Cold01', line: 'Generic/Template/Line/Ice/', burst: 'Generic/Ice/SnowflakeBurst_01_Regular_BlueWhite_Burst', aura: 'Generic/Template/Circle/Aura/AuraThemedInwardLoopCold', square: 'Generic/Template/Square/TemplateSnowflakeSquare', bolt: 'Cantrip/Ray_Of_Frost/', on: 'Generic/Impact/FrostImpact' },
  lightning: { cone: 'Generic/Template/Cone/Lightning/TemplateCone5e', line: '3rd_Level/Lightning_Bolt/', burst: 'Generic/Lightning/LightningStrike01', aura: 'Generic/Template/Circle/Lightning/', bolt: '1st_Level/Witch_Bolt/', on: 'Generic/Lightning/StaticElectricity' },
  thunder: { cone: 'TMFX/OutPulse/Cone/', line: 'TMFX/OutPulse/Line/', burst: '2nd_Level/Shatter/', aura: 'TMFX/OutPulse/Circle/', square: 'TMFX/OutPulse/Circle/', bolt: 'Generic/RangedSpell/02/', on: '2nd_Level/Shatter/' },
  acid: { cone: 'Generic/Template/Cone/Breath_Weapon/BreathWeapon_Poison01', line: 'Generic/Template/Line/Breath_Weapon/BreathWeapon_Acid01', burst: 'Generic/Template/Circle/TemplatePoisonCircle', square: 'Generic/Template/Square/TemplatePoisonSquare', bolt: 'Generic/RangedSpell/04/', on: 'Generic/Explosion/SideFractureFlask01_01' },
  poison: { cone: 'Generic/Template/Cone/Breath_Weapon/BreathWeapon_Poison01', line: 'Generic/Template/Line/Breath_Weapon/BreathWeapon_Acid01', burst: 'Generic/Template/Circle/TemplatePoisonCircle', aura: 'Generic/Template/Circle/TemplatePoisonCircle', square: 'Generic/Template/Square/TemplatePoisonSquare', bolt: 'Generic/RangedSpell/04/' },
  radiant: { cone: 'TMFX/OutPulse/Cone/', line: 'Generic/RangedSpell/Beam/', burst: 'Generic/Explosion/Explosion_03_Regular_BlueYellow', aura: '3rd_Level/Spirit_Guardians/', bolt: '1st_Level/Guiding_Bolt/', on: 'Cantrip/Sacred_Flame/' },
  necrotic: { cone: 'Generic/Template/Cone/001/TemplateCone5e001', burst: 'Generic/Template/Circle/TemplateSkullCircle', aura: 'Generic/Template/Circle/TemplateSkullCircle', square: 'Generic/Template/Square/TemplateSkullSquare', bolt: 'Generic/RangedSpell/04/', on: 'Cantrip/Toll_The_Dead/' },
  psychic: { cone: 'Generic/Template/Cone/001/TemplateCone5e001', burst: 'Generic/Template/Circle/TemplateHorrorCircle', aura: 'Generic/Template/Circle/TemplateHorrorCircle', square: 'Generic/Template/Square/TemplateHorrorSquare', bolt: 'Generic/RangedSpell/03/', on: 'Generic/Conditions/Dizzy_Stars/' },
  force: { cone: 'TMFX/OutPulse/Cone/', line: 'Generic/Energy/EnergyBeam_01', burst: 'Generic/Explosion/Explosion_02_Blue', aura: 'Generic/Template/Circle/Aura/AuraLoop01', square: 'TMFX/OutPulse/Circle/', bolt: 'Cantrip/Eldritch_Blast/', on: 'Generic/Impact/Impact_01' },
  earth: { burst: 'Generic/Impact/GroundCrackImpact_02', aura: 'Generic/Fire/GroundCrackLoop_01', square: 'Generic/Impact/GroundCrackImpact_01', bolt: 'Generic/RangedSpell/02/', on: 'Generic/Impact/GroundCrackImpact_01' },
  weapon: { burst: 'Generic/Template/Circle/Projectile/', cone: 'Generic/Template/Cone/Projectile/5e/', line: 'Generic/Template/Line/Projectile/', bolt: 'Generic/Weapon_Attacks/Ranged/', on: 'Generic/Weapon_Attacks/Melee/GenericSlash01' },
};
const SCHOOL_COLOUR: Record<string, string> = { abjuration: 'Blue', conjuration: 'Yellow', divination: 'Blue', enchantment: 'Pink', evocation: 'Red', illusion: 'Purple', necromancy: 'Green', transmutation: 'Yellow' };
const BUFF_COLOUR: Record<string, string> = { abjuration: 'BlueTeal', conjuration: 'OrangeYellow', divination: 'Blue', enchantment: 'PinkYellow', evocation: 'OrangeYellow', illusion: 'BluePurple', necromancy: 'GreenPurple', transmutation: 'GreenYellow' };

/** Where a file is, under the pack's Library/ (its own spells, Generic…), or null if it isn't the pack's. */
const rel = (f: EffectFile): string | null => { const i = f.path.indexOf('Library/'); return i < 0 || !(f.remote || /JB2A/i.test(f.path)) ? null : f.path.slice(i + 8); };

/** The pack's best file that starts with `prefix` (its plain version: not a still, a name tag, an opacity…). */
export function packFile(prefix: string, files: readonly EffectFile[], lasting = false, bolt = false, fire = false): EffectFile | null {
  let best: EffectFile | null = null, top = -Infinity;
  for (const f of files) {
    const r = rel(f); if (!r || !r.startsWith(prefix)) continue;
    if (/\.webp$|StillFrame|\/Opacities\/|\/Name[Tt]ag\/|\/Banners\/|_\d\dOPA|Intro|Outro/.test(r)) continue;
    const name = r.slice(r.lastIndexOf('/') + 1);
    let s = -name.length / 100;
    if (/High_Res/.test(r)) s -= 2;
    if (lasting ? /Loop/.test(name) : /Complete|Burst/.test(name)) s += 3;
    if (!lasting && /Loop/.test(name)) s -= 1;
    if (/_30ft|_60ft/.test(name)) s += 1;
    if (/_01_|Regular/.test(name)) s += 0.5;
    // a burst's explosion, not the beam that brings it (Fireball); a bolt's beam
    if (/Beam|Projectile|Missile/.test(name)) s += bolt ? 2 : -3;
    if (fire && /Orange|Yellow|Red/.test(name)) s += 1;
    if (s > top) { top = s; best = f; }
  }
  return best;
}

/**
 * The pack's animation for a 5e spell: its own (named after it, or under another name); else by what it does (heals,
 * teleports, summons, a curse or a boon) and what it's made of, for its kind of area; else its school's sign.
 */
export function fiveEFile(name: string, text: string | undefined, school: string | undefined, area: Area | null, files: readonly EffectFile[]): EffectFile | null {
  const n = name.trim().toLowerCase().replace(/[’`]/g, "'");
  const t = String(text ?? '');
  const lasting = !!area?.lasting;
  let bolt = area?.target === 'bolt';
  const fiery = /\bfire|flame|burn/i.test(n);
  const own = (p: string) => packFile(p, files, lasting, bolt, fiery);
  const alias = ALIASES[n]; if (alias) { const f = own(alias); if (f) return f; }
  // creatures' abilities, by what they're called (light, a stench, ink, fear, a roar or a song, a shaking ground)
  for (const [re, p] of ABILITY_LOOKS) if (re.test(n)) { const f = own(p); if (f) return f; }
  // its own folder, by name ("Cone Of Cold": 5th_Level/Cone_Of_Cold)
  const folder = n.replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('_');
  for (const lv of ['Cantrip', '1st_Level', '2nd_Level', '3rd_Level', '4th_Level', '5th_Level', '6th_Level', '7th_Level', '8th_Level', '9th_Level']) {
    const f = own(`${lv}/${folder}/`) ?? own(`${lv}/${folder.replace(/_Of_|_The_/g, (m) => m.toLowerCase())}/`);
    if (f) return f;
  }
  const sc = String(school ?? '').trim().toLowerCase();
  const kind: 'cone' | 'line' | 'burst' | 'aura' | 'square' | 'bolt' | 'on' =
    !area ? 'on' : area.target === 'bolt' ? 'bolt' : area.target || area.self ? 'on' : area.shape === 'cone' ? 'cone' : area.shape === 'line' || area.shape === 'wall' ? 'line'
      : area.shape === 'cube' ? 'square' : area.shape === 'emanation' ? 'aura' : 'burst';
  // what it does (a spell that hurts is what it's made of first: Vampiric Touch is necrotic)
  const hurts = /\d+d\d+[^.]{0,60}?\b[a-z]+ damage\b/i.test(t);
  bolt = kind === 'bolt';
  if (!hurts && /(?<!can['’]?t |cannot )\bregains? (?:a number of |\d+(?:d\d+)?(?:\s*\+\s*\d+)? )?hit points\b|\brestores? [^.]*hit points\b/i.test(t)) {
    const f = own(kind === 'aura' || kind === 'burst' || kind === 'square' ? 'Generic/Healing/HealingAbility_02_Regular_GreenOrange' : 'Generic/Healing/HealingAbility_01_Green'); if (f) return f;
  }
  if (!hurts && /\bteleport/i.test(t) && !/\bcan'?t teleport|\bprevent\w* .*teleport/i.test(t)) { const f = own('2nd_Level/Misty_Step/') ?? own('Generic/Energy/Teleport/'); if (f) return f; }
  if (/^(?:summon|conjure|find |create (?:undead|homunculus|magen)|animate dead|planar ally|infernal calling)/i.test(n)) { const f = own('Generic/Magic_Signs/ConjurationCircleComplete_02_Regular_Yellow'); if (f) return f; }
  // what it's made of: only for a spell that does damage (not Protection from Poison's "resistance to Poison damage")
  const els = hurts ? elementsOf(name, t) : [];
  let el: string | undefined = els[0];
  if (hurts && !el && /\b(?:bludgeoning|piercing|slashing)\s+damage\b/i.test(t)) el = /\b(?:earth|stone|rock|ground|rubble)\b/i.test(t) ? 'earth' : 'weapon';
  if (el) {
    const p = BY_ELEMENT[el]?.[kind] ?? BY_ELEMENT[el]?.burst;
    const f = p ? own(p) : null; if (f) return f;
  }
  // no damage: a boon or a curse on a creature, or its school's sign
  if (kind === 'on' || kind === 'bolt') {
    const harm = /\bsaving throw\b|\bdisadvantage\b|\bcurse/i.test(t) && !/\badvantage on\b(?![^.]*\bagainst you\b)/i.test(t.slice(0, 300));
    const f = harm ? own('Generic/Conditions/Curse01/') : own(`Generic/On_Token/Buff/Ontoken_Buff001_001_${BUFF_COLOUR[sc] ?? 'Blue'}`) ?? own('Generic/Conditions/Boon01/');
    if (f) return f;
  }
  if (kind === 'cone') { const f = own('Generic/Template/Cone/001/TemplateCone5e001'); if (f) return f; }
  if (kind === 'line') { const f = own('TMFX/OutPulse/Line/'); if (f) return f; }
  if (sc && SCHOOL_COLOUR[sc]) {
    const s = sc[0].toUpperCase() + sc.slice(1);
    const on = kind === 'on' || kind === 'bolt';
    const f = on ? own(`Generic/Magic_Signs/Runes/${s}Rune${lasting ? 'Loop' : 'Complete'}_01`) ?? own(`Generic/Magic_Signs/Runes/${s}RuneComplete_01`)
      : own(`Generic/Magic_Signs/${s}Circle${lasting ? 'Loop' : 'Complete'}_02_Regular`) ?? own(`Generic/Magic_Signs/${s}CircleComplete_02_Regular`);
    if (f) return f;
  }
  return null;
}
