# Combate naval v2 · Diseño (borrador para aprobar)

Inspirado en Battlefleet Gothic: posición, distancia, escudos, órdenes especiales con Liderazgo y flotas con identidad propia.
Todos los números son iniciales y se ajustarán con un simulador (miles de duelos por par de facciones) antes de publicar.

## 1. Estructura del duelo

- **Fuerzas:** nave capital + hasta 3 escuadrones de escoltas (3 naves por escuadrón).
- **Bloques de 3 rondas.** Cada jugador fija en secreto sus 3 rondas. El bloque se resuelve **en cuanto los dos confirman** (máximo 24 h; quien no confirma pierde por silencio, como ahora).
- **Cada ronda eliges:**
  1. **Maniobra:** Acercarse · Mantener · Flanquear · Romper contacto.
  2. **Orden especial (opcional):** ver §4. Requiere chequeo de Liderazgo.
  3. **Blanco prioritario:** nave capital o escoltas.
  4. **Doctrina de escoltas** (una por bloque): Pantalla · Ataque · Flanqueo.
- **Fin:** casco de la capital a 0 (derrota), retirada (Romper contacto 2 rondas seguidas estando en Lejos), retirada warp manual o silencio.
- **Botín, renombre y protección warp:** se mantienen como ahora.

## 2. Distancia y maniobra

Bandas: **Contacto (0) · Cerca (1) · Media (2) · Lejos (3)**. El duelo empieza en Lejos.

- Acercarse = −1, Romper contacto = +1, Mantener/Flanquear = 0. Se suman las dos maniobras.
- Si uno se acerca y el otro se aleja, **gana el más rápido** (Velocidad, §5): la distancia se mueve 1 banda a su favor; con empate de velocidad no cambia.
- **Flanquear:** si el rival no flanquea ni rompe contacto, ganas el **flanco** esa ronda: disparas con todo el costado (+50 % baterías) y el rival recibe en su blindaje lateral, no en el de proa.
- **¡Avante toda!** duplica tu movimiento (2 bandas).

Alcance de las armas:

| Arma | Alcance | Notas |
|---|---|---|
| Baterías | Cerca–Media (mitad en Lejos) | Tiran contra el blindaje (proa/lateral) |
| Lanzas | Cerca–Lejos | Impactan a 4+ ignorando el blindaje; los escudos sí las paran |
| Torpedos | Cerca–Media | Se lanzan una ronda e impactan la siguiente; las torretas los derriban; luego hay que recargar |
| Abordaje | Solo Contacto | Tropa contra tropa: cada impacto neto causa 2 de daño, ignora escudos, causa críticos y suma botín |
| Embestida | Contacto con ¡Avante toda! | Daño según el casco propio; también te dañas |

## 3. Daño, escudos y críticos

1. **Escudos:** absorben los primeros *E* impactos de cada ronda (lanzas incluidas) y se recargan en la siguiente. Si absorben todos, se marcan como **sobrecargados**: −1 escudo la ronda siguiente.
2. **Blindaje:** cada dado de batería impacta si iguala o supera el blindaje del lado alcanzado (4+ ligero, 5+ pesado; la proa puede ser más gruesa que los costados).
3. **Casco:** cada impacto que pasa resta 1. Cada **6 natural** que pasa provoca una tirada de **crítico inmediato**:

| d6 | Crítico | Efecto | Se repara con |
|---|---|---|---|
| 1 | Motores dañados | No puedes Acercarte ni usar ¡Avante toda! | Control de daños |
| 2 | Baterías fuera de servicio | Baterías a la mitad | Control de daños |
| 3 | Lanza fuera de servicio | Sin lanzas | Control de daños |
| 4 | Incendio | −1 casco al final de cada ronda | Control de daños |
| 5 | Puente alcanzado | −2 Liderazgo | Control de daños |
| 6 | Escudos colapsados | 0 escudos la ronda siguiente | Se recupera solo |

Los críticos que sigan activos al terminar el duelo se convierten en averías de módulos (como ahora).

## 4. Órdenes especiales y Liderazgo

- **Liderazgo** = 6 + Puente/2 + 1 si el Coro astropático es nivel 2 o más (máximo 10).
- Para dar una orden especial tiras **2d6 ≤ Liderazgo**. Si fallas, esa ronda no hay orden especial.

| Orden | Efecto | Coste |
|---|---|---|
| ¡Fijar blanco! | Repites los fallos de baterías y lanzas | — |
| ¡Avante toda! | Mueves 2 bandas; permite embestir | Baterías a la mitad |
| ¡Nuevo rumbo! | Ganas el flanco aunque el rival flanquee | Baterías a la mitad |
| ¡Recargar artillería! | Torpedos listos para la ronda siguiente | — |
| ¡Prepararse para el impacto! | Salvación 4+ contra cada impacto | Todo tu fuego a la mitad; no cuenta como orden fallida |
| Control de daños | Repara 1 crítico (2 con Forja nivel 2+) y apaga incendios | Baterías a la mitad |
| Orden de facción | Ver §5 | Según facción |

## 5. Identidad de facción

Atributos de la nave capital: Velocidad (V), Escudos (E), Blindaje proa/lateral (B), Baterías (Bat), Lanzas (L), Torpedos (T), Torretas (Tor), Abordaje (Ab), Casco.

