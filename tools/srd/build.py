# Makes src/srd-data.ts: the SRD 5.2.1 and 5.1 spells and creatures as notes, gzipped. Run:
#   SRD_DB=<5e-database>/src python3 tools/srd/build.py src/srd-data.ts
import json, re, gzip, base64, sys
import os
DB = os.environ.get('SRD_DB', 'node_modules/5e-database/src')   # a clone of https://github.com/5e-bits/5e-database: its src folder
ATTR = {
 '2024': 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
 '2014': 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
}
SRCNAME = {'2024': 'SRD 5.2.1', '2014': 'SRD 5.1'}
q = lambda v: json.dumps(v, ensure_ascii=False)
LABELS = ['Cantrip Upgrade', 'Using a Higher-Level Spell Slot', 'At Higher Levels']
def para(text):
    t = re.sub(r'\n\s*', '\n\n', text.replace('\r', ''))
    for l in LABELS:
        t = re.sub(r'(?:(?<=\n\n)|^|(?<=\. ))' + re.escape(l) + r'\.', f'***{l}.***', t)
        t = t.replace(f'. ***{l}.***', f'.\n\n***{l}.***')
    return t.strip()

def spell_note(s, ed):
    lvl = s['level']; school = s['school']['name']; classes = [c['name'] for c in s.get('classes', [])]
    comps = ', '.join(s.get('components', [])) + (f" ({s['material'].rstrip('.')})" if s.get('material') else '')
    dur = ('Concentration, ' if s.get('concentration') and not s['duration'].lower().startswith('concentration') else '') + s['duration']
    head = f"*{'Level ' + str(lvl) + ' ' + school if lvl else school + ' Cantrip'} ({', '.join(classes)})*"
    desc = s['description'] if ed == '2024' else '\n'.join(s['desc'])
    body = para(desc)
    hl = s.get('higher_level')
    if isinstance(hl, list): hl = ' '.join(hl)
    if hl and not any(l in body for l in LABELS):
        body += f"\n\n***{'Using a Higher-Level Spell Slot' if ed == '2024' else 'At Higher Levels'}.*** {hl}"
    fm = ['---', f'level: {lvl}', f'school: {q(school)}', f"casting_time: {q(s['casting_time'])}", f"range: {q(s['range'])}", f'components: {q(comps)}']
    if s.get('material'): fm.append(f"material: {q(s['material'].rstrip('.'))}")
    fm += [f'duration: {q(dur)}', f"concentration: {str(bool(s.get('concentration'))).lower()}", f"ritual: {str(bool(s.get('ritual'))).lower()}", 'classes:'] + [f'  - {q(c)}' for c in classes] + [f'source: {SRCNAME[ed]}', 'tags:', '  - spell', '---']
    return '\n'.join(fm) + f"\n{head}\n\n**Casting Time:** {s['casting_time']}  \n**Range:** {s['range']}  \n**Components:** {comps}  \n**Duration:** {dur}\n\n{body}\n\n---\n*{ATTR[ed]}*\n"

def cr(v): return {0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}.get(v, str(int(v)) if float(v).is_integer() else str(v))
def usage(a):
    u = a.get('usage') or {}; t = u.get('type'); n = a['name']
    if '(' in n: return ''
    if t == 'per day': return f" ({u['times']}/Day" + (f", or {u['times_in_lair']}/Day in Lair" if u.get('times_in_lair') else '') + ')'
    if t == 'recharge on roll': return ' (Recharge 6)' if u.get('min_value') == 6 else f" (Recharge {u.get('min_value')}–6)"
    if t == 'recharge after rest': return ' (Recharges after a Short or Long Rest)'
    return ''
def entries(lst, key):
    out = [f'{key}:']
    for a in lst: out += [f"  - name: {q(a['name'] + usage(a))}", f"    desc: {q(a.get('desc', ''))}"]
    return out if lst else []
def SPEED(d): return ', '.join((v if k == 'walk' else f"{k.capitalize()} {v}") if not isinstance(v, bool) else 'Hover' for k, v in d.items() if v)
def senses(d):
    parts = [f"{k.replace('_', ' ').capitalize()} {v}" for k, v in d.items() if k != 'passive_perception']
    return ', '.join(parts) + ('; ' if parts else '') + f"Passive Perception {d.get('passive_perception')}"
def monster_note(m, ed):
    saves, skills = [], []
    for p in m.get('proficiencies', []):
        i = p['proficiency']['index']
        # (by the ability's full name, as Atlas's 5E templates and Fantasy Statblocks key them: strength, not str)
        if i.startswith('saving-throw-'): saves.append(f"  - {dict(str='strength', dex='dexterity', con='constitution', int='intelligence', wis='wisdom', cha='charisma')[i[13:]]}: {p['value']}")
        elif i.startswith('skill-'): skills.append(f"  - {i[6:].replace('-', '_')}: {p['value']}")
    # the source's 2024 Mule carries the Octopus's traits, attack and reaction (a copying slip there): left out
    if ed == '2024' and m['name'] == 'Mule':
        m = {**m, 'special_abilities': [], 'actions': [], 'reactions': []}
    traits = [a for a in (m.get('special_abilities') or []) if not a.get('spellcasting')]
    actions = [a for a in (m.get('actions') or []) if not a.get('spellcasting')]
    spells_list = []
    for a in [*(m.get('special_abilities') or []), *(m.get('actions') or [])]:
        sc = a.get('spellcasting')
        if not sc: continue
        lines = [l.strip() for l in a['desc'].split('\n') if l.strip()]
        listed = [l.lstrip('-* ').strip() for l in lines[1:]]
        if listed: spells_list += [lines[0]] + listed; continue
        groups = {}
        for sp in sc.get('spells', []):
            u = sp.get('usage') or {}
            key = 'At Will' if u.get('type') == 'at will' else (f"{u.get('times')}/Day" if u.get('type') == 'per day' else ('Cantrips (at will)' if sp.get('level') == 0 else f"Level {sp.get('level')}"))
            groups.setdefault(key, []).append(sp['name'])
        spells_list += [lines[0]] + [f"{k}{' Each' if len(v) > 1 and '/Day' in k else ''}: {', '.join(v)}" for k, v in groups.items()]
    tpl = 'builtin:5e-2024-monster' if ed == '2024' else 'builtin:5e-2014-monster'
    fm = ['---', 'statblock: true', f'atlas-template: {tpl}', f"name: {q(m['name'])}", f"size: {q(m['size'])}", f"type: {q(m['type'])}"]
    if m.get('subtype'): fm.append(f"subtype: {q(m['subtype'])}")
    ac = m['armor_class'][0]
    fm += [f"alignment: {q(m['alignment'])}", f"ac: {ac['value']}", f"hp: {m['hit_points']}", f"hit_dice: {q(m.get('hit_points_roll') or m['hit_dice'])}", f"speed: {q(SPEED(m['speed']))}",
           f"stats: [{m['strength']}, {m['dexterity']}, {m['constitution']}, {m['intelligence']}, {m['wisdom']}, {m['charisma']}]"]
    if saves: fm += ['saves:'] + saves
    if skills: fm += ['skillsaves:'] + skills
    for k in ('damage_vulnerabilities', 'damage_resistances', 'damage_immunities'):
        if m.get(k): fm.append(f"{k}: {q(', '.join(x[0].upper() + x[1:] for x in m[k]))}")
    if m.get('condition_immunities'): fm.append(f"condition_immunities: {q(', '.join(c['name'] for c in m['condition_immunities']))}")
    if m.get('gear'): fm.append(f"gear: {q(m['gear'])}")
    fm += [f"senses: {q(senses(m['senses']))}", f"languages: {q(m.get('languages') or 'None')}", f"cr: {q(cr(m['challenge_rating']))}"]
    fm += entries(traits, 'traits') + entries(actions, 'actions') + entries(m.get('bonus_actions') or [], 'bonus_actions') + entries(m.get('reactions') or [], 'reactions') + entries(m.get('legendary_actions') or [], 'legendary_actions')
    if spells_list: fm += ['spells:'] + [f'  - {q(x)}' for x in spells_list]
    fm += [f'source: {SRCNAME[ed]}', 'tags:', '  - monster', '---']
    return '\n'.join(fm) + f"\n*{ATTR[ed]}*\n"

data = {}
for ed in ('2024', '2014'):
    sp = json.load(open(f'{DB}/{ed}/en/5e-SRD-Spells.json')); mo = json.load(open(f'{DB}/{ed}/en/5e-SRD-Monsters.json'))
    data[ed] = {'spells': {s['name']: spell_note(s, ed) for s in sp}, 'monsters': {m['name']: monster_note(m, ed) for m in mo}, 'attribution': ATTR[ed], 'source': SRCNAME[ed]}
raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
gz = gzip.compress(raw, 9)
print('raw', len(raw), 'gzip', len(gz), 'b64', len(base64.b64encode(gz)))
if len(sys.argv) > 1:
    open(sys.argv[1], 'w').write('// The D&D System Reference Documents 5.2.1 and 5.1 (CC-BY-4.0, Wizards of the Coast): spells and creatures as\n// notes, gzipped. Made by tools/srd (from the 5e-bits 5e-database transcription); not edited by hand.\nexport const SRD_GZ = ' + json.dumps(base64.b64encode(gz).decode()) + ';\n')

