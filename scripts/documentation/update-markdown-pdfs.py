"""Publish rendered Markdown PDFs into the checked source collection.

Requires the authoring toolkit, not application runtime dependencies. Review the
source and collection plan before invoking this tool. Historical supplied PDFs
remain frozen; this tool only updates Markdown sources in the collection plan.
"""
from pathlib import Path
from io import BytesIO
from datetime import date
import argparse
import hashlib
import json
import re
import os
import tempfile
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[2]
MASTER = 'docs/manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.pdf'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render-dir', type=Path, default=ROOT / 'output/documentation-render')
    parser.add_argument('--font', type=Path, required=True, help='Installed Arial TrueType font used by the standard guide format')
    args = parser.parse_args()
    catalogue_path = ROOT / 'public/documentation/library.json'
    catalogue = json.loads(catalogue_path.read_text(encoding='utf-8'))
    pdfmetrics.registerFont(TTFont('GuideArial', str(args.font)))
    cover = PdfReader(ROOT / MASTER)
    version = 'v' + json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    changes = 0
    for record_file in sorted(args.render_dir.glob('*.json')):
        if record_file.name == 'rendered-index.json':
            continue
        item = json.loads(record_file.read_text(encoding='utf-8'))
        if not re.fullmatch(r'[a-z0-9-]+', item['id']):
            raise ValueError('Invalid document ID')
        source = (ROOT / item['sourceDocument']).resolve()
        if not source.is_relative_to(ROOT) or source.suffix != '.md':
            raise ValueError('Markdown source must remain inside the repository')
        reviewed = date.fromisoformat(item['reviewed'])
        application = item['applicationSource']
        if not re.fullmatch(r'[0-9a-f]{40}', application):
            raise ValueError('Record the reviewed application commit')
        display_date = reviewed.strftime('%d %B %Y').lstrip('0')
        destination = ROOT / 'docs/manuals/current' / f"ZTF-Orchestrator-{item['id']}-{reviewed.isoformat()}.pdf"
        body = PdfReader(args.render_dir / (item['id'] + '-body.pdf'))
        writer = PdfWriter()
        writer.append(cover, pages=(0, 1), import_outline=False)
        writer.append(body)
        for number, page in enumerate(writer.pages):
            if number == 0:
                continue
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            stream = BytesIO()
            layer = canvas.Canvas(stream, pagesize=(width, height))
            layer.setFillColorRGB(1, 1, 1)
            layer.rect(0, height - 48, width, 48, stroke=0, fill=1)
            layer.rect(0, 0, width, 45, stroke=0, fill=1)
            layer.setFillColorRGB(0, 0, 0)
            layer.setFont('GuideArial', 9)
            layer.drawString(49, height - 34, 'ZTF-Orchestrator | Team Operational Quick Guides')
            layer.setFont('GuideArial', 8)
            layer.drawString(49, 26, f'{version} | Source {application[:7]} | {display_date} | Page {number + 1} of {len(writer.pages)}')
            layer.save()
            page.merge_page(PdfReader(BytesIO(stream.getvalue())).pages[0])
        writer.add_metadata({'/Title': item['title'], '/Author': 'ZTF-Orchestrator maintainers', '/Subject': f'Source documentation reviewed {display_date} at application {application[:7]}'})
        writer.compress_identical_objects()
        old = next((row for row in catalogue['documents'] if row['id'] == item['id']), None)
        if old and old['source'] != destination.relative_to(ROOT).as_posix():
            previous = dict(old)
            previous['id'] += '-previous-' + re.search(r'(\d{4}-\d{2}-\d{2})\.pdf$', old['source']).group(1)
            previous['archived'] = True
            previous.pop('sourceDocument', None)
            previous['scope'] = 'Earlier source edition. ' + previous['scope']
            if not any(row['id'] == previous['id'] for row in catalogue['documents']):
                catalogue['documents'].append(previous)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.pdf.tmp', delete=False) as output:
                temporary = Path(output.name)
                writer.write(output)
            os.replace(temporary, destination)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
        data = destination.read_bytes()
        result = dict(old or {}, **{key: item[key] for key in ['id', 'title', 'category', 'archived', 'kind', 'scope', 'sourceDocument']})
        result.update(source=destination.relative_to(ROOT).as_posix(), pdf='files/' + destination.name,
                      description=(old or {}).get('description', item['title']), edition='Source snapshot ' + display_date,
                      pages=len(writer.pages), bytes=len(data), sha256=sha(data), reviewed=reviewed.isoformat(), applicationSource=application,
                      inputSources=[*item['inputSources'], dict(path=MASTER, sha256=sha((ROOT / MASTER).read_bytes()), normalization='binary')],
                      coverFile='ztf-standard-cover.jpg', tags=(old or {}).get('tags', [item['category'], item['sourceDocument']]))
        catalogue['documents'] = [row for row in catalogue['documents'] if row['id'] != item['id']]
        catalogue['documents'].append(result)
        catalogue['updated'] = reviewed.isoformat()
        catalogue['applicationSource'] = application
        changes += 1
    catalogue['documents'].sort(key=lambda item: (item['archived'], item['id'] != 'collection-overview', item['category'], item['title'].casefold()))
    catalogue['currentDocuments'] = sum(not item['archived'] for item in catalogue['documents'])
    catalogue['historicalDocuments'] = len(catalogue['documents']) - catalogue['currentDocuments']
    catalogue_path.write_text(json.dumps(catalogue, indent=2) + '\n', encoding='utf-8')
    register_path = ROOT / 'docs/manuals/current/collection-register.json'
    register = json.loads(register_path.read_text(encoding='utf-8'))
    register.update(applicationSource=catalogue['applicationSource'], reviewed=catalogue['updated'], currentDocuments=catalogue['currentDocuments'], historicalDocuments=catalogue['historicalDocuments'])
    register['documents'] = [dict(id=item['id'], source=item['source'], sha256=item['sha256'], inputSources=item.get('inputSources', [])) for item in catalogue['documents']]
    register_path.write_text(json.dumps(register, indent=2) + '\n', encoding='utf-8')
    print(f'Updated {changes} Markdown PDFs. Refresh the complete task book if any task PDF changed; then run source, render and website checks.')


if __name__ == '__main__':
    main()
