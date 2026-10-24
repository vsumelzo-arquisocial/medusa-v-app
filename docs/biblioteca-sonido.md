# Biblioteca de sonido y efectos · guía de recogida

La app ya tiene el motor preparado (`src/lib/sfx/`): capas Armas, Ambiente, Música e Interfaz con volumen independiente, variantes aleatorias, panorama estéreo y síntesis de reserva. Cada **hueco** de abajo admite varias grabaciones. Tú las descargas; yo las recorto, normalizo (−1 dBTP, sonoridad igualada), comprimo a OGG/MP3 ligeros y las conecto.

## Cómo entregármelas
1. Crea una carpeta en tu ordenador llamada `atalaya-sonidos` con una subcarpeta por hueco (los nombres de la tabla: `macrocanon`, `lanza`…). Puedes dejar varias opciones por hueco: yo elijo las mejores.
2. No renombres los ficheros de Freesound (su nombre lleva el número y el autor; así queda trazada la licencia). De los packs, deja también el archivo de licencia del pack.
3. Avísame y te pediré acceso a esa carpeta desde aquí.

## Fuentes recomendadas (gratuitas y con licencia apta)
- **Kenney** (kenney.nl, packs *Sci-fi Sounds* e *Impact Sounds*). CC0: sin atribución, uso libre. Buenos para interfaz, impactos y disparos de energía.
- **Sonniss · GDC Game Audio Bundle** (sonniss.com/gameaudiogdc). Gigas de efectos profesionales gratuitos, libres de derechos para juegos, sin atribución. Lo mejor para explosiones, cañones, metal y ambientes. Es pesado: busca dentro las carpetas de *explosions*, *sci-fi*, *weapons*, *ambience*, *metal*.
- **Freesound** (freesound.org). Filtra la licencia por **Creative Commons 0**. Necesita una cuenta gratuita.
- **Música**: *Pixabay Music* (licencia propia: uso libre sin atribución) o OpenGameArt filtrando por CC0. Busca pistas largas, oscuras y orquestales, que se puedan repetir en bucle.

Evita: CC BY-NC (no comercial), cualquier cosa extraída de juegos o películas (incluidos los de Warhammer) y bancos «gratis» de YouTube sin licencia clara.

## Huecos de sonido

### Armas e impactos (capa Armas)
| Hueco | Qué tiene que sonar | Duración | Variantes | Búsqueda (en inglés) |
|---|---|---|---|---|
| `macrocanon` | Andanada de cañones pesados: retumbo grave y metálico, como artillería naval | 1–3 s | 3–5 | naval cannon, artillery boom, heavy cannon distant |
| `lanza` | Haz de energía: zumbido que carga y descarga con crepitar eléctrico | 1–2 s | 2–3 | laser beam heavy, energy beam, plasma cannon |
| `torpedo_lanzamiento` | Lanzamiento de cohete con siseo largo | 1–2 s | 2–3 | missile launch, rocket launch whoosh |
| `torpedo_impacto` | Explosión media seca | 1–2 s | 3–4 | explosion medium, impact explosion |
| `impacto_casco` | Golpe en metal grueso con chirrido y escombros | 0,5–1,5 s | 3–5 | metal impact heavy, hull hit, debris metal |
| `impacto_escudo` | Choque contra campo de energía: zumbido eléctrico que se disipa | 0,5–1 s | 2–3 | force field hit, shield impact, energy deflect |
| `explosion_grande` | Destrucción de nave: explosión enorme con cola larga y retumbo | 3–6 s | 2 | huge explosion, massive explosion long tail |
| `embestida` | Choque de dos moles de metal: crujido, desgarro y chirrido | 2–3 s | 2 | metal crash, ship collision, metal tear |
| `avante_toda` | Motores forzados: rugido que sube | 2–3 s | 2 | rocket engine burst, thruster boost |
| `salto_disforme` | Apertura de un portal: succión, distorsión y estallido final | 2–3 s | 1–2 | portal open, warp, dimensional rift |
| `salto_fallido` | Lo mismo, pero se colapsa con un golpe sucio | 2 s | 1 | portal collapse, energy implosion |
| `abordaje` | Disparos y metal a corta distancia (combate en pasillos) | 2–3 s | 2 | gunfight indoor, metal clang combat |

### Ambiente (capa Ambiente)
| Hueco | Qué tiene que sonar | Duración | Búsqueda |
|---|---|---|---|
| `puente` (bucle) | Puente de mando: zumbido grave constante, máquinas lejanas, pitidos de consolas, sin voces claras | 1–3 min, que se pueda repetir | spaceship bridge ambience, sci-fi interior hum |
| `reactor` (bucle) | Reactor cargándose: zumbido eléctrico pulsante | 30 s–1 min | reactor hum loop, generator hum |
| `reactor_encendido` | Arranque del reactor: golpe, chirrido y zumbido que sube | 3–5 s | power up machine, reactor start |
| `alarma` | Sirena de alerta de nave (grave, no de ambulancia) | 2–4 s, que se pueda repetir | spaceship alarm, red alert klaxon |

### Música (capa Música)
| Hueco | Qué tiene que sonar | Duración |
|---|---|---|
| `musica_combate` (bucle) | Épica oscura: coros graves, órgano o cuerdas, percusión lenta y pesada | 2–4 min |
| `musica_tension` (bucle) | Tensión contenida para la aproximación: drones y pulsos | 2–4 min |

### Interfaz
| Hueco | Qué tiene que sonar | Búsqueda |
|---|---|---|
| `click` | Pulsador mecánico corto o pitido de consola | ui click mechanical, console beep |

## Efectos gráficos
Ya funcionan partículas en tiempo real para lanzas, andanadas, torpedos con estela, escudos, explosiones, embestidas, saltos y motores. Para más realismo, el motor acepta **hojas de sprites de explosiones** (cuadrícula de fotogramas en PNG con fondo negro o transparente):
- `explosion`: explosión mediana, 16–64 fotogramas.
- `explosion_grande`: destrucción de nave, 32–64 fotogramas.
- `humo`: nube de humo/escombros que se disipa.

Fuentes: OpenGameArt (busca *explosion spritesheet* con licencia CC0) y los packs de Kenney *Particle Pack* y *Smoke Particles* (CC0). Ponlas en `atalaya-sonidos/sprites/`.

## Créditos
Los sonidos actuales vienen de Wikimedia Commons (`public/sfx/CREDITS.md`). Al incorporar los nuevos ampliaré ese fichero con la fuente y la licencia de cada uno.
