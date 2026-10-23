/** Mirrors build_module; repairs keep using the original catalogue prices. */
export function shipUpgradeCost(baseCost: number, targetLevel: number, forgeBonus = 0) {
  return Math.ceil(10 * baseCost * 1.25 ** (targetLevel - 1) * (1 - forgeBonus));
}