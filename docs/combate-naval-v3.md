# Combate naval v3

Sustituye a la v2 (escoltas y bloques de 3 rondas). Solo nave capital, pensado para ser intuitivo, profundo y estratégico.

## Ritmo
- Al declarar la ofensiva (100 cr) el atacante viaja hasta el planeta del defensor. Durante el viaje ya se pueden fijar las órdenes del bloque 1.
- El combate va en **bloques de 5 fases**. Los dos jugadores planifican a ciegas; el bloque se resuelve en cuanto ambos confirman (máximo 24 h).
- Plazo vencido: si nadie dio órdenes pierde el atacante (`silencio`); si solo uno, pierde el otro (`abandono`).
- Límite: 4 bloques (20 fases); después gana quien conserve más % de casco (`tiempo`).

## Cada fase
Maniobra (acercarse / mantener / alejarse) + una acción:

| Acción | Efecto |
|---|---|
| Fuego | Daño según la tabla de distancia de la flota, ± varianza. |
| Torpedos | Requiere tubos cargados. Llegan la fase siguiente (en Cerca/Contacto al instante, más difíciles de esquivar). 2 de daño por torpedo. |
| Recargar | Carga los tubos y dispara a media potencia. |
| Evasión | +30 % de esquiva contra torpedos y embestidas, recibe la mitad de disparo, no dispara. |
| Embestir | Fuerza acercarse; si acaba en Cerca/Contacto choca (puede esquivarse) y deja la distancia en Contacto. Daño al rival y retroceso propio. |
| Reparar | Recupera 3 + nivel de forja. |
| Salto disforme | Instantáneo. Éxito = huye (pierde el duelo, salva la nave). Fallo = 2–6 de daño. Probabilidad 70 % + 5/nivel de Puente y Astropático + flota − 40 % × daño sufrido (15–95 %; demonios 100 %). |

Orden de resolución: torpedos en vuelo → saltos → maniobras → embestidas → disparo/lanzamientos (simultáneos) → reparación y regeneración.

- **Distancia:** si las dos naves tiran en el mismo sentido se suman; si tiran en sentidos opuestos gana la más rápida (iguales: no cambia). Mantener no impide que el otro mueva.
- **Escudos:** absorben su valor de cada disparo, nunca más de la mitad.
- **Esquiva:** contra torpedos y embestidas; además reduce el disparo recibido un 1 % por cada 2 % de esquiva. Aeldari: −30 % extra en Media/Lejos.
- **Salto de emergencia:** el jugador fija un umbral de casco (0/20/30/40/50 %); si al final de una fase baja de él, la siguiente acción pasa a ser un salto.
- **Destrucción:** casco a 0 → la nave estalla y el perfil de su dueño se reinicia (`reset_profile_uid`). El vencedor cobra el botín normal antes.

## Módulos
Baterías +1 daño en Cerca/Media · Lanza de proa +1 en Media/Lejos · Cubierta de abordaje +1 en Contacto · Cámara de escudos +1 escudo · Motores +1 velocidad cada 2 niveles · Blindaje de proa +2 embestida y −1 daño de embestida recibido · Forja +1 reparación · Puente y Astropático +5 % salto.

## Flotas
| Flota | Vel. | Fuego [C, Ce, M, L] | Escudos | Esquiva | Torpedos | Embestida | Regen. | Rasgo |
|---|---|---|---|---|---|---|---|---|
| imperium | 2 | [5, 5, 4, 2] | 1 | 15 % | 4 | 7 | 0 | Proa de asalto |
| chaos | 3 | [3, 4, 4, 4] | 1 | 20 % | 3 | 4 | 0 | Lanzas de largo alcance |
| tau | 2 | [2, 3, 5, 7] | 2 | 20 % | 3 | 2 | 0 | Misiles buscadores |
| aeldari | 4 | [2, 4, 4, 3] | 0 | 35 % | 3 | 2 | 0 | Campos holográficos |
| drukhari | 4 | [8, 6, 3, 1] | 0 | 50 % | 2 | 3 | 0 | Incursión esclavista |
| orks | 2 | [7, 5, 2, 1] | 1 | 10 % | 4 | 10 | 0 | ¡Más dakka! |
| necrons | 1 | [6, 6, 5, 4] | 0 | 10 % | 2 | 5 | 1 | Reanimación |
| tyranids | 2 | [5, 4, 2, 1] | 0 | 10 % | 3 | 6 | 1 | Bioregeneración |
| daemons | 3 | [6, 5, 4, 2] | 1 | 30 % | 2 | 5 | 0 | Hijos de la disformidad |
| votann | 1 | [4, 4, 4, 4] | 3 | 10 % | 3 | 6 | 0 | Blindaje de vacío |
| genestealer | 2 | [6, 5, 3, 2] | 1 | 20 % | 3 | 6 | 0 | Infiltración |

## Segundo al mando
Cada flota tiene su oficial (Primer Oficial, Kontramaestre Gretchin, Kor'el…). Calcula en qué distancia somos más eficaces, pregunta por la postura (Al abordaje / Nuestra distancia / Resistir) y rellena el plan, prevé la distancia de cada fase suponiendo que el rival busca la suya, avisa de errores (lanzar sin carga, embestir fuera de alcance, disparar donde no hacemos daño) y suplica el salto con el casco bajo el 35 %.

## Interfaz
Radar circular (auspex) con nuestra nave en el centro, anillos teñidos según quién domina cada distancia, torpedos en vuelo y posición prevista al pasar sobre una fase. Repetición animada del último bloque con narración, registro completo y archivo con repetición del duelo entero.

## Equilibrio (IA contra IA, 400 duelos por pareja, módulos a 0)
```
Media por flota:
imperium     56.3%
chaos        57.1%
tau          49.8%
aeldari      53.7%
drukhari     41.2%
orks         41.0%
necrons      53.8%
tyranids     54.5%
daemons      41.4%
votann       52.8%
genestealer  48.5%
Desenlaces: {
  salto: "45.6%",
  destruida: "54.2%",
  tiempo: "0.2%",
} fases medias 8.2 bloques medios 2.12
Parejas más desequilibradas:
chaos vs votann            0%
necrons vs tau             0%
orks vs votann             99%
daemons vs tau             99%
daemons vs genestealer     3%
chaos vs necrons           96%
genestealer vs tyranids    4%
necrons vs tyranids        96%
drukhari vs tau            94%
aeldari vs daemons         94%
```
Siguen existiendo emparejamientos muy desfavorables con la IA (que juega de forma predecible); con jugadores reales la lectura del rival los suaviza. Revisar con datos de partidas.

Código: `src/lib/naval3/` (motor, Segundo, narración, servidor), `src/components/ship/duel/`, migración `20261024050000_naval_v3.sql`, simulador `scripts/naval3-sim.ts`.