| Flota | V | E | B | Bat | L | T | Tor | Ab | Casco | Regla pasiva | Orden única |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Imperium | 2 | 2 | 5+/4+ | 6 | 2 | 4 | 2 | 3 | 27 | Proa blindada: blindaje 5+ de frente (4+ en los costados) y torpedos pesados. | **Carga de proa:** En Contacto: embestida con +3 de daño. |
| Caos | 3 | 2 | 4+/4+ | 6 | 4 | 0 | 1 | 4 | 34 | Fuego a distancia: +1 dado de lanza en Lejos. | **Marca de los dioses:** Repite el chequeo de Liderazgo y obtén +2 dados de lanza esta ronda. |
| Tau | 2 | 1 | 5+/4+ | 6 | 2 | 4 | 3 | 1 | 22 | Deflector: +2 escudos contra impactos de frente. | **Sistemas de puntería:** Torpedos guiados: recargan al instante e ignoran 1 torreta. |
| Aeldari | 4 | 0 | 4+/4+ | 6 | 4 | 4 | 1 | 2 | 26 | Campos holográficos: contra baterías salvación 2+ en Lejos/Media y 4+ en Cerca; contra lanzas y torpedos 4+; ninguna en Contacto. | **Velas solares:** Elige la maniobra tras ver la del rival para quedar a tu distancia ideal. |
| Drukhari | 4 | 0 | 4+/4+ | 5 | 3 | 3 | 1 | 5 | 35 | Campos de sombras: salvación 3+ contra todo disparo salvo en Contacto. | **Incursión esclavista:** Abordaje también en Cerca; cada impacto suma botín doble. |
| Orkos | 2 | 1 | 5+/4+ | 2d6+1 | 1 | 3 | 1 | 5 | 40 | ¡Más dakka!: baterías de 2d6+1 dados (varianza alta). | **¡Embestida!:** Avanza 2 bandas y embiste al llegar a Contacto sin perder fuego. |
| Necrones | 1 | 0 | 5+/5+ | 6 | 4 | 0 | 2 | 2 | 33 | Reanimación: cada ronda, 4+ repara 1 crítico o 1 de casco. | **Salto inercial:** Cambia hasta 2 bandas de distancia a voluntad. |
| Tiránidos | 2 | 0 | 4+/4+ | 5 | 2 | 4 | 3 | 6 | 47 | Nubes de esporas: absorben 2 impactos por ronda y nunca colapsan. Instinto: si falla el Liderazgo, repite la maniobra anterior. | **Tentáculos de abordaje:** Abordaje también en Cerca. |
| Demonios | 3 | 2 | 4+/4+ | 6 | 3 | 0 | 1 | 6 | 24 | Manifestación: en su primera ronda del duelo no se le puede apuntar. | **Grieta disforme:** Reaparece en la banda que quiera (1 vez por duelo). |
| Votann | 1 | 1 | 5+/5+ | 6 | 2 | 0 | 2 | 3 | 28 | Blindaje de vacío: −1 impacto de batería recibido por ronda. | **Juicio de los ancestros:** Fuego concentrado: +2 dados de lanza que repiten fallos. |
| Culto genestealer | 2 | 1 | 4+/4+ | 7 | 1 | 2 | 1 | 6 | 42 | Infiltración: el rival empieza el duelo con un crítico aleatorio. | **Alzamiento:** El abordaje tira el doble de dados si el rival está dañado. |

Los módulos de la nave siguen sumando: Baterías (+2 dados por nivel), Generador de escudos (+1 escudo en niveles 1 y 3; en flotas sin escudos de vacío, +1 a partir de nivel 2), Lanza de proa (+L), Cubierta de abordaje (+Ab), Motores de plasma (+V, +1 a partir de nivel 2), Blindaje de proa (−impactos de frente), Forja (Control de daños mejorado), Puente y Coro (Liderazgo).

## 6. Escoltas

Escuadrones de 3 naves, construidos en el astillero con créditos y tiempo (afectados por la Forja). Cada nave aguanta 1 impacto tras su escudo (1). Las bajas se reconstruyen.

| Tipo | Papel | Arma | Coste orientativo |
|---|---|---|---|
| Fragatas | Fuego de apoyo | 2 baterías por nave, Cerca–Media | 150 cr/escuadrón |
| Destructores | Torpederos | 2 torpedos por nave | 200 cr/escuadrón |
| Piquetes | Defensa | +1 torreta por nave (contra torpedos) y +1 defensa contra abordaje | 120 cr/escuadrón |

Doctrinas de escolta (una por bloque):

- **Pantalla:** los primeros impactos dirigidos a tu capital van a las escoltas.
- **Ataque:** añaden su fuego al de la capital.
- **Flanqueo:** si el rival no flanquea, te dan el flanco aunque tú no maniobres.

Cada facción les da nombre propio y un rasgo (por ejemplo, las fragatas Aeldari tienen holocampos 4+, los piquetes tiránidos regeneran).

## 7. Interfaz

- **Panel de órdenes por ronda:** maniobra, orden especial, blanco y una previsión de alcance ("a Media: baterías 8 dados, lanzas 2").
- **Repetición con pista de distancia:** naves en una banda de 4 casillas, flanco marcado, escudos absorbiendo, críticos y torpedos en vuelo.
- **Ficha de facción** con sus atributos, regla pasiva y orden única, y la ficha del rival.

## 8. Implementación

1. **Motor en TypeScript** (servidor de la app, función con clave de servicio) con tests unitarios y **simulador de equilibrio** (matriz de victorias entre facciones).
2. **Base de datos:** tabla de escoltas, estado del duelo v2 (distancia, críticos, incendios, recarga, escoltas), planes por bloque. **Los duelos activos se anulan devolviendo los 100 créditos.**
3. **Resolución:** al confirmar ambos o al vencer el plazo (se comprueba al consultar, como ahora).
4. **Interfaz:** panel de órdenes, astillero de escoltas y repetición con pista de distancia.
5. **Ajuste de equilibrio** con el simulador hasta que ningún enfrentamiento supere 60/40 con niveles iguales.
