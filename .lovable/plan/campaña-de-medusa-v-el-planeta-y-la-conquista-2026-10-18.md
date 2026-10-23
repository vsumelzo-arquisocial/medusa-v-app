# Campaña de Medusa V: el planeta y la conquista

## Qué verá el jugador
- El holograma del Puente abre la nueva pantalla **Planeta**.
- Globo 3D giratorio de Medusa V dividido en ~40 regiones pulsables.
- Dos vistas con un interruptor:
  - **Por bando:** azul/verde leal, rojo/amarillo traidor, gris neutral.
  - **Por jugador:** cada región muestra el **color y el emblema** que eligió su dueño.
- Ficha de región: tipo, dueño, bonificación, estado (en toma, disputada, fecha límite).
- Marcador: % del planeta por bando y ranking de jugadores por regiones.

## Identidad del jugador en el mapa
- Cada jugador elige su **color** y un **emblema** (de una galería de iconos imperiales y del Caos) en su perfil o al aterrizar. Se puede cambiar después.

## Fases de la campaña (reiniciable)
1. **Fase 0 · Aproximación:** las naves van de camino. Se ve el planeta pero no se puede aterrizar.
2. **Fase 1 · Conquista:** el admin pulsa «Iniciar campaña». Cada jugador elige su región inicial, que se convierte en su **Espaciopuerto**, y aterriza allí.
3. **Fin y reinicio:** el admin cierra y reinicia: todas las regiones vuelven a neutral y se regresa a la Fase 0. Naves, reservas y créditos se conservan.

## Tipos de región y bonificaciones
| Tipo | Ventaja para el dueño |
|---|---|
| Yermo | Sin bonus |
| Ciudad colmena | −20 % tiempo de infantería |
| Manufactorum | −20 % tiempo de tanques |
| Forja | −20 % tiempo de Titanes y Caballeros; la primera vez regala un Warhound |
| Mina | +ingreso diario de créditos |
| Puerto estelar | −10 % tiempo de todo el reclutamiento |
| Arsenal | −10 % coste de reclutamiento |
| Bastión | +plazas de carga extra en la nave |

- **No acumulables:** cada tipo cuenta una sola vez. Dos minas dan lo mismo que una.
- **Ventaja de las repetidas:** cada región extra del mismo tipo suma **+5 % de probabilidad** cuando un ataque se resuelve al azar (tope +20 %).
- **El Renombre solo se gana en batalla.**
- Nombres de las ~40 regiones inventados a partir del lore, para que los revises.

## Recompensas
- **Conquistar una región:** pocos créditos (propuesta: 100 neutral, 200 de otro jugador).
- **Ganar una batalla:** la mayor recompensa (propuesta: 500 al ganador, 150 al perdedor) más Renombre.

## Reglas de conquista
1. **Solo adyacentes:** únicamente puedes reclamar o atacar regiones que tocan una tuya. El territorio crece como un país.
2. **Un ataque a la vez** por jugador (incluye la toma de una neutral).
3. **Neutral:** «Reclamar» tarda **1 día real**.
4. **De otro jugador** (cualquier bando, también del tuyo): «Atacar» crea un desafío directo en Partidas vinculado a la región, con **plazo de 7 días**.
   - Siempre con **escenario aleatorio**; los jugadores eligen el tamaño en puntos.
   - Batalla jugada: el ganador se queda la región.
   - Sin batalla en 7 días: se resuelve al azar (50/50 más ventajas de repetidas).
5. **Espaciopuerto:** solo se pierde con una **batalla real**; nunca por azar. Si vence el plazo sin jugar, el ataque se cancela.
6. **Jugador destruido** = pierde su Espaciopuerto. Todas sus regiones vuelven a neutral y debe aterrizar de nuevo eligiendo otra región libre como nuevo Espaciopuerto.

## Partidas multijugador
- Nuevos formatos en el gestor de partidas: **1 vs 1**, **1 vs 2** y **2 vs 2**.
- Puntos equilibrados por bando: en 1 vs 2 a 3000, el jugador solo lleva 3000 y cada rival 1500. En 2 vs 2, cada uno la mitad del total del bando.
- Cada jugador elige su lista al aceptar, con su propio límite.
- El asistente de batalla agrupa a los jugadores por equipo (marcador, bajas y motores por equipo).
- En conquista, los aliados del atacante o del defensor pueden unirse al desafío; la región va al jugador principal del equipo ganador.

## Panel de administración
- Cambiar la fase, iniciar, cerrar y reiniciar campaña.
- Editar nombre y tipo de cada región; reasignar dueño; ajustar recompensas.

## Orden de construcción
1. Regiones, globo, fases, Espaciopuerto, color y emblema.
2. Toma de neutrales, ataques con plazo, azar, bonus y recompensas.
3. Partidas 1 vs 2 y 2 vs 2 (gestor y asistente de batalla).

## Detalles técnicos
- Tablas: `campaign` (fila única: fase, número), `regions` (nombre, tipo, celda, vecinos[], owner_id, is_spaceport, claim_until), `region_attacks` (región, atacante, defensor, game_id, deadline, resultado), `game_players` (game_id, user_id, equipo, puntos, lista) para multijugador.
- `profiles`: nuevas columnas `map_color`, `map_emblem`. `games`: `region_id`, `format` ('1v1','1v2','2v2').
- RPCs SECURITY DEFINER: `land_region`, `claim_region`, `attack_region`, `campaign_tick` (tomas de 1 día, ataques vencidos con azar salvo Espaciopuerto, resultados de partidas, recompensas, destrucción), `admin_set_phase`, `admin_reset_campaign`. `campaign_tick` se llama desde `ship_tick` y al abrir el planeta.
- Bonus: conjunto de tipos distintos; `recruit_unit` e ingreso diario lo leen sin sumar repetidos.
- Lectura de regiones para autenticados; escritura solo por RPC.
- Globo con three.js (`@react-three/fiber`) solo en cliente; icosaedro subdividido → 42 celdas con adyacencia natural.
- Pruebas: bonus no acumulables, ventaja con tope, adyacencia, un ataque a la vez, Espaciopuerto nunca por azar, reparto de puntos 1v2/2v2, fase 0 bloquea aterrizaje.
