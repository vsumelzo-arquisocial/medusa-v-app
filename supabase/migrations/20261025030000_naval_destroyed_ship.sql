-- Combate naval: la nave destruida ya no reinicia el perfil, abordajes y secciones averiadas.
-- · Nave destruida: módulos a nivel 0, escoltas y obras perdidas, casco al máximo y 24 h de astillero.
--   Conquistas, créditos, unidades y regiones siguen igual. Durante el astillero no hay ofensivas navales ni viajes.
-- · Las secciones que queden fuera de combate en un duelo se guardan como módulos averiados (repararlos en Ingeniería).

ALTER TABLE public.ships ADD COLUMN IF NOT EXISTS rebuild_until timestamptz;

-- 1. Nave en astillero = ocupada (no viaja, no ataca ni puede ser atacada)
CREATE OR REPLACE FUNCTION public.ship_engaged(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS(SELECT 1 FROM public.naval_raids WHERE status IN ('pendiente','enfrentado') AND _uid IN (attacker_id, defender_id))
         OR EXISTS(SELECT 1 FROM public.ships WHERE user_id = _uid AND rebuild_until > now()) $$;

-- 2. Destrucción de la nave
CREATE OR REPLACE FUNCTION public.ship_destroyed(_uid uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(72401020);
  DELETE FROM public.build_queue WHERE user_id = _uid;
  DELETE FROM public.ship_modules WHERE user_id = _uid;
  DELETE FROM public.ship_escorts WHERE user_id = _uid;
  UPDATE public.ships
     SET hull_hp = public.ship_max_hull(_uid), hull_repair_until = NULL, hull_repair_target = NULL,
         works_paused_at = NULL, rebuild_until = now() + interval '24 hours'
   WHERE user_id = _uid;
END $$;

-- 3. Secciones averiadas en el duelo → módulos averiados
CREATE OR REPLACE FUNCTION public.naval_mark_damaged(_uid uuid, _modules text[]) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
  AS $$
  INSERT INTO public.ship_modules(user_id, module, level, damaged)
  SELECT _uid, m, 0, true FROM unnest(_modules) AS m
  ON CONFLICT (user_id, module) DO UPDATE SET damaged = true
$$;

REVOKE ALL ON FUNCTION public.ship_destroyed(uuid), public.naval_mark_damaged(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ship_destroyed(uuid), public.naval_mark_damaged(uuid, text[]) TO service_role;

-- 4. Estado de cada bando al empezar el duelo: también los módulos averiados
CREATE OR REPLACE FUNCTION public.naval3_side(_uid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'fleet', public.ship_fleet(_uid),
    'hull', COALESCE((SELECT hull_hp FROM public.ships WHERE user_id = _uid), public.ship_max_hull(_uid)),
    'max_hull', public.ship_max_hull(_uid),
    'damaged', COALESCE((SELECT jsonb_agg(module) FROM public.ship_modules WHERE user_id = _uid AND damaged), '[]'::jsonb),
    'modules', jsonb_build_object(
      'baterias', public.mod_level(_uid,'baterias'), 'camara_escudos', public.mod_level(_uid,'camara_escudos'),
      'cubierta_abordaje', public.mod_level(_uid,'cubierta_abordaje'), 'motores_plasma', public.mod_level(_uid,'motores_plasma'),
      'lanza_proa', public.mod_level(_uid,'lanza_proa'), 'blindaje_proa', public.mod_level(_uid,'blindaje_proa'),
      'forja', public.mod_level(_uid,'forja'), 'puente', public.mod_level(_uid,'puente'), 'astropatico', public.mod_level(_uid,'astropatico'))) $$;
REVOKE ALL ON FUNCTION public.naval3_side(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.naval3_side(uuid) TO service_role;

-- 5. Declarar ofensiva: ninguna de las dos naves puede estar en el astillero
CREATE OR REPLACE FUNCTION public.declare_raid3(_defender uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();rid uuid;bal integer;a_since timestamptz;a_body text;d_body text;secs int;approach int;BEGIN
 IF uid IS NULL OR _defender IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;IF uid=_defender THEN RAISE EXCEPTION 'self';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_travel_tick();PERFORM public.resolve_raids();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND approved AND oath_sworn_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_defender AND approved AND oath_sworn_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden';END IF;
 IF (SELECT count(*) FROM public.ships WHERE user_id IN (uid,_defender))<>2 THEN RAISE EXCEPTION 'no ship';END IF;
 SELECT body_id INTO a_body FROM public.ships WHERE user_id=uid;SELECT body_id INTO d_body FROM public.ships WHERE user_id=_defender;
 IF a_body IS NULL OR d_body IS NULL THEN RAISE EXCEPTION 'in warp';END IF;
 IF EXISTS(SELECT 1 FROM public.ships WHERE user_id IN (uid,_defender) AND rebuild_until>now()) THEN RAISE EXCEPTION 'rebuilding';END IF;
 IF public.ship_engaged(uid) OR public.ship_engaged(_defender) THEN RAISE EXCEPTION 'ship busy';END IF;
 IF public.ship_warp_until(_defender)>now() THEN RAISE EXCEPTION 'protected';END IF;
 IF EXISTS(SELECT 1 FROM public.ships WHERE user_id IN (uid,_defender) AND (hull_hp<=0 OR hull_repair_until IS NOT NULL)) THEN RAISE EXCEPTION 'repair or works';END IF;
 SELECT COALESCE(oath_sworn_at,'-infinity') INTO a_since FROM public.profiles WHERE id=uid;
 IF EXISTS(SELECT 1 FROM public.naval_raids WHERE attacker_id=uid AND status<>'anulado' AND created_at>greatest(now()-interval '24 hours',a_since)) THEN RAISE EXCEPTION 'daily';END IF;
 SELECT imperial_credits INTO bal FROM public.profiles WHERE id=uid FOR UPDATE;IF bal<100 THEN RAISE EXCEPTION 'credits';END IF;UPDATE public.profiles SET imperial_credits=imperial_credits-100 WHERE id=uid;
 secs:=public.travel_seconds(a_body,d_body);
 approach:=public.naval_approach_seconds(a_body,d_body,_defender);
 INSERT INTO public.naval_raids(attacker_id,defender_id,deadline,attacker_plan,defender_plan,engine_version) VALUES(uid,_defender,now()+make_interval(secs=>approach),'[]',NULL,3) RETURNING id INTO rid;INSERT INTO public.naval_private_plans(raid_id,attacker_plan,defender_plan) VALUES(rid,'null'::jsonb,NULL);
 IF secs>0 THEN
   UPDATE public.ships SET travel_from=body_id, body_id=NULL, arrives_at=now()+make_interval(secs=>secs) WHERE user_id=uid;
   INSERT INTO public.ship_travel_private(user_id,destination) VALUES(uid,d_body) ON CONFLICT (user_id) DO UPDATE SET destination=EXCLUDED.destination, started_at=now();
 END IF;
 RETURN rid;END $$;
REVOKE ALL ON FUNCTION public.declare_raid3(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_raid3(uuid) TO authenticated, service_role;

-- 6. Estado de flota con el fin del astillero
CREATE OR REPLACE FUNCTION public.naval_raids_view() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE result jsonb;uid uuid:=auth.uid();fleet jsonb;BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM public.resolve_raids();SELECT COALESCE(jsonb_agg((to_jsonb(r)-'attacker_plan'-'defender_plan')||jsonb_build_object('own_plan',CASE WHEN r.attacker_id=uid THEN pp.attacker_plan ELSE pp.defender_plan END)),'[]') INTO result FROM (SELECT * FROM public.naval_raids WHERE uid IN(attacker_id,defender_id) ORDER BY created_at DESC LIMIT 50) r LEFT JOIN public.naval_private_plans pp ON pp.raid_id=r.id;SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',s.user_id,'busy',public.ship_engaged(s.user_id),'warp_until',public.ship_warp_until(s.user_id),'max_hull',public.ship_max_hull(s.user_id),'rebuild_until',s.rebuild_until)),'[]') INTO fleet FROM public.ships s JOIN public.profiles p ON p.id=s.user_id WHERE p.approved AND p.oath_sworn_at IS NOT NULL;RETURN jsonb_build_object('raids',result,'fleet_status',fleet,'server_now',now());END $$;
