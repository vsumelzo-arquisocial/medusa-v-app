/**
 * Sonido del motor de salto, a través de la biblioteca de sonido (src/lib/sfx).
 * Cuando lleguen las grabaciones reales basta con añadirlas a los huecos
 * "reactor_encendido", "reactor", "alarma" y "salto_disforme".
 */
import { play, startLoop, stopLoop } from "@/lib/sfx/engine";

export function playReactorIgnition(): void {
  play("reactor_encendido");
  play("alarma", { delay: 0.2 });
  startLoop("reactor", 2);
}

export function playWarpJump(): void {
  stopLoop("reactor", 0.6);
  play("salto_disforme");
}

export function stopJumpAudio(): void {
  stopLoop("reactor", 0.4);
}
