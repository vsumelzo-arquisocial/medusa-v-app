# Bonificaciones de regiones para Warhammer 40.000

Las regiones dejan de dar bonos de Titanes o de tiempos de Legions Imperialis. Ahora dan bonos de economía y de astillero.

## Tipos de región (valores con 1 / 2 / 3 o más regiones del mismo tipo)

| Tipo | Bonificación | 1 | 2 | 3+ (tope) |
|---|---|---|---|---|
| Mina | Más créditos diarios | +10 % | +15 % | +20 % |
| Forja | Mejoras de nave más baratas | −10 % | −15 % | −20 % |
| Dique orbital (antes Manufactorum) | Reparaciones de casco y módulos más baratas y rápidas | −10 % | −15 % | −20 % |
| Arsenal | Unidades más baratas al reclutar | −10 % | −15 % | −20 % |
| Colmena | Reclutamiento y reentrenamiento más rápidos | −10 % | −15 % | −20 % |
| Puerto estelar | Protección warp más larga después de un combate naval | +6 h | +9 h | +12 h |
| Bastión | Más capacidad en la bodega (OC) | +10 % | +15 % | +20 % |
| Yermo | Sin bonificación | — | — | — |

- Los bonos se acumulan de forma escalonada (10 → 15 → 20 %) y nunca pasan del 20 %.
- Se elimina por completo el bono de la Forja que daba un Warhound gratis, junto con cualquier texto sobre Titanes o Caballeros.
- La ventaja actual en la resolución aleatoria por tener regiones repetidas se mantiene.

## Dónde lo verá el jugador

- Planeta: la leyenda y la ficha de cada región muestran el bono nuevo y el nivel que ya tienes.
- Puente, Nave y Reclutamiento: una línea indica qué descuento o extra se está aplicando (por ejemplo, «Forja ×2: −15 %»).

## Detalles técnicos

- Una única función SQL `region_bonus(_uid, _type)` devuelve el multiplicador escalonado. Se aplica en las RPC bloqueadas que ya existen: `collect_daily_income`/`daily_income_status` (Mina), `build_module` (Forja), `repair_hull`/`repair_module` en coste y duración (Dique), `recruit_40k` en coste y `ready_at` de reclutamiento/reentrenamiento (Arsenal y Colmena), la protección warp al cerrar un combate naval (Puerto) y `ship_assert_capacity` (Bastión).
- Los datos de las regiones cambian `manufactorum` por `dique`. Se retiran la lógica de regalo de `forja` y `forge_gift_claimed` (la columna queda marcada como obsoleta, sin borrarla).
- `src/lib/planet.ts`: `REGION_TYPES` con los textos nuevos y un `regionBonus(owned, type)` en el cliente con la misma curva, solo para mostrarla. El cálculo real siempre lo hace el servidor.
- Pruebas: curva 10/15/20 con tope, y prueba PGlite de que la Mina sube el ingreso, la Forja abarata la mejora y el Arsenal abarata el reclutamiento.
