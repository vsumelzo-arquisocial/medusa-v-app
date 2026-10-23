# Sistema Medusa: de un planeta a un sistema completo

## Qué verá el jugador

**Vista de sistema (nueva página principal de campaña)**
- Sol en el centro y nueve planetas orbitando con animación; las lunas giran alrededor de su planeta.
- Planetas: I Ígneo (inhóspito), tres gigantes gaseosos (decorativos), Medusa IV (tierra con mares), Medusa V (el actual, 42 regiones), uno rojo tipo Marte, uno helado y uno desértico.
- Tamaños variados: grande unas 50-56 regiones, mediano 30-36, pequeño 20-24. Las lunas tienen de 3 a 6 regiones (por ejemplo dos lunas para Medusa IV, una para el rojo y otra para el helado).
- Cada planeta o luna muestra un candado si está bloqueado, el reparto de facciones y las naves estacionadas allí (con el estandarte de cada jugador). Las naves en viaje aparecen en una franja «En el warp» sin destino.
- Porcentajes globales de Orden, Caos, Incursores y Neutral de todo el sistema.
- Al pulsar un planeta o luna se abre la vista de detalle (el planeta actual con su globo, regiones, vista por jugador o bando y porcentajes de ese planeta).

**Viajes desde Mando de la Nave**
- Eliges un planeta o luna de destino y ves cuánto tardarás. El tiempo va según la distancia entre órbitas, hasta 7 días para el trayecto más largo; ir de un planeta a su luna lleva unas horas.
- Durante el viaje la nave está en el warp: los demás no ven tu destino y no puedes atacar ni ser atacado por otras naves. Al llegar quedas localizado.
- Puedes viajar a planetas bloqueados, pero allí no puedes desembarcar ni atacar.

**Reglas de conquista**
- Solo puedes desembarcar o atacar regiones del planeta o la luna donde está estacionada tu nave, y solo si está abierto.
- Un desembarco por planeta o luna: tu primera región allí es tu zona de desembarco, que no se resuelve automáticamente.
- Tus regiones en otros planetas pueden recibir ataques y las defiendes con normalidad.
- Las bonificaciones de región solo cuentan las regiones del planeta donde está tu nave, con el mismo escalonado del 10/15/20 %.

**Combate naval**
- Puedes atacar cualquier nave localizada (que no esté en el warp ni en protección warp).
- El duelo tarda más en empezar cuanto más lejos esté el objetivo.
- Al terminar te quedas en el planeta del rival, sin viaje de vuelta; desde allí decides a dónde ir después.

**Panel de control de campaña (Admin)**
- Fases: Preparación (todo bloqueado) → En curso → Finalizada, con el botón **Iniciar campaña**.
- Interruptor Abierto/Bloqueado por cada planeta y luna. Al bloquearlo los territorios se quedan como están, se cancelan los ataques pendientes allí y se puede seguir viajando a él.
- Tabla de dominio por planeta con un aviso cuando una facción controla el 100 %.
- Se mantienen las herramientas de reinicio, saltar esperas y forzar colas.

## Orden de trabajo
1. Generar las texturas de los planetas y lunas nuevos y extraer de ellas sus regiones (fronteras, mares y continentes), como se hizo con Medusa V.
2. Base de datos: tabla de cuerpos celestes (planeta/luna, tipo, órbita, tamaño, abierto/bloqueado), regiones asociadas a su cuerpo, ubicación y viaje de cada nave, y desembarco por cuerpo.
3. Reglas en el servidor: viajar, llegar, desembarcar y atacar solo donde está la nave y si está abierto; bonificaciones por el planeta actual; duelo naval con retraso según distancia y nave que se queda en el destino; abrir y bloquear cuerpos (solo admin).
4. Vista de sistema y nueva ruta de detalle por planeta; adaptar el globo a varias texturas.
5. Mando: selector de rumbo, cuenta atrás del viaje y estado en el warp.
6. Panel de control de campaña en Admin.
7. Ayuda del jugador, alertas de amenaza y compendio con el nombre del planeta.
8. Pruebas: tiempos de viaje, bloqueo, ataque solo en el planeta propio, bonificación por planeta y un desembarco por cuerpo.

## Detalles técnicos
- Nuevas tablas `celestial_bodies` (id, name, kind planet|moon, parent_id, biome, orbit_index, size, status locked|open, playable) y `ship_travel` (o columnas en `ships`: `body_id`, `travel_from`, `travel_to`, `arrives_at`). Columna `regions.body_id` (Medusa V conserva los ids 0-41). Regiones nuevas con ids a partir de 42. Las RPCs públicas ocultan `travel_to` a quien no es el dueño.
- `region_rate` filtra por `regions.body_id = ships.body_id`. `claim_region` y `wh40k_attack_region` exigen el mismo cuerpo, un cuerpo abierto, una nave que no esté en viaje, y permiten un `is_spaceport` por usuario y cuerpo.
- `declare_raid`: deadline + retraso proporcional a la distancia orbital; `naval_finish` mueve al atacante al cuerpo del defensor.
- Tiempo de viaje = 7 días × |Δórbita| / máxima Δ, con un mínimo de unas 3 h entre una luna y su planeta. Lo procesa `ship_tick`.
- Datos de mapa en `src/data/bodies/<id>.json` con el mismo formato que `planet-regions.json`; `Globe` recibe la textura y la cuadrícula por props. Las texturas se generan con IA y la extracción de regiones se hace con un script.
- Ruta `/sistema` (vista general) y `/planeta/$body` (detalle). `/planeta` redirige a Medusa V.
- Se actualizan `AGENTS.md` y la memoria del proyecto con las reglas del sistema.
