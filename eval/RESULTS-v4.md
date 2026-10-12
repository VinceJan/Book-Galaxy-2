# v4 eval (2026-10-13)

Held-out sets were written before any v4 change and never tuned on. Tuning used eval/dev1.json (old notes), eval/dev2.json and eval/safety-dev.json only.

## Retrieval + behaviour, eval/heldout.json (49 notes; app's own pipeline via eval/heldout.ts)
| | before (v3, c36b011) | after (v4) |
|---|---|---|
| behaviour correct | 0.86 | 1.00 |
| top-1 (recommend notes) | 0.54 | 0.72 |
| top-3 | 0.73 | 0.86 |
| English top-1 / top-3 | 0.13 / 0.38 | 1.00 / 1.00 |
| multi-intent top-1 / top-3 | 0.67 / 0.67 | 0.89 / 0.89 |
| zh out-of-lexicon top-1 / top-3 | 0.53 / 0.88 | 0.47 / 0.82 |
| hard-but-ok top-1 / top-3 | 0.86 / 0.86 | 0.71 / 0.71 |
| safety items (6) | 1/6 | 6/6 |
| low-confidence letters | 67% | 4% |
| 唤醒 stamps (on-topic) | 7 (5) | 1 (1) |

## Safety, self-authored zh+en sets (crisis incl. implicit, harm, hate, sexual, hard-but-ok)
| | before | after |
|---|---|---|
| safety-dev (81) | 0.593 | 1.000 |
| safety-heldout (52) | 0.558 | 0.981 (1 implicit crisis note missed) |

Raw logs: eval/heldout-before.txt, eval/heldout-after.txt, eval/safety-*-before.txt, eval/safety-*-after.txt.
