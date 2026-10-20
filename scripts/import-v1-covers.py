"""Import covers that v1 (Book-Galaxy) added after the data package snapshot (data/covers-extra.json:
verified Open Library / Wikimedia Commons images). Resized to the same 180x260 WebP as scripts/covers.py,
appended to scripts/raw/covers.index.json, and passed through the same legibility check as cover-quality.py
(rejects are merged into covers.reject.json, never overwriting earlier rejects). Existing covers are untouched."""
import json, os
from PIL import Image, ImageStat, ImageFilter
V1 = os.environ.get('V1', '/workspace/Book-Galaxy')
idx_path, rej_path = 'scripts/raw/covers.index.json', 'scripts/raw/covers.reject.json'
idx = json.load(open(idx_path)); rej = json.load(open(rej_path)) if os.path.exists(rej_path) else {}
extra = json.load(open(f'{V1}/data/covers-extra.json'))
runtime = {b['id']: b for b in json.load(open(f'{V1}/public/data/catalog.runtime.json'))['books']}
added, rejected = [], []
for qid, b in runtime.items():
    if not b.get('coverUrl') or qid in idx['covers'] or qid in rej: continue
    meta = extra.get(qid)
    src = f"{V1}/public/{b['coverUrl']}"
    if not meta or not os.path.exists(src): continue
    im = Image.open(src).convert('RGB'); im.thumbnail((180, 260), Image.LANCZOS)
    g = im.convert('L'); mean = ImageStat.Stat(g).mean[0]; edges = ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).mean[0]
    if mean < 20 and edges < 2.5: rej[qid] = {'mean': round(mean, 1), 'edges': round(edges, 2)}; rejected.append(qid); continue
    dst = f'public/covers/{qid}.webp'; im.save(dst, 'WEBP', quality=74, method=6)
    ol = meta.get('provider') == 'open-library'
    idx['covers'][qid] = {'file': f'covers/{qid}.webp', 'w': im.width, 'h': im.height,
        'provider': 'open-library' if ol else 'wikimedia-commons', 'sourceUrl': meta['sourceUrl'],
        'licenseClass': 'publisher-copyright' if ol else 'free', 'license': None if ol else meta.get('license'),
        'artist': meta.get('artist'), 'note': meta.get('license') if ol else 'Wikimedia Commons; licence per file page.'}
    if qid in idx.get('missing', []): idx['missing'].remove(qid)
    added.append(qid)
json.dump(idx, open(idx_path, 'w'), ensure_ascii=False); json.dump(rej, open(rej_path, 'w'), indent=1)
print('added', len(added), 'rejected', rejected, 'total', len(idx['covers']))
