import { describe, expect, it } from "vitest";
import patrolsJson from "@/data/warhammer40k/combat-patrols.json";
import { isPlayable, pendingRecruits, requirements } from "@/lib/wh40k-lists";
import { importPatrol, type Patrol } from "@/lib/wh40k-patrols";

const u = (name: string, models: number) => ({ id: name + models + Math.random(), name, models });

describe("listas importadas y reclutamiento", () => {
  it('descuenta encargos uno a uno: faltan 3, 2, 1 y desaparece la última', () => {
    const reqs = requirements({units: Array.from({length:3}, () => u('BREACHER TEAM',10))}, []);
    const queue = Array.from({length:3}, () => ({unit_name:'BREACHER TEAM',models:10,status:'training'}));
    for (const count of [0,1,2]) {
      const pending = pendingRecruits([reqs], queue.slice(0,count));
      expect(pending.map(r => r.need-r.have)).toEqual([3-count]);
    }
    expect(pendingRecruits([reqs],queue)).toEqual([]);
  });
  it('al cancelar un encargo vuelve a faltar una copia', () => {
    const reqs = requirements({units:[u('BREACHER TEAM',10)]}, []);
    expect(pendingRecruits([reqs],[{unit_name:'BREACHER TEAM',models:10,status:'training'}])).toEqual([]);
    expect(pendingRecruits([reqs],[]).map(r => r.need-r.have)).toEqual([1]);
  });
  it('preparación no hace jugable la lista ni cuenta fichas listas o caídas dos veces', () => {
    const reqs = requirements({units:[u('BREACHER TEAM',10),u('BREACHER TEAM',10)]},[{unit_name:'BREACHER TEAM',models:10,quantity:1}]);
    const squad = {unit_name:'breacher team',models:10};
    expect(pendingRecruits([reqs],[{...squad,status:'ready'},{...squad,status:'fallen'}])[0]?.have).toBe(1);
    expect(pendingRecruits([reqs],[{...squad,status:'training'}])).toEqual([]);
    expect(isPlayable(reqs)).toBe(false);
    expect(pendingRecruits([reqs],[{...squad,models:5,status:'training'}])[0]?.have).toBe(1);
  });
  it('los encargos se comparten entre listas sin sumarlos varias veces', () => {
    const a = requirements({units:[u('BREACHER TEAM',10),u('BREACHER TEAM',10)]},[]);
    const b = requirements({units:[u('BREACHER TEAM',10),u('BREACHER TEAM',10),u('BREACHER TEAM',10)]},[]);
    expect(pendingRecruits([a,b],[{unit_name:'BREACHER TEAM',models:10,status:'training'}])).toEqual([{name:'BREACHER TEAM',models:10,need:3,have:1}]);
  });
  it("una lista solo es jugable si el stock cubre todas sus unidades", () => {
    const roster = { units: [u("BREACHER TEAM", 10), u("BREACHER TEAM", 10)] };
    expect(isPlayable(requirements(roster, [{ unit_name: "BREACHER TEAM", models: 10, quantity: 1 }]))).toBe(false);
    expect(isPlayable(requirements(roster, [{ unit_name: "BREACHER TEAM", models: 10, quantity: 2 }]))).toBe(true);
  });
  it("lo pendiente es el mayor déficit de una sola lista, no la suma", () => {
    const stock = [{ unit_name: "BREACHER TEAM", models: 10, quantity: 1 }];
    const a = requirements({ units: [u("BREACHER TEAM", 10), u("BREACHER TEAM", 10)] }, stock);
    const b = requirements({ units: [u("BREACHER TEAM", 10), u("BREACHER TEAM", 10), u("BREACHER TEAM", 10)] }, stock);
    expect(pendingRecruits([a, b])).toEqual([{ name: "BREACHER TEAM", models: 10, need: 3, have: 1 }]);
  });
  it("reconoce una patrulla por su nombre en el texto exportado", () => {
    const patrols = (patrolsJson as unknown as { patrols: Patrol[] }).patrols;
    const p = patrols.find((x) => x.faction === "tau-empire")!;
    const r = importPatrol(`Mis cazadores\n\nCombat Patrol\n${p.name}\n`, patrols, []);
    expect(r?.patrol.id).toBe(p.id);
    expect(r?.roster.units.length).toBe(p.units.length);
  });
});
