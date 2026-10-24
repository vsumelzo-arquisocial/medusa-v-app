-- Combate naval v2 (docs/combate-naval-v2.md): escoltas, estado del duelo y funciones de apoyo.
-- La resolución de los bloques v2 la hace el servidor de la app (TypeScript) con la clave de servicio.

-- 1. Columnas del duelo v2
ALTER TABLE public.naval_raids ADD COLUMN IF NOT EXISTS engine_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public.naval_raids ADD COLUMN IF NOT EXISTS duel_state jsonb;

-- 2. Escoltas
CREATE TABLE IF NOT EXISTS public.ship_escorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.ships(user_id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('fragatas','destructores','piquetes')),
  ships smallint NOT NULL DEFAULT 3 CHECK (ships BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ship_escorts_user_idx ON public.ship_escorts(user_id);
ALTER TABLE public.ship_escorts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own escorts" ON public.ship_escorts;
CREATE POLICY "own escorts" ON public.ship_escorts FOR SELECT TO authenticated USING (auth.uid() = user_id);
GRANT SELECT ON public.ship_escorts TO authenticated;
GRANT ALL ON public.ship_escorts TO service_role;

CREATE OR REPLACE FUNCTION public.escort_cost(_type text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _type WHEN 'fragatas' THEN 150 WHEN 'destructores' THEN 200 WHEN 'piquetes' THEN 120 END $$;

CREATE OR REPLACE FUNCTION public.build_escort(_type text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); cost integer := public.escort_cost(_type);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  IF cost IS NULL THEN RAISE EXCEPTION 'bad type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ships WHERE user_id = uid) THEN RAISE EXCEPTION 'no ship'; END IF;
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  IF (SELECT count(*) FROM public.ship_escorts WHERE user_id = uid) >= 3 THEN RAISE EXCEPTION 'escort slots'; END IF;
  IF (SELECT imperial_credits FROM public.profiles WHERE id = uid FOR UPDATE) < cost THEN RAISE EXCEPTION 'credits'; END IF;
  UPDATE public.profiles SET imperial_credits = imperial_credits - cost WHERE id = uid;
  INSERT INTO public.ship_escorts (user_id, type, ships) VALUES (uid, _type, 3);
END $$;

CREATE OR REPLACE FUNCTION public.reinforce_escort(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); e public.ship_escorts; cost integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  SELECT * INTO e FROM public.ship_escorts WHERE id = _id AND user_id = uid FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF e.ships >= 3 THEN RAISE EXCEPTION 'full'; END IF;
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  cost := ceil(public.escort_cost(e.type) * (3 - e.ships) / 3.0)::int;
  IF (SELECT imperial_credits FROM public.profiles WHERE id = uid FOR UPDATE) < cost THEN RAISE EXCEPTION 'credits'; END IF;
  UPDATE public.profiles SET imperial_credits = imperial_credits - cost WHERE id = uid;
  UPDATE public.ship_escorts SET ships = 3 WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.scrap_escort(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  DELETE FROM public.ship_escorts WHERE id = _id AND user_id = uid;
END $$;

-- 3. Datos de un bando para iniciar el duelo (solo servidor)
CREATE OR REPLACE FUNCTION public.naval2_side(_uid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'fleet', public.ship_fleet(_uid),
    'hull', COALESCE((SELECT hull_hp FROM public.ships WHERE user_id = _uid), public.ship_max_hull(_uid)),
    'max_hull', public.ship_max_hull(_uid),
    'modules', jsonb_build_object(
      'baterias', public.mod_level(_uid,'baterias'), 'camara_escudos', public.mod_level(_uid,'camara_escudos'),
      'cubierta_abordaje', public.mod_level(_uid,'cubierta_abordaje'), 'motores_plasma', public.mod_level(_uid,'motores_plasma'),
      'lanza_proa', public.mod_level(_uid,'lanza_proa'), 'blindaje_proa', public.mod_level(_uid,'blindaje_proa'),
      'forja', public.mod_level(_uid,'forja'), 'puente', public.mod_level(_uid,'puente'), 'astropatico', public.mod_level(_uid,'astropatico')),
    'escorts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'type', type, 'ships', ships) ORDER BY created_at) FROM public.ship_escorts WHERE user_id = _uid AND ships > 0), '[]'::jsonb)) $$;

-- 4. Averías de módulos por críticos activos al terminar (solo servidor)
CREATE OR REPLACE FUNCTION public.naval2_damage_modules(_uid uuid, _modules text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.ship_modules SET damaged = true, damaged_until = NULL
  WHERE user_id = _uid AND level > 0 AND module = ANY(_modules) $$;

-- 5. Declarar una ofensiva v2 (sin plan previo: se planifica por bloques)
CREATE OR REPLACE FUNCTION public.declare_raid2(_defender uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();rid uuid;bal integer;a_since timestamptz;a_body text;d_body text;secs int;BEGIN
 IF uid IS NULL OR _defender IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;IF uid=_defender THEN RAISE EXCEPTION 'self';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_travel_tick();PERFORM public.resolve_raids();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND approved AND oath_sworn_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_defender AND approved AND oath_sworn_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden';END IF;
 IF (SELECT count(*) FROM public.ships WHERE user_id IN (uid,_defender))<>2 THEN RAISE EXCEPTION 'no ship';END IF;
 SELECT body_id INTO a_body FROM public.ships WHERE user_id=uid;SELECT body_id INTO d_body FROM public.ships WHERE user_id=_defender;
 IF a_body IS NULL OR d_body IS NULL THEN RAISE EXCEPTION 'in warp';END IF;
 IF public.ship_busy(uid) OR public.ship_busy(_defender) THEN RAISE EXCEPTION 'ship busy';END IF;
 IF public.ship_warp_until(_defender)>now() THEN RAISE EXCEPTION 'protected';END IF;
 IF EXISTS(SELECT 1 FROM public.ships WHERE user_id IN (uid,_defender) AND (hull_hp<=0 OR hull_repair_until IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.ship_modules WHERE user_id IN (uid,_defender) AND (building_until IS NOT NULL OR damaged_until IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.build_queue WHERE user_id IN (uid,_defender)) THEN RAISE EXCEPTION 'repair or works';END IF;
 SELECT COALESCE(oath_sworn_at,'-infinity') INTO a_since FROM public.profiles WHERE id=uid;
 IF EXISTS(SELECT 1 FROM public.naval_raids WHERE attacker_id=uid AND status<>'anulado' AND created_at>greatest(now()-interval '24 hours',a_since)) THEN RAISE EXCEPTION 'daily';END IF;
 SELECT imperial_credits INTO bal FROM public.profiles WHERE id=uid FOR UPDATE;IF bal<100 THEN RAISE EXCEPTION 'credits';END IF;UPDATE public.profiles SET imperial_credits=imperial_credits-100 WHERE id=uid;
 secs:=public.travel_seconds(a_body,d_body);
 INSERT INTO public.naval_raids(attacker_id,defender_id,deadline,attacker_plan,defender_plan,engine_version) VALUES(uid,_defender,now()+interval '24 hours'+make_interval(secs=>secs),'[]',NULL,2) RETURNING id INTO rid;INSERT INTO public.naval_private_plans(raid_id,attacker_plan,defender_plan) VALUES(rid,'null'::jsonb,NULL);
 IF secs>0 THEN
   UPDATE public.ships SET travel_from=body_id, body_id=NULL, arrives_at=now()+make_interval(secs=>secs) WHERE user_id=uid;
   INSERT INTO public.ship_travel_private(user_id,destination) VALUES(uid,d_body) ON CONFLICT (user_id) DO UPDATE SET destination=EXCLUDED.destination, started_at=now();
 END IF;
 RETURN rid;END $$;

-- 6. Las funciones v1 ignoran los duelos v2
CREATE OR REPLACE FUNCTION public.resolve_raid(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r public.naval_raids;pp public.naval_private_plans;ap jsonb;dp jsonb;ahull integer;dhull integer;amax integer;dmax integer;ah integer;dh integer;ac integer;dc integer;aheal integer;dheal integer;oa text;od text;rounds jsonb;acrit jsonb;dcrit jsonb;a_total integer:=0;d_total integer:=0;ab integer;db integer;roll record;
BEGIN
 PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_id FOR UPDATE;IF r.id IS NULL OR r.status NOT IN ('pendiente','enfrentado') THEN RETURN;END IF;IF r.engine_version=2 THEN RETURN;END IF;IF r.status='pendiente' AND r.deadline>now() THEN RETURN;END IF;
 IF r.status='enfrentado' AND NOT(r.attacker_ready AND r.defender_ready) THEN IF r.deadline<=now() THEN PERFORM public.naval_finish(_id,CASE WHEN r.attacker_ready AND NOT r.defender_ready THEN 'atacante' ELSE 'defensor' END,'silencio');END IF;RETURN;END IF;
 SELECT * INTO pp FROM public.naval_private_plans WHERE raid_id=_id;ap:=public.naval_normal_plan(pp.attacker_plan,r.attacker_id);dp:=public.naval_normal_plan(COALESCE(pp.defender_plan,(SELECT plan FROM public.naval_stances WHERE user_id=r.defender_id)),r.defender_id);
 SELECT hull_hp INTO ahull FROM public.ships WHERE user_id=r.attacker_id FOR UPDATE;SELECT hull_hp INTO dhull FROM public.ships WHERE user_id=r.defender_id FOR UPDATE;amax:=public.ship_max_hull(r.attacker_id);dmax:=public.ship_max_hull(r.defender_id);ahull:=COALESCE(ahull,amax);dhull:=COALESCE(dhull,dmax);rounds:=COALESCE(r.report->'rounds','[]');acrit:=COALESCE(r.report->'attacker_crits','[]');dcrit:=COALESCE(r.report->'defender_crits','[]');ab:=COALESCE((r.report->>'boarding')::int,0);db:=COALESCE((r.report->>'defender_boarding')::int,0);r.report:=COALESCE(r.report,'{}');IF NOT(r.report?'a_hull0') THEN r.report:=r.report||jsonb_build_object('a_hull0',ahull,'d_hull0',dhull);END IF;
 FOR rnd IN 0..4 LOOP EXIT WHEN ahull<=0 OR dhull<=0;oa:=ap->>rnd;od:=dp->>rnd;ah:=0;dh:=0;ac:=0;dc:=0;aheal:=0;dheal:=0;
 FOR side IN 1..2 LOOP
 DECLARE own uuid:=CASE WHEN side=1 THEN r.attacker_id ELSE r.defender_id END;tgt uuid:=CASE WHEN side=1 THEN r.defender_id ELSE r.attacker_id END;o text:=CASE WHEN side=1 THEN oa ELSE od END;t text:=CASE WHEN side=1 THEN od ELSE oa END;fleet text;tfleet text;h integer:=0;c integer:=0;g integer;lvl integer;tlvl integer;heal integer:=0;
 BEGIN fleet:=public.ship_fleet(own);tfleet:=public.ship_fleet(tgt);g:=3+public.mod_level(own,'baterias');lvl:=public.mod_level(own,public.naval_order_module(o));tlvl:=public.mod_level(tgt,public.naval_order_module(t));
 IF o='fuego' THEN SELECT * INTO roll FROM public.naval_roll(g*2,4);h:=greatest(roll.hits-(1+public.mod_level(tgt,'puente')/2+public.mod_level(tgt,'camara_escudos')),0);c:=roll.sixes;ELSIF o='lanza' THEN SELECT * INTO roll FROM public.naval_roll(2+g/2,4);h:=roll.hits+(CASE WHEN roll.hits>0 THEN lvl ELSE 0 END);c:=roll.sixes;ELSIF o='abordaje' THEN SELECT * INTO roll FROM public.naval_roll(2+public.mod_level(own,'cubierta_abordaje'),4);h:=roll.hits;c:=roll.sixes;ELSIF o='escudos' AND public.naval_beats(o,t) THEN heal:=2+public.mod_level(own,'camara_escudos')+(CASE WHEN fleet='necrons' THEN 1 ELSE 0 END);END IF;
 IF h>0 THEN h:=greatest(0,h+(CASE WHEN fleet='tau' THEN CASE WHEN o IN ('fuego','lanza') THEN 2 WHEN o='abordaje' THEN -1 ELSE 0 END WHEN fleet='orks' THEN CASE WHEN o='abordaje' THEN 2 WHEN o IN ('fuego','lanza') THEN -1 ELSE 0 END WHEN fleet='tyranids' THEN CASE WHEN o='abordaje' THEN 2 WHEN o='lanza' THEN -1 ELSE 0 END WHEN fleet='daemons' THEN CASE WHEN o='abordaje' THEN 1 WHEN o='lanza' THEN -1 ELSE 0 END WHEN fleet IN ('chaos','drukhari','genestealer') AND o='abordaje' THEN 1 WHEN fleet='votann' AND o='fuego' THEN -1 ELSE 0 END));END IF;
 IF h>0 AND public.naval_beats(o,t) THEN h:=h+2+lvl;END IF;IF public.naval_beats(t,o) THEN h:=h/2;c:=c/2;IF tlvl>0 THEN h:=h-(tlvl+1)/2;END IF;END IF;
 IF t='evasion' THEN IF public.naval_beats('evasion',o) THEN h:=0;c:=0;ELSE h:=h-public.mod_level(tgt,'motores_plasma');END IF;h:=h-(CASE WHEN tfleet='aeldari' THEN 2 WHEN tfleet='drukhari' THEN 1 ELSE 0 END);END IF;
 IF t='escudos' AND o<>'lanza' THEN h:=h*(10-public.mod_level(tgt,'camara_escudos'))/10;END IF;h:=greatest(0,h-public.mod_level(tgt,'blindaje_proa')-(CASE WHEN tfleet='votann' THEN 1 ELSE 0 END));IF h=0 THEN c:=0;END IF;
 IF side=1 THEN ah:=h;ac:=c;aheal:=heal;IF o='abordaje' THEN ab:=ab+h;END IF;ELSE dh:=h;dc:=c;dheal:=heal;IF o='abordaje' THEN db:=db+h;END IF;END IF;END;END LOOP;
 ahull:=greatest(0,least(amax,ahull-dh+aheal));dhull:=greatest(0,least(dmax,dhull-ah+dheal));a_total:=a_total+ac;d_total:=d_total+dc;rounds:=rounds||jsonb_build_object('round',(r.block_number-1)*5+rnd+1,'block',r.block_number,'a_order',oa,'d_order',od,'a_hits',ah,'d_hits',dh,'a_sixes',ac,'d_sixes',dc,'a_heal',aheal,'d_heal',dheal,'a_hull',ahull,'d_hull',dhull);END LOOP;
 UPDATE public.ships SET hull_hp=ahull WHERE user_id=r.attacker_id;UPDATE public.ships SET hull_hp=dhull WHERE user_id=r.defender_id;acrit:=acrit||public.naval_apply_crits(r.attacker_id,d_total);dcrit:=dcrit||public.naval_apply_crits(r.defender_id,a_total);UPDATE public.naval_raids SET report=r.report||jsonb_build_object('rounds',rounds,'attacker_crits',acrit,'defender_crits',dcrit,'boarding',ab,'defender_boarding',db),attacker_plan=ap,defender_plan=dp WHERE id=_id;
 IF ahull=0 OR dhull=0 THEN PERFORM public.naval_finish(_id,CASE WHEN ahull=0 AND dhull=0 THEN 'empate' WHEN dhull=0 THEN 'atacante' ELSE 'defensor' END,'casco');ELSE UPDATE public.naval_raids SET status='enfrentado',block_number=block_number+1,attacker_ready=false,defender_ready=false,deadline=now()+interval '24 hours' WHERE id=_id;UPDATE public.naval_private_plans SET attacker_plan='[]',defender_plan=NULL WHERE raid_id=_id;END IF;
END $$;

CREATE OR REPLACE FUNCTION public.naval_continue(_raid uuid, _plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;uid uuid:=auth.uid();BEGIN PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_raid FOR UPDATE;IF uid IS NULL OR r.id IS NULL OR uid NOT IN(r.attacker_id,r.defender_id) THEN RAISE EXCEPTION 'forbidden';END IF;IF r.engine_version=2 THEN RAISE EXCEPTION 'locked';END IF;IF r.status<>'enfrentado' THEN RAISE EXCEPTION 'locked';END IF;IF r.deadline<=now() THEN PERFORM public.resolve_raid(_raid);RETURN;END IF;IF (CASE WHEN uid=r.attacker_id THEN r.attacker_ready ELSE r.defender_ready END) THEN RAISE EXCEPTION 'locked';END IF;IF NOT public.naval_plan_valid(_plan,uid) THEN RAISE EXCEPTION 'plan';END IF;IF uid=r.attacker_id THEN UPDATE public.naval_private_plans SET attacker_plan=_plan WHERE raid_id=_raid;UPDATE public.naval_raids SET attacker_ready=true WHERE id=_raid;ELSE UPDATE public.naval_private_plans SET defender_plan=_plan WHERE raid_id=_raid;UPDATE public.naval_raids SET defender_ready=true WHERE id=_raid;END IF;PERFORM public.resolve_raid(_raid);END $$;

CREATE OR REPLACE FUNCTION public.set_raid_plan(_raid uuid, _plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;uid uuid:=auth.uid();BEGIN PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_raid FOR UPDATE;IF uid IS NULL OR r.id IS NULL OR uid NOT IN(r.attacker_id,r.defender_id) THEN RAISE EXCEPTION 'forbidden';END IF;IF r.engine_version=2 THEN RAISE EXCEPTION 'locked';END IF;IF r.status<>'pendiente' OR r.deadline<=now() THEN RAISE EXCEPTION 'locked';END IF;IF NOT public.naval_plan_valid(_plan,uid) THEN RAISE EXCEPTION 'plan';END IF;IF uid=r.attacker_id THEN UPDATE public.naval_private_plans SET attacker_plan=_plan WHERE raid_id=_raid;ELSE UPDATE public.naval_private_plans SET defender_plan=_plan WHERE raid_id=_raid;END IF;END $$;

-- 7. Permisos
REVOKE ALL ON FUNCTION public.naval2_side(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.naval2_damage_modules(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.naval2_side(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.naval2_damage_modules(uuid, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.build_escort(text), public.reinforce_escort(uuid), public.scrap_escort(uuid), public.declare_raid2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_escort(text), public.reinforce_escort(uuid), public.scrap_escort(uuid), public.declare_raid2(uuid) TO authenticated, service_role;

-- 8. Anular los duelos v1 activos y devolver los 100 créditos al atacante
UPDATE public.profiles p SET imperial_credits = imperial_credits + 100
  FROM public.naval_raids r WHERE r.attacker_id = p.id AND r.status IN ('pendiente','enfrentado') AND r.engine_version = 1;
UPDATE public.naval_raids SET status = 'anulado', resolved_at = now(), report = report || '{"objective":"anulado_v2"}'::jsonb
  WHERE status IN ('pendiente','enfrentado') AND engine_version = 1;
