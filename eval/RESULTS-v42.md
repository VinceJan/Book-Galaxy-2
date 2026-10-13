# v4.2 (after blind v4.1 REPORT-dev)

Blind remains the judge (Top-1 0.344 / Top-3 0.688 on tip 50129a1). Self-authored sets below are diagnostics only.

## New hard-heldout (26 notes, authored once, not tuned on)
| | before v4.2 | after |
|---|---|---|
| behaviour | 0.85 | **1.00** |
| top-1 | 0.70 | **0.80** |
| top-3 | 0.80 | **0.90** |
| EN top-1 | 0.67 | **1.00** |
| safety (6) | 0.33 | **1.00** |
| 唤醒 (on-topic) | 9 (7) | **1 (1)** |

## Safety heldout (expanded EN existential; 63 notes)
| | v4.1 base | v4.2 |
|---|---|---|
| total | 0.873 | **0.984** (1 zh residual miss) |

## Changes
1. EN crisis: first-person existential despair; academic/seminar framing exempt.
2. 唤醒: high + vector top-6 + zhViews<800 & pct≥0.8 only.
3. EN retrieval: glossary extras, stronger title/alias boost, 45% original-EN embed blend; rank λ 0.18.
4. Constraints: 勿传记/勿推理/勿绘本, musician topic, race+court, dual 关于A与B.
5. Book-side situations/lexicon for siblings, graphic novels, feminism, grief, satire, death philosophy, musicians, dogs.
