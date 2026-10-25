-- Módulo de asalto profundo (cápsulas de desembarco, Portal de la Telaraña, esporas micéticas, túneles…).
-- · Permite lanzar una toma neutral o un ataque contra una región NO vecina del planeta donde orbita la nave.
-- · Requisitos: nave en ese planeta, tu zona de desembarco allí y el módulo operativo con carga.
-- · Nunca contra una zona de desembarco (espaciopuerto) de ningún jugador.
-- · Una carga como máximo. La primera es gratis al construir el módulo (una sola vez por jugador).
-- · Recargar cuesta 2000 / 1500 / 1000 cr según el nivel (1/2/3) y tarda 24 h.
-- · La carga se gasta al lanzar el asalto, pase lo que pase (cancelado, perdido o ganado).
-- · Cuenta para el límite normal de una toma neutral y un ataque a jugador en curso.

-- 1. Módulo
INSERT INTO public.module_types (id, name, description, base_cost, base_hours, max_level, sort, active)
VALUES ('asalto_profundo', 'Asalto profundo',
  'Ataca o toma una región no vecina del planeta donde orbitas (nunca una zona de desembarco). 1 carga; la primera gratis. Recarga 24 h: 2000/1500/1000 cr según nivel.',
  200, 3, 3, 13, true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
  base_cost = EXCLUDED.base_cost, base_hours = EXCLUDED.base_hours, max_level = EXCLUDED.max_level,
  sort = EXCLUDED.sort, active = true;

-- 2. Estado de la carga
CREATE TABLE IF NOT EXISTS public.ship_deep_strike (
  user_id uuid PRIMARY KEY,
  charged boolean NOT NULL DEFAULT false,
  ready_at timestamptz,          -- recarga en curso: lista a esta hora
  free_used boolean NOT NULL DEFAULT false,
  last_used_at timestamptz
);
ALTER TABLE public.ship_deep_strike ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own deep strike" ON public.ship_deep_strike;
CREATE POLICY "own deep strike" ON public.ship_deep_strike FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.ship_deep_strike FROM anon;
GRANT SELECT ON public.ship_deep_strike TO authenticated;

ALTER TABLE public.region_attacks ADD COLUMN IF NOT EXISTS deep_strike boolean NOT NULL DEFAULT false;

-- Primera carga gratis al construir el nivel 1; al perder el módulo (desmantelar o nave destruida) se pierde la carga
CREATE OR REPLACE FUNCTION public.deep_strike_module_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
BEGIN
  IF NEW.module <> 'asalto_profundo' THEN RETURN NEW; END IF;
  IF NEW.level >= 1 AND COALESCE(OLD.level, 0) = 0 THEN
    INSERT INTO public.ship_deep_strike (user_id, charged, free_used) VALUES (NEW.user_id, true, true)
    ON CONFLICT (user_id) DO UPDATE
      SET charged = ship_deep_strike.charged OR NOT ship_deep_strike.free_used, free_used = true;
  ELSIF NEW.level = 0 AND COALESCE(OLD.level, 0) > 0 THEN
    UPDATE public.ship_deep_strike SET charged = false, ready_at = NULL WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deep_strike_module_change ON public.ship_modules;
CREATE TRIGGER deep_strike_module_change AFTER INSERT OR UPDATE OF level ON public.ship_modules
  FOR EACH ROW EXECUTE FUNCTION public.deep_strike_module_change();

-- ¿Tiene carga lista? (cierra la recarga si ya ha terminado)
CREATE OR REPLACE FUNCTION public.deep_strike_ready(_uid uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
BEGIN
  UPDATE public.ship_deep_strike SET charged = true, ready_at = NULL
    WHERE user_id = _uid AND NOT charged AND ready_at IS NOT NULL AND ready_at <= now();
  RETURN COALESCE((SELECT charged FROM public.ship_deep_strike WHERE user_id = _uid), false);
END $$;
REVOKE ALL ON FUNCTION public.deep_strike_ready(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.deep_strike_cost(_level integer) RETURNS integer
  LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN _level >= 3 THEN 1000 WHEN _level = 2 THEN 1500 ELSE 2000 END $$;

-- 3. Estado para la interfaz
CREATE OR REPLACE FUNCTION public.deep_strike_status() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
DECLARE uid uuid := auth.uid(); d public.ship_deep_strike; lvl integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.deep_strike_ready(uid);
  SELECT * INTO d FROM public.ship_deep_strike WHERE user_id = uid;
  lvl := public.mod_level(uid, 'asalto_profundo');
  RETURN jsonb_build_object(
    'level', COALESCE((SELECT level FROM public.ship_modules WHERE user_id = uid AND module = 'asalto_profundo'), 0),
    'operational', lvl > 0,
    'charged', COALESCE(d.charged, false),
    'ready_at', d.ready_at,
    'cost', public.deep_strike_cost(lvl),
    'last_used_at', d.last_used_at,
    'server_now', now());
END $$;
REVOKE ALL ON FUNCTION public.deep_strike_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deep_strike_status() TO authenticated;

-- 4. Recargar
CREATE OR REPLACE FUNCTION public.deep_strike_recharge() RETURNS timestamptz
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
DECLARE uid uuid := auth.uid(); lvl integer; price integer; bal integer; eta timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  lvl := public.mod_level(uid, 'asalto_profundo');
  IF lvl < 1 THEN RAISE EXCEPTION 'deep strike unavailable'; END IF;
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  IF public.deep_strike_ready(uid) THEN RAISE EXCEPTION 'already charged'; END IF;
  IF (SELECT ready_at FROM public.ship_deep_strike WHERE user_id = uid) IS NOT NULL THEN RAISE EXCEPTION 'recharging'; END IF;
  price := public.deep_strike_cost(lvl);
  SELECT imperial_credits INTO bal FROM public.profiles WHERE id = uid FOR UPDATE;
  IF COALESCE(bal, 0) < price THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  UPDATE public.profiles SET imperial_credits = imperial_credits - price WHERE id = uid;
  eta := now() + interval '24 hours';
  INSERT INTO public.ship_deep_strike (user_id, charged, ready_at, free_used) VALUES (uid, false, eta, true)
  ON CONFLICT (user_id) DO UPDATE SET ready_at = eta;
  RETURN eta;
END $$;
REVOKE ALL ON FUNCTION public.deep_strike_recharge() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deep_strike_recharge() TO authenticated;

-- 5. Saltarse la vecindad solo dentro de un asalto profundo (marca local de la transacción)
DO $$
DECLARE src text; changed text;
BEGIN
  src := pg_get_functiondef('public.claim_region(integer, text)'::regprocedure);
  changed := replace(src,
    'IF NOT EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND _region = ANY(neighbors)) THEN RAISE EXCEPTION ''not adjacent''; END IF;',
    'IF current_setting(''atalaya.deep_strike'', true) IS DISTINCT FROM ''on'' AND NOT EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND _region = ANY(neighbors)) THEN RAISE EXCEPTION ''not adjacent''; END IF;');
  IF changed = src AND position('atalaya.deep_strike' in src) = 0 THEN
    RAISE EXCEPTION 'claim_region no tiene la comprobación de vecindad esperada';
  END IF;
  IF changed <> src THEN EXECUTE changed; END IF;
END $$;

-- 6. Lanzar el asalto profundo
CREATE OR REPLACE FUNCTION public.deep_strike_region(_region integer, _kind text DEFAULT NULL, _points integer DEFAULT NULL, _list uuid DEFAULT NULL)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
DECLARE uid uuid := auth.uid(); r public.regions; op uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 1));
  IF public.mod_level(uid, 'asalto_profundo') < 1 THEN RAISE EXCEPTION 'deep strike unavailable'; END IF;
  IF NOT public.deep_strike_ready(uid) THEN RAISE EXCEPTION 'deep strike not charged'; END IF;
  SELECT * INTO r FROM public.regions WHERE id = _region;
  IF r.id IS NULL THEN RAISE EXCEPTION 'bad region'; END IF;
  IF r.is_spaceport THEN RAISE EXCEPTION 'deep strike spaceport'; END IF;
  IF r.owner_id = uid THEN RAISE EXCEPTION 'own region'; END IF;
  IF (SELECT body_id FROM public.ships WHERE user_id = uid) IS DISTINCT FROM r.body_id THEN RAISE EXCEPTION 'ship not here'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND body_id = r.body_id AND is_spaceport) THEN RAISE EXCEPTION 'not landed'; END IF;
  IF EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND _region = ANY(neighbors)) THEN RAISE EXCEPTION 'deep strike adjacent'; END IF;

  UPDATE public.ship_deep_strike SET charged = false, ready_at = NULL, last_used_at = now() WHERE user_id = uid;
  PERFORM set_config('atalaya.deep_strike', 'on', true);
  IF r.owner_id IS NULL THEN
    PERFORM public.claim_region(_region, 'batalla');
  ELSE
    PERFORM public.wh40k_attack_region(_region, COALESCE(_kind, 'normal'), _points, _list);
  END IF;
  PERFORM set_config('atalaya.deep_strike', 'off', true);

  UPDATE public.region_attacks SET deep_strike = true
    WHERE region_id = _region AND attacker_id = uid AND resolved_at IS NULL
    RETURNING id INTO op;
  RETURN op;
END $$;
REVOKE ALL ON FUNCTION public.deep_strike_region(integer, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deep_strike_region(integer, text, integer, uuid) TO authenticated;
