import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FleetId } from "@/lib/ship-identity";
import {
  ACTION_INFO,
  FLEET_PROFILES,
  PHASES_PER_BLOCK,
  SECOND,
  SPEED_INFO,
} from "@/lib/naval3/factions";

const SECTIONS = [
  "Lo básico",
  "El radar",
  "Órdenes",
  "Arcos y distancias",
  "Daño y defensa",
  "Perder y huir",
  "Tu flota",
] as const;
type Section = (typeof SECTIONS)[number];

/** Guía del combate naval, por apartados. */
export function DuelHelp({ fleet }: { fleet: FleetId }) {
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState<Section>("Lo básico");
  const p = FLEET_PROFILES[fleet];
  const v = SECOND[fleet];
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CircleHelp /> Ayuda
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">Manual de combate naval</DialogTitle>
            <DialogDescription>Todo lo que tu {v.title} querría que supieras.</DialogDescription>
          </DialogHeader>
          <nav className="flex flex-wrap gap-1" aria-label="Apartados de la ayuda">
            {SECTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                aria-pressed={sec === s}
                className={sec === s ? "border-primary bg-accent text-primary" : ""}
                onClick={() => setSec(s)}
              >
                {s}
              </Button>
            ))}
          </nav>
          <div className="space-y-2 text-sm leading-relaxed [&_b]:text-primary">
            {sec === "Lo básico" && (
              <>
                <p>
                  Un duelo enfrenta a dos naves capitales. Se juega en{" "}
                  <b>bloques de {PHASES_PER_BLOCK} fases</b>: cada uno da sus órdenes a ciegas y,
                  cuando los dos confirmáis, se resuelve el bloque entero y podéis verlo en el
                  radar.
                </p>
                <p>
                  Si los dos estáis conectados no hay espera. Si no, cada bloque tiene un plazo de
                  24 h: quien no dé órdenes pierde el duelo (si no las da nadie, pierde el
                  atacante).
                </p>
                <p>
                  El <b>{v.title}</b> te propone un plan completo según la postura que elijas (Al
                  abordaje, Nuestra distancia o Resistir). Puedes aceptarlo o tocar cualquier fase.
                  Sus avisos en cada fase te dicen si algo va a salir mal.
                </p>
                <p>
                  Tras cada bloque se reproduce lo ocurrido: las naves se mueven, los disparos
                  viajan por el radar y el registro se va escribiendo con sus comentarios y un
                  informe final con recomendaciones.
                </p>
              </>
            )}
            {sec === "El radar" && (
              <>
                <p>
                  Tu nave está siempre en el centro, con la proa hacia arriba. Los anillos son las
                  distancias: <b>Contacto</b>, <b>Cerca</b>, <b>Media</b> y <b>Lejos</b>.
                </p>
                <p>
                  Las <b>cuñas azules</b> son tus arcos de fuego (proa, costados, popa); el número
                  es el daño que harías con ese arco a la distancia actual. Los <b>conos rojos</b>{" "}
                  alrededor del enemigo son sus arcos: si estás dentro de su cono más grande, te va
                  a doler.
                </p>
                <p>
                  La <b>silueta discontinua</b> muestra dónde estará el enemigo en la fase que estás
                  editando, suponiendo que mantiene el rumbo.
                </p>
                <p>
                  En la repetición verás las andanadas salir de la nave y llegar al blanco (o pasar
                  de largo si fallan), los torpedos con su estela (los esquivados se desvían), los
                  destellos azules de los escudos y los números de daño.
                </p>
              </>
            )}
            {sec === "Órdenes" && (
              <>
                <p>
                  <b>Máquinas</b>:
                </p>
                <ul className="list-disc pl-5">
                  {SPEED_INFO.map((s) => (
                    <li key={s.name}>
                      <b>{s.name}</b>: {s.text}
                    </li>
                  ))}
                </ul>
                <p>
                  <b>Timón</b>: <i>Encarar</i> pone la proa hacia el enemigo, <i>Costado</i> le
                  presenta la andanada, <i>Alejarse</i> le da la espalda y <i>Recto</i> mantiene el
                  rumbo. Las intenciones se ajustan solas a dónde esté el enemigo cuando llegue la
                  fase. También puedes girar a mano 45° o 90° a babor (B) o estribor (E).
                </p>
                <p>
                  <b>Acciones</b>:
                </p>
                <ul className="list-disc pl-5">
                  {Object.values(ACTION_INFO).map((a) => (
                    <li key={a.name}>
                      <b>{a.name}</b>: {a.text}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {sec === "Arcos y distancias" && (
              <>
                <p>
                  Cada flota tiene armas distintas en la <b>proa</b>, los <b>costados</b> y la{" "}
                  <b>popa</b>, y cada arma rinde distinto según la distancia. Entre dos arcos, el
                  disparo se reparte.
                </p>
                <p>
                  Atacar la <b>popa</b> del enemigo hace más daño (motores expuestos). Muchas flotas
                  tienen la <b>proa blindada</b>. Busca su popa y no le des la tuya.
                </p>
                <p>
                  Si tiráis en sentidos opuestos, la distancia la decide la velocidad.{" "}
                  <b>Avante toda</b> sirve para dar caza a quien huye o para escapar de un abordaje,
                  pero no permite girar y dispara a la mitad.
                </p>
              </>
            )}
            {sec === "Daño y defensa" && (
              <>
                <p>
                  <b>Escudos</b>: paran parte de cada andanada (hasta la mitad). Con{" "}
                  <b>Escudos al máximo</b> paran mucho más (hasta ¾), a cambio de disparar a la
                  mitad. Úsalo cuando estés dentro de su mejor arco.
                </p>
                <p>
                  <b>Evasión</b>: dificulta que te acierten los torpedos y las embestidas, y reduce
                  a la mitad su fuego, pero no disparas. Úsala cuando haya torpedos enemigos en
                  vuelo.
                </p>
                <p>
                  <b>Torpedos</b>: solo salen por la proa. Llegan en la fase siguiente (de cerca, al
                  instante) y cada uno puede esquivarse. Después hay que recargar.
                </p>
                <p>
                  <b>Embestida</b>: avante toda en línea recta contra un enemigo que tengas a proa.
                  Si llegas, el choque es brutal… también para ti.
                </p>
                <p>
                  <b>Reparar</b>: control de daños, recupera casco.
                </p>
              </>
            )}
            {sec === "Perder y huir" && (
              <>
                <p>
                  Hay dos formas de perder: que tu <b>nave estalle</b> (casco a 0) o{" "}
                  <b>saltar al disforme</b>.
                </p>
                <p className="text-red-300">
                  Si la nave estalla, tu perfil se reinicia por completo: nave, planetas, créditos…
                  todo.
                </p>
                <p>
                  El <b>salto disforme</b> es instantáneo: pierdes el duelo pero salvas la nave.
                  Puede fallar (y dañarte), y cuanto más dañado estés, más probable es que falle.
                  Fija un <b>salto de emergencia</b> en cada bloque: si el casco baja del umbral, tu
                  oficial saltará por ti.
                </p>
                <p>
                  Con el casco bajo el 35 % tu oficial te suplicará que saltes, con un botón para
                  hacerlo en la primera fase.
                </p>
              </>
            )}
            {sec === "Tu flota" && (
              <>
                <p>
                  <b>{p.trait}</b>: {p.traitText}
                </p>
                <ul className="list-disc pl-5">
                  <li>
                    Velocidad {p.speed} u/fase (avante toda {p.speed + p.burn}), giro{" "}
                    {p.agility * 45}° por fase.
                  </li>
                  <li>
                    Proa: {p.prowName} [{p.prow.join(" · ")}] (Contacto · Cerca · Media · Lejos).
                  </li>
                  <li>
                    Costados: {p.broadsideName} [{p.broadside.join(" · ")}].
                  </li>
                  {p.stern.some((x) => x > 0) && <li>Popa: [{p.stern.join(" · ")}].</li>}
                  <li>
                    Escudos {p.shields}, esquiva {p.dodge} %, {p.torpedoes} {p.torpedoName} por
                    salva, embestida {p.ram}.
                  </li>
                </ul>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
