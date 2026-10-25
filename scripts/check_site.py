"""Dependency-free checks for the static site. Run from any directory."""
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('knowledge-map', 'learning-path', 'interview', 'correction-lab')
errors = []


class Page(HTMLParser):
    def __init__(self, filename):
        super().__init__()
        self.filename = filename
        self.ids = set()
        self.references = []
        self.has_main = False
        self.has_title = False

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        identifier = attributes.get('id')
        if identifier:
            if identifier in self.ids:
                errors.append(f'{self.filename}: duplicate id {identifier}')
            self.ids.add(identifier)
        self.has_main |= tag == 'main'
        self.has_title |= tag == 'title'
        for name in ('href', 'src'):
            value = attributes.get(name)
            if value:
                self.references.append(value)


required = ['index.html', 'README.md', 'LICENSE', 'vercel.json', 'shared/styles.css',
            'shared/navigation.js', 'shared/storage.js', 'shared/vendor/lucide.min.js',
            'shared/vendor/LUCIDE-LICENSE', 'public/favicon.svg']
required += [f'{folder}/{name}' for folder in MODULES
             for name in ('index.html', 'style.css', 'script.js', 'README.md')]
required.append('knowledge-map/data.js')
required += ['knowledge-map/explore.html', 'knowledge-map/explore.js',
             'knowledge-map/account.html', 'knowledge-map/account.js',
             'knowledge-map/case-editor.js', 'knowledge-map/my.html', 'knowledge-map/home.js', 'knowledge-map/account-entry.js',
             'knowledge-map/position-writes.js',
             'docs/KNOWLEDGE-UX-REFACTORING-IMPLEMENTATION-PLAN.md']
for name in required:
    if not (ROOT / name).is_file():
        errors.append(f'Missing {name}')

for filename in sorted(ROOT.rglob('*.html')):
    relative = filename.relative_to(ROOT)
    parser = Page(relative)
    source = filename.read_text(encoding='utf-8')
    parser.feed(source)
    if not parser.has_main or not parser.has_title:
        errors.append(f'{relative}: missing title or main landmark')
    if 'window.openai' in source or 'Tweak' in source:
        errors.append(f'{relative}: conversation-only runtime code remains')
    for reference in parser.references:
        url = urlsplit(reference)
        if url.scheme or url.netloc or not url.path:
            continue
        target = (ROOT / unquote(url.path.lstrip('/')) if url.path.startswith('/')
                  else filename.parent / unquote(url.path)).resolve()
        if not target.is_relative_to(ROOT):
            errors.append(f'{relative}: link leaves the site: {reference}')
            continue
        if target.is_dir():
            target = target / 'index.html'
        if not target.is_file():
            errors.append(f'{relative}: missing local link or asset {reference}')

try:
    config = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
    if config.get('rewrites'):
        errors.append('This multi-page starter should not use catch-all SPA rewrites')
except (ValueError, OSError) as exc:
    errors.append(f'Invalid Vercel configuration: {exc}')

if errors:
    raise SystemExit('\n'.join(errors))
print('Static checks passed: four modules, local links, assets, IDs and Vercel configuration.')
