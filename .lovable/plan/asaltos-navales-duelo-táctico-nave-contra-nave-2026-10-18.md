# Asaltos navales: duelo táctico nave contra nave

Inspirado en Battlefleet Gothic: órdenes especiales, andanadas, escudos de vacío, abordajes y daños críticos. Ningún jugador tiene que estar conectado durante el combate.

## Cómo se juega

```text
Atacante declara asalto ──> Defensor recibe aviso (24 h)
     │                          │
 programa sus 3 rondas      programa su defensa (editable)
     └──────── a las 24 h se fijan y se resuelve ────────┘
                         │
                 Informe de batalla
```

1. **Declarar asalto**: desde la Nave, «Asaltar nave» y eliges a cualquier jugador. Coste de preparación: 100 cr. Máximo un asalto lanzado al día, y la víctima queda protegida 48 h después de recibir uno.
2. **Plan de batalla (3 rondas)**: cada jugador elige una orden por ronda. Puede cambiarla cuantas veces quiera hasta que se cumplan las 24 h. Si el defensor no la toca, se aplica su «postura por defecto», configurada en el Puente.
3. **Resolución automática**: al acabar el plazo se fijan los planes y se juegan las tres rondas con dados y los módulos de cada nave.
4. **Informe**: un parte ronda a ronda con impactos, escudos caídos, críticos y botín, visible para los dos.

## Órdenes especiales (estilo BFG)

| Orden | Efecto | Vence a | Pierde contra |
|---|---|---|---|
| ¡Fuego a discreción! (Andanada) | Daño doble con baterías | Abordaje | Escudos reforzados |
| ¡Refuercen escudos! | Anula la mitad del daño y recarga escudos | Andanada | Abordaje |
| ¡Preparad el abordaje! | Lanza tropas; si acierta, roba créditos o sabotea un módulo | Escudos | Andanada |
| ¡A toda máquina! (Evasión) | Reduce los impactos recibidos y no inflige daño | — | Neutral |
| Lanza (bombardeo de proa) | Daño perforante con 4+, ignora escudos, se usa una vez por duelo | — | Neutral |

Los módulos que ya existen modifican el resultado: Baterías orbitales (+daño), Escudos/Puente (+escudos y +liderazgo para cambiar de orden), Barracones/Talleres (+fuerza de abordaje y +defensa contra él), Forja (reduce el daño de los críticos). El Renombre del capitán da una repetición de tirada por duelo.

## Daño, botín y riesgo

- **Puntos de casco** según el nivel de los módulos. La nave nunca se destruye: al llegar a 0 queda «a la deriva» y el duelo termina.
- **Críticos** (con 6 en los impactos, o con un abordaje exitoso): un módulo al azar queda **averiado** (deja de funcionar hasta que se repare, con coste y tiempo), y con mala suerte **pierde un nivel**. Nunca baja de nivel 1 en el Puente.
- **Botín del vencedor atacante**: 10–20 % de los créditos del defensor, con un tope de 600 cr y más si hubo abordajes exitosos.
- **Riesgo del atacante**: si pierde, sufre críticos igual que el defensor y no recupera el coste de preparación.
- **Renombre**: el vencedor gana +2 (+1 extra si gana sin sufrir ningún crítico) y el defensor que resiste gana +1.
- **Reparación** desde la Nave: botón «Reparar» en los módulos averiados, que se suma a la cola de obras actual.

## Pantallas

- **Nave**: pestaña «Combate naval» con los asaltos lanzados y recibidos, la cuenta atrás, el editor del plan en 3 rondas y el historial de informes.
- **Puente**: aviso rojo «¡Nave enemiga aproximándose!» cuando te atacan, con un acceso directo para preparar la defensa.
- **Esquema de la nave**: los módulos averiados se ven parpadeando en rojo.
- **Ayuda**: tutorial de órdenes y combate naval.
- **Admin**: anular un asalto y reparar módulos a mano.
- **Estrategos/Logros**: asaltos ganados, créditos saqueados y nuevos logros («Corsario del vacío», «Muro de acero»).

## Detalles técnicos

- Tabla `naval_raids` (atacante, defensor, plazo, planes jsonb de cada lado, estado, informe jsonb, botín). Tabla `naval_stances` con la postura por defecto. Columnas nuevas y nulas en `ship_modules`: `damaged_until`/`damaged` (migración aditiva). Con GRANT y RLS: cada jugador lee solo los asaltos en los que participa, y las escrituras van solo por RPC.
- RPCs SECURITY DEFINER: `declare_raid`, `set_raid_plan` (rechaza cambios después del plazo), `set_default_stance` y `resolve_raids` (se ejecuta desde `ship_tick`, con bloqueo de filas para que no se resuelva dos veces ni se cobre botín doble), `repair_module`, `admin_cancel_raid`, `admin_repair_module`.
- El motor de dados va en SQL y la tabla de órdenes, espejada en `src/lib/naval.ts`, sirve para el texto de la interfaz. Pruebas unitarias de la matriz de órdenes, el tope de botín y que el Puente nunca baje de nivel 1.
- Los módulos averiados no aportan bonus en `collect_daily_income`, el reclutamiento ni el combate naval.

## Valores inventados (a confirmar)
Coste de 100 cr, robo del 10–20 % con tope de 600, protección de 48 h, Renombre +2/+1, 3 rondas y probabilidad de perder nivel en los críticos.
