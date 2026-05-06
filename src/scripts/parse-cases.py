#!/usr/bin/env python3
"""
parse-cases.py
Parses the Native Med 246 Mock SCA Case Collection docx
and outputs cases-seed.json for the TypeScript seeder.

Usage:
    python3 parse-cases.py /path/to/cases.docx
    python3 parse-cases.py /path/to/cases.docx --output cases-seed.json
"""

import sys, json, re, argparse
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

# ─────────────────────────────────────────────────────────────────────────────
# Specialty map
# ─────────────────────────────────────────────────────────────────────────────

_SPECIALTY_STATIONS = [
    ('Cardiology',          [42,52,58,118,121,139,141,167,194,199,203,219,225,227,229,232]),
    ('Dermatology',         [8,20,69,89,90,105,119,128,138,145,156,193,213,231,244]),
    ('Endocrinology',       [6,7,11,12,15,23,48,70,86,110,116,120,133,149,153,171,176,177,190,209,215,216]),
    ('ENT & Eye',           [3,30,82,99,108,166,174,189,192,202,235]),
    ('Ethics',              [18,25,32,43,55,66,80,88,91,112,117,132,150,178,210,214,220,227,242]),
    ('Gastroenterology',    [2,16,29,35,45,54,60,65,78,87,103,127,134,144,146,152,159,195,200,218,223,226,237,238]),
    ('Genetics',            [12,103,115]),
    ('Gynaecology',         [1,22,40,50,59,75,79,94,138,140,143,154,172,180,188,205,236,239,240,241]),
    ("Men's Health",        [51,77,98,104,109,191]),
    ('Mental Health',       [9,10,14,26,49,53,84,93,96,102,125,142,151,163,164,165,170,187,217,221,222,225]),
    ('Neurology',           [44,57,62,64,92,114,158,160,224,228,243,246]),
    ('Paediatrics',         [3,36,76,83,106,107,136,155,165,184,198,231,233]),
    ('Respiratory',         [5,24,37,41,71,74,100,113,122,124,129,137,181,230,234]),
    ('Rheumatology',        [39,56,81,95,130,173,175,182,183,212]),
    ('Infectious Disease',  [13,72,179,197]),
    ('General Practice',    [4,17,28,33,47,63,73,85,97,131,148,161,162,186,196,245]),
]

def get_specialty(num):
    for specialty, stations in _SPECIALTY_STATIONS:
        if num in stations:
            return specialty
    return 'General Practice'

# ─────────────────────────────────────────────────────────────────────────────
# Document helpers
# ─────────────────────────────────────────────────────────────────────────────

def iter_blocks(doc):
    for child in doc.element.body:
        if child.tag == qn('w:p'):
            yield Paragraph(child, doc)
        elif child.tag == qn('w:tbl'):
            yield Table(child, doc)

def is_bold(para):
    runs = [r for r in para.runs if r.text.strip()]
    return bool(runs) and all(r.bold for r in runs)

def ptext(block):
    return block.text.strip() if isinstance(block, Paragraph) else ''

# ─────────────────────────────────────────────────────────────────────────────
# TOC title extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_toc_titles(doc):
    titles = {}
    for para in doc.paragraphs:
        if para.style.name not in ('toc 1', 'TOC 1'):
            continue
        text = para.text.strip()
        m = re.match(
            r'Station\s+(\d+)\s*[-–—:]*\s*'
            r'(?:(?:Video|Telephone)\s*[Cc]onsultation\s*[-–—]*\s*)?'
            r'(.+?)(?:\s{2,}|\t|$)', text
        )
        if m:
            num, topic = int(m.group(1)), m.group(2).strip()
            if topic:
                titles[num] = topic
    return titles

# ─────────────────────────────────────────────────────────────────────────────
# Station block splitting
# ─────────────────────────────────────────────────────────────────────────────

def split_into_stations(doc):
    stations = []
    current_num, current_type, current_blocks = None, '', []
    header_re = re.compile(
        r'^Station\s+(\d{1,3})\s*[-–—:]*\s*(Video|Telephone)?\s*[Cc]onsultation',
        re.IGNORECASE
    )
    for block in iter_blocks(doc):
        if isinstance(block, Paragraph) and block.style.name == 'TOC L':
            m = header_re.match(ptext(block))
            if m:
                if current_num is not None:
                    stations.append((current_num, current_type, current_blocks))
                current_num = int(m.group(1))
                current_type = (m.group(2) or '').capitalize()
                current_blocks = []
                continue
        if current_num is not None:
            current_blocks.append(block)
    if current_num is not None:
        stations.append((current_num, current_type, current_blocks))
    return stations

# ─────────────────────────────────────────────────────────────────────────────
# Section header patterns
# Each tuple: (bucket_key, compiled_regex, store_header_text_as_content)
# Sections from 'marking_scheme' onward are "post-patient" sections.
# The ms_subsection key is used only INSIDE the marking scheme.
# ─────────────────────────────────────────────────────────────────────────────

# Patient data sections (appear before marking scheme)
PATIENT_SECTIONS = [
    ('patient_name',        re.compile(r"patient.{0,10}name|^name\s*:|^caller\s*:", re.I),      True),
    ('age',                 re.compile(r"^age\s*[:\-–]?\s*\d", re.I),                           True),
    ('pmh',                 re.compile(r"past\s+med", re.I),                                     False),
    ('drug_history',        re.compile(r"^drug|^medication|allergy\s*hist", re.I),               False),
    ('recent_consultation', re.compile(r"recent\s*(notes|consult)", re.I),                       False),
    ('blood_tests',         re.compile(r"blood\s*test|blood\s*result|blood\s*results\s*summary", re.I), False),
    ('patient_story',       re.compile(r"patient.{0,20}story|patient\s*information|role\s*player|patient.{0,10}brief", re.I), False),
]

# Post-patient sections (appear after patient story)
POST_SECTIONS = [
    ('marking_scheme',      re.compile(r"marking\s*scheme", re.I),     False),
    ('example_explanation', re.compile(r"example.{0,10}explan", re.I), False),
    ('management',          re.compile(r"^management\b", re.I),         False),
    ('learning_points',     re.compile(r"learning\s*point", re.I),      False),
    ('further_reading',     re.compile(r"further\s*(reading|resource)", re.I), False),
]

# Sub-sections only valid INSIDE marking scheme
MS_SUBSECTION_RE = re.compile(r"data\s*gather|diagnosis|^history\b", re.I)

ALL_SECTIONS = PATIENT_SECTIONS + POST_SECTIONS

def detect_section(text):
    """Return (bucket_key, store_text) or (None, False)."""
    for key, pattern, store in ALL_SECTIONS:
        if pattern.search(text):
            return key, store
    return None, False

# ─────────────────────────────────────────────────────────────────────────────
# Blood test helpers
# ─────────────────────────────────────────────────────────────────────────────

def is_abnormal(result, ref):
    try:
        val_m = re.search(r'([\d.]+)', result)
        if not val_m:
            return False
        val = float(val_m.group(1))
        m = re.match(r'<\s*([\d.]+)', ref.strip())
        if m: return val >= float(m.group(1))
        m = re.match(r'>\s*([\d.]+)', ref.strip())
        if m: return val <= float(m.group(1))
        m = re.search(r'([\d.]+)\s*[-–]\s*([\d.]+)', ref)
        if m:
            lo, hi = float(m.group(1)), float(m.group(2))
            return val < lo or val > hi
    except Exception:
        pass
    return False

def parse_table(table):
    rows = []
    data_rows = table.rows
    start = 1 if (data_rows and re.match(r'test', data_rows[0].cells[0].text, re.I)) else 0
    for row in data_rows[start:]:
        cells = [c.text.strip() for c in row.cells]
        if len(cells) < 3: continue
        test, result, ref = cells[0], cells[1], cells[2]
        if not test or not result: continue
        rows.append({'test': test, 'result': result, 'referenceRange': ref,
                     'isAbnormal': is_abnormal(result, ref)})
    return rows

# ─────────────────────────────────────────────────────────────────────────────
# Age / gender extraction
# ─────────────────────────────────────────────────────────────────────────────

_AGE_RE = re.compile(
    r'(\d+)\s*[-–]?\s*years?\s*[-–]?\s*old\s*(male|female)|'
    r'(\d+)[-–]year[-–]old\s*(male|female)|'
    r'age\s*[:\-–]?\s*(\d+)\s*[-–]?\s*(male|female)',
    re.IGNORECASE
)

def extract_age_gender(text):
    m = _AGE_RE.search(text)
    if m:
        age = int(m.group(1) or m.group(3) or m.group(5) or 0)
        gender = (m.group(2) or m.group(4) or m.group(6) or '').lower()
        return age, gender if gender in ('male', 'female') else 'other'
    num = re.search(r'\b(\d+)\b', text)
    age = int(num.group(1)) if num and 1 < int(num.group(1)) < 130 else 0
    gender = ('female' if re.search(r'female|woman|girl|lady', text, re.I)
              else 'male' if re.search(r'\bmale\b|man\b|boy\b', text, re.I)
              else 'other')
    return age, gender

# ─────────────────────────────────────────────────────────────────────────────
# URL helpers
# ─────────────────────────────────────────────────────────────────────────────

_URL_RE = re.compile(r'https?://[^\s\]\)>\"\']+')

def url_to_title(url):
    clean = re.sub(r'^https?://(www\.)?', '', url).rstrip('/')
    skip = {'topics', 'en', 'uk', 'conditions', 'guidance', 'articles'}
    parts = [p for p in clean.split('/') if p and p not in skip]
    if parts:
        return parts[-1].replace('-', ' ').replace('_', ' ').title()
    return clean

# ─────────────────────────────────────────────────────────────────────────────
# Main station parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_station(num, consult_type, blocks, toc_titles):
    # Buckets hold ('text'|'bold'|'table', content) tuples
    buckets = {key: [] for key, _, _ in ALL_SECTIONS}
    buckets['_overflow'] = []

    # Marking scheme sub-sections are accumulated separately
    ms_sections  = []   # list of {'heading': str, 'points': [str]}
    ms_heading   = 'Data Gathering and Diagnosis'
    ms_points    = []
    in_ms        = False   # True only while inside the marking scheme block

    current = '_overflow'

    for block in blocks:
        # ── Tables go straight into the current bucket ─────────────────────
        if isinstance(block, Table):
            buckets[current].append(('table', block))
            continue

        text = ptext(block)
        bold = is_bold(block)

        if not text:
            continue

        # ── Section header detection ────────────────────────────────────────
        # We check BOTH bold and non-bold lines for name/age patterns
        # (some stations have non-bold name lines as first paragraph).
        # For all other sections we require bold to avoid false positives.

        is_name_line = bool(re.search(
            r"patient.{0,10}name|^name\s*:|^caller\s*:", text, re.I
        ))
        is_age_line = bool(re.match(r"age\s*[:\-–]?\s*\d", text, re.I))

        # Always check name/age on any paragraph (bold or not)
        if not bold and (is_name_line or is_age_line):
            key = 'patient_name' if is_name_line else 'age'
            buckets[key].append(('text', text))
            if is_name_line:
                current = 'patient_name'
            continue

        if bold:
            # ── Inside marking scheme: check for sub-section headers ────────
            if in_ms and MS_SUBSECTION_RE.search(text):
                if ms_points:
                    ms_sections.append({'heading': ms_heading, 'points': ms_points})
                ms_heading = text
                ms_points  = []
                continue

            # ── Regular section detection ───────────────────────────────────
            key, store_text = detect_section(text)

            if key == 'marking_scheme':
                # Flush any previous marking scheme section on re-entry
                if ms_points:
                    ms_sections.append({'heading': ms_heading, 'points': ms_points})
                    ms_points = []
                in_ms     = True
                current   = 'marking_scheme'
                continue

            if key and key != 'marking_scheme':
                # Any recognised section CLOSES the marking scheme block
                in_ms   = False
                current = key
                if store_text:
                    buckets[key].append(('bold', text))
                continue

            # ── Bold paragraph that's not a section header ──────────────────
            if in_ms:
                ms_points.append(text)
            else:
                buckets[current].append(('bold', text))

        else:
            # Non-bold, non-name/age content
            if in_ms:
                ms_points.append(text)
            else:
                buckets[current].append(('text', text))

    # Flush last marking scheme section
    if ms_points:
        ms_sections.append({'heading': ms_heading, 'points': ms_points})

    # ── Extract patient name ──────────────────────────────────────────────────
    name = ''
    for kind, content in buckets['patient_name']:
        if not isinstance(content, str): continue
        # Handle multiline "Patient's name: X\nAge: Y" paragraphs
        first_line = content.split('\n')[0]
        m = re.search(r"(?:patient.{0,10}name|^name|caller)\s*:?\s*(.+)", first_line, re.I)
        if m:
            name = m.group(1).strip().rstrip('*').strip()
            break

    # ── Extract age and gender ────────────────────────────────────────────────
    age, gender = 0, 'other'

    # 1. Dedicated age bucket (bold or non-bold "Age: X" lines)
    for kind, content in buckets['age']:
        if not isinstance(content, str): continue
        a, g = extract_age_gender(content)
        if a: age, gender = a, g; break

    # 2. Multiline name+age paragraph (station 100 pattern)
    if age == 0:
        for kind, content in buckets['patient_name']:
            if not isinstance(content, str) or '\n' not in content: continue
            for line in content.split('\n')[1:]:
                a, g = extract_age_gender(line)
                if a: age, gender = a, g; break
            if age: break

    # 3. Scan first few lines of _overflow for plain "Age: X" text
    if age == 0:
        for kind, content in buckets['_overflow']:
            if not isinstance(content, str): continue
            if re.match(r'age\s*[:\-–]', content, re.I):
                a, g = extract_age_gender(content)
                if a: age, gender = a, g; break

    # 4. Last resort: first sentence of patient story
    if age == 0:
        for kind, content in buckets['patient_story'][:3]:
            if not isinstance(content, str): continue
            a, g = extract_age_gender(content)
            if a: age, gender = a, g; break

    # ── Past medical history ──────────────────────────────────────────────────
    noise = {'none', 'nil', 'none recorded', 'nil recorded', 'past medical history',
             'past medical history:', 'not recorded'}
    pmh = [c for k, c in buckets['pmh']
           if isinstance(c, str) and c.lower().strip('.') not in noise]

    # ── Drug history ──────────────────────────────────────────────────────────
    drug_noise = re.compile(r'^drug|^medication|^allergy\s*hist', re.I)
    drugs = [c for k, c in buckets['drug_history']
             if isinstance(c, str) and not drug_noise.match(c)]

    # ── Recent consultation ───────────────────────────────────────────────────
    seen_by = 'GP Surgery'
    notes_parts = []
    for kind, content in buckets['recent_consultation']:
        if not isinstance(content, str): continue
        if re.search(r'seen\s*by|letter\s*from|telephone\s*consult', content, re.I):
            if seen_by == 'GP Surgery':
                seen_by = content
            else:
                notes_parts.append(content)
        else:
            notes_parts.append(content)
    consult_notes = ' '.join(notes_parts).strip() or 'No recent consultation notes'

    # ── Blood test results ────────────────────────────────────────────────────
    # Tables can appear in blood_tests OR recent_consultation buckets
    blood_rows  = []
    blood_summary_parts = []
    for bname in ('blood_tests', 'recent_consultation'):
        for kind, content in buckets[bname]:
            if kind == 'table':
                blood_rows.extend(parse_table(content))
            elif isinstance(content, str) and bname == 'blood_tests':
                blood_summary_parts.append(content)

    blood_summary = ' '.join(blood_summary_parts).strip() or (
        'Blood tests reviewed — see table' if blood_rows else 'No blood tests available'
    )

    # ── Patient story ─────────────────────────────────────────────────────────
    story_parts = [c for k, c in buckets['patient_story'] if isinstance(c, str) and c]
    patient_story = '\n\n'.join(story_parts).strip() or 'No patient story available'

    # ── Marking scheme ────────────────────────────────────────────────────────
    marking_scheme = ms_sections
    if not marking_scheme:
        pts = [c for k, c in buckets['marking_scheme'] if isinstance(c, str) and c]
        marking_scheme = [{'heading': 'Data Gathering and Diagnosis',
                           'points': pts or ['See case notes']}]

    # ── Management ────────────────────────────────────────────────────────────
    management = [c for k, c in buckets['management'] if isinstance(c, str) and c]
    if not management:
        management = ['Refer to marking scheme for management guidance']

    # ── Example explanation ───────────────────────────────────────────────────
    exp_parts = [c for k, c in buckets['example_explanation'] if isinstance(c, str) and c]
    example_explanation = '\n\n'.join(exp_parts).strip() or 'No example explanation provided'

    # ── Learning points ───────────────────────────────────────────────────────
    lp_parts = [c for k, c in buckets['learning_points'] if isinstance(c, str) and c]
    learning_points = '\n\n'.join(lp_parts).strip() or 'No learning points provided'

    # ── Further resources ─────────────────────────────────────────────────────
    further_resources = []
    seen_urls = set()
    for kind, content in buckets['further_reading']:
        if not isinstance(content, str): continue
        for url in _URL_RE.findall(content):
            url = url.rstrip('.,;)')
            if url not in seen_urls:
                seen_urls.add(url)
                further_resources.append({'title': url_to_title(url), 'url': url})

    # ── Build output ──────────────────────────────────────────────────────────
    title = toc_titles.get(num, f'Station {num}')
    consult_label = f'{consult_type} Consultation' if consult_type else 'Consultation'

    return {
        'stationNumber': num,
        'title': title,
        'consultationType': consult_label,
        'specialty': get_specialty(num),
        'difficulty': 'medium',
        'isPublished': False,
        'patientData': {
            'name': name or f'Patient {num}',
            'age': age,
            'gender': gender,
            'pastMedicalHistory': pmh,
            'drugHistory': drugs,
            'recentConsultation': {'seenBy': seen_by, 'notes': consult_notes},
            'bloodTestResults': {'summary': blood_summary, 'rows': blood_rows},
        },
        'patientStory': patient_story,
        'markingScheme': marking_scheme,
        'exampleExplanation': example_explanation,
        'management': management,
        'learningPoints': learning_points,
        'furtherResources': further_resources,
    }

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('docx')
    ap.add_argument('--output', '-o', default='cases-seed.json')
    args = ap.parse_args()

    p = Path(args.docx)
    if not p.exists():
        print(f'Error: {p} not found', file=sys.stderr); sys.exit(1)

    print(f'📖  Loading {p.name}...')
    doc = Document(str(p))

    print('📋  Extracting TOC titles...')
    toc_titles = extract_toc_titles(doc)
    print(f'    Found {len(toc_titles)} TOC entries')

    print('✂️   Splitting into station blocks...')
    station_blocks = split_into_stations(doc)
    print(f'    Found {len(station_blocks)} stations')

    cases, errors = [], []

    for num, consult_type, blocks in station_blocks:
        try:
            case = parse_station(num, consult_type, blocks, toc_titles)
            cases.append(case)
            if case['patientData']['name'].startswith('Patient '):
                errors.append(f'  Station {num:3d}: name not found')
            if case['patientData']['age'] == 0:
                errors.append(f'  Station {num:3d}: age not found')
        except Exception as e:
            errors.append(f'  Station {num:3d}: CRASH — {e}')
            import traceback; traceback.print_exc()

    out = Path(args.output)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(cases, f, ensure_ascii=False, indent=2)

    print(f'\n✅  Wrote {len(cases)} cases to {out}')

    if errors:
        print(f'\n⚠️   {len(errors)} warnings:')
        for e in errors[:30]: print(e)
        if len(errors) > 30: print(f'    ... and {len(errors)-30} more')
    else:
        print('    No warnings — all 246 cases parsed cleanly.')

    with_blood  = sum(1 for c in cases if c['patientData']['bloodTestResults']['rows'])
    with_res    = sum(1 for c in cases if c['furtherResources'])
    no_name     = sum(1 for c in cases if c['patientData']['name'].startswith('Patient '))
    no_age      = sum(1 for c in cases if c['patientData']['age'] == 0)
    total_blood = sum(len(c['patientData']['bloodTestResults']['rows']) for c in cases)
    total_res   = sum(len(c['furtherResources']) for c in cases)

    print(f'\n📊  Summary:')
    print(f'    Total cases parsed:            {len(cases)}')
    print(f'    With blood test tables:        {with_blood}  ({total_blood} rows total)')
    print(f'    With further resources:        {with_res}  ({total_res} links total)')
    print(f'    Missing name (used fallback):  {no_name}')
    print(f'    Missing age  (used fallback):  {no_age}')
    print(f'    Specialties covered:           {len(set(c["specialty"] for c in cases))}')

if __name__ == '__main__':
    main()