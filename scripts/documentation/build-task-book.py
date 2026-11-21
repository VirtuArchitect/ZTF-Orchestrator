from pathlib import Path
from io import BytesIO
import json
import hashlib
import textwrap
import os
import re
from datetime import date
from pypdf import PdfReader, PdfWriter
from pypdf.annotations import Link
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[2]
catalogue_path = ROOT / 'public/documentation/library.json'
catalogue = json.loads(catalogue_path.read_text(encoding='utf-8'))
reviewed = catalogue['updated']
display_date = date.fromisoformat(reviewed).strftime('%d %B %Y').lstrip('0')
source_short = catalogue['applicationSource'][:7]
version = 'v' + json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
coverage = json.loads((ROOT / 'docs/quick-guides/coverage.json').read_text(encoding='utf-8'))
tasks = [item for item in catalogue['documents'] if item.get('kind') == 'task' and not item['archived']]
assert len(tasks) == sum(coverage['counts'][key] for key in ['currentWorkflows', 'scripts', 'dedicatedOperations'])
tasks.sort(key=lambda item: (item['category'], item['title'].casefold()))
common = next(item for item in catalogue['documents'] if item['id'] == 'quick-guides-using-the-guides')
master_path = 'docs/manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.pdf'
pdfmetrics.registerFont(TTFont('BookArial', os.environ['DOCUMENTATION_ARIAL_FONT']))
pdfmetrics.registerFont(TTFont('BookArialBold', os.environ['DOCUMENTATION_ARIAL_BOLD_FONT']))
rows = []
page_index = 0
y = 650
for item in tasks:
    lines = textwrap.wrap(item['title'], width=76)
    height = 15 * len(lines) + 13
    if y - height < 64:
        page_index += 1
        y = 704
    rows.append(dict(item=item, page=page_index, y=y, height=height, lines=lines))
    y -= height
toc_pages = page_index + 1
common_pages = common['pages'] - 1
offset = 1 + toc_pages + common_pages
for row in rows:
    row['target'] = offset
    offset += row['item']['pages'] - 1

stream = BytesIO()
table = canvas.Canvas(stream, pagesize=(612, 792))
for page in range(toc_pages):
    table.setFont('BookArialBold', 20 if page == 0 else 15)
    table.drawString(49, 718, 'Workflow and Script Quick Guides' if page == 0 else 'Task contents continued')
    if page == 0:
        table.setFont('BookArial', 10)
        table.drawString(49, 696, f"{len(tasks)} current tasks: {coverage['counts']['currentWorkflows']} workflows, {coverage['counts']['scripts']} scripts and {coverage['counts']['dedicatedOperations']} dedicated operations.")
        table.drawString(49, 680, f'Source {source_short} | {display_date} | Simulated screenshots; no live target validation.')
    for row in [row for row in rows if row['page'] == page]:
        item = row['item']
        table.setFont('BookArial', 10.5)
        table.setFillColorRGB(.09, .21, .36)
        for index, line in enumerate(row['lines']):
            table.drawString(49, row['y'] - index * 15, line)
        table.drawRightString(560, row['y'], str(row['target'] + 1))
        table.setFillColorRGB(.3, .36, .42)
        table.setFont('BookArial', 8)
        table.drawString(49, row['y'] - 15 * len(row['lines']) + 3, item['category'])
    table.showPage()
table.save()

writer = PdfWriter()
writer.append(PdfReader(ROOT / master_path), pages=(0, 1), import_outline=False)
writer.append(PdfReader(BytesIO(stream.getvalue())), import_outline=False)
writer.add_outline_item('Task contents', 1)
writer.add_outline_item('Using the quick guides', 1 + toc_pages)
writer.append(PdfReader(ROOT / common['source']), pages=(1, common['pages']), import_outline=False)
for row in rows:
    item = row['item']
    writer.add_outline_item(item['title'], len(writer.pages))
    writer.append(PdfReader(ROOT / item['source']), pages=(1, item['pages']), import_outline=False)
    writer.add_annotation(1 + row['page'], Link(rect=(48, row['y'] - row['height'] + 8, 562, row['y'] + 13), target_page_index=row['target']))
assert len(writer.pages) == offset
for number, page in enumerate(writer.pages):
    if number == 0:
        continue
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    overlay = BytesIO()
    layer = canvas.Canvas(overlay, pagesize=(width, height))
    layer.setFillColorRGB(1, 1, 1)
    layer.rect(0, height - 48, width, 48, fill=1, stroke=0)
    layer.rect(0, 0, width, 45, fill=1, stroke=0)
    layer.setFillColorRGB(0, 0, 0)
    layer.setFont('BookArial', 9)
    layer.drawString(49, height - 34, 'ZTF-Orchestrator | Team Operational Quick Guides')
    layer.setFont('BookArial', 8)
    layer.drawString(49, 26, f'{version} | Source {source_short} | {display_date} | Page {number + 1} of {len(writer.pages)}')
    layer.save()
    page.merge_page(PdfReader(BytesIO(overlay.getvalue())).pages[0])
writer.add_metadata({'/Title': 'Workflow and Script Quick Guides Current Collection', '/Author': 'ZTF-Orchestrator maintainers', '/Subject': f'{len(tasks)} source-reviewed current tasks at application {source_short}; simulated authoring screenshots'})
writer.compress_identical_objects()
destination = ROOT / f'docs/manuals/current/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Current-{reviewed}.pdf'
with destination.open('wb') as output:
    writer.write(output)
data = destination.read_bytes()
inputs = [dict(path=item['source'], sha256=item['sha256'], normalization='binary') for item in [common, *tasks]]
record = dict(id='current-workflow-script-collection', title='Workflow and Script Quick Guides Complete Current Collection', category='Getting started',
              source=destination.relative_to(ROOT).as_posix(), pdf='files/' + destination.name,
              description=f"All {len(tasks)} current task procedures in one PDF with linked contents, bookmarks and task-specific simulated authoring screenshots.",
              edition='Current source collection ' + display_date, scope=f'Application source {source_short}. Retired catalogue entries are kept separately as historical references. Procedures and simulated screenshots do not establish live hardware validation or enable deployment gates.',
              tags=['workflow', 'script', 'complete', 'quick guide', 'all tasks', *[item['title'] for item in tasks]], archived=False,
              pages=len(writer.pages), bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), applicationSource=catalogue['applicationSource'],
              inputSources=inputs, sourceDocument='docs/quick-guides/README.md', kind='guide', coverFile='ztf-standard-cover.jpg', taskCount=len(tasks))
previous = next((row for row in catalogue['documents'] if row['id'] == record['id']), None)
if previous and previous['source'] != record['source']:
    archive = dict(previous)
    previous_date = re.search(r'(\d{4}-\d{2}-\d{2})\.pdf$', previous['source'])
    if not previous_date:
        raise ValueError('Previous task book needs a dated source filename.')
    archive['id'] += '-previous-' + previous_date.group(1)
    archive['archived'] = True
    archive.pop('sourceDocument', None)
    if not any(row['id'] == archive['id'] for row in catalogue['documents']):
        catalogue['documents'].append(archive)
catalogue['documents'] = [row for row in catalogue['documents'] if row['id'] != record['id']] + [record]
catalogue['currentDocuments'] = sum(not row['archived'] for row in catalogue['documents'])
catalogue['historicalDocuments'] = len(catalogue['documents']) - catalogue['currentDocuments']
catalogue_path.write_text(json.dumps(catalogue, indent=2) + '\n', encoding='utf-8')
(ROOT / 'docs/manuals/current/current-task-book-contents.json').write_text(json.dumps([dict(id=row['item']['id'], page=row['target'] + 1, contentsPage=row['page'] + 2) for row in rows], indent=2) + '\n', encoding='utf-8')
register_path = ROOT / 'docs/manuals/current/collection-register.json'
register = json.loads(register_path.read_text(encoding='utf-8'))
register['currentDocuments'] = catalogue['currentDocuments']
register['historicalDocuments'] = catalogue['historicalDocuments']
register['documents'] = [dict(id=row['id'], source=row['source'], sha256=row['sha256'], inputSources=row.get('inputSources', [])) for row in catalogue['documents']]
register_path.write_text(json.dumps(register, indent=2) + '\n', encoding='utf-8')
print(f'Built current task book: {len(writer.pages)} pages, {len(tasks)} linked task entries, {len(data)} bytes.')
