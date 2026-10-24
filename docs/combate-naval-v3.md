# Combate naval v3 · rumbo y arcos

> **Actualización (24-10-2026):** bloques de **3 rondas** (antes 5) y máximo 6 bloques. Cada ronda se elige una **maniobra** (recto, virar 45° a babor/estribor, giro cerrado de 90°, avante toda, parar) y una **acción**. La interfaz combina un **mapa táctico** visto desde arriba (trayectoria prevista de tu nave, trayectoria más probable del enemigo según la IA, zona que puede alcanzar y daño previsto) con el **radar del puente**. Hay **simulacro contra la IA** (en el navegador, sin riesgo) y **tutorial guiado**. Los jugadores pueden poner su propia música de combate (se guarda solo en su navegador).

Duelo entre naves capitales, al estilo Battlefleet Gothic pero jugable a ciegas por bloques. Sustituye a la v2 (escoltas).

## Ritmo
- Al declarar la ofensiva (100 cr) el atacante viaja hasta el planeta del defensor; durante el viaje ya se fijan las órdenes del bloque 1.
- **Bloques de 5 fases** planificadas a ciegas; se resuelve en cuanto confirman los dos (máximo 24 h).
- Plazo vencido: si nadie dio órdenes pierde el atacante (`silencio`); si solo uno, pierde el otro (`abandono`).
- Límite de 4 bloques (20 fases); después gana quien conserve más % de casco (`tiempo`).

## Espacio
- Plano continuo. Cada nave tiene posición y **rumbo en pasos de 45°**. Empiezan cara a cara a 12 u (con desvío aleatorio).
- Bandas: Contacto < 2 u ≤ Cerca < 5 ≤ Media < 9 ≤ Lejos. Distancia máxima 15 u: más allá los auspex siguen fijados (no se puede huir solo alejándose; para escapar está el salto).
- **Máquinas**: parar (0,5 u, gira 45° extra), avante (velocidad de la flota), **avante toda** (velocidad + empuje extra, sin girar y con el fuego a la mitad) para dar caza o escapar.
- **Timón**: giro fijo (45°/90° a babor o estribor, según agilidad) o una **intención** que se resuelve al ejecutar la fase según dónde esté el enemigo: *Encarar* (proa hacia él), *Costado* (presentar la andanada), *Alejarse* (darle la espalda), *Recto*. Las intenciones hacen que el plan de 5 fases siga teniendo sentido aunque el rival maniobre.
- Orden de cada fase: torpedos en vuelo → saltos → giros y movimiento simultáneos (embestidas) → disparo → reparación.

## Arcos de fuego
- Cada flota tiene tablas de daño por distancia para **proa**, **costados** (babor y estribor, simétricos) y **popa**.
- El ángulo del enemigo respecto a nuestra proa reparte el disparo entre arcos con transiciones suaves de 30° (proa pura hasta ±30°, costado puro de 60° a 120°, popa pura desde 150°). No hay ángulo mágico: entre dos arcos se mezclan.
- Defensa por arco: `proa × blindaje de proa` (Imperio 0,7, Tau 0,65…), costados ×1, `popa × debilidad` (×1,2–1,5). Atacar la popa del rival es clave; darle la tuya, letal.
- Necrones: armas en todos los arcos. Votann: también algo de popa.
- **Torpedos**: solo por la proa (enemigo a ±45°). Llegan en la fase siguiente; en Cerca/Contacto al instante y más difíciles de esquivar. Luego hay que recargar.
- **Embestir**: avante toda en línea recta; exige tener al enemigo a proa (±45°) y pasar a menos de 2 u durante el movimiento. Deja las naves trabadas en Contacto.
- Escudos: absorben su valor de cada disparo, nunca más de la mitad. Esquiva: contra torpedos y embestidas, y reduce el disparo un 1 % por cada 2 %. Aeldari −30 % en Media/Lejos; Drukhari −35 % de todo el disparo (campos de sombras).
- Salto disforme instantáneo con riesgo (70 % + Puente/Astropático + flota − 40 % × daño; demonios 100 %); salto de emergencia por umbral de casco; nave a 0 = reinicio del perfil.

## Flotas
| Flota | Vel.+empuje | Giro | Proa [C,Ce,M,L] | Costados | Popa | Escudos | Blindaje proa / debilidad popa | Esquiva | Torpedos | Embestida | Rasgo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| imperium | 3+3 | 45° | [3, 4, 3, 3] | [4, 4, 2, 1] | — | 1 | 0.7 / 1.4 | 15 % | 4 | 8 | Proa blindada |
| chaos | 4+3 | 45° | [2, 2, 2, 2] | [4, 5, 5, 4] | — | 1 | 1 / 1.4 | 20 % | 3 | 4 | Andanadas de largo alcance |
| tau | 3+2 | 45° | [2, 3, 5, 6] | [1, 2, 2, 2] | — | 2 | 0.65 / 1.5 | 20 % | 4 | 2 | Deflector frontal |
| aeldari | 5+2 | 90° | [3, 5, 5, 3] | [2, 2, 2, 1] | — | 0 | 1 / 1.3 | 35 % | 3 | 2 | Velas solares |
| drukhari | 5+2 | 90° | [10, 7, 4, 1] | [3, 3, 1, 0] | — | 1 | 1 / 1.3 | 50 % | 4 | 3 | Incursión esclavista |
| orks | 3+4 | 45° | [8, 5, 2, 1] | [6, 4, 2, 0] | — | 1 | 0.8 / 1.4 | 10 % | 4 | 12 | ¡Más dakka! |
| necrons | 2+2 | 45° | [4, 3, 2, 2] | [4, 3, 2, 2] | [4, 3, 2, 2] | 0 | 1 / 1 | 10 % | 3 | 6 | Reanimación |
| tyranids | 3+3 | 45° | [6, 4, 2, 0] | [4, 3, 1, 0] | — | 0 | 0.8 / 1.3 | 10 % | 4 | 7 | Bioregeneración |
| daemons | 4+2 | 90° | [7, 5, 3, 1] | [5, 5, 3, 2] | — | 1 | 1 / 1.3 | 35 % | 3 | 5 | Hijos de la disformidad |
| votann | 2+2 | 45° | [3, 3, 3, 3] | [2, 3, 2, 2] | [0, 1, 1, 0] | 1 | 0.8 / 1.2 | 10 % | 4 | 6 | Blindaje de vacío |
| genestealer | 3+3 | 45° | [3, 3, 2, 1] | [6, 5, 4, 1] | — | 1 | 1 / 1.4 | 20 % | 4 | 7 | Infiltración |

Módulos: Baterías +1 costados en Cerca/Media · Lanza de proa +1 proa en Media/Lejos · Cubierta de abordaje +1 en Contacto · Escudos +1 · Motores +1 velocidad cada 2 niveles · Blindaje de proa +2 embestida, −1 daño de embestida y −5 % daño por proa · Forja +1 reparación · Puente y Astropático +5 % salto.

## Segundo al mando
- Lee la geometría: a qué lado está el enemigo, en qué arco nuestro y en qué arco suyo estamos, velocidades con y sin avante toda, giro.
- Posturas (Al abordaje / Nuestra distancia / Resistir): rellena el plan eligiendo en cada fase la combinación de máquinas e intención de timón que maximiza nuestro daño menos el suyo (suponiendo que el rival mantiene rumbo) y la acción adecuada.
- Avisa: torpedos sin enemigo a proa, embestidas imposibles, dar la popa, disparar con un arco débil, avante toda que reduce el fuego… Y suplica el salto con el casco bajo el 35 %.

## Interfaz
- Auspex en el marco de nuestra nave (proa arriba): cuñas azules con el daño de cada arco a la distancia actual, enemigo con su rumbo y conos rojos de sus arcos, brújula, torpedos en vuelo y silueta discontinua con la posición prevista de la fase elegida.
- Planificador por fases (chips con banda y daño previsto nuestro/suyo; editor de máquinas, timón y acción).
- Repetición con efectos de partículas (lanzas, andanadas, torpedos con estela, escudos, explosiones, embestidas, saltos, motores) y sonido por capas con panorama estéreo (lo que viene por estribor suena a la derecha). Ver `docs/biblioteca-sonido.md`.

## Equilibrio (IA contra IA, 100 duelos por pareja y lado, módulos a 0)
```
Media por flota:
imperium     53.5%
chaos        49.5%
tau          50.2%
aeldari      47.8%
drukhari     54.6%
orks         45.1%
necrons      53.5%
tyranids     49.2%
daemons      51.6%
votann       51.5%
genestealer  43.5%
Desenlaces: {
  salto: "43.5%",
  destruida: "48.0%",
  tiempo: "8.5%",
} fases medias 12.8 bloques medios 2.94
Parejas más desequilibradas:
necrons vs tau             83%
chaos vs tau               21%
aeldari vs necrons         23%
necrons vs tyranids        24%
tau vs votann              27%
chaos vs orks              72%
chaos vs tyranids          72%
necrons vs orks            29%
drukhari vs tyranids       71%
chaos vs drukhari          30%
```

Código: `src/lib/naval3/` (motor, Segundo, narración, servidor), `src/components/ship/duel/` (Duel, Radar, fx, stage, SoundControls), `src/lib/sfx/`, simuladores `scripts/naval3-sim.ts` y `scripts/naval3-one.ts`.
