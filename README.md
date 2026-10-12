# 书架星系 2.0 · 夜班馆员

给图书馆写一张纸条。夜班馆员会在一千本真实的书里，替你找回一本很少被人翻开的，然后给你回一封信。每收到一封回信，「回信档案」里就会长出一缕菌丝。

Live: https://vincejan.github.io/Book-Galaxy-2/

## 哪些是真的
- **书目**：1000 本书，来自 v1（[Book-Galaxy](https://github.com/VinceJan/Book-Galaxy)）的 `catalog.runtime.json`，内容源自中文维基百科和 Wikidata（CC BY-SA 4.0）。封面来自 Open Library。
- **冷门度**：`scripts/fetch-obscurity.mjs` 抓取 Wikimedia REST pageviews（zh+en，user agent，2025-10 至 2026-09 的月度数据）以及 Wikidata sitelinks 数量。原始数据保存在 `scripts/raw/obscurity.raw.json`，文件内带 `fetchedAt`。计算公式：`0.7·(1−pct(log1p(views))) + 0.3·(1−pct(sitelinks))`。回信只引用真实的浏览次数和百分位，不再编造“沉睡 N 年”。
- **检索**：`scripts/embed.mjs` 用 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` 为每本书的简介离线生成向量：短文本视图和长文本视图各一份，取平均后做均值中心化，再量化为 int8，打包成 `public/data/vectors.i8.bin`（384 KB）。浏览器用 transformers.js 加载同一个模型给纸条生成向量，再做余弦检索：先取相关度 top-24，再按冷门度重排。模型载入前，以及载入失败时，退回到字符二元组 IDF 字面检索。
- **回信**：`src/letter.ts` 是离线模板层，每个句子都由书目字段填充。摘录取简介中的完整句子，不在句中截断。设置 `VITE_LLM_ENDPOINT` 后可以接入可选的改写端点（POST facts + draft，返回 `{paragraphs}`），8 秒超时后回退到模板。
- **档案**：回信保存在 localStorage。节点数 = 回信数 + 1。每封信接在向量最相近的前一封信上，相似度不够时接到“你”。只有焦点节点和它的一度邻居显示书名。支持拖拽、滚轮缩放和双指缩放。

## 开发
```
npm i && npm run dev        # 本地开发
npm test && npm run build   # CI 同款检查
npm run data:obscurity && npm run data:embed && npm run data:build   # 重建数据（需要 v1 仓库在 /workspace/Book-Galaxy，或设置 V1=）
```
