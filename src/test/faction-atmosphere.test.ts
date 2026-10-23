import { describe,expect,it } from 'vitest';
import { factionAtmosphere } from '@/lib/faction-atmosphere';
describe('identidad ambiental de facción',()=>{
 it('T’au usa su emblema y el Bien Supremo',()=>{const t=factionAtmosphere('tau','tau-empire');expect(t.fleet).toBe('tau');expect(t.emblem).toContain('tau.png');expect(t.motto).toBe('Por el Bien Supremo');});
 it('Caos usa iconografía herética aunque tenga raza humana',()=>{const t=factionAtmosphere('humanity','chaos-space-marines');expect(t.fleet).toBe('chaos');expect(t.emblem).toContain('chaos_star.png');});
 it('el Imperium conserva el emblema propio de su capítulo',()=>{const t=factionAtmosphere('humanity','space-marines','blood-angels');expect(t.fleet).toBe('imperium');expect(t.emblem).toContain('blood_angels.png');});
});