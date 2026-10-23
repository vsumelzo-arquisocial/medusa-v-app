# Mando de la Nave Capital: combate naval en serio

## Nueva pantalla «Mando de la Nave»
Un menú propio en la barra principal (separado de Nave). Tres secciones:

1. **Estrategos de la nave**: retrato del oficial táctico con su diálogo («Mi señor, ¿cuál será nuestra postura?»). Le dictas la defensa por defecto con iconos grandes, uno por ronda.
2. **Lanzar ofensiva**: eliges el objetivo con su emblema y su nave, y programas las 3 órdenes con iconos grandes (Andanada, Escudos, Abordaje, Evasión, Lanza). Al final, un botón grande y rojo: «LANZAR OFENSIVA».
3. **Archivo de combate**: los asaltos en curso y los informes, con un botón «Ver combate» para repetir la animación.

## Animaciones
- **Salida de órbita**: tu nave (leal o traidora) deja la órbita geoestacionaria de Medusa V. La pantalla muestra «Calculando trayectoria…» con una trayectoria punteada hacia la nave enemiga y el rumbo fijado.
- **Durante las 24 h**: una vista táctica que no se detiene. Tu nave avanza por la trayectoria en función del tiempo real que falta, con telemetría que cambia (distancia, vector, cuenta atrás).
- **Combate**: un duelo animado entre las dos naves reales. Antes de cada ronda se oye una voz: «Ronda uno», «Ronda dos» y «Ronda tres». Se ve la orden de cada bando: andanadas con destellos, escudos de vacío que se iluminan, lanzaderas de abordaje, el impulso de evasión y el rayo de la lanza. El sonido incluye cañones, impactos, alarma y escudos.
- **Desenlace**: «VICTORIA» o «DERROTA», la lista de módulos destruidos (que pierden nivel) y dañados, el objetivo conseguido (créditos saqueados, sabotaje, defensa resistida) y el Renombre ganado.

## Mejoras navales (nuevos módulos)
Cada orden tiene su módulo de refuerzo, con 3 niveles. El que gana el piedra-papel-tijera sigue ganando, pero tu mejora hace más daño cuando aciertas y te protege más cuando fallas.

| Módulo | Refuerza | Efecto por nivel |
|---|---|---|
| Cámara de escudos de vacío | ¡Refuercen escudos! | +1 escudo y −10 % del daño recibido |
| Baterías orbitales (ya existe) | ¡Fuego a discreción! | +1 dado de andanada y +10 % al daño crítico |
| Cubierta de abordaje | ¡Preparad el abordaje! | +1 tropa y +5 % de botín |
| Motores de plasma | ¡A toda máquina! | La evasión anula un impacto más |
| Lanza de proa | Lanza | +1 de daño perforante |
| Blindaje de proa | Siempre activo | −1 impacto por ronda (mínimo 0) |

## Más ideas que te propongo (elige las que quieras)
1. **Escoltas**: fragatas de un solo uso, compradas con créditos, que absorben el primer crítico.
2. **Oficiales con rasgos**: el Estrategos sube de nivel con los combates y gana un rasgo, como «Artillero veterano» (repite un dado) o «Paranoico» (+1 contra el abordaje).
3. **Inteligencia**: un módulo de Auspex que, pagando, revela 1 de las 3 órdenes enemigas antes del plazo.
4. **Contraataque**: tras recibir un asalto, el defensor puede responder durante 24 h, sin coste y sin el límite diario.
5. **Flotas de bando**: un aliado del mismo bando puede enviar refuerzos a un defensor y sumar un dado por ronda.
6. **Botín especial**: con un abordaje perfecto robas un Drop Pod o una carga de bombardeo, no solo créditos.
7. **Recompensas**: una bonificación semanal para el capitán con más asaltos ganados y una medalla para el «Terror del vacío».

## Detalles técnicos
- La ruta nueva `/mando` lleva su propio enlace en el menú y su ayuda contextual. La sección de combate se quita de `/nave`.
- Hay 4 módulos nuevos en el catálogo de módulos, con la migración aditiva correspondiente. `resolve_raid` lee los niveles de esos módulos, aplica los modificadores y guarda en el informe jsonb una secuencia de eventos por ronda (disparos, escudos, críticos) para poder reproducir la animación.
- Las animaciones usan SVG/CSS con las imágenes reales de las naves. El sonido se genera con Web Audio (cañones, impactos, alarmas) y las voces de ronda con la voz del navegador en español, así que no hace falta nada externo. Un botón permite silenciar.
- La trayectoria se interpola con `created_at`/`deadline` y la hora del servidor.
- Las pruebas cubren los modificadores por nivel (el ganador sigue ganando) y los topes.

## Valores inventados (a confirmar)
Los porcentajes y bonificaciones de cada nivel, y el coste y el tiempo de obra de los módulos nuevos.
