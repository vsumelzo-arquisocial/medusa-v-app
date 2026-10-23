import { describe, expect, it } from 'vitest';
import { shipUpgradeCost } from '@/lib/ship-upgrade-cost';

describe('ship upgrades only', () => {
  it('keeps the first level at ten times the original base price', () => {
    expect(shipUpgradeCost(300, 1)).toBe(3000);
  });
  it('each further level costs 25 percent more, compounded', () => {
    expect(shipUpgradeCost(300, 2)).toBe(3750);
    expect(shipUpgradeCost(300, 3)).toBe(4688);
    expect(shipUpgradeCost(300, 4)).toBe(5860);
  });
  it('applies forge discounts before rounding to whole credits', () => {
    expect(shipUpgradeCost(150, 2, .15)).toBe(1594);
    expect(shipUpgradeCost(101, 1, .15)).toBe(859);
  });
});