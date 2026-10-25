/** Resumen del efecto de cada módulo a un nivel dado (mirrors engine.ts y las funciones SQL). */
export function moduleEffect(id: string, level: number): string {
  const L = Math.max(0, level);
  switch (id) {
    case "puente":
      return `${2 + 2 * L} ranuras · +${3 * L} casco · +${50 * L} cr/día · resto hasta N${Math.max(1, L)}`;
    case "motores_plasma":
      return `+${Math.floor(L / 2)} velocidad en combate · −${10 * L} % tiempo de viaje`;
    case "lanza_proa":
      return `+${L} torpedos por salva · −${5 * L} % esquiva enemiga`;
    case "baterias":
      return `+${L} daño de andanada · +${Math.ceil(L / 2)} cañones de proa`;
    case "blindaje_proa":
      return `−${6 * L} % daño recibido · +${2 * L} embestida`;
    case "camara_escudos":
      return `+${L} escudo`;
    case "cubierta_abordaje":
      return `+${10 * L} % éxito al abordar · +${L} daño a contacto${L >= 3 ? " · +1 carga" : ""}`;
    case "casco":
      return `+${8 * L} casco máximo`;
    case "bodegas":
      return `${100 + 100 * L} OC de bodega base`;
    case "caja_creditos":
      return `protege el ${10 * Math.min(3, L)} % del saldo`;
    case "astropatico":
      return `−${10 * L} % reclutamiento · −${Math.round((100 * Math.min(3, L)) / 3)} % pérdida por distancia`;
    case "forja":
      return `obras más rápidas${L >= 3 ? " · 2 obras a la vez" : ""}`;
    default:
      return "";
  }
}
