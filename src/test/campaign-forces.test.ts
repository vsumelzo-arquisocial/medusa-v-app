import { describe, expect, it } from 'vitest';
import { campaignForce, regionForce } from '@/lib/campaign-forces';
import { WH40K_FACTIONS } from '@/lib/warhammer40k-factions';

describe('Campaign forces', () => {
  it('assigns every imperial faction to Order, including Marines, Guard and Adeptus', () => {
    for (const id of ['space-marines', 'astra-militarum', 'adeptus-mechanicus', 'adeptus-custodes']) expect(campaignForce(id)).toBe('order');
    for (const f of WH40K_FACTIONS.filter(f => f.group === 'imperium')) expect(campaignForce(f.id)).toBe('order');
  });
  it('assigns Chaos Marines and daemons to Chaos', () => {
    expect(campaignForce('chaos-space-marines')).toBe('chaos');
    expect(campaignForce('chaos-daemons')).toBe('chaos');
    for (const f of WH40K_FACTIONS.filter(f => f.group === 'chaos')) expect(campaignForce(f.id)).toBe('chaos');
  });
  it('assigns all Xenos including Tau and Eldar to Incursors', () => {
    expect(campaignForce('tau-empire')).toBe('incursors');
    expect(campaignForce('aeldari')).toBe('incursors');
    for (const f of WH40K_FACTIONS.filter(f => f.group === 'xenos')) expect(campaignForce(f.id)).toBe('incursors');
  });
  it('keeps unowned regions neutral until conquered by a player', () => {
    const players = [{ id: 'tau-player', army_faction: 'tau-empire' }];
    expect(regionForce(null, players)).toBe('neutral');
    expect(regionForce('tau-player', players)).toBe('incursors');
    expect(campaignForce(null)).toBeNull();
  });
});