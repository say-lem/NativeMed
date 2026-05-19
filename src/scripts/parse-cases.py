#!/usr/bin/env python3
"""
parse-cases.py
Parses the Native Med 246 Mock SCA Case Collection docx and outputs
cases-seed.json with bold (**text**) and italic (*text*) formatting preserved
as Markdown in all rich-text fields.

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
# Markdown formatting
# ─────────────────────────────────────────────────────────────────────────────

def _wrap(text, bold, italic):
    """Wrap a text fragment with markdown markers, preserving surrounding whitespace."""
    stripped = text.strip()
    if not stripped:
        return text  # pure whitespace — keep as-is, no markers
    prefix = text[:len(text) - len(text.lstrip())]
    suffix = text[len(text.rstrip()):]
    if bold and italic:
        return f'{prefix}***{stripped}***{suffix}'
    if bold:
        return f'{prefix}**{stripped}**{suffix}'
    if italic:
        return f'{prefix}*{stripped}*{suffix}'
    return text

def para_to_markdown(para):
    """
    Convert a paragraph's runs into a Markdown string, merging consecutive
    runs that share the same bold/italic state to avoid redundant markers.

    run.bold / run.italic return:
        True  — explicitly set on this run
        None  — inherited from paragraph style (treat as plain)
        False — explicitly cleared
    """
    if not isinstance(para, Paragraph):
        return ''

    # Merge consecutive runs with the same (bold, italic) pair
    groups = []   # list of (bold, italic, text)
    for run in para.runs:
        b = run.bold  is True
        i = run.italic is True
        if groups and groups[-1][0] == b and groups[-1][1] == i:
            groups[-1] = (b, i, groups[-1][2] + run.text)
        else:
            groups.append((b, i, run.text))

    return ''.join(_wrap(t, b, i) for b, i, t in groups).strip()

def strip_md(text):
    """Remove markdown markers — used when extracting structured data (name, age)."""
    return re.sub(r'\*+', '', text).strip()

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
    """Plain text — used only for section detection and regex extraction."""
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
# Station splitting
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
# Section detection patterns
# ─────────────────────────────────────────────────────────────────────────────

PATIENT_SECTIONS = [
    ('patient_name',        re.compile(r"patient.{0,10}name|^name\s*:|^caller\s*:", re.I),      True),
    ('age',                 re.compile(r"^age\s*[:\-–]?\s*\d", re.I),                           True),
    ('pmh',                 re.compile(r"past\s+med", re.I),                                     False),
    ('drug_history',        re.compile(r"^drug|^medication|allergy\s*hist", re.I),               False),
    ('recent_consultation', re.compile(r"recent\s*(notes|consult)", re.I),                       False),
    ('blood_tests',         re.compile(r"blood\s*test|blood\s*result|blood\s*results\s*summary", re.I), False),
    ('patient_story',       re.compile(r"patient.{0,20}story|patient\s*information|role\s*player|patient.{0,10}brief", re.I), False),
]

POST_SECTIONS = [
    ('marking_scheme',      re.compile(r"marking\s*scheme", re.I),     False),
    ('example_explanation', re.compile(r"example.{0,10}explan", re.I), False),
    ('management',          re.compile(r"^management\b", re.I),         False),
    ('learning_points',     re.compile(r"learning\s*point", re.I),      False),
    ('further_reading',     re.compile(r"further\s*(reading|resource)", re.I), False),
]

ALL_SECTIONS = PATIENT_SECTIONS + POST_SECTIONS
MS_SUBSECTION_RE = re.compile(r"data\s*gather|diagnosis|^history\b", re.I)

def detect_section(text):
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
        if not val_m: return False
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
        rows.append({
            'test': test,
            'result': result,
            'referenceRange': ref if ref.strip() else 'N/A',
            'isAbnormal': is_abnormal(result, ref),
        })
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
    """Always call with plain/stripped text, not markdown."""
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
    # Buckets store ('text'|'bold'|'table', content) tuples.
    # 'content' is MARKDOWN text for paragraph items, Table object for tables.
    buckets = {key: [] for key, _, _ in ALL_SECTIONS}
    buckets['_overflow'] = []

    ms_sections = []
    ms_heading  = 'Data Gathering and Diagnosis'
    ms_points   = []
    in_ms       = False
    current     = '_overflow'

    for block in blocks:
        if isinstance(block, Table):
            buckets[current].append(('table', block))
            continue

        plain = ptext(block)          # plain text — for detection only
        md    = para_to_markdown(block)  # markdown — for storage
        bold  = is_bold(block)

        if not plain:
            continue

        # ── Non-bold name/age lines (some stations have these un-bolded) ──────
        is_name_line = bool(re.search(r"patient.{0,10}name|^name\s*:|^caller\s*:", plain, re.I))
        is_age_line  = bool(re.match(r"age\s*[:\-–]?\s*\d", plain, re.I))

        if not bold and (is_name_line or is_age_line):
            key = 'patient_name' if is_name_line else 'age'
            buckets[key].append(('text', md))
            if is_name_line:
                current = 'patient_name'
            continue

        if bold:
            # ── Inside marking scheme: check for sub-section header ──────────
            if in_ms and MS_SUBSECTION_RE.search(plain):
                if ms_points:
                    ms_sections.append({'heading': ms_heading, 'points': ms_points})
                ms_heading = plain   # headings stored as plain text (structural, not displayed)
                ms_points  = []
                continue

            key, store_text = detect_section(plain)

            if key == 'marking_scheme':
                if ms_points:
                    ms_sections.append({'heading': ms_heading, 'points': ms_points})
                    ms_points = []
                in_ms   = True
                current = 'marking_scheme'
                continue

            if key and key != 'marking_scheme':
                in_ms   = False   # any post-MS section closes the MS block
                current = key
                if store_text:
                    buckets[key].append(('bold', md))
                continue

            # Bold but not a section header
            if in_ms:
                ms_points.append(md)
            else:
                buckets[current].append(('bold', md))

        else:
            # Non-bold content
            if in_ms:
                if plain:
                    ms_points.append(md)
            else:
                if plain:
                    buckets[current].append(('text', md))

    if ms_points:
        ms_sections.append({'heading': ms_heading, 'points': ms_points})

    # ── Extract patient name (from plain text, not markdown) ─────────────────
    name = ''
    for kind, content in buckets['patient_name']:
        plain_content = strip_md(content)
        first_line = plain_content.split('\n')[0]
        m = re.search(r"(?:patient.{0,10}name|^name|caller)\s*:?\s*(.+)", first_line, re.I)
        if m:
            name = m.group(1).strip().rstrip('*').strip()
            break

    # ── Extract age/gender (always strip markdown before regex) ──────────────
    age, gender = 0, 'other'

    for kind, content in buckets['age']:
        a, g = extract_age_gender(strip_md(content))
        if a: age, gender = a, g; break

    if age == 0:
        for kind, content in buckets['patient_name']:
            plain_content = strip_md(content)
            if '\n' in plain_content:
                for line in plain_content.split('\n')[1:]:
                    a, g = extract_age_gender(line)
                    if a: age, gender = a, g; break
                if age: break

    if age == 0:
        for kind, content in buckets['_overflow']:
            if not isinstance(content, str): continue
            plain_content = strip_md(content)
            if re.match(r'age\s*[:\-–]', plain_content, re.I):
                a, g = extract_age_gender(plain_content)
                if a: age, gender = a, g; break

    if age == 0:
        for kind, content in buckets['patient_story'][:3]:
            if isinstance(content, str):
                a, g = extract_age_gender(strip_md(content))
                if a: age, gender = a, g; break

    # ── PMH & drug history ────────────────────────────────────────────────────
    noise = {'none', 'nil', 'none recorded', 'nil recorded', 'past medical history',
             'past medical history:', 'not recorded'}
    pmh = [c for k, c in buckets['pmh']
           if isinstance(c, str) and strip_md(c).lower().strip('.') not in noise]

    drug_noise = re.compile(r'^drug|^medication|^allergy\s*hist', re.I)
    drugs = [c for k, c in buckets['drug_history']
             if isinstance(c, str) and not drug_noise.match(strip_md(c))]

    # ── Recent consultation ───────────────────────────────────────────────────
    seen_by = 'GP Surgery'
    notes_parts = []
    for kind, content in buckets['recent_consultation']:
        if not isinstance(content, str): continue
        if re.search(r'seen\s*by|letter\s*from|telephone\s*consult', strip_md(content), re.I):
            if seen_by == 'GP Surgery':
                seen_by = strip_md(content)   # seen_by stored as plain — it's a label
            else:
                notes_parts.append(content)
        else:
            notes_parts.append(content)
    consult_notes = '\n\n'.join(notes_parts).strip() or 'No recent consultation notes'

    # ── Blood tests ───────────────────────────────────────────────────────────
    blood_rows, blood_summary_parts = [], []
    for bname in ('blood_tests', 'recent_consultation'):
        for kind, content in buckets[bname]:
            if kind == 'table':
                blood_rows.extend(parse_table(content))
            elif isinstance(content, str) and bname == 'blood_tests':
                blood_summary_parts.append(content)

    blood_summary = '\n\n'.join(blood_summary_parts).strip() or (
        'Blood tests reviewed — see table' if blood_rows else 'No blood tests available'
    )

    # ── Patient story (markdown preserved) ───────────────────────────────────
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

    # ── Example explanation (markdown preserved — typically italic) ───────────
    exp_parts = [c for k, c in buckets['example_explanation'] if isinstance(c, str) and c]
    example_explanation = '\n\n'.join(exp_parts).strip() or 'No example explanation provided'

    # ── Learning points (markdown preserved) ─────────────────────────────────
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
    else:
        print('    No warnings — all 246 cases parsed cleanly.')

    # Spot-check markdown in station 1
    s1 = next(c for c in cases if c['stationNumber'] == 1)
    bold_count  = s1['patientStory'].count('**') // 2
    italic_count = s1['patientStory'].count('*')
    print(f'\n🔍  Station 1 spot-check:')
    print(f'    Bold markers in patientStory: ~{bold_count}')
    print(f'    Italic chars in exampleExplanation: {s1["exampleExplanation"].count("*")}')
    print(f'    First 200 chars of patientStory:')
    print(f'    {repr(s1["patientStory"][:200])}')

    with_bold   = sum(1 for c in cases if '**' in c['patientStory'])
    with_italic = sum(1 for c in cases if (
        c['exampleExplanation'].count('*') - c['exampleExplanation'].count('**') * 2 > 0
    ))
    print(f'\n📊  Summary:')
    print(f'    Cases with bold in patientStory:          {with_bold}')
    print(f'    Cases with italic in exampleExplanation:  {with_italic}')
    print(f'    Total cases: {len(cases)}')

if __name__ == '__main__':
    main()