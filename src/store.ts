import type { Letter } from './types';
const KEY = 'bg2.letters.v1';
export const loadLetters = (s: Storage = localStorage): Letter[] => { try { return JSON.parse(s.getItem(KEY) || '[]'); } catch { return []; } };
export const saveLetter = (l: Letter, s: Storage = localStorage) => { const all = loadLetters(s); all.push(l); s.setItem(KEY, JSON.stringify(all)); return all; };
