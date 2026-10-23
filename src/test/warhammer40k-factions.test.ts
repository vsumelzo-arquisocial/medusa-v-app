import { describe, it, expect } from 'vitest';
import { WH40K_CATALOGUE, WH40K_FACTIONS, get40kFaction, searchFactions } from '@/lib/warhammer40k-factions';
describe('Official 40k catalogue', () => {
 it('uses the requested eleventh edition', () => expect(WH40K_CATALOGUE.edition).toBe(11));
 it('covers all official manual entries including titan support', () => {
  expect(WH40K_FACTIONS).toHaveLength(30);
  expect(new Set(WH40K_FACTIONS.map(f => f.id)).size).toBe(30);
  expect(get40kFaction('titan-legions')?.role).toBe('support');
  expect(get40kFaction('chaos-titan-legions')?.role).toBe('support');
 });
 it('nests rules-backed chapters beneath Marines', () => {
  expect(get40kFaction('space-marines')?.variants.map(v => v.id)).toEqual(expect.arrayContaining(['ultramarines','white-scars','blood-angels','dark-angels','black-templars','deathwatch','space-wolves']));
  expect(get40kFaction('blood-angels')?.parentId).toBe('space-marines');
 });
 it('distinguishes Eldar forces from detachments', () => {
  expect(get40kFaction('aeldari')?.variants.map(v => v.id)).toEqual(['harlequins','ynnari']);
  expect(get40kFaction('aeldari')?.detachments.some(d => d.name === 'DEVOTED OF YNNEAD')).toBe(true);
 });
 it('includes current Ork and Tau options, without inventing sept rules', () => {
  expect(get40kFaction('orks')?.detachments).toHaveLength(15);
  expect(get40kFaction('tau-empire')?.variants).toEqual([]);
  expect(get40kFaction('tau-empire')?.detachments.some(d => d.name === 'KROOT HUNTING PACK')).toBe(true);
 });
 it('searches variants and filters by group', () => {
  expect(searchFactions('angeles','imperium').map(f => f.id)).toContain('space-marines');
  expect(searchFactions('kroot','xenos').map(f => f.id)).toEqual(['tau-empire']);
  expect(searchFactions('kroot','chaos')).toEqual([]);
 });
});
