"""Self-host covers from the book-galaxy-data package as small WebP (2x the library-card size: 180x260 box).
Local package files are preferred; entries that only have an imageUrl are fetched once into scripts/raw/cover-cache/."""
import json, os, sys, urllib.request, io
from PIL import Image
PKG = os.environ.get('BG_PKG', '/workspace/book-galaxy-data')
books = json.load(open(f'{PKG}/dist/books.json'))['books']
os.makedirs('public/covers', exist_ok=True); os.makedirs('scripts/raw/cover-cache', exist_ok=True)
out, miss = {}, []
for b in books:
    c = b.get('cover')
    if not c: miss.append(b['id']); continue
    src = os.path.join(PKG, c['file']) if c.get('file') else None
    if not (src and os.path.exists(src)):
        src = f"scripts/raw/cover-cache/{b['id']}.img"
        if not os.path.exists(src):
            try:
                req = urllib.request.Request(c['imageUrl'], headers={'User-Agent': 'BookGalaxy2/0.1 (https://github.com/VinceJan/Book-Galaxy-2)'})
                open(src, 'wb').write(urllib.request.urlopen(req, timeout=30).read())
            except Exception as e: print('fail', b['id'], e); miss.append(b['id']); continue
    try:
        im = Image.open(src).convert('RGB'); im.thumbnail((180, 260), Image.LANCZOS)
        dst = f"public/covers/{b['id']}.webp"; im.save(dst, 'WEBP', quality=74, method=6)
        out[b['id']] = {'file': f"covers/{b['id']}.webp", 'w': im.width, 'h': im.height, 'provider': c.get('provider'), 'sourceUrl': c.get('sourceUrl'), 'licenseClass': c.get('licenseClass'), 'license': c.get('license'), 'artist': c.get('artist'), 'note': c.get('note')}
    except Exception as e: print('bad', b['id'], e); miss.append(b['id'])
json.dump({'covers': out, 'missing': miss}, open('scripts/raw/covers.index.json', 'w'), ensure_ascii=False)
tot = sum(os.path.getsize(f"public/{v['file']}") for v in out.values())
print('covers', len(out), 'missing', len(miss), 'total KB', tot // 1024, 'avg KB', tot // max(1, len(out)) // 1024)
