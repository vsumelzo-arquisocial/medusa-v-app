import { Link } from "@tanstack/react-router";
import type { Requirement } from "@/lib/wh40k-lists";

/** Graphical check of a list's units against recruited stock: one pip per copy needed. */
export function Requirements({ reqs }: { reqs: Requirement[] }) {
  const missing = reqs.filter((r) => r.have < r.need);
  return (
    <div>
      {missing.length ? (
        <div className="mb-3 border border-destructive p-3 text-sm">
          <p className="text-destructive">✖ La lista aún no es jugable.</p>
          <p className="text-xs text-muted-foreground">Te faltan {missing.reduce((a, r) => a + r.need - r.have, 0)} unidades por reclutar. <Link to="/reclutar" className="text-primary">Ir a reclutamiento →</Link></p>
        </div>
      ) : (
        <p className="mb-3 border border-primary p-3 text-sm text-primary">✔ Lista jugable: tienes reclutadas todas sus unidades.</p>
      )}
      <ul className="space-y-1">
        {reqs.map((r) => (
          <li key={r.name + r.models} className={`flex items-center gap-3 border p-2 text-xs ${r.have >= r.need ? "border-border" : "border-destructive/60"}`}>
            <span className="flex-1"><span className="text-primary">{r.name}</span> <span className="text-muted-foreground">({r.models} {r.models === 1 ? "miniatura" : "miniaturas"})</span></span>
            <span className="flex gap-1" aria-label={`${Math.min(r.have, r.need)} de ${r.need} reclutadas`}>
              {Array.from({ length: r.need }, (_, i) => (
                <span key={i} className={`h-3 w-3 border ${i < r.have ? "border-primary bg-primary" : "border-destructive"}`} />
              ))}
            </span>
            <span className={r.have >= r.need ? "text-primary" : "text-destructive"}>{Math.min(r.have, r.need)}/{r.need}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
