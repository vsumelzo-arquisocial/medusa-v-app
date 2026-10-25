-- Página Nave renovada: módulos al servicio del combate e ingresos de todos los planetas conquistados.
-- · Puente: +3 de casco máximo por nivel (además de ranuras, nivel máximo del resto y +50 créditos diarios).
-- · Motores: −10 % de tiempo de viaje y de aproximación a otro planeta por nivel.
-- · Arma de proa pasa a Tubos de torpedos (se conservan los niveles construidos).
-- · Antena (astropático): además del reclutamiento, reduce ⅓ por nivel la pérdida por distancia.
-- · Regiones: cuentan las de TODOS los planetas conquistados, ponderadas por la distancia a la nave:
--     mismo planeta o sus lunas 100 %; cada órbita de distancia −15 % (máx. −75 %), × (1 − antena/3).
-- · Minas: +40 créditos diarios fijos por mina (ponderados por distancia), sin tope.
-- · Resto de regiones: 0,10 con 1 región equivalente, 0,15 con 2 y 0,20 con 3 o más (lineal entre medias).

-- 1. Módulos
UPDATE public.module_types SET name = 'Puente de mando',
  description = '2 + 2 ranuras y +3 de casco máximo por nivel; limita el nivel del resto de módulos; +50 créditos diarios por nivel.'
  WHERE id = 'puente';
UPDATE public.module_types SET name = 'Motores',
  description = '+1 de velocidad en combate cada 2 niveles; −10 % de tiempo de viaje entre planetas y de aproximación por nivel.'
  WHERE id = 'motores_plasma';
UPDATE public.module_types SET name = 'Tubos de torpedos',
  description = '+1 torpedo por salva y −5 % de esquiva enemiga contra tus torpedos por nivel.'
  WHERE id = 'lanza_proa';
UPDATE public.module_types SET name = 'Baterías navales',
  description = '+1 de daño de andanada a distancia corta y media por nivel; refuerza los cañones de proa.'
  WHERE id = 'baterias';
UPDATE public.module_types SET name = 'Blindaje',
  description = '−6 % de daño recibido por nivel y embestidas más fuertes.'
  WHERE id = 'blindaje_proa';
UPDATE public.module_types SET name = 'Generador de escudos',
  description = '+1 de escudo por nivel.'
  WHERE id = 'camara_escudos';
UPDATE public.module_types SET name = 'Cubierta de abordaje',
  description = '+10 % de éxito al abordar y +1 de daño a contacto por nivel; a nivel 3, +1 carga de abordaje.'
  WHERE id = 'cubierta_abordaje';
UPDATE public.module_types SET name = 'Antena astropática',
  description = '−10 % de tiempo de reclutamiento y −⅓ de pérdida por distancia de tus regiones lejanas por nivel.'
  WHERE id = 'astropatico';

-- 2. Distancia nave ↔ región
CREATE OR REPLACE FUNCTION public.region_factor(_uid uuid, _body text) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT CASE WHEN here.orbit IS NULL OR there.orbit IS NULL THEN 0.25
    ELSE 1 - least(0.75, 0.15 * abs(here.orbit - there.orbit))
             * (1 - least(3, public.mod_level(_uid, 'astropatico')) / 3.0) END::numeric
  FROM (SELECT b.orbit FROM public.ships s
          LEFT JOIN public.celestial_bodies b ON b.id = COALESCE(s.body_id, s.travel_from)
        WHERE s.user_id = _uid) here
  LEFT JOIN public.celestial_bodies there ON there.id = _body
$$;

-- Regiones equivalentes de un tipo (suma de los factores de distancia)
CREATE OR REPLACE FUNCTION public.region_reach(_uid uuid, _type text) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT COALESCE(sum(public.region_factor(_uid, r.body_id)), 0)::numeric
  FROM public.regions r WHERE r.owner_id = _uid AND r.type = _type
$$;

CREATE OR REPLACE FUNCTION public.region_rate(_uid uuid, _type text) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT round(CASE WHEN w <= 0 THEN 0 WHEN w < 1 THEN 0.10 * w ELSE least(0.20, 0.05 + 0.05 * w) END, 4)::numeric
  FROM (SELECT public.region_reach(_uid, _type) w) x
$$;

