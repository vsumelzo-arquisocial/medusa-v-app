import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FleetId } from "@/lib/ship-identity";
import { FLEET_PROFILES, SECOND } from "@/lib/naval3/factions";

const KEY = "naval3-tutorial-v1";

export function tutorialSeen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

interface Step {
  target: string | null;
  title: string;
  text: string;
  needsPlan?: boolean;
}

function steps(fleet: FleetId): Step[] {
  const v = SECOND[fleet];
  const p = FLEET_PROFILES[fleet];
  return [
    {
      target: null,
      title: `${v.lord}, bienvenido al puente`,
      text: `Soy vuestro ${v.title}. En un minuto os enseño a mandar esta nave. Los dos capitanes dais las órdenes a la vez, sin ver las del otro, y luego se resuelven juntas: de una en una (más fluido) o de tres en tres (más rápido), según elijáis al empezar.`,
    },
    {
      target: "mapa",
      title: "El mapa táctico",
      text: "Visto desde arriba, con el norte arriba. Vuestra nave es la azul y el enemigo la roja. Los conos de color son los arcos de fuego: donde caiga el enemigo dentro de vuestro cono, le disparáis con esas armas. Los anillos marcan las distancias: Contacto, Cerca y Media.",
    },
    {
      target: "mapa",
      title: "Pronóstico",
      text: "Las siluetas azules numeradas (1, 2, 3) son dónde acabará vuestra nave al final de cada ronda con las órdenes actuales. Las rojas discontinuas, lo que el enemigo hará con más probabilidad. La nube roja es todo lo que podría alcanzar si hace otra cosa. Las cifras sobre el mapa son el daño previsto.",
      needsPlan: true,
    },
    {
      target: "radar",
      title: "El radar del puente",
      text: "Visto desde vuestra nave, con la proa siempre arriba. El eco verde es el enemigo: se ilumina al pasar el barrido. Abajo os dice dónde está, cuánto daño le hacen nuestras baterías esa ronda y cuánto nos hace él.",
    },
    {
      target: "posturas",
      title: "Mi sugerencia",
      text: "Las órdenes empiezan vacías. Si queréis que decida yo, pulsad Al abordaje, Nuestra distancia o Resistir y relleno las órdenes por vos; luego podéis cambiar lo que queráis.",
      needsPlan: true,
    },
    {
      target: "maniobra",
      title: "Maniobra",
      text: "Cada ronda la nave se mueve. Las flechas dicen cómo: ↑ recto, ↖ ↗ virar 45°, ⤺ ⤻ giro cerrado de 90° (pierde velocidad), ⇈ avante toda (mucho más lejos, dispara a la mitad) y ■ parar. Al pulsar, mirad cómo cambia la silueta azul en el mapa.",
      needsPlan: true,
    },
    {
      target: "accion",
      title: "Acción",
      text: `Disparar usa las armas cuyo arco cubre al enemigo (vuestra flota pega fuerte con ${p.prowName} en la proa y ${p.broadsideName} en los costados). Torpedos solo salen por la proa. Escudos frena andanadas; Evasión, torpedos y embestidas. Embestir exige tenerlo delante. Saltar abre un portal: esa ronda y la siguiente quedáis quietos y sin defensas, y después saltáis.`,
      needsPlan: true,
    },
    {
      target: "pronostico",
      title: "Leed el pronóstico",
      text: "Cada ronda os dice dónde estará el enemigo respecto a vosotros y cuánto daño hacéis y recibís. Si los números rojos superan a los azules, cambiad la maniobra: buscad su popa o vuestro mejor arco.",
      needsPlan: true,
    },
    {
      target: "segundo",
      title: "Mis consejos",
      text: "Aquí os resumo la situación: dónde somos más fuertes, quién es más rápido y qué peligros hay. Si el casco cae mucho, os suplicaré que saltéis al disforme.",
    },
    {
      target: "salto",
      title: "Red de seguridad",
      text: "Si la nave llega a 0 de casco, estalla y vuestro perfil se reinicia por completo. Fijad un salto automático: si el casco baja de ese umbral, declararé el salto por vos (tarda dos rondas).",
      needsPlan: true,
    },
    {
      target: "confirmar",
      title: "Fijad las órdenes",
      text: "Cuando os guste el plan, confirmadlo. Al resolverse veréis la repetición: las naves se mueven por el mapa, los disparos vuelan y el registro cuenta lo que pasa. Para practicar sin riesgo, probad un simulacro contra la IA desde el mando naval.",
      needsPlan: true,
    },
  ];
}

/** Tutorial guiado: resalta cada parte del tablero y la explica con la voz del Segundo. */
export function Tutorial({
  fleet,
  canPlan,
  onClose,
}: {
  fleet: FleetId;
  canPlan: boolean;
  onClose: () => void;
}) {
  const all = steps(fleet).filter((s) => canPlan || !s.needsPlan);
  const [i, setI] = useState(0);
  const step = all[i]!;
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(
      "ring-2",
      "ring-amber-400",
      "ring-offset-2",
      "ring-offset-background",
      "relative",
      "z-40",
    );
    return () =>
      el.classList.remove(
        "ring-2",
        "ring-amber-400",
        "ring-offset-2",
        "ring-offset-background",
        "relative",
        "z-40",
      );
  }, [step.target]);
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* sin almacenamiento */
    }
    onClose();
  };
  return (
    <div
      role="dialog"
      aria-label="Tutorial del combate naval"
      className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-lg rounded border border-amber-400 bg-background/95 p-4 shadow-2xl backdrop-blur sm:bottom-4"
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300">
        Tutorial · {i + 1} de {all.length}
      </p>
      <h4 className="mt-1 text-base text-primary">{step.title}</h4>
      <p className="mt-1 text-sm leading-relaxed">{step.text}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={close}>
          Saltar tutorial
        </Button>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={i === 0} onClick={() => setI(i - 1)}>
            Anterior
          </Button>
          {i < all.length - 1 ? (
            <Button size="sm" onClick={() => setI(i + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button size="sm" onClick={close}>
              ¡Entendido!
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
