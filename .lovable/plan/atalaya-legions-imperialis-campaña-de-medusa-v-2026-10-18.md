# Atalaya Legions Imperialis — Campaña de Medusa V

Compañero de juego para Legions Imperialis con capa de rol persistente. Las batallas con miniaturas reales siguen siendo el núcleo; la app añade renombre, medallas, habilidades y una nave propia que viaja por Medusa V.

## Identidad
- Nombre: **Atalaya Legions Imperialis**.
- Logo: el dragón y la torre del club Atalaya Vigía, rehecho al estilo de la Herejía de Horus (metal grabado, aquila, cráneo del Mechanicum, verde fósforo sobre negro). Se usará también como icono de la pestaña.

## Estética
- Terminal del Mechanicum: fondo negro, todo en verde fósforo, tipografía monoespaciada, líneas de escaneo.
- Modo claro opcional (interruptor guardado por usuario).
- Al entrar: "carga de datos" tipo Matrix (lluvia de caracteres, líneas de log) que termina mostrando **GLORIA AL OMNISSIAH**.

## Moneda
- Un único recurso: **Créditos Imperiales**. Se ganan con batallas registradas, misiones y logros; se gastan en unidades, habilidades, bombardeos y mejoras de la nave.

## Fases

### Fase 1 — Acceso y juramento
- Lovable Cloud: cuentas (email + Google), base de datos y almacenamiento de imágenes.
- Pantalla de carga Matrix + Gloria al Omnissiah.
- Creación de comandante, paso a paso y solemne:
  1. Subir imagen del líder de tu legión (obligatoria).
  2. Juramento: **El Emperador** o **Horus y los Poderes Ruinosos** (definitivo).
  3. Facción disponible para ese bando (Legiones Astartes, Solar Auxilia, Mechanicum, Titanicum, Knights… según los manuales).
  4. Si es Astartes: elegir Legión (solo las de ese bando).
  5. Nombre de la fuerza y del líder.
- Puente de mando: perfil, créditos, renombre, medallas.

### Fase 2 — Datos de reglas y listas
- Extraer de tus 5 manuales facciones, unidades, perfiles, armas, reglas especiales y costes.
- Colección personal y creador de listas con validación de puntos y destacamentos.

### Fase 3 — Escenarios y batalla
- Generador de escenarios (misiones y despliegues de los manuales).
- Asistente de batalla por fases, fichas de daño, calculadora, marcador.
- Registrar resultado contra otro jugador: da créditos, renombre y medallas.

### Fase 4 — La nave
- Nave propia con nombre, en órbita sobre Medusa V.
- Mapa de Medusa V por regiones; la nave se desplaza entre ellas con tiempo real de viaje.
- Mejoras de la nave con créditos (hangares, armamento, sensores).
- Llamar unidades y desplegar ejércitos en la región bajo la nave.

### Fase 5 — Progresión y rol
- Renombre y rangos, medallas por logros.
- Habilidades de un solo uso para unidades o líderes, aplicables en la siguiente batalla.
- Bombardeos orbitales comprables y usables en batalla.
- Aventuras/expediciones en regiones de Medusa V con recompensas.

## Primer paso
Fase 1 completa y extracción de datos de los manuales (Fase 2).

## Detalles técnicos
- TanStack Start + Lovable Cloud (auth, Postgres con RLS por usuario, bucket privado para retratos de líderes).
- Tablas: profiles (alianza, facción, legión, nombre, retrato, créditos, renombre), factions, legions, unit_profiles, weapons, special_rules, army_lists, list_entries, scenarios, battles, medals, abilities, ship, ship_upgrades, regions, ship_travel, expeditions, credit_ledger.
- Alianza bloqueada tras el juramento (sin edición desde la app).
- Viajes y expediciones con marcas de tiempo resueltas al leer.
- Créditos movidos solo en funciones de servidor con registro de movimientos.
- Datos de reglas privados (contenido con copyright).