-- 3. Ingresos diarios
CREATE OR REPLACE FUNCTION public.daily_income_amount(_uid uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT (100 + 50 * public.mod_level(_uid, 'puente') + floor(40 * public.region_reach(_uid, 'mina')))::int $$;

CREATE OR REPLACE FUNCTION public.daily_income_status()
  RETURNS TABLE(amount integer, next_collection_at timestamp with time zone, server_now timestamp with time zone)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT public.daily_income_amount(auth.uid()), s.last_income_at + interval '24 hours', now()
  FROM public.ships s WHERE s.user_id = auth.uid() AND auth.uid() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.collect_daily_income() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
DECLARE uid uuid := auth.uid(); s public.ships; reward integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  PERFORM public.ship_tick();
  SELECT * INTO s FROM public.ships WHERE user_id = uid FOR UPDATE;
  IF s.user_id IS NULL THEN RAISE EXCEPTION 'No tienes nave'; END IF;
  IF now() < s.last_income_at + interval '24 hours' THEN RAISE EXCEPTION 'Debes esperar 24 horas entre recogidas'; END IF;
  reward := public.daily_income_amount(uid);
  UPDATE public.profiles SET imperial_credits = imperial_credits + reward WHERE id = uid;
  UPDATE public.ships SET last_income_at = now() WHERE user_id = uid;
  RETURN reward;
END $$;

-- Desglose para la página Nave: base, puente, cada región con su planeta y factor, y bonificaciones.
CREATE OR REPLACE FUNCTION public.income_breakdown() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT jsonb_build_object(
    'base', 100,
    'bridge', 50 * public.mod_level(auth.uid(), 'puente'),
    'mine_credits', 40,
    'antenna', least(3, public.mod_level(auth.uid(), 'astropatico')),
    'total', public.daily_income_amount(auth.uid()),
    'ship_body', (SELECT COALESCE(s.body_id, s.travel_from) FROM public.ships s WHERE s.user_id = auth.uid()),
    'regions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'type', r.type, 'body_id', r.body_id,
                                          'factor', round(public.region_factor(auth.uid(), r.body_id), 4))
                       ORDER BY r.body_id, r.id)
      FROM public.regions r WHERE r.owner_id = auth.uid() AND r.type <> 'yermo'), '[]'),
    'rates', (SELECT jsonb_object_agg(t, public.region_rate(auth.uid(), t))
              FROM unnest(ARRAY['forja','dique','arsenal','colmena','puerto','bastion']) t))
  WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.income_breakdown() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.income_breakdown() TO authenticated;
REVOKE ALL ON FUNCTION public.region_factor(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.region_reach(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_income_amount(uuid) FROM PUBLIC, anon, authenticated;

-- 4. Puente: +3 de casco por nivel (las naves actuales reciben el casco extra, no quedan dañadas)
UPDATE public.ships s SET hull_hp = s.hull_hp + 3 * m.level
  FROM public.ship_modules m
  WHERE m.user_id = s.user_id AND m.module = 'puente' AND m.level > 0 AND s.hull_hp IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ship_max_hull(_uid uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT public.ship_base_hull(_uid)
    + 8 * COALESCE((SELECT level FROM public.ship_modules WHERE user_id = _uid AND module = 'casco'), 0)
    + 3 * COALESCE((SELECT level FROM public.ship_modules WHERE user_id = _uid AND module = 'puente'), 0) $$;

-- 5. Motores: viajes y aproximaciones más cortos
CREATE OR REPLACE FUNCTION public.travel_seconds_for(_uid uuid, _a text, _b text) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT round(public.travel_seconds(_a, _b) * (1 - 0.10 * least(3, public.mod_level(_uid, 'motores_plasma'))))::int $$;
REVOKE ALL ON FUNCTION public.travel_seconds_for(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.travel_seconds_for(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.naval_approach_seconds(_a text, _d text, _defender uuid, _attacker uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT CASE
    WHEN _a = _d THEN 300 + 3600 * least(4, (SELECT count(*)::int FROM public.regions r
                                             WHERE r.body_id = _d AND r.owner_id = _defender AND r.is_spaceport))
    ELSE greatest(300, public.travel_seconds_for(_attacker, _a, _d))
  END
$$;
REVOKE ALL ON FUNCTION public.naval_approach_seconds(text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.naval_approach_seconds(text, text, uuid, uuid) TO authenticated, service_role;

-- Sustituye las llamadas en las funciones actuales (viajar y declarar combate) sin reescribirlas a mano
DO $$
DECLARE f record; src text; changed text;
BEGIN
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('ship_set_course', 'declare_raid', 'declare_raid2') LOOP
    src := pg_get_functiondef(f.oid);
    changed := replace(src, 'public.travel_seconds(s.body_id, _body)', 'public.travel_seconds_for(uid, s.body_id, _body)');
    changed := replace(changed, 'public.travel_seconds(a_body,d_body)', 'public.travel_seconds_for(uid,a_body,d_body)');
    changed := replace(changed, 'public.naval_approach_seconds(a_body,d_body,_defender)', 'public.naval_approach_seconds(a_body,d_body,_defender,uid)');
    IF changed <> src THEN
      EXECUTE changed;
      RAISE NOTICE 'Actualizada %', f.proname;
    END IF;
  END LOOP;
END $$;
