# Campaña de Medusa V: la nave fortaleza y la conquista planetaria

Las partidas con miniaturas siguen siendo el centro del juego. Lo que se añade es una capa de juego de gestión: cada jugador dirige su nave capital y su bando conquista Medusa V región a región.

## 1. Recursos (todo gira en torno a ellos)

| Recurso | Para qué sirve | Cómo se consigue |
|---|---|---|
| Créditos Imperiales | Todo: construir, reclutar, reparar | Ingreso diario de la nave y de las regiones, y batallas |
| Renombre | Desbloquea rangos, medallas y módulos de élite | Victorias, objetivos secundarios, gestas |
| Días (tiempo real) | Las construcciones y los reclutamientos tardan | Se aceleran con módulos o gastando créditos |

Se mantiene una sola moneda, como ya acordamos. El tiempo actúa de segundo «recurso» y frena la creación rápida de ejércitos.

## 2. La nave fortaleza

La nave tiene nombre, una posición sobre una región del planeta (puede viajar) y **ranuras de módulos** que se amplían subiendo el nivel del casco.

**Módulos sugeridos** (cada uno con niveles del 1 al 3, coste en créditos y días de obra):

- **Puente de mando:** nivel de la nave. Más nivel da más ranuras y permite viajar más lejos.
- **Bodegas de carga:** capacidad total de tropas (infantería, blindados). Sin espacio no se puede reclutar más.
- **Hangar de Titanes:** cada nivel mantiene un Titán más. Los Warlord y Warmaster necesitan nivel alto.
- **Establos de Caballeros:** igual, pero para Caballeros.
- **Forja de a bordo:** reduce los días de construcción. Con el nivel 3 permite dos encargos a la vez.
- **Talleres de reparación:** reparan Titanes y Caballeros dañados en batalla.
- **Grúas de recuperación:** recuperan Titanes o Caballeros destruidos (con probabilidad y coste) en vez de perderlos.
- **Barracones y lanzaderas:** aceleran los refuerzos de infantería que llegan de otros sistemas.
- **Enlace astropático:** aceleran los refuerzos de blindados de los mundos forja.
- **Baterías orbitales:** dan un bombardeo orbital de un solo uso por batalla (ya estaba en la idea inicial).
- **Capilla o Templo del Omnissiah:** ingreso de Renombre y un bonus de moral de un solo uso.

## 3. Reclutamiento: «Colección» pasa a ser el «Arsenal»

- Lo que tienes en el Arsenal es lo único que puedes meter en las listas de campaña. El modo «Simulación libre» sigue existiendo para practicar.
- **Tres vías de llegada, con tiempos distintos:**
  - **Infantería:** llega de otros sistemas. Es rápida y barata, 1-2 días.
  - **Blindados:** se piden como refuerzos a los mundos forja, 2-4 días.
  - **Titanes y Caballeros:** se construyen en la forja. Un Warhound tarda unos 3 días y un Warlord unos 10 (valores orientativos para ajustar).
- **Cola de encargos:** se ve como en un videojuego, con una barra de progreso y la hora a la que llega.
- **Bajas permanentes:** al cerrar una batalla, las bajas registradas en el asistente se restan del Arsenal. Por ejemplo, 12 Predator con 5 destruidos te dejan 7. Los Titanes o Caballeros destruidos pasan a «Restos» y se pueden recuperar con las Grúas.
- **Daño persistente:** un Titán que acaba herido se queda herido hasta que pasa por el Taller.
- **Límite de carga:** al reclutar se comprueban las bodegas y los hangares.

## 4. El planeta Medusa V

- Un globo que se puede girar con **unas 40 regiones** repartidas en varios continentes (nombres del lore de Medusa V: picos de Hydra, desierto Rojo, ciudad colmena, etc.).
- Cada región es **neutral, leal o traidora** y tiene una barra de control del 0 al 100 %.
- **Cómo se conquista:** una batalla jugada «sobre» una región mueve su control hacia el bando ganador, más o menos según el tamaño de la partida y la victoria. Al llegar al 100 % la región cambia de dueño.
- **Solo se ataca lo adyacente:** a una región adyacente a otra de tu bando o a donde está tu nave. Así aparecen frentes en el mapa.
- **Recompensas por región:**
  - **Ingresos:** más créditos diarios.
  - **Bonus especiales:** un mundo forja o fundición regala un Titán una vez, o abarata los blindados; una manufactorum acelera la forja; un puerto estelar acelera los refuerzos; un santuario da Renombre; las ruinas xenos dan habilidades de un solo uso.
- **Marcador global:** el porcentaje del planeta para cada bando. Cuando un bando alcanza un umbral (por ejemplo el 70 %) gana la campaña y se puede empezar una nueva.

## 5. Orden de construcción (fases)

1. **Fase A, la economía y la nave:** recursos, ingreso diario, nave con módulos, cola de obras con tiempos.
2. **Fase B, el Arsenal:** reclutamiento con tiempos y capacidad, listas de campaña limitadas al Arsenal, bajas que se restan al cerrar la batalla, daños y reparaciones.
3. **Fase C, el planeta:** globo con regiones, control, adyacencia, partidas vinculadas a una región y recompensas.
4. **Fase D, el pulido:** medallas, rangos, bombardeos orbitales y habilidades de un solo uso, panel del administrador para ajustar costes y tiempos.

## Decisiones que necesito de ti

- ¿Los tiempos van en días reales o en «ciclos» que el administrador avanza a mano (por ejemplo cada semana del club)?
- ¿Las batallas sueltas también restan bajas, o solo las marcadas como «de campaña»?
- ¿Las 40 regiones me las pasas tú, con nombres y bonus, o me las invento inspiradas en el lore y luego las revisas?

## Detalles técnicos

- Tablas nuevas: `ships` (nombre, región actual, nivel), `ship_modules` (tipo, nivel, en obra hasta), `build_queue` (qué, cuántas, hasta cuándo), `arsenal` (sustituye o amplía `collection_items`, con estado operativo, dañado o restos), `regions` (continente, adyacencias, bonus, control por bando), `region_battles`.
- Todo cambio de créditos, inventario o control se hace en funciones seguras del servidor, nunca desde el navegador, para evitar trampas.
- Las colas se resuelven al consultar: si la hora de fin ya ha pasado, se entrega lo encargado. No hace falta un proceso programado.
- El globo se dibuja en 3D con un modelo sencillo y regiones pulsables (o en 2D como alternativa ligera en móvil).
