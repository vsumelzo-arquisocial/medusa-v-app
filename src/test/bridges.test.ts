import { describe, expect, it } from 'vitest';
import { bridgeImageFor } from '@/lib/bridges';
import tau from '@/assets/bridges/tau.jpg';
import chaos from '@/assets/bridges/chaos.jpg';
import imperium from '@/assets/bridges/imperium.jpg';
import drukhari from '@/assets/bridges/drukhari.jpg';

describe('army bridge artwork', () => {
  it('uses the Tau bridge for the Tau Empire, not Chaos', () => {
    expect(bridgeImageFor('tau', 'tau-empire')).toBe(tau);
    expect(bridgeImageFor('tau', 'tau-empire')).not.toBe(chaos);
  });
  it('distinguishes Imperial and Chaos human factions', () => {
    expect(bridgeImageFor('humanity', 'space-marines')).toBe(imperium);
    expect(bridgeImageFor('humanity', 'death-guard')).toBe(chaos);
  });
  it('gives Drukhari their own bridge', () => {
    expect(bridgeImageFor('aeldari', 'drukhari')).toBe(drukhari);
    expect(bridgeImageFor('aeldari', 'aeldari')).not.toBe(drukhari);
  });
});