-- Combate espacial: la aproximación depende de dónde estén las naves y solo el combate bloquea.
-- · Mismo planeta: 5 min + 1 h por cada zona de desembarco del defensor en ese planeta (máx. 4 h).
-- · Otro planeta: lo que dure el viaje (mínimo 5 min).
-- · Durante la aproximación nadie queda bloqueado (mejoras, obras, escoltas, desembarcos, ataques en tierra),
--   salvo que ninguna de las dos naves puede viajar a otro planeta ni verse envuelta en otro duelo.
-- · Al empezar el combate las obras en curso se pausan; al terminar, continúan donde se quedaron.

-- 1. Tiempo de aproximación
CREATE OR REPLACE FUNCTION public.naval_approach_seconds(_a text, _d text, _defender uuid) RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  SELECT CASE
    WHEN _a = _d THEN 300 + 3600 * least(4, (SELECT count(*)::int FROM public.regions r
                                             WHERE r.body_id = _d AND r.owner_id = _defender AND r.is_spaceport))
    ELSE greatest(300, public.travel_seconds(_a, _d))
  END
$$;
REVOKE ALL ON FUNCTION public.naval_approach_seconds(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.naval_approach_seconds(text, text, uuid) TO authenticated, service_role;

-- 2. Ocupada = en combate (bloquea obras, mejoras, escoltas…); enfrascada = aproximación o combate (bloquea viajar y otro duelo)
CREATE OR REPLACE FUNCTION public.ship_busy(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS(SELECT 1 FROM public.naval_raids WHERE status = 'enfrentado' AND _uid IN (attacker_id, defender_id)) $$;

CREATE OR REPLACE FUNCTION public.ship_engaged(_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$ SELECT EXISTS(SELECT 1 FROM public.naval_raids WHERE status IN ('pendiente','enfrentado') AND _uid IN (attacker_id, defender_id)) $$;
REVOKE ALL ON FUNCTION public.ship_engaged(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ship_engaged(uuid) TO service_role;

-- 3. El defensor (y el atacante) quedan anclados durante la aproximación
CREATE OR REPLACE FUNCTION public.ship_set_course(_body text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s public.ships; secs int; eta timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  PERFORM public.ship_travel_tick();
  IF NOT EXISTS (SELECT 1 FROM public.celestial_bodies WHERE id = _body) THEN RAISE EXCEPTION 'bad body'; END IF;
  SELECT * INTO s FROM public.ships WHERE user_id = uid FOR UPDATE;
  IF s.user_id IS NULL THEN RAISE EXCEPTION 'no ship'; END IF;
  IF s.body_id IS NULL THEN RAISE EXCEPTION 'in warp'; END IF;
  IF s.body_id = _body THEN RAISE EXCEPTION 'already there'; END IF;
  IF public.ship_engaged(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  secs := public.travel_seconds(s.body_id, _body);
  eta := now() + make_interval(secs => secs);
  UPDATE public.ships SET travel_from = body_id, body_id = NULL, arrives_at = eta WHERE user_id = uid;
  INSERT INTO public.ship_travel_private (user_id, destination) VALUES (uid, _body)
    ON CONFLICT (user_id) DO UPDATE SET destination = EXCLUDED.destination, started_at = now();
  RETURN eta;
END $$;

-- 4. Pausa y reanudación de las obras durante el combate
ALTER TABLE public.ships ADD COLUMN IF NOT EXISTS works_paused_at timestamptz;

CREATE OR REPLACE FUNCTION public.ship_pause_works(_uid uuid) RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
  AS $$ UPDATE public.ships SET works_paused_at = now() WHERE user_id = _uid AND works_paused_at IS NULL $$;

CREATE OR REPLACE FUNCTION public.ship_resume_works(_uid uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
DECLARE d interval;
BEGIN
  SELECT now() - works_paused_at INTO d FROM public.ships WHERE user_id = _uid AND works_paused_at IS NOT NULL FOR UPDATE;
  IF d IS NULL THEN RETURN; END IF;
  UPDATE public.build_queue SET started_at = started_at + d, finishes_at = finishes_at + d
    WHERE user_id = _uid AND started_at IS NOT NULL;
  UPDATE public.ship_modules SET building_until = building_until + d WHERE user_id = _uid AND building_until IS NOT NULL;
  UPDATE public.ship_modules SET damaged_until = damaged_until + d WHERE user_id = _uid AND damaged_until IS NOT NULL;
  UPDATE public.ships SET hull_repair_until = hull_repair_until + d WHERE user_id = _uid AND hull_repair_until IS NOT NULL;
  UPDATE public.ships SET works_paused_at = NULL WHERE user_id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.ship_pause_works(uuid), public.ship_resume_works(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ship_pause_works(uuid), public.ship_resume_works(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.naval_combat_works() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $$
BEGIN
  IF NEW.status = 'enfrentado' AND OLD.status IS DISTINCT FROM 'enfrentado' THEN
    PERFORM public.ship_pause_works(NEW.attacker_id);
    PERFORM public.ship_pause_works(NEW.defender_id);
  ELSIF OLD.status = 'enfrentado' AND NEW.status NOT IN ('pendiente', 'enfrentado') THEN
    PERFORM public.ship_resume_works(NEW.attacker_id);
    PERFORM public.ship_resume_works(NEW.defender_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS naval_combat_works ON public.naval_raids;
CREATE TRIGGER naval_combat_works AFTER UPDATE OF status ON public.naval_raids
  FOR EACH ROW EXECUTE FUNCTION public.naval_combat_works();

-- 5. Declarar una ofensiva: aproximación según la posición y sin exigir que no haya obras
CREATE OR REPLACE FUNCTION public.declare_raid3(_defender uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();rid uuid;bal integer;a_since timestamptz;a_body text;d_body text;secs int;approach int;BEGIN
 IF uid IS NULL OR _defender IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;IF uid=_defender THEN RAISE EXCEPTION 'self';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_travel_tick();PERFORM public.resolve_raids();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND approved AND oath_sworn_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_defender AND approved AND oath_sworn_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden';END IF;
 IF (SELECT count(*) FROM public.ships WHERE user_id IN (uid,_defender))<>2 THEN RAISE EXCEPTION 'no ship';END IF;
 SELECT body_id INTO a_body FROM public.ships WHERE user_id=uid;SELECT body_id INTO d_body FROM public.ships WHERE user_id=_defender;
 IF a_body IS NULL OR d_body IS NULL THEN RAISE EXCEPTION 'in warp';END IF;
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

-- 6. En la lista de objetivos, «ocupada» incluye la aproximación (no se puede atacar a quien ya está en un duelo)
CREATE OR REPLACE FUNCTION public.naval_raids_view() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE result jsonb;uid uuid:=auth.uid();fleet jsonb;BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM public.resolve_raids();SELECT COALESCE(jsonb_agg((to_jsonb(r)-'attacker_plan'-'defender_plan')||jsonb_build_object('own_plan',CASE WHEN r.attacker_id=uid THEN pp.attacker_plan ELSE pp.defender_plan END)),'[]') INTO result FROM (SELECT * FROM public.naval_raids WHERE uid IN(attacker_id,defender_id) ORDER BY created_at DESC LIMIT 50) r LEFT JOIN public.naval_private_plans pp ON pp.raid_id=r.id;SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',s.user_id,'busy',public.ship_engaged(s.user_id),'warp_until',public.ship_warp_until(s.user_id),'max_hull',public.ship_max_hull(s.user_id))),'[]') INTO fleet FROM public.ships s JOIN public.profiles p ON p.id=s.user_id WHERE p.approved AND p.oath_sworn_at IS NOT NULL;RETURN jsonb_build_object('raids',result,'fleet_status',fleet,'server_now',now());END $$;
