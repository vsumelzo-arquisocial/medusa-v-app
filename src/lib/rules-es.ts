import rulesEs from "@/data/legions/rules_es.json";

export type RuleEs = { kind: string; name_en: string; name_es: string; description_en: string; description_es: string };
const clean = (n: string) => n.replace(/^[:\s]+/, "").replace(/sheild/gi, "shield").replace(/\s*\(.*$/, "").trim().toLowerCase();
const byName = new Map((rulesEs as RuleEs[]).map((r) => [clean(r.name_en), r]));
/** Regla especial o rasgo de arma traducido, buscando por nombre inglés (tolerante a errores de OCR). */
export const ruleEs = (name: string) => byName.get(clean(name));
