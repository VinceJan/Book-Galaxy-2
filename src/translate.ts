/** Offline English → Chinese query rewrite: phrase/word lookup in a CC-CEDICT-derived glossary limited to words that
 *  occur in this catalog (public/data/en-zh.json, ~190 KB / ~70 KB gzip). No network, no model. */
export type Glossary = Record<string, string[]>;
const STOP = new Set('a an the and or of to in on at for with by from about into over under as is are was were be been being i me my we our you your it its this that these those some something anything any one ones book books read reading recommend recommendation suggest please want would like looking look find give me need good great nice best should have has had by now just really very kind sort type story stories novel novels thing things lot more most much many can could do does did make makes made get got where when how what which who why there here than then so but if not no yes up down out'.split(' '));
const lemmas = (w: string) => [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ly$/, '')];
export function toChinese(note: string, g: Glossary): { zh: string; terms: string[]; unknown: string[] } {
  const words = note.toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/).filter(Boolean);
  const terms: string[] = [], unknown: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const two = words[i + 1] ? `${words[i]} ${words[i + 1]}` : '';
    if (two && g[two]) { terms.push(...g[two]); i++; continue; }
    const w = words[i]; if (STOP.has(w) || w.length < 2) continue;
    const hit = lemmas(w).find(x => g[x]); if (hit) terms.push(...g[hit].slice(0, 2)); else unknown.push(w);
  }
  const uniq = [...new Set(terms)];
  return { zh: uniq.length ? `关于${uniq.join('、')}的书` : '', terms: uniq, unknown };
}
