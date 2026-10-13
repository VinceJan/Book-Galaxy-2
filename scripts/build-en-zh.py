"""Offline English→Chinese glossary for query translation, built from CC-CEDICT (CC BY-SA 4.0) reversed,
keeping only Chinese words that occur in this catalog. Output: public/data/en-zh.json {word: [zh, ...]}."""
import json, re, collections
books = json.load(open('public/data/books.json'))['books']
corpus = '\n'.join(b['title'] + '|' + '|'.join(b['themes']) + '|' + '|'.join(b.get('facets', {}).get('genres', [])) + '|' + b['summary'] for b in books)
cand = collections.defaultdict(list)  # en key -> [(rank, simp)]
for line in open('scripts/raw/cedict_ts.u8', encoding='utf8'):
    if line.startswith('#'): continue
    m = re.match(r'(\S+) (\S+) \[(.*?)\] /(.*)/', line)
    if not m: continue
    simp, glosses = m.group(2), m.group(4).split('/')
    if re.search(r'[A-Za-z0-9]', simp): continue
    for gi, g in enumerate(glosses[:4]):
        if g.startswith(('variant of', 'old variant', 'surname', 'see ', 'used in', 'abbr.', 'CL:', 'Taiwan pr.', 'also written')): continue
        if g[:1].isupper(): continue  # proper names / transliterations
        if len(simp) < 2 and gi > 0: continue
        g = re.sub(r'\(.*?\)|\[.*?\]', '', g).strip().lower()
        g = re.sub(r'^(to|a|an|the) ', '', g).strip()
        if not g or len(g.split()) > 2 or not re.fullmatch(r"[a-z][a-z' -]*", g): continue
        cand[g].append((gi, simp))
freq = {}
def f(w):
    if w not in freq: freq[w] = corpus.count(w)
    return freq[w]
out = {}
for en, cs in cand.items():
    scored = []
    for gi, zh in set(cs):
        n = f(zh)
        if n >= (20 if len(zh) < 2 else 2): scored.append((-(n ** 0.5) / (1 + gi), zh))
    if scored: out[en] = [z for _, z in sorted(scored)[:2]]
# Genre / catalog vocabulary CEDICT lacks or ranks oddly (generic taxonomy, matches the catalog's own facet names).
extra = {'graphic novel': ['图像小说', '漫画'], 'graphic novels': ['图像小说', '漫画'], 'comic': ['漫画'], 'sci-fi': ['科幻'], 'science fiction': ['科幻', '科学幻想'], 'spy': ['间谍', '谍报'], 'detective': ['侦探', '推理'], 'mystery': ['推理', '悬疑'], 'thriller': ['惊悚', '悬疑'], 'satire': ['讽刺'], 'satirical': ['讽刺'], 'feminist': ['女性主义', '女性'], 'feminism': ['女性主义', '女性'], 'grief': ['哀悼', '悲伤', '丧亲'], 'memoir': ['回忆录'], 'dystopia': ['反乌托邦'], 'dystopian': ['反乌托邦'], 'fantasy': ['奇幻'], 'horror': ['恐怖'], 'ghost': ['鬼', '幽灵'], 'romance': ['爱情', '恋爱'], 'poetry': ['诗歌', '诗'], 'poem': ['诗'], 'novel': ['小说'], 'essay': ['随笔'], 'essays': ['随笔'], 'biography': ['传记'], 'autobiography': ['自传'], 'gothic': ['哥德'], 'sibling': ['兄弟姐妹', '手足'], 'siblings': ['兄弟姐妹', '手足'], 'artificial intelligence': ['人工智能'], 'ai': ['人工智能'], 'robot': ['机器人'], 'slavery': ['奴隶'], 'holocaust': ['大屠杀', '纳粹'], 'genocide': ['种族灭绝', '屠杀'], 'atomic bomb': ['原子弹', '核武器'], 'loss': ['失去', '死亡'], 'lost': ['失去'], 'mother': ['母亲'], 'father': ['父亲'], 'growing up': ['成长'], 'small town': ['小镇'], 'philosophy': ['哲学'], 'philosophical': ['哲学'], 'meaning': ['意义'], 'painter': ['画家'], 'painting': ['绘画', '画'], 'art': ['艺术'], 'bureaucracy': ['官僚'], 'funny': ['幽默'], 'sad': ['悲伤'], 'love': ['爱情'], 'war': ['战争'], 'murder': ['谋杀'], 'crime': ['犯罪'], 'ocean': ['海洋', '大海'], 'sailor': ['水手'], 'sailors': ['水手'], 'women': ['女性'], 'woman': ['女性'], "women's": ['女性'], 'rights': ['权利'], 'space': ['太空', '宇宙'], 'battle': ['战斗', '战争'], 'puzzle': ['谜', '推理'], 'politics': ['政治'], 'family': ['家庭', '家族'], 'suicide': ['自杀'], 'evil': ['恶'], 'psychology': ['心理学'], 'depression': ['抑郁症'], 'addiction': ['成瘾', '毒品'], 'racism': ['种族歧视'], 'freedom': ['自由'], 'children': ['儿童'], 'kids': ['儿童'], 'teen': ['青少年'], 'brothers': ['兄弟'], 'sisters': ['姐妹'], 'japanese': ['日本'], 'russian': ['俄罗斯'], 'french': ['法国'], 'british': ['英国'], 'american': ['美国'], 'chinese': ['中国'], 'german': ['德国']}

extra.update({'feminism': ['女性主义', '女权'], 'feminist': ['女性主义', '女性'], 'grief': ['哀悼', '悲伤', '丧亲'], 'bereavement': ['丧亲', '哀悼'], 'mourning': ['哀悼', '丧'],
 'bureaucracy': ['官僚', '官僚主义'], 'paperwork': ['公文', '文书'], 'satire': ['讽刺'], 'satirical': ['讽刺'],
 'liberation': ['解放'], "women's liberation": ['女性解放', '女权'], 'civil rights': ['民权', '民权运动'],
 'narrative nonfiction': ['纪实', '非虚构'], 'nonfiction': ['非虚构', '纪实'], 'scientific': ['科学'], 'discovery': ['发现'],
 'office': ['办公室', '职场'], 'sentimental': ['感伤'], 'despair': ['绝望'], 'existential': ['存在主义', '存在'],
 'sibling': ['兄弟姐妹', '手足'], 'siblings': ['兄弟姐妹', '手足'], 'sister': ['姐妹', '姐姐'], 'brother': ['兄弟'],
 'graphic novel': ['图像小说', '漫画'], 'musician': ['音乐家', '作曲家'], 'composer': ['作曲家'], 'pianist': ['钢琴家'],
 'courtroom': ['法庭', '审判'], 'trial': ['审判', '法庭'], 'justice': ['正义'], 'racial': ['种族'], 'ethnicity': ['族裔', '种族'],
 'adventure': ['冒险'], 'dog': ['狗'], 'puppy': ['小狗']})

out.update(extra)
json.dump(out, open('public/data/en-zh.json', 'w'), ensure_ascii=False, separators=(',', ':'))
import os; print(len(out), 'keys', os.path.getsize('public/data/en-zh.json') // 1024, 'KB')
