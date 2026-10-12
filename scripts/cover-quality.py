"""Reject covers that carry no legible information (near-black blank bindings): mean luminance < 20 and almost no
detail (edge energy). Rejected books fall back to the title placeholder. Writes scripts/raw/covers.reject.json."""
import glob, json, os
from PIL import Image, ImageStat, ImageFilter
rej = {}
for f in sorted(glob.glob('public/covers/*.webp')):
    im = Image.open(f).convert('L'); mean = ImageStat.Stat(im).mean[0]
    edges = ImageStat.Stat(im.filter(ImageFilter.FIND_EDGES)).mean[0]
    if mean < 20 and edges < 2.5: rej[os.path.basename(f)[:-5]] = {'mean': round(mean, 1), 'edges': round(edges, 2)}
json.dump(rej, open('scripts/raw/covers.reject.json', 'w'), indent=1)
for q in rej: os.remove(f'public/covers/{q}.webp')
print(len(rej), 'rejected', rej)
