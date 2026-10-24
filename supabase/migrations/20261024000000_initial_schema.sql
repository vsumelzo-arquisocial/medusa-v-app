--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6 (Debian 18.6-3)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: allegiance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.allegiance AS ENUM (
    'loyalist',
    'traitor'
);


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: achievement_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.achievement_stats() RETURNS TABLE(id uuid, leader_name text, allegiance public.allegiance, faction text, legion text, map_color text, map_emblem text, renown integer, battles integer, wins integer, losses integer, draws integer, regions integer, spaceport boolean, conquest_wins integer, big_battles integer, engines_destroyed integer, best_margin integer, honours_used integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.leader_name, p.allegiance, p.faction, p.legion, p.map_color, p.map_emblem, p.renown,
    (select count(*)::int from battle_records b where b.user_id = p.id),
    (select count(*)::int from battle_records b where b.user_id = p.id and b.result = 'victoria'),
    (select count(*)::int from battle_records b where b.user_id = p.id and b.result = 'derrota'),
    (select count(*)::int from battle_records b where b.user_id = p.id and b.result = 'empate'),
    (select count(*)::int from regions r where r.owner_id = p.id),
    exists (select 1 from regions r where r.owner_id = p.id and r.is_spaceport),
    (select count(*)::int from battle_records b where b.user_id = p.id and b.result = 'victoria' and b.conquest),
    (select count(*)::int from battle_records b where b.user_id = p.id and b.points >= 5000),
    (select coalesce(sum(b.engines_destroyed),0)::int from battle_records b where b.user_id = p.id),
    (select coalesce(max(b.vp_for - b.vp_against),0)::int from battle_records b where b.user_id = p.id and b.result = 'victoria'),
    (select count(*)::int from honours h where h.user_id = p.id and h.used_at is not null)
  from profiles p
  where p.approved and p.oath_sworn_at is not null and auth.uid() is not null;
$$;


--
-- Name: admin_adjust(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_adjust(_uid uuid, _credits integer, _renown integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.profiles set imperial_credits = greatest(0, imperial_credits + coalesce(_credits,0)), renown = greatest(0, renown + coalesce(_renown,0)) where id = _uid;
end $$;


--
-- Name: admin_cancel_raid(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_cancel_raid(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r public.naval_raids;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  select * into r from public.naval_raids where id=_id for update;
  if r.status<>'pendiente' then raise exception 'not pending'; end if;
  update public.naval_raids set status='anulado', resolved_at=now() where id=_id;
  update public.profiles set imperial_credits = imperial_credits + 100 where id=r.attacker_id;
end $$;


--
-- Name: admin_clear_damage(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_clear_damage(_id uuid, _restore_lost boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare e public.lost_engines;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  delete from public.engine_damage where id = _id;
  if _restore_lost then
    select * into e from public.lost_engines where id = _id;
    if e.id is not null then
      insert into public.collection_items (user_id, unit_id, quantity) values (e.user_id, e.unit_id, 1)
        on conflict (user_id, unit_id) do update set quantity = public.collection_items.quantity + 1, updated_at = now();
      delete from public.lost_engines where id = _id;
    end if;
  end if;
end $$;


--
-- Name: admin_finish_travel(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_finish_travel(_uid uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  UPDATE public.ships SET arrives_at = now() WHERE arrives_at IS NOT NULL AND (_uid IS NULL OR user_id = _uid);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.ship_travel_tick();
  RETURN n;
END $$;


--
-- Name: admin_force_queues(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_force_queues(_uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; i int;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.wh40k_squads set ready_at = now()
    where (_uid is null or user_id=_uid) and status in ('training','retraining','restoring') and ready_at > now();
  perform public.wh40k_tick();
  for r in select distinct user_id from public.build_queue where _uid is null or user_id=_uid loop
    for i in 1..6 loop
      update public.build_queue set finishes_at = now()
        where user_id=r.user_id and started_at is not null and finishes_at > now();
      exit when not found;
      perform public.ship_process_jobs(r.user_id);
    end loop;
  end loop;
  update public.ship_modules set building_until = now() where (_uid is null or user_id=_uid) and building_until > now();
  update public.ship_modules set damaged_until = now() where (_uid is null or user_id=_uid) and damaged_until > now();
end $$;


--
-- Name: admin_force_region(integer, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_force_region(_region integer, _uid uuid, _spaceport boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.region_attacks set resolved_at = now(), result = 'admin' where region_id = _region and resolved_at is null;
  if _spaceport and _uid is not null then update public.regions set is_spaceport = false where owner_id = _uid; end if;
  update public.regions set owner_id = _uid, is_spaceport = (_uid is not null and _spaceport), owned_since = case when _uid is null then null else now() end where id = _region;
end $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: games; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid DEFAULT auth.uid() NOT NULL,
    opponent_id uuid,
    size text NOT NULL,
    points integer NOT NULL,
    scenario_id uuid,
    scenario_random boolean DEFAULT false NOT NULL,
    status text DEFAULT 'abierta'::text NOT NULL,
    creator_list_id uuid,
    opponent_list_id uuid,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    battle jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    region_id integer,
    format text DEFAULT '1v1'::text NOT NULL,
    creator_ally_id uuid,
    opponent_ally_id uuid,
    creator_ally_list_id uuid,
    opponent_ally_list_id uuid,
    battle_type text DEFAULT 'normal'::text NOT NULL,
    summaries jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT games_format_check CHECK ((format = ANY (ARRAY['1v1'::text, '1v2'::text, '2v1'::text, '2v2'::text]))),
    CONSTRAINT games_size_check CHECK ((size = ANY (ARRAY['escaramuza'::text, 'batalla'::text, 'armageddon'::text]))),
    CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['abierta'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text, 'en_curso'::text, 'finalizada'::text])))
);


--
-- Name: COLUMN games.battle_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.games.battle_type IS '40k game kind: normal | patrulla';


--
-- Name: admin_games(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_games() RETURNS SETOF public.games
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from public.games where public.has_role(auth.uid(), 'admin') order by coalesce(scheduled_at, created_at) desc
$$;


--
-- Name: admin_grant_honour(uuid, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_grant_honour(_uid uuid, _unit integer, _bearer text, _ability text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  if public.honour_cost(_ability) is null then raise exception 'bad ability'; end if;
  insert into public.honours (user_id, unit_id, bearer, ability) values (_uid, _unit, coalesce(_bearer,''), _ability);
end $$;


--
-- Name: admin_import_unit_oc(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_import_unit_oc(_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE n integer;BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden';END IF;IF jsonb_typeof(_rows)<>'array' OR jsonb_array_length(_rows)>2000 THEN RAISE EXCEPTION 'bad data';END IF;IF EXISTS(SELECT 1 FROM jsonb_to_recordset(_rows) AS v(faction text,unit_name text,oc numeric) WHERE oc<0 OR oc>100 OR faction IS NULL OR unit_name IS NULL) THEN RAISE EXCEPTION 'bad OC';END IF;UPDATE public.wh40k_unit_prices p SET oc_per_model=v.oc FROM jsonb_to_recordset(_rows) AS v(faction text,unit_name text,oc numeric) WHERE p.faction=v.faction AND upper(p.unit_name)=upper(v.unit_name);GET DIAGNOSTICS n=ROW_COUNT;UPDATE public.wh40k_squads s SET oc_cost=p.oc_per_model*s.models FROM public.wh40k_unit_prices p WHERE p.faction=s.faction AND upper(p.unit_name)=upper(s.unit_name) AND p.models=s.models AND s.oc_cost IS NULL;RETURN n;END $$;


--
-- Name: admin_remove_honour(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_remove_honour(_id uuid, _restore boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  if _restore then update public.honours set used_at = null, used_game = null where id = _id;
  else delete from public.honours where id = _id; end if;
end $$;


--
-- Name: admin_repair_module(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_repair_module(_uid uuid, _module text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.ship_modules set damaged=false, damaged_until=null where user_id=_uid and (_module is null or module=_module);
end $$;


--
-- Name: admin_reset_campaign(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_reset_campaign() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.games set status = 'cancelada' where region_id is not null and status in ('abierta','aceptada','en_curso');
  update public.region_attacks set resolved_at = now(), result = 'reinicio' where resolved_at is null;
  update public.regions set owner_id = null, is_spaceport = false, owned_since = null where true;
  update public.profiles set forge_gift_claimed = false where true;
  update public.campaign set phase = 'aproximacion', number = number + 1, started_at = null where id = 1;
end $$;


--
-- Name: admin_resolve_attack(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_resolve_attack(_id uuid, _winner text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a public.region_attacks;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  select * into a from public.region_attacks where id = _id and resolved_at is null;
  if a.id is null then raise exception 'not found'; end if;
  if _winner = 'atacante' then
    update public.regions set owner_id = a.attacker_id, is_spaceport = false, owned_since = now() where id = a.region_id;
    update public.region_attacks set resolved_at = now(), result = 'admin_atacante' where id = _id;
  elsif _winner = 'defensor' then
    update public.region_attacks set resolved_at = now(), result = 'admin_defensor' where id = _id;
  else
    update public.region_attacks set resolved_at = now(), result = 'anulada' where id = _id;
  end if;
  if a.game_id is not null then update public.games set status = 'cancelada' where id = a.game_id and status <> 'finalizada'; end if;
end $$;


--
-- Name: admin_resolve_battle(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_resolve_battle(_game uuid, _action text, _battle jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE g public.games; b jsonb; a public.region_attacks;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  IF coalesce(b->>'disputed', 'false') <> 'true' THEN RAISE EXCEPTION 'not disputed'; END IF;
  IF _action = 'eliminar' THEN
    UPDATE public.games SET status = 'cancelada', battle = b || jsonb_build_object('disputed', false, 'phase', 'anulada') WHERE id = _game;
    SELECT * INTO a FROM public.region_attacks WHERE game_id = _game AND resolved_at IS NULL FOR UPDATE;
    IF a.id IS NOT NULL THEN UPDATE public.region_attacks SET resolved_at = now(), result = 'anulada' WHERE id = a.id; END IF;
  ELSIF _action = 'aplicar' THEN
    IF _battle IS NOT NULL THEN b := b || public.wh40k_sanitize_battle(_battle); END IF;
    UPDATE public.games SET battle = b || jsonb_build_object('disputed', false) WHERE id = _game;
    PERFORM public.wh40k_apply_result(_game);
  ELSE RAISE EXCEPTION 'bad action'; END IF;
END $$;


--
-- Name: admin_restart_campaign_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_restart_campaign_safe() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  LOCK TABLE public.campaign, public.region_attacks, public.regions, public.games IN SHARE ROW EXCLUSIVE MODE;
  UPDATE public.games SET region_id = NULL WHERE region_id IS NOT NULL AND status <> 'finalizada';
  UPDATE public.region_attacks SET resolved_at = now(), result = 'reinicio', auto_attacker_confirmed = false, auto_defender_confirmed = false WHERE resolved_at IS NULL;
  UPDATE public.regions SET owner_id = NULL, is_spaceport = false, owned_since = NULL WHERE id IS NOT NULL;
  DELETE FROM public.ship_travel_private WHERE user_id IS NOT NULL;
  UPDATE public.ships SET region = 'Órbita alta', body_id = 'medusa-5', travel_from = NULL, arrives_at = NULL WHERE user_id IS NOT NULL;
  UPDATE public.celestial_bodies SET status = 'locked' WHERE playable;
  UPDATE public.campaign SET phase = 'aproximacion', number = number + 1, started_at = NULL WHERE id = 1;
END;
$$;


--
-- Name: admin_set_body_status(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_body_status(_body text, _status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('open','locked') THEN RAISE EXCEPTION 'bad status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.celestial_bodies WHERE id = _body AND playable) THEN RAISE EXCEPTION 'bad body'; END IF;
  UPDATE public.celestial_bodies SET status = _status WHERE id = _body;
  IF _status = 'locked' THEN
    UPDATE public.games SET status = CASE WHEN status IN ('abierta','aceptada') THEN 'cancelada' ELSE status END, region_id = NULL
      WHERE status <> 'finalizada' AND region_id IN (SELECT id FROM public.regions WHERE body_id = _body);
    UPDATE public.region_attacks SET resolved_at = now(), result = 'bloqueo', auto_attacker_confirmed = false, auto_defender_confirmed = false
      WHERE resolved_at IS NULL AND region_id IN (SELECT id FROM public.regions WHERE body_id = _body);
  END IF;
END $$;


--
-- Name: admin_set_phase(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_phase(_phase text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.campaign set phase = _phase, started_at = case when _phase = 'conquista' then coalesce(started_at, now()) else started_at end where id = 1;
end $$;


--
-- Name: admin_set_supports(uuid, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_supports(_uid uuid, _charged boolean, _pods integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  insert into public.ship_supports (user_id) values (_uid) on conflict do nothing;
  update public.ship_supports set orbital_charged = _charged, orbital_ready_at = null, pods = greatest(0, _pods), pods_building = 0, pods_ready_at = null where user_id = _uid;
end $$;


--
-- Name: admin_set_unit(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_unit(_uid uuid, _unit integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  if _qty <= 0 then delete from public.collection_items where user_id = _uid and unit_id = _unit;
  else insert into public.collection_items (user_id, unit_id, quantity) values (_uid, _unit, _qty)
    on conflict (user_id, unit_id) do update set quantity = excluded.quantity, updated_at = now(); end if;
end $$;


--
-- Name: admin_skip_waits(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_skip_waits(_uid uuid, _include_attacks boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  update public.recruit_orders set ready_at = now() where (_uid is null or user_id=_uid) and ready_at > now();
  update public.ship_modules set building_until = now() where (_uid is null or user_id=_uid) and building_until > now();
  update public.ship_modules set damaged_until = now() where (_uid is null or user_id=_uid) and damaged_until > now();
  update public.engine_damage set repair_until = now() where (_uid is null or user_id=_uid) and repair_until > now();
  update public.ship_supports set orbital_ready_at = least(orbital_ready_at, now()), pods_ready_at = least(pods_ready_at, now()) where (_uid is null or user_id=_uid);
  update public.ships set last_income_at = least(last_income_at, now() - interval '25 hours') where (_uid is null or user_id=_uid);
  update public.naval_raids set deadline = now() where status='pendiente' and deadline > now() and (_uid is null or attacker_id=_uid or defender_id=_uid);
  update public.naval_raids set report = report || jsonb_build_object('return_until', now()) where status='retirada' and (_uid is null or attacker_id=_uid);
  update public.region_attacks set deadline = now() where resolved_at is null and deadline > now() and (_uid is null or attacker_id=_uid or defender_id=_uid) and (kind='claim' or _include_attacks);
  perform public.resolve_raids();
  perform public.campaign_tick();
end $$;


--
-- Name: apply_casualties(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_casualties(_uid uuid, _game uuid, _c jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare x jsonb;
begin
  if _uid is null or _c is null then return; end if;
  for x in select * from jsonb_array_elements(coalesce(_c->'units', '[]'::jsonb)) loop
    update public.collection_items set quantity = greatest(0, quantity - greatest(0, (x->>'qty')::int)), updated_at = now() where user_id = _uid and unit_id = (x->>'unit_id')::int;
  end loop;
  delete from public.collection_items where user_id = _uid and quantity <= 0;
  if _c ? 'veterans' then return; end if;
  for x in select * from jsonb_array_elements(coalesce(_c->'destroyed', '[]'::jsonb)) loop
    insert into public.lost_engines (user_id, unit_id, name, game_id) values (_uid, (x->>'unit_id')::int, coalesce(x->>'name',''), _game);
  end loop;
  for x in select * from jsonb_array_elements(coalesce(_c->'damaged', '[]'::jsonb)) loop
    insert into public.engine_damage (user_id, unit_id, name, wounds_lost, max_wounds) values (_uid, (x->>'unit_id')::int, coalesce(x->>'name',''), (x->>'wounds_lost')::int, (x->>'max_wounds')::int);
  end loop;
end $$;


--
-- Name: build_module(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_module(_module text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE t public.module_types;proj integer;bridge_proj integer;used integer;cost integer;
BEGIN
 PERFORM public.ship_assert_job_slot();SELECT * INTO t FROM public.module_types WHERE id=_module AND active;IF t.id IS NULL THEN RAISE EXCEPTION 'bad module';END IF;
 IF EXISTS(SELECT 1 FROM public.ship_modules WHERE user_id=auth.uid() AND module=_module AND damaged) AND NOT EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=auth.uid() AND module=_module AND kind='module_repair') THEN RAISE EXCEPTION 'not repaired';END IF;
 SELECT COALESCE((SELECT level FROM public.ship_modules WHERE user_id=auth.uid() AND module=_module),0)+(SELECT count(*) FROM public.build_queue WHERE user_id=auth.uid() AND module=_module AND kind='build') INTO proj;
 IF proj>=t.max_level THEN RAISE EXCEPTION 'max level';END IF;
 SELECT COALESCE((SELECT level FROM public.ship_modules WHERE user_id=auth.uid() AND module='puente'),0)+(SELECT count(*) FROM public.build_queue WHERE user_id=auth.uid() AND module='puente' AND kind='build') INTO bridge_proj;
 IF proj=0 THEN SELECT count(DISTINCT module) INTO used FROM (SELECT m.module FROM public.ship_modules m JOIN public.module_types mt ON mt.id=m.module AND mt.active WHERE user_id=auth.uid() AND level>0 UNION SELECT module FROM public.build_queue WHERE user_id=auth.uid() AND kind='build') x;IF used>=2+2*bridge_proj THEN RAISE EXCEPTION 'no slots';END IF;END IF;
 IF _module<>'puente' AND proj>=1 AND proj+1>bridge_proj THEN RAISE EXCEPTION 'bridge level';END IF;
 cost:=ceil(10*t.base_cost*power(1.25::numeric,proj)*(1-public.region_rate(auth.uid(),'forja')))::int;PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;IF (SELECT imperial_credits FROM public.profiles WHERE id=auth.uid())<cost THEN RAISE EXCEPTION 'credits';END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits-cost WHERE id=auth.uid();INSERT INTO public.build_queue(user_id,module,target_level,cost) VALUES(auth.uid(),_module,proj+1,cost);PERFORM public.ship_start_queued(auth.uid());
END $$;


--
-- Name: FUNCTION build_module(_module text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.build_module(_module text) IS 'Upgrade-only tenfold base price with compounded 25 percent per target level; forge discounts apply before credit rounding. Repairs and already paid queue costs remain unchanged.';


--
-- Name: build_pods(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.build_pods(_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin raise exception 'Las cápsulas se reclutan en Reservas y se cargan en la Bahía'; end $$;


--
-- Name: campaign_players(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_players() RETURNS TABLE(id uuid, leader_name text, force_name text, allegiance public.allegiance, map_color text, map_emblem text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.leader_name, p.force_name, p.allegiance, p.map_color, p.map_emblem from public.profiles p
  where p.approved and p.oath_sworn_at is not null and auth.uid() is not null
$$;


--
-- Name: campaign_players_40k(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_players_40k() RETURNS TABLE(id uuid, leader_name text, force_name text, army_faction text, map_color text, map_emblem text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT p.id, p.leader_name, p.force_name, p.army_faction, p.map_color, p.map_emblem
 FROM public.profiles p
 WHERE p.approved AND p.oath_sworn_at IS NOT NULL AND auth.uid() IS NOT NULL
$$;


--
-- Name: campaign_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.campaign_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare a public.region_attacks; c public.campaign; r public.regions; chance numeric;
begin
  perform public.ship_travel_tick();
  select * into c from public.campaign where id = 1;
  if c.phase <> 'conquista' then return; end if;
  for a in select * from public.region_attacks where resolved_at is null and deadline <= now() for update skip locked loop
    select * into r from public.regions where id = a.region_id;
    if a.kind = 'claim' then
      if r.owner_id is null then
        perform public.give_region(a.region_id, a.attacker_id, c.reward_neutral);
        update public.region_attacks set resolved_at = now(), result = 'conquistada' where id = a.id;
      else
        update public.region_attacks set resolved_at = now(), result = 'anulada' where id = a.id;
      end if;
    else
      update public.games set status = 'cancelada' where id = a.game_id and status not in ('finalizada');
      if r.owner_id is distinct from a.defender_id then
        update public.region_attacks set resolved_at = now(), result = 'anulada' where id = a.id;
      elsif r.is_spaceport then
        update public.region_attacks set resolved_at = now(), result = 'cancelada' where id = a.id;
      else
        chance := 0.5 + public.dup_advantage(a.attacker_id) - public.dup_advantage(a.defender_id);
        if random() < chance then
          perform public.give_region(a.region_id, a.attacker_id, c.reward_capture);
          update public.region_attacks set resolved_at = now(), result = 'azar_atacante' where id = a.id;
        else
          update public.region_attacks set resolved_at = now(), result = 'azar_defensor' where id = a.id;
        end if;
      end if;
    end if;
  end loop;
end $$;


--
-- Name: cancel_campaign_operation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_campaign_operation(_attack uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE a public.region_attacks; g public.games; gid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT game_id INTO gid FROM public.region_attacks WHERE id = _attack AND attacker_id = auth.uid();
  IF gid IS NOT NULL THEN SELECT * INTO g FROM public.games WHERE id = gid FOR UPDATE; END IF;
  SELECT * INTO a FROM public.region_attacks WHERE id = _attack AND attacker_id = auth.uid() AND resolved_at IS NULL FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'operation unavailable'; END IF;
  IF g.status IN ('en_curso','finalizada') THEN RAISE EXCEPTION 'battle started'; END IF;
  UPDATE public.games SET status = 'cancelada' WHERE id = a.game_id;
  UPDATE public.region_attacks SET resolved_at = now(), result = 'retirada' WHERE id = a.id;
END $$;


--
-- Name: cancel_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_claim() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE operation_id uuid; operation_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT count(*) INTO operation_count FROM public.region_attacks WHERE attacker_id = auth.uid() AND resolved_at IS NULL;
  IF operation_count > 1 THEN RAISE EXCEPTION 'Selecciona la operación que deseas retirar'; END IF;
  SELECT id INTO operation_id FROM public.region_attacks WHERE attacker_id = auth.uid() AND resolved_at IS NULL;
  IF operation_id IS NOT NULL THEN PERFORM public.cancel_campaign_operation(operation_id); END IF;
END $$;


--
-- Name: cancel_queued(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_queued(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE q public.build_queue;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_tick();IF public.ship_busy(auth.uid()) THEN RAISE EXCEPTION 'ship busy';END IF;
 SELECT * INTO q FROM public.build_queue WHERE id=_id AND user_id=auth.uid() FOR UPDATE;IF q.id IS NULL THEN RAISE EXCEPTION 'not found';END IF;IF q.started_at IS NOT NULL THEN RAISE EXCEPTION 'job active';END IF;
 IF EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=auth.uid() AND (created_at,sequence)>(q.created_at,q.sequence) AND ((module=q.module AND kind='build') OR (q.module='puente' AND q.kind='build' AND kind='build'))) THEN RAISE EXCEPTION 'cancel later first';END IF;
 DELETE FROM public.build_queue WHERE id=q.id;UPDATE public.profiles SET imperial_credits=imperial_credits+q.cost WHERE id=auth.uid();END $$;


--
-- Name: cancel_raid(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_raid(_id uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN PERFORM public.naval_withdraw(_id);RETURN now();END $$;


--
-- Name: cancel_recruit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_recruit(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare o public.recruit_orders;
begin
  select * into o from public.recruit_orders where id = _id and user_id = auth.uid();
  if o.id is null then raise exception 'not found'; end if;
  delete from public.recruit_orders where id = _id;
  update public.profiles set imperial_credits = imperial_credits + o.cost where id = auth.uid();
end $$;


--
-- Name: claim_region(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_region(_region integer, _size text DEFAULT 'batalla'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); r public.regions; g uuid; operation_kind text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  PERFORM public.campaign_tick();
  IF (SELECT phase FROM public.campaign WHERE id = 1) IS DISTINCT FROM 'conquista' THEN RAISE EXCEPTION 'approach phase'; END IF;
  SELECT * INTO r FROM public.regions WHERE id = _region FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'bad region'; END IF;
  IF r.owner_id = uid THEN RAISE EXCEPTION 'own region'; END IF;
  IF (SELECT status FROM public.celestial_bodies WHERE id = r.body_id) <> 'open' THEN RAISE EXCEPTION 'body locked'; END IF;
  IF (SELECT body_id FROM public.ships WHERE user_id = uid) IS DISTINCT FROM r.body_id THEN RAISE EXCEPTION 'ship not here'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND _region = ANY(neighbors)) THEN RAISE EXCEPTION 'not adjacent'; END IF;
  operation_kind := CASE WHEN r.owner_id IS NULL THEN 'claim' ELSE 'attack' END;
  IF EXISTS (SELECT 1 FROM public.region_attacks WHERE attacker_id = uid AND resolved_at IS NULL AND kind = operation_kind) THEN
    IF operation_kind = 'claim' THEN RAISE EXCEPTION 'one neutral claim'; ELSE RAISE EXCEPTION 'one player attack'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.region_attacks WHERE region_id = _region AND resolved_at IS NULL) THEN RAISE EXCEPTION 'region contested'; END IF;
  IF r.owner_id IS NULL THEN
    INSERT INTO public.region_attacks (region_id, attacker_id, kind, deadline) VALUES (_region, uid, 'claim', now() + interval '1 day');
  ELSE
    INSERT INTO public.games (creator_id, opponent_id, size, points, scenario_random, notes, region_id, battle_type)
      VALUES (uid, r.owner_id, 'batalla', 2000, false, 'Conquista de ' || r.name || CASE WHEN r.is_spaceport THEN ' (Zona de desembarco)' ELSE '' END, _region, 'normal') RETURNING id INTO g;
    INSERT INTO public.region_attacks (region_id, attacker_id, defender_id, kind, game_id, deadline)
      VALUES (_region, uid, r.owner_id, 'attack', g, now() + interval '7 days');
  END IF;
END $$;


--
-- Name: cleanup_deleted_player(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_deleted_player() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.region_attacks SET resolved_at = now(), result = 'cancelada'
  WHERE resolved_at IS NULL AND (attacker_id = OLD.id OR defender_id = OLD.id OR game_id IN (
    SELECT id FROM public.games WHERE status <> 'finalizada' AND OLD.id IN (creator_id, opponent_id, creator_ally_id, opponent_ally_id)
  ));
  UPDATE public.games SET status = 'cancelada'
  WHERE status <> 'finalizada' AND OLD.id IN (creator_id, opponent_id, creator_ally_id, opponent_ally_id);
  UPDATE public.games SET creator_list_id = NULL WHERE creator_id = OLD.id;
  UPDATE public.games SET opponent_list_id = NULL WHERE opponent_id = OLD.id;
  UPDATE public.games SET creator_ally_list_id = NULL WHERE creator_ally_id = OLD.id;
  UPDATE public.games SET opponent_ally_list_id = NULL WHERE opponent_ally_id = OLD.id;
  UPDATE public.regions SET owner_id = NULL, is_spaceport = false, owned_since = NULL WHERE owner_id = OLD.id;
  DELETE FROM public.region_attacks WHERE attacker_id = OLD.id OR defender_id = OLD.id;
  DELETE FROM public.game_exclusions WHERE user_id = OLD.id;
  DELETE FROM public.battle_records WHERE user_id = OLD.id;
  DELETE FROM public.honours WHERE user_id = OLD.id;
  DELETE FROM public.engine_damage WHERE user_id = OLD.id;
  DELETE FROM public.lost_engines WHERE user_id = OLD.id;
  DELETE FROM public.veterans WHERE user_id = OLD.id;
  DELETE FROM public.recruit_orders WHERE user_id = OLD.id;
  DELETE FROM public.build_queue WHERE user_id = OLD.id;
  DELETE FROM public.ship_supports WHERE user_id = OLD.id;
  DELETE FROM public.ship_modules WHERE user_id = OLD.id;
  DELETE FROM public.ships WHERE user_id = OLD.id;
  DELETE FROM public.army_lists WHERE user_id = OLD.id;
  DELETE FROM public.collection_items WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;


--
-- Name: cleanup_wh40k_squads(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_wh40k_squads() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.wh40k_squad_history WHERE user_id = OLD.id;
  DELETE FROM public.wh40k_squads WHERE user_id = OLD.id;
  DELETE FROM public.wh40k_recruits WHERE user_id = OLD.id;
  RETURN OLD;
END $$;


--
-- Name: collect_daily_income(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.collect_daily_income() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); s public.ships; reward integer;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  perform public.ship_tick();
  select * into s from public.ships where user_id = uid for update;
  if s.user_id is null then raise exception 'No tienes nave'; end if;
  if now() < s.last_income_at + interval '24 hours' then raise exception 'Debes esperar 24 horas entre recogidas'; end if;
  reward := floor((100 + 50 * public.mod_level(uid, 'puente')) * (1 + public.region_rate(uid,'mina')))::int;
  update public.profiles set imperial_credits = imperial_credits + reward where id = uid;
  update public.ships set last_income_at = now() where user_id = uid;
  return reward;
end $$;


--
-- Name: confirm_attack_auto_resolution(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_attack_auto_resolution(_attack uuid, _confirm boolean DEFAULT true) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE a public.region_attacks; r public.regions; g public.games; uid uuid := auth.uid(); gid uuid; chance numeric; outcome text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT game_id INTO gid FROM public.region_attacks WHERE id = _attack;
  IF gid IS NOT NULL THEN SELECT * INTO g FROM public.games WHERE id = gid FOR UPDATE; END IF;
  SELECT * INTO a FROM public.region_attacks WHERE id = _attack FOR UPDATE;
  IF a.id IS NULL OR a.kind <> 'attack' OR a.defender_id IS NULL OR a.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'El ataque ya no está disponible'; END IF;
  IF uid <> a.attacker_id AND uid <> a.defender_id THEN RAISE EXCEPTION 'Solo atacante y defensor pueden confirmar'; END IF;
  IF (SELECT phase FROM public.campaign WHERE id = 1) IS DISTINCT FROM 'conquista' THEN RAISE EXCEPTION 'La campaña no está activa'; END IF;
  SELECT * INTO r FROM public.regions WHERE id = a.region_id FOR UPDATE;
  IF r.is_spaceport THEN RAISE EXCEPTION 'La región inicial solo puede resolverse en batalla real'; END IF;
  IF r.owner_id IS DISTINCT FROM a.defender_id THEN RAISE EXCEPTION 'La región ha cambiado de dueño'; END IF;
  IF g.id IS NULL OR g.status NOT IN ('abierta', 'aceptada', 'en_curso', 'rechazada') THEN RAISE EXCEPTION 'La partida ya no está disponible'; END IF;
  IF _confirm IS NULL THEN RAISE EXCEPTION 'Confirmación inválida'; END IF;
  IF NOT _confirm THEN
    UPDATE public.region_attacks SET auto_attacker_confirmed = false, auto_defender_confirmed = false WHERE id = _attack;
    RETURN 'rechazada';
  END IF;
  IF uid = a.attacker_id THEN a.auto_attacker_confirmed := true; ELSE a.auto_defender_confirmed := true; END IF;
  UPDATE public.region_attacks SET auto_attacker_confirmed = a.auto_attacker_confirmed, auto_defender_confirmed = a.auto_defender_confirmed WHERE id = _attack;
  IF NOT (a.auto_attacker_confirmed AND a.auto_defender_confirmed) THEN RETURN 'pendiente'; END IF;
  chance := 0.5 + public.dup_advantage(a.attacker_id) - public.dup_advantage(a.defender_id);
  IF random() < chance THEN
    PERFORM public.give_region(a.region_id, a.attacker_id, (SELECT reward_capture FROM public.campaign WHERE id = 1));
    outcome := 'acuerdo_atacante';
  ELSE outcome := 'acuerdo_defensor'; END IF;
  UPDATE public.region_attacks SET resolved_at = now(), result = outcome WHERE id = _attack;
  UPDATE public.games SET status = 'cancelada' WHERE id = a.game_id;
  RETURN outcome;
END $$;


--
-- Name: conquest_lists_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conquest_lists_only() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.region_id is not null then
    if new.creator_list_id is not null and exists (select 1 from public.army_lists where id = new.creator_list_id and mode <> 'coleccion') then raise exception 'campaign list required'; end if;
    if new.opponent_list_id is not null and exists (select 1 from public.army_lists where id = new.opponent_list_id and mode <> 'coleccion') then raise exception 'campaign list required'; end if;
  end if;
  return new;
end $$;


--
-- Name: create_ship(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_ship(_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(72401020);
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved AND oath_sworn_at IS NOT NULL) THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF length(trim(_name))<2 OR length(trim(_name))>100 THEN RAISE EXCEPTION 'bad name'; END IF;
 INSERT INTO public.ships(user_id,name,hull_hp) VALUES(auth.uid(),trim(_name),public.ship_base_hull(auth.uid())) ON CONFLICT DO NOTHING;
 INSERT INTO public.ship_modules(user_id,module,level) VALUES(auth.uid(),'puente',1),(auth.uid(),'bodegas',1) ON CONFLICT DO NOTHING;
END $$;


--
-- Name: daily_income_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.daily_income_status() RETURNS TABLE(amount integer, next_collection_at timestamp with time zone, server_now timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select floor((100 + 50 * public.mod_level(auth.uid(), 'puente')) * (1 + public.region_rate(auth.uid(),'mina')))::int,
    s.last_income_at + interval '24 hours', now()
  from public.ships s where s.user_id = auth.uid() and auth.uid() is not null; $$;


--
-- Name: declare_raid(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.declare_raid(_defender uuid, _plan jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();rid uuid;bal integer;a_since timestamptz;a_body text;d_body text;secs int;BEGIN
 IF uid IS NULL OR _defender IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;IF uid=_defender THEN RAISE EXCEPTION 'self';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_travel_tick();PERFORM public.resolve_raids();IF NOT public.naval_plan_valid(_plan,uid) THEN RAISE EXCEPTION 'plan';END IF;
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
 INSERT INTO public.naval_raids(attacker_id,defender_id,deadline,attacker_plan,defender_plan) VALUES(uid,_defender,now()+interval '24 hours'+make_interval(secs=>secs),'[]',NULL) RETURNING id INTO rid;INSERT INTO public.naval_private_plans(raid_id,attacker_plan,defender_plan) VALUES(rid,_plan,public.naval_normal_plan((SELECT plan FROM public.naval_stances WHERE user_id=_defender),_defender));
 IF secs>0 THEN
   UPDATE public.ships SET travel_from=body_id, body_id=NULL, arrives_at=now()+make_interval(secs=>secs) WHERE user_id=uid;
   INSERT INTO public.ship_travel_private(user_id,destination) VALUES(uid,d_body) ON CONFLICT (user_id) DO UPDATE SET destination=EXCLUDED.destination, started_at=now();
 END IF;
 RETURN rid;END $$;


--
-- Name: delete_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_game(_game uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'games cannot be deleted';
END $$;


--
-- Name: FUNCTION delete_game(_game uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.delete_game(_game uuid) IS 'DEPRECATED: games are retained; use authorized cancellation or disputed-result resolution instead.';


--
-- Name: demolish_module(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.demolish_module(_module text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();m public.ship_modules;t public.module_types;refund integer;BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_tick();IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy';END IF;IF _module='puente' THEN RAISE EXCEPTION 'cannot demolish bridge';END IF;SELECT * INTO m FROM public.ship_modules WHERE user_id=uid AND module=_module FOR UPDATE;IF m.module IS NULL OR m.level=0 THEN RAISE EXCEPTION 'not built';END IF;IF m.building_until IS NOT NULL OR m.damaged_until IS NOT NULL OR EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=uid AND module=_module) THEN RAISE EXCEPTION 'busy module';END IF;IF _module='bodegas' AND public.ship_oc_used(uid)>100 THEN RAISE EXCEPTION 'cargo full';END IF;SELECT * INTO t FROM public.module_types WHERE id=_module;refund:=t.base_cost*m.level*(m.level+1)/4;DELETE FROM public.ship_modules WHERE user_id=uid AND module=_module;UPDATE public.ships SET hull_hp=least(hull_hp,public.ship_max_hull(uid)) WHERE user_id=uid;UPDATE public.profiles SET imperial_credits=imperial_credits+refund WHERE id=uid;RETURN refund;END $$;


--
-- Name: dismiss_40k(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_40k(_unit text, _models integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); n integer;
BEGIN
  WITH d AS (SELECT id FROM public.wh40k_squads WHERE user_id=uid AND unit_name=_unit AND models=_models AND status='ready' ORDER BY created_at LIMIT greatest(_qty,0))
  DELETE FROM public.wh40k_squads s USING d WHERE s.id=d.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n < _qty OR _qty < 1 THEN RAISE EXCEPTION 'not enough'; END IF;
END $$;


--
-- Name: dismiss_unit(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_unit(_unit integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); have integer;
begin
  if uid is null then raise exception 'forbidden'; end if;
  select quantity into have from public.collection_items where user_id = uid and unit_id = _unit for update;
  if have is null or _qty < 1 or _qty > have then raise exception 'bad qty'; end if;
  if have = _qty then delete from public.collection_items where user_id = uid and unit_id = _unit;
  else update public.collection_items set quantity = quantity - _qty, updated_at = now() where user_id = uid and unit_id = _unit; end if;
end $$;


--
-- Name: dismiss_unit_and_veterans(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_unit_and_veterans(_unit integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.dismiss_unit(_unit, _qty);
  PERFORM public.sync_veterans(auth.uid());
END;
$$;


--
-- Name: dup_advantage(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dup_advantage(_uid uuid) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select least(0.2, 0.05 * (count(*) - count(distinct type))) from public.regions where owner_id = _uid
$$;


--
-- Name: faction_hold_factor(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.faction_hold_factor(_faction text) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    AS $$
 SELECT CASE
  WHEN _faction IN ('orks','tyranids','astra-militarum','genestealer-cults') THEN 1.5
  WHEN _faction IN ('adeptus-custodes','grey-knights','imperial-knights','chaos-knights') THEN 0.75
  ELSE 1 END::numeric $$;


--
-- Name: game_full(public.games); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.game_full(g public.games) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select g.opponent_id is not null
    and (g.format not in ('2v1','2v2') or g.creator_ally_id is not null)
    and (g.format not in ('1v2','2v2') or g.opponent_ally_id is not null)
$$;


--
-- Name: game_lists(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.game_lists(_game uuid) RETURNS TABLE(side text, id uuid, name text, formations jsonb, owner_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when l.id in (g.creator_list_id, g.creator_ally_list_id) then 'creator' else 'opponent' end, l.id, l.name, l.formations, l.user_id
  from public.games g join public.army_lists l on l.id in (g.creator_list_id, g.opponent_list_id, g.creator_ally_list_id, g.opponent_ally_list_id)
  where g.id = _game and public.is_game_player(_game, auth.uid())
$$;


--
-- Name: ship_supports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ship_supports (
    user_id uuid NOT NULL,
    orbital_charged boolean DEFAULT false NOT NULL,
    orbital_ready_at timestamp with time zone,
    pods integer DEFAULT 0 NOT NULL,
    pods_building integer DEFAULT 0 NOT NULL,
    pods_ready_at timestamp with time zone
);


--
-- Name: get_supports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_supports() RETURNS public.ship_supports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s public.ship_supports;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform public.support_tick(auth.uid());
  select * into s from public.ship_supports where user_id = auth.uid();
  return s;
end $$;


--
-- Name: give_region(integer, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.give_region(_region integer, _uid uuid, _reward integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.regions set owner_id = _uid, is_spaceport = false, owned_since = now() where id = _region;
  update public.profiles set imperial_credits = imperial_credits + _reward where id = _uid;
end $$;


--
-- Name: grant_honour(integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_honour(_unit integer, _bearer text, _ability text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare cost int := public.honour_cost(_ability);
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if cost is null then raise exception 'bad ability'; end if;
  if not exists (select 1 from public.collection_items where user_id = auth.uid() and unit_id = _unit and quantity > 0) then raise exception 'not owned'; end if;
  if (select count(*) from public.honours where user_id = auth.uid() and unit_id = _unit and bearer = coalesce(_bearer,'') and used_at is null) >= 2 then raise exception 'max honours'; end if;
  if (select renown from public.profiles where id = auth.uid()) < cost then raise exception 'renown'; end if;
  update public.profiles set renown = renown - cost where id = auth.uid();
  insert into public.honours (user_id, unit_id, bearer, ability) values (auth.uid(), _unit, coalesce(_bearer,''), _ability);
end $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE first_account boolean := false;
BEGIN
  -- Row lock serializes concurrent registrations; this flag is never reopened.
  SELECT NOT claimed INTO first_account FROM public.admin_bootstrap_state WHERE id = 1 FOR UPDATE;
  first_account := COALESCE(first_account, false);
  IF first_account THEN
    first_account := NOT EXISTS (SELECT 1 FROM public.profiles) AND NOT EXISTS (SELECT 1 FROM public.user_roles);
    UPDATE public.admin_bootstrap_state SET claimed = true WHERE id = 1;
  END IF;
  INSERT INTO public.profiles (id, email, approved)
  VALUES (new.id, new.email, first_account) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user') ON CONFLICT (user_id, role) DO NOTHING;
  IF first_account THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;


--
-- Name: honour_cost(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.honour_cost(_ability text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case _ability
    when 'repetir_disparo' then 10 when 'recarga_escudos' then 20 when 'reactor_estable' then 15 when 'paso_firme' then 10
    when 'blindaje_reforzado' then 15 when 'fuego_preciso' then 10 when 'motor_forzado' then 10
    when 'medico_mejorado' then 10 when 'orden_inspiradora' then 10 when 'duelo_heroico' then 15 when 'ultima_resistencia' then 15
    else null end
$$;


--
-- Name: is_excluded(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_excluded(_game uuid, _user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.game_exclusions where game_id = _game and user_id = _user)
$$;


--
-- Name: is_game_creator(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_game_creator(_game uuid, _user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.games where id = _game and creator_id = _user)
$$;


--
-- Name: is_game_player(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_game_player(_game uuid, _user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.games where id = _game and _user in (creator_id, coalesce(opponent_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(creator_ally_id,'00000000-0000-0000-0000-000000000000'::uuid), coalesce(opponent_ally_id,'00000000-0000-0000-0000-000000000000'::uuid)))
$$;


--
-- Name: join_game(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_game(_game uuid, _side text, _list uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare g public.games;
begin
  select * into g from public.games where id = _game for update;
  if g.id is null or g.status <> 'abierta' or g.region_id is not null then raise exception 'not available'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and approved) then raise exception 'forbidden'; end if;
  if public.is_game_player(_game, auth.uid()) or public.is_excluded(_game, auth.uid()) then raise exception 'forbidden'; end if;
  if _list is null or not exists (select 1 from public.army_lists where id = _list and user_id = auth.uid()) then raise exception 'list required'; end if;
  if _side = 'creator' and g.format in ('2v1','2v2') and g.creator_ally_id is null then
    g.creator_ally_id := auth.uid();
    update public.games set creator_ally_id = auth.uid(), creator_ally_list_id = _list where id = _game;
  elsif _side = 'opponent' and g.format in ('1v2','2v2') and g.opponent_ally_id is null then
    g.opponent_ally_id := auth.uid();
    update public.games set opponent_ally_id = auth.uid(), opponent_ally_list_id = _list where id = _game;
  else raise exception 'slot taken';
  end if;
  if public.game_full(g) then update public.games set status = 'aceptada', accepted_at = now() where id = _game; end if;
end $$;


--
-- Name: land_region(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.land_region(_region integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); r public.regions;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  PERFORM public.ship_travel_tick();
  IF (SELECT phase FROM public.campaign WHERE id = 1) <> 'conquista' THEN RAISE EXCEPTION 'approach phase'; END IF;
  SELECT * INTO r FROM public.regions WHERE id = _region FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'bad region'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ships WHERE user_id = uid) THEN RAISE EXCEPTION 'no ship'; END IF;
  IF (SELECT body_id FROM public.ships WHERE user_id = uid) IS DISTINCT FROM r.body_id THEN RAISE EXCEPTION 'ship not here'; END IF;
  IF (SELECT status FROM public.celestial_bodies WHERE id = r.body_id) <> 'open' THEN RAISE EXCEPTION 'body locked'; END IF;
  IF EXISTS (SELECT 1 FROM public.regions WHERE owner_id = uid AND body_id = r.body_id) THEN RAISE EXCEPTION 'already landed'; END IF;
  IF r.owner_id IS NOT NULL THEN RAISE EXCEPTION 'region taken'; END IF;
  IF EXISTS (SELECT 1 FROM public.region_attacks WHERE region_id = _region AND resolved_at IS NULL) THEN RAISE EXCEPTION 'region contested'; END IF;
  UPDATE public.regions SET owner_id = uid, is_spaceport = true, owned_since = now() WHERE id = _region;
END $$;


--
-- Name: leave_game(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_game(_game uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.games set creator_ally_id = null, creator_ally_list_id = null where id = _game and creator_ally_id = auth.uid() and status = 'abierta';
  update public.games set opponent_ally_id = null, opponent_ally_list_id = null where id = _game and opponent_ally_id = auth.uid() and status = 'abierta';
end $$;


--
-- Name: list_40k_playable(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_40k_playable(_list uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.army_lists l,
      lateral (select u->>'name' as name, (u->>'models')::int as models, count(*) as n
               from jsonb_array_elements(coalesce(l.roster->'units','[]'::jsonb)) u group by 1,2) r
    where l.id = _list
      and r.n > coalesce((select w.quantity from public.wh40k_recruits w where w.user_id = l.user_id
                          and w.faction = l.army_faction and upper(w.unit_name) = upper(r.name) and w.models = r.models), 0)
  )
$$;


--
-- Name: list_players(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_players() RETURNS TABLE(id uuid, leader_name text, force_name text, allegiance public.allegiance)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.leader_name, p.force_name, p.allegiance from public.profiles p
  where p.approved and p.oath_sworn_at is not null and auth.uid() is not null
  order by p.leader_name
$$;


--
-- Name: load_pod_unit(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.load_pod_unit(_unit integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare uid uuid := auth.uid(); cap int; cur int; have int;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if _unit not in (20,23,24,25) then raise exception 'not a pod'; end if;
  perform pg_advisory_xact_lock(hashtext('pods:'||uid::text));
  perform public.support_tick(uid);
  cap := public.pod_capacity(public.mod_level(uid, 'bahia_pods'));
  if cap = 0 then raise exception 'no module'; end if;
  select coalesce(sum(quantity),0) into cur from public.pod_bay where user_id = uid;
  if _qty < 1 or cur + _qty > cap then raise exception 'capacity'; end if;
  select quantity into have from public.collection_items where user_id = uid and unit_id = _unit for update;
  if coalesce(have,0) < _qty then raise exception 'no reserves'; end if;
  update public.collection_items set quantity = quantity - _qty, updated_at = now() where user_id = uid and unit_id = _unit;
  delete from public.collection_items where user_id = uid and unit_id = _unit and quantity <= 0;
  insert into public.pod_bay (user_id, unit_id, quantity) values (uid, _unit, _qty)
    on conflict (user_id, unit_id) do update set quantity = public.pod_bay.quantity + excluded.quantity;
  update public.ship_supports set pods = pods + _qty where user_id = uid;
end $$;


--
-- Name: load_pods(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.load_pods(_qty integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select public.load_pod_unit(23, _qty) $$;


--
-- Name: mod_level(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mod_level(_uid uuid, _m text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select case when damaged then 0 else level end from public.ship_modules where user_id=_uid and module=_m),0)
$$;


--
-- Name: naval_apply_crits(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_apply_crits(_uid uuid, _n integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare out jsonb := '[]'::jsonb; i integer; m public.ship_modules; forja integer; lost boolean;
begin
  forja := public.mod_level(_uid,'forja');
  for i in 1..least(greatest(_n,0),3) loop
    if random() < 0.15*forja then out := out || jsonb_build_object('module','forja','saved',true); continue; end if;
    select * into m from public.ship_modules where user_id=_uid and level>0 and not damaged order by random() limit 1;
    if m.module is null then exit; end if;
    lost := random() < 0.25 and not (m.module='puente' and m.level<=1);
    update public.ship_modules set damaged=true, damaged_until=null, level = level - (case when lost then 1 else 0 end)
      where user_id=_uid and module=m.module;
    out := out || jsonb_build_object('module', m.module, 'lost_level', lost);
  end loop;
  return out;
end $$;


--
-- Name: naval_beats(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_beats(_a text, _b text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select (_a,_b) in (('fuego','abordaje'),('fuego','evasion'),('escudos','fuego'),('escudos','evasion'),
    ('abordaje','escudos'),('abordaje','lanza'),('evasion','lanza'),('evasion','abordaje'),('lanza','escudos'),('lanza','fuego'))
$$;


--
-- Name: naval_continue(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_continue(_raid uuid, _plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;uid uuid:=auth.uid();BEGIN PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_raid FOR UPDATE;IF uid IS NULL OR r.id IS NULL OR uid NOT IN(r.attacker_id,r.defender_id) THEN RAISE EXCEPTION 'forbidden';END IF;IF r.status<>'enfrentado' THEN RAISE EXCEPTION 'locked';END IF;IF r.deadline<=now() THEN PERFORM public.resolve_raid(_raid);RETURN;END IF;IF (CASE WHEN uid=r.attacker_id THEN r.attacker_ready ELSE r.defender_ready END) THEN RAISE EXCEPTION 'locked';END IF;IF NOT public.naval_plan_valid(_plan,uid) THEN RAISE EXCEPTION 'plan';END IF;IF uid=r.attacker_id THEN UPDATE public.naval_private_plans SET attacker_plan=_plan WHERE raid_id=_raid;UPDATE public.naval_raids SET attacker_ready=true WHERE id=_raid;ELSE UPDATE public.naval_private_plans SET defender_plan=_plan WHERE raid_id=_raid;UPDATE public.naval_raids SET defender_ready=true WHERE id=_raid;END IF;PERFORM public.resolve_raid(_raid);END $$;


--
-- Name: naval_finish(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_finish(_id uuid, _winner text, _reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;loser uuid;victor uuid;bal integer;exposed integer;v_loot integer:=0;boarding integer; BEGIN
 PERFORM pg_advisory_xact_lock(72401020); SELECT * INTO r FROM public.naval_raids WHERE id=_id FOR UPDATE; IF r.id IS NULL OR r.status NOT IN ('pendiente','enfrentado') THEN RETURN;END IF;
 IF _winner IS NULL OR _winner NOT IN ('atacante','defensor','empate') THEN RAISE EXCEPTION 'bad winner';END IF;
 IF _winner<>'empate' THEN victor:=CASE WHEN _winner='atacante' THEN r.attacker_id ELSE r.defender_id END;loser:=CASE WHEN _winner='atacante' THEN r.defender_id ELSE r.attacker_id END;SELECT imperial_credits INTO bal FROM public.profiles WHERE id=loser FOR UPDATE;exposed:=bal-floor(bal*least(3,public.mod_level(loser,'caja_creditos'))*0.10)::int;boarding:=COALESCE((r.report->>(CASE WHEN _winner='atacante' THEN 'boarding' ELSE 'defender_boarding' END))::int,0);v_loot:=least(600,floor(greatest(exposed,0)*least(0.10+0.05*boarding,0.20+0.05*public.mod_level(victor,'cubierta_abordaje')))::int);UPDATE public.profiles SET imperial_credits=imperial_credits-v_loot WHERE id=loser;UPDATE public.profiles SET imperial_credits=imperial_credits+v_loot,renown=renown+(CASE WHEN _winner='atacante' THEN 2 ELSE 1 END) WHERE id=victor;END IF;
 UPDATE public.naval_raids SET status='resuelto',winner=_winner,loot=v_loot,resolved_at=now(),report=COALESCE(report,'{}')||jsonb_build_object('objective',_reason) WHERE id=_id;END $$;


--
-- Name: naval_normal_plan(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_normal_plan(_p jsonb, _uid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT CASE WHEN public.naval_plan_valid(_p,_uid) THEN _p ELSE '["escudos","fuego","abordaje","fuego","escudos"]'::jsonb END $$;


--
-- Name: naval_order_module(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_order_module(_o text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case _o when 'fuego' then 'baterias' when 'escudos' then 'camara_escudos' when 'abordaje' then 'cubierta_abordaje'
    when 'evasion' then 'motores_plasma' when 'lanza' then 'lanza_proa' end
$$;


--
-- Name: naval_plan_valid(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_plan_valid(_p jsonb, _uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF _p IS NULL OR jsonb_typeof(_p)<>'array' THEN RETURN false; END IF; IF jsonb_array_length(_p)<>5 THEN RETURN false; END IF; RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(_p) o WHERE o NOT IN ('fuego','escudos','abordaje','evasion','lanza')) AND (SELECT count(*) FROM jsonb_array_elements_text(_p) o WHERE o='lanza')<=1 AND (SELECT count(*) FROM jsonb_array_elements_text(_p) o WHERE o='evasion')<=1+(CASE WHEN public.mod_level(_uid,'motores_plasma')>0 THEN 1 ELSE 0 END)+(CASE WHEN public.ship_fleet(_uid)='aeldari' THEN 1 ELSE 0 END);END $$;


--
-- Name: naval_raids_view(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_raids_view() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE result jsonb;uid uuid:=auth.uid();fleet jsonb;BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM public.resolve_raids();SELECT COALESCE(jsonb_agg((to_jsonb(r)-'attacker_plan'-'defender_plan')||jsonb_build_object('own_plan',CASE WHEN r.attacker_id=uid THEN pp.attacker_plan ELSE pp.defender_plan END)),'[]') INTO result FROM (SELECT * FROM public.naval_raids WHERE uid IN(attacker_id,defender_id) ORDER BY created_at DESC LIMIT 50) r LEFT JOIN public.naval_private_plans pp ON pp.raid_id=r.id;SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',s.user_id,'busy',public.ship_busy(s.user_id),'warp_until',public.ship_warp_until(s.user_id),'max_hull',public.ship_max_hull(s.user_id))),'[]') INTO fleet FROM public.ships s JOIN public.profiles p ON p.id=s.user_id WHERE p.approved AND p.oath_sworn_at IS NOT NULL;RETURN jsonb_build_object('raids',result,'fleet_status',fleet,'server_now',now());END $$;


--
-- Name: naval_roll(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_roll(_n integer, _target integer, OUT hits integer, OUT sixes integer) RETURNS record
    LANGUAGE plpgsql
    AS $$
declare i integer; d integer;
begin
  hits := 0; sixes := 0;
  for i in 1..greatest(_n,0) loop
    d := 1 + floor(random()*6)::int;
    if d >= _target then hits := hits+1; end if;
    if d = 6 then sixes := sixes+1; end if;
  end loop;
end $$;


--
-- Name: naval_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_stats() RETURNS TABLE(id uuid, raids_won integer, defenses_won integer, loot integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id,
    (select count(*)::int from public.naval_raids r where r.attacker_id=p.id and r.status='resuelto' and r.winner='atacante'),
    (select count(*)::int from public.naval_raids r where r.defender_id=p.id and r.status='resuelto' and r.winner='defensor'),
    (select coalesce(sum(r.loot),0)::int from public.naval_raids r where r.attacker_id=p.id and r.status='resuelto' and r.winner='atacante')
  from public.profiles p where auth.uid() is not null
$$;


--
-- Name: naval_valid_plan(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_valid_plan(_p jsonb) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT public.naval_plan_valid(_p,auth.uid()) $$;


--
-- Name: naval_withdraw(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.naval_withdraw(_raid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;uid uuid:=auth.uid();BEGIN PERFORM pg_advisory_xact_lock(72401020);PERFORM public.resolve_raid(_raid);SELECT * INTO r FROM public.naval_raids WHERE id=_raid FOR UPDATE;IF uid IS NULL OR r.id IS NULL OR uid NOT IN(r.attacker_id,r.defender_id) THEN RAISE EXCEPTION 'forbidden';END IF;IF r.status NOT IN('pendiente','enfrentado') THEN RAISE EXCEPTION 'locked';END IF;PERFORM public.naval_finish(_raid,CASE WHEN uid=r.attacker_id THEN 'defensor' ELSE 'atacante' END,'retirada_warp');END $$;


--
-- Name: no_simulated_40k_lists_in_games(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.no_simulated_40k_lists_in_games() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if exists (select 1 from public.army_lists l where l.id in (new.creator_list_id, new.opponent_list_id, new.creator_ally_list_id, new.opponent_ally_list_id)
             and l.game_system = '40k' and not public.list_40k_playable(l.id)) then
    raise exception 'list needs recruited units';
  end if;
  return new;
end $$;


--
-- Name: pod_capacity(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pod_capacity(_lvl integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case when _lvl <= 0 then 0 when _lvl = 1 then 10 when _lvl = 2 then 20 else 40 end
$$;


--
-- Name: process_veterans(uuid, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_veterans(_uid uuid, _game uuid, _v jsonb, _res text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare x jsonb; v public.veterans; used uuid[] := '{}'; dead boolean; wl int; mvp boolean; gain int; hon text; pool text[];
begin
  if _uid is null or _v is null or jsonb_typeof(_v) <> 'array' then return; end if;
  perform public.sync_veterans(_uid);
  for x in select * from jsonb_array_elements(_v) loop
    select * into v from public.veterans
      where user_id = _uid and unit_id = (x->>'unit_id')::int and status = 'activo' and not (id = any(used))
      order by (name <> '' and lower(name) = lower(coalesce(x->>'name',''))) desc, renown desc, created_at
      limit 1 for update;
    if v.id is null then continue; end if;
    used := used || v.id;
    dead := coalesce((x->>'destroyed')::boolean, false);
    wl := greatest(0, coalesce((x->>'wounds_lost')::int, 0));
    mvp := coalesce((x->>'mvp')::boolean, false);
    gain := 1 + (case when _res = 'victoria' then 1 else 0 end) + (case when mvp then 2 else 0 end);
    update public.veterans set renown = renown + gain where id = v.id;
    hon := null;
    if not dead and random() < 0.2 + (case when _res = 'victoria' then 0.1 else 0 end) + (case when mvp then 0.2 else 0 end)
       and (select count(*) from public.honours where veteran_id = v.id and used_at is null) < 2 then
      pool := case v.kind
        when 'titan' then array['repetir_disparo','recarga_escudos','reactor_estable','paso_firme']
        when 'caballero' then array['repetir_disparo','paso_firme','blindaje_reforzado','motor_forzado']
        else array['medico_mejorado','orden_inspiradora','duelo_heroico','ultima_resistencia'] end;
      hon := pool[1 + floor(random() * array_length(pool, 1))::int];
      insert into public.honours (user_id, unit_id, bearer, ability, veteran_id) values (_uid, v.unit_id, v.name, hon, v.id);
    end if;
    if dead then
      update public.veterans set status = 'caido' where id = v.id;
      if v.kind in ('titan','caballero') then
        insert into public.lost_engines (user_id, unit_id, name, game_id, veteran_id) values (_uid, v.unit_id, v.name, _game, v.id);
      end if;
    elsif wl > 0 and v.kind in ('titan','caballero') then
      insert into public.engine_damage (user_id, unit_id, name, wounds_lost, max_wounds, veteran_id)
        values (_uid, v.unit_id, v.name, wl, greatest(wl, coalesce((x->>'max_wounds')::int, wl)), v.id);
    end if;
    insert into public.veteran_battles (veteran_id, game_id, result, renown_gained, honour, destroyed, wounds_lost, mvp)
      values (v.id, _game, _res, gain, hon, dead, wl, mvp);
  end loop;
end $$;


--
-- Name: protect_conquest_game(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_conquest_game() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'UPDATE' and (old.region_id is not null or new.region_id is not null) then raise exception 'conquest game locked'; end if;
    if tg_op = 'INSERT' and new.region_id is not null then raise exception 'conquest game locked'; end if;
  end if;
  return new;
end $$;


--
-- Name: protect_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if current_user = 'authenticated' then
    new.imperial_credits := old.imperial_credits;
    new.renown := old.renown;
    new.approved := old.approved;
    new.email := old.email;
    new.forge_gift_claimed := old.forge_gift_claimed;
    if old.oath_sworn_at is not null then
      new.allegiance := old.allegiance;
      new.faction := old.faction;
      new.legion := old.legion;
      new.oath_sworn_at := old.oath_sworn_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;


--
-- Name: recharge_orbital(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recharge_orbital() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare lvl int; s public.ship_supports; cost int := 150;
begin
  perform public.support_tick(auth.uid());
  lvl := public.mod_level(auth.uid(), 'baterias');
  if lvl < 1 then raise exception 'no module'; end if;
  select * into s from public.ship_supports where user_id = auth.uid();
  if s.orbital_charged or s.orbital_ready_at is not null then raise exception 'already charged'; end if;
  if (select imperial_credits from public.profiles where id = auth.uid()) < cost then raise exception 'credits'; end if;
  update public.profiles set imperial_credits = imperial_credits - cost where id = auth.uid();
  update public.ship_supports set orbital_ready_at = now() + make_interval(hours => 12 - 3 * (lvl - 1)) where user_id = auth.uid();
end $$;


--
-- Name: recover_engine(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recover_engine(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare e public.lost_engines; k public.unit_catalog; lvl int; cost int;
begin
  select * into e from public.lost_engines where id = _id and user_id = auth.uid();
  if e.id is null then raise exception 'not found'; end if;
  lvl := public.mod_level(auth.uid(), 'gruas');
  if lvl < 1 then raise exception 'no module'; end if;
  select * into k from public.unit_catalog where unit_id = e.unit_id;
  if k.unit_id is null then raise exception 'bad unit'; end if;
  cost := ceil(k.cost * (case lvl when 1 then 0.6 when 2 then 0.45 else 0.3 end));
  if (select imperial_credits from public.profiles where id = auth.uid()) < cost then raise exception 'credits'; end if;
  update public.profiles set imperial_credits = imperial_credits - cost where id = auth.uid();
  insert into public.recruit_orders (user_id, unit_id, quantity, cost, ready_at) values (auth.uid(), e.unit_id, 1, cost, now() + make_interval(hours => greatest(1, k.hours / 2)));
  update public.veterans set status = 'recuperando' where id = e.veteran_id;
  delete from public.lost_engines where id = _id;
end $$;


--
-- Name: recruit_40k(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recruit_40k(_unit text, _models integer, _qty integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid:=auth.uid(); fac text; p public.wh40k_unit_prices; bal integer; sid uuid; unit_cost integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(72401020);
 IF _qty IS NULL OR _qty<1 OR _qty>10 THEN RAISE EXCEPTION 'bad qty'; END IF;
 SELECT army_faction,imperial_credits INTO fac,bal FROM public.profiles WHERE id=uid AND approved FOR UPDATE;
 IF fac IS NULL THEN RAISE EXCEPTION 'no army'; END IF;
 SELECT * INTO p FROM public.wh40k_unit_prices WHERE faction=fac AND unit_name=_unit AND models=_models;
 IF p.unit_name IS NULL THEN RAISE EXCEPTION 'bad unit'; END IF;
 IF p.epic_hero AND (EXISTS(SELECT 1 FROM public.wh40k_squads WHERE user_id=uid AND faction=fac AND unit_name=_unit) OR _qty>1) THEN RAISE EXCEPTION 'epic hero unique'; END IF;
 PERFORM public.ship_assert_capacity(uid,p.oc_per_model*_models*_qty);
 unit_cost:=ceil(p.points*(1-public.region_rate(uid,'arsenal')))::int;
 IF bal<unit_cost*_qty THEN RAISE EXCEPTION 'credits'; END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits-unit_cost*_qty WHERE id=uid;
 FOR i IN 1.._qty LOOP
 INSERT INTO public.wh40k_squads(user_id,faction,unit_name,models,models_alive,wounds_max,wounds_left,points,status,ready_at,oc_cost) VALUES(uid,fac,_unit,_models,_models,p.wounds,p.wounds,p.points,'training',now()+make_interval(secs=>public.ship_training_seconds(uid,p.points)),p.oc_per_model*_models) RETURNING id INTO sid;
 INSERT INTO public.wh40k_squad_history(squad_id,user_id,kind,cost) VALUES(sid,uid,'recruited',unit_cost);
 END LOOP;
 RETURN bal-unit_cost*_qty;
END $$;


--
-- Name: recruit_unit(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recruit_unit(_unit integer, _qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare c public.unit_catalog; uid uuid := auth.uid(); have integer; cap integer; total integer; hrs numeric; rt text[];
begin
  perform public.ship_tick();
  if uid is null or not exists (select 1 from public.ships where user_id = uid) then raise exception 'no ship'; end if;
  if _qty < 1 or _qty > 50 then raise exception 'bad qty'; end if;
  select * into c from public.unit_catalog where unit_id = _unit;
  if c.unit_id is null then raise exception 'bad unit'; end if;
  rt := public.region_types_of(uid);
  select coalesce(sum(ci.quantity),0) into have from public.collection_items ci join public.unit_catalog k on k.unit_id = ci.unit_id
    where ci.user_id = uid and (k.category = c.category or (c.category in ('infanteria','blindado') and k.category in ('infanteria','blindado')));
  select have + coalesce(sum(o.quantity),0) into have from public.recruit_orders o join public.unit_catalog k on k.unit_id = o.unit_id
    where o.user_id = uid and (k.category = c.category or (c.category in ('infanteria','blindado') and k.category in ('infanteria','blindado')));
  cap := case c.category
    when 'titan' then 2 + 2 * public.mod_level(uid,'hangar_titanes')
    when 'caballero' then 6 + 3 * public.mod_level(uid,'establos')
    else 100 + 30 * public.mod_level(uid,'bodegas') + (case when 'bastion' = any(rt) then 20 else 0 end) end;
  if have + _qty > cap then raise exception 'no capacity'; end if;
  total := c.cost * _qty;
  if 'arsenal' = any(rt) then total := round(total * 0.9); end if;
  if (select imperial_credits from public.profiles where id = uid) < total then raise exception 'credits'; end if;
  hrs := c.hours * (1 - 0.2 * public.mod_level(uid, case c.category when 'infanteria' then 'barracones' when 'blindado' then 'astropatico' else 'forja' end));
  if ('colmena' = any(rt) and c.category = 'infanteria') or ('manufactorum' = any(rt) and c.category = 'blindado') or ('forja' = any(rt) and c.category in ('titan','caballero')) then hrs := hrs * 0.8; end if;
  if 'puerto' = any(rt) then hrs := hrs * 0.9; end if;
  update public.profiles set imperial_credits = imperial_credits - total where id = uid;
  insert into public.recruit_orders (user_id, unit_id, quantity, cost, ready_at)
    values (uid, _unit, _qty, total, now() + make_interval(mins => greatest(30, (hrs * 60)::int)));
end $$;


--
-- Name: region_rate(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.region_rate(_uid uuid, _type text) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE WHEN n>=3 THEN 0.20 WHEN n=2 THEN 0.15 WHEN n=1 THEN 0.10 ELSE 0 END::numeric
  FROM (SELECT count(*) n FROM public.regions r WHERE r.owner_id=_uid AND r.type=_type
        AND r.body_id = (SELECT s.body_id FROM public.ships s WHERE s.user_id=_uid)) x $$;


--
-- Name: region_types_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.region_types_of(_uid uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(type), '{}') from public.regions where owner_id = _uid
$$;


--
-- Name: rename_ship(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_ship(_name text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.ships set name = trim(_name) where user_id = auth.uid() and length(trim(_name)) >= 2;
$$;


--
-- Name: rename_veteran(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rename_veteran(_id uuid, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if length(trim(coalesce(_name,''))) < 1 or length(trim(_name)) > 40 then raise exception 'bad name'; end if;
  update public.veterans set name = trim(_name) where id = _id and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  update public.honours set bearer = trim(_name) where veteran_id = _id;
end $$;


--
-- Name: repair_engine(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_engine(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare d public.engine_damage; k public.unit_catalog; cost int; hrs numeric;
begin
  select * into d from public.engine_damage where id = _id and user_id = auth.uid();
  if d.id is null then raise exception 'not found'; end if;
  if d.repair_until is not null then raise exception 'already repairing'; end if;
  select * into k from public.unit_catalog where unit_id = d.unit_id;
  cost := greatest(10, ceil(coalesce(k.cost, 100) * d.wounds_lost::numeric / greatest(1, d.max_wounds) * 0.4));
  hrs := greatest(1, coalesce(k.hours, 8) * d.wounds_lost::numeric / greatest(1, d.max_wounds) * 0.5 * (1 - 0.2 * public.mod_level(auth.uid(), 'talleres')));
  if (select imperial_credits from public.profiles where id = auth.uid()) < cost then raise exception 'credits'; end if;
  update public.profiles set imperial_credits = imperial_credits - cost where id = auth.uid();
  update public.ship_modules set level = level where false;
  update public.engine_damage set repair_until = now() + make_interval(mins => (hrs * 60)::int) where id = _id;
end $$;


--
-- Name: repair_hull(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_hull() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE n integer;r numeric;cost integer;BEGIN
 PERFORM public.ship_assert_job_slot();IF EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=auth.uid() AND kind='hull_repair') THEN RAISE EXCEPTION 'busy module';END IF;
 SELECT public.ship_max_hull(auth.uid())-hull_hp INTO n FROM public.ships WHERE user_id=auth.uid();IF n<=0 THEN RAISE EXCEPTION 'not damaged';END IF;
 r:=public.region_rate(auth.uid(),'dique');cost:=ceil(5*n*(1-r))::int;
 PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;IF (SELECT imperial_credits FROM public.profiles WHERE id=auth.uid())<cost THEN RAISE EXCEPTION 'credits';END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits-cost WHERE id=auth.uid();
 INSERT INTO public.build_queue(user_id,module,target_level,cost,kind,repair_amount,duration_seconds) VALUES(auth.uid(),'casco',0,cost,'hull_repair',n,greatest(1,ceil(120*n*(1-0.15*public.mod_level(auth.uid(),'forja'))*(1-r))::int));PERFORM public.ship_start_queued(auth.uid());END $$;


--
-- Name: repair_module(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.repair_module(_module text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE m public.ship_modules;t public.module_types;cost integer;r numeric;BEGIN
 PERFORM public.ship_assert_job_slot();SELECT * INTO m FROM public.ship_modules WHERE user_id=auth.uid() AND module=_module FOR UPDATE;
 IF m.module IS NULL OR NOT m.damaged THEN RAISE EXCEPTION 'not damaged';END IF;IF EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=auth.uid() AND module=_module) THEN RAISE EXCEPTION 'busy module';END IF;
 SELECT * INTO t FROM public.module_types WHERE id=_module;r:=public.region_rate(auth.uid(),'dique');
 cost:=ceil(greatest(50,t.base_cost*greatest(m.level,1)/2)*(1-r))::int;PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;IF (SELECT imperial_credits FROM public.profiles WHERE id=auth.uid())<cost THEN RAISE EXCEPTION 'credits';END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits-cost WHERE id=auth.uid();
 INSERT INTO public.build_queue(user_id,module,target_level,cost,kind,duration_seconds) VALUES(auth.uid(),_module,m.level,cost,'module_repair',greatest(1,ceil(greatest(1,t.base_hours*greatest(m.level,1)/2)*3600*(1-r))::int));PERFORM public.ship_start_queued(auth.uid());END $$;


--
-- Name: reset_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_profile() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
 -- Same lock as recruitment, cancellation, ship work and naval settlement.
 PERFORM pg_advisory_xact_lock(72401020);
 PERFORM 1 FROM public.profiles WHERE id=_uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Perfil no encontrado'; END IF;
 UPDATE public.region_attacks SET resolved_at=now(), result='cancelada'
 WHERE resolved_at IS NULL AND (attacker_id=_uid OR defender_id=_uid OR game_id IN (
 SELECT id FROM public.games WHERE status<>'finalizada' AND _uid IN (creator_id,opponent_id,creator_ally_id,opponent_ally_id)));
 UPDATE public.games SET status='cancelada',region_id=NULL
 WHERE status<>'finalizada' AND _uid IN (creator_id,opponent_id,creator_ally_id,opponent_ally_id);
 UPDATE public.games SET creator_list_id=NULL WHERE creator_id=_uid;
 UPDATE public.games SET opponent_list_id=NULL WHERE opponent_id=_uid;
 UPDATE public.games SET creator_ally_list_id=NULL WHERE creator_ally_id=_uid;
 UPDATE public.games SET opponent_ally_list_id=NULL WHERE opponent_ally_id=_uid;
 UPDATE public.regions SET owner_id=NULL,is_spaceport=false,owned_since=NULL WHERE owner_id=_uid;
 UPDATE public.naval_raids SET status='anulado',resolved_at=now()
 WHERE status IN ('pendiente','enfrentado') AND (attacker_id=_uid OR defender_id=_uid);
 DELETE FROM public.naval_private_plans WHERE raid_id IN (SELECT id FROM public.naval_raids WHERE attacker_id=_uid OR defender_id=_uid);
 DELETE FROM public.naval_stances WHERE user_id=_uid;
 DELETE FROM public.region_attacks WHERE attacker_id=_uid OR defender_id=_uid;
 DELETE FROM public.game_exclusions WHERE user_id=_uid;
 DELETE FROM public.battle_records WHERE user_id=_uid;
 DELETE FROM public.wh40k_squad_history WHERE user_id=_uid;
 DELETE FROM public.wh40k_squads WHERE user_id=_uid;
 DELETE FROM public.wh40k_recruits WHERE user_id=_uid;
 DELETE FROM public.honours WHERE user_id=_uid;
 DELETE FROM public.engine_damage WHERE user_id=_uid;
 DELETE FROM public.lost_engines WHERE user_id=_uid;
 DELETE FROM public.veteran_battles WHERE veteran_id IN (SELECT id FROM public.veterans WHERE user_id=_uid);
 DELETE FROM public.veterans WHERE user_id=_uid;
 DELETE FROM public.recruit_orders WHERE user_id=_uid;
 DELETE FROM public.build_queue WHERE user_id=_uid;
 DELETE FROM public.pod_bay WHERE user_id=_uid;
 DELETE FROM public.ship_supports WHERE user_id=_uid;
 DELETE FROM public.ship_modules WHERE user_id=_uid;
 DELETE FROM public.ships WHERE user_id=_uid;
 DELETE FROM public.army_lists WHERE user_id=_uid;
 DELETE FROM public.collection_items WHERE user_id=_uid;
 UPDATE public.profiles SET previous_allegiance=NULL,
 allegiance=NULL,faction=NULL,legion=NULL,oath_sworn_at=NULL,
 army_race=NULL,army_faction=NULL,army_variant=NULL,
 leader_name=NULL,force_name=NULL,portrait_path=NULL,
 map_color=DEFAULT,map_emblem=DEFAULT,forge_gift_claimed=DEFAULT,
 imperial_credits=DEFAULT,renown=DEFAULT
 WHERE id=_uid;
END $$;


--
-- Name: FUNCTION reset_profile(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reset_profile() IS 'Atomic personal progress reset; preserves account, approval, roles and shared finished matches for rivals.';


--
-- Name: resolve_raid(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_raid(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r public.naval_raids;pp public.naval_private_plans;ap jsonb;dp jsonb;ahull integer;dhull integer;amax integer;dmax integer;ah integer;dh integer;ac integer;dc integer;aheal integer;dheal integer;oa text;od text;rounds jsonb;acrit jsonb;dcrit jsonb;a_total integer:=0;d_total integer:=0;ab integer;db integer;roll record;
BEGIN
 PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_id FOR UPDATE;IF r.id IS NULL OR r.status NOT IN ('pendiente','enfrentado') THEN RETURN;END IF;IF r.status='pendiente' AND r.deadline>now() THEN RETURN;END IF;
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


--
-- Name: resolve_raids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_raids() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE x uuid;BEGIN PERFORM pg_advisory_xact_lock(72401020);FOR x IN SELECT id FROM public.naval_raids WHERE status IN ('pendiente','enfrentado') AND deadline<=now() ORDER BY deadline LIMIT 20 LOOP PERFORM public.resolve_raid(x);END LOOP;FOR x IN SELECT DISTINCT user_id FROM public.build_queue LOOP PERFORM public.ship_process_jobs(x);END LOOP;END $$;


--
-- Name: respond_game(uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_game(_game uuid, _accept boolean, _list uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE g public.games; l public.army_lists;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR g.status <> 'abierta' OR g.creator_id = auth.uid() OR auth.uid() IN (coalesce(g.creator_ally_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(g.opponent_ally_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN RAISE EXCEPTION 'not available'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND approved) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.opponent_id IS NULL THEN
    IF public.is_excluded(_game, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF NOT _accept THEN RAISE EXCEPTION 'open games cannot be rejected'; END IF;
  ELSIF g.opponent_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden';
  ELSIF g.opponent_list_id IS NOT NULL THEN RAISE EXCEPTION 'already accepted';
  END IF;
  IF _accept AND _list IS NULL THEN RAISE EXCEPTION 'list required'; END IF;
  IF _list IS NOT NULL THEN
    SELECT * INTO l FROM public.army_lists WHERE id = _list AND user_id = auth.uid();
    IF l.id IS NULL THEN RAISE EXCEPTION 'bad list'; END IF;
    IF l.game_system = '40k' THEN
      IF l.list_format IS DISTINCT FROM g.battle_type THEN RAISE EXCEPTION 'list kind mismatch'; END IF;
      IF l.points > g.points THEN RAISE EXCEPTION 'list over points'; END IF;
      IF NOT public.list_40k_playable(_list) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
    END IF;
  END IF;
  IF _accept THEN
    g.opponent_id := auth.uid();
    UPDATE public.games SET opponent_id = auth.uid(), opponent_list_id = _list,
      status = CASE WHEN public.game_full(g) THEN 'aceptada' ELSE 'abierta' END,
      accepted_at = CASE WHEN public.game_full(g) THEN now() ELSE null END
    WHERE id = _game;
  ELSE
    UPDATE public.games SET status = 'rechazada' WHERE id = _game;
  END IF;
END $$;


--
-- Name: save_battle(uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_battle(_game uuid, _battle jsonb, _status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare g public.games; c public.campaign; a public.region_attacks; w text; winner uuid; r public.regions; vc int; vo int;
  u uuid; side text; res text; cas jsonb;
begin
  select * into g from public.games where id = _game for update;
  if g.id is null or auth.uid() is null or not public.is_game_player(_game, auth.uid()) then raise exception 'forbidden'; end if;
  if g.status not in ('aceptada','en_curso') then raise exception 'not active'; end if;
  if _status not in ('en_curso','finalizada') then raise exception 'bad status'; end if;
  update public.games set battle = _battle, status = _status, started_at = coalesce(started_at, now()) where id = _game;
  if _status <> 'finalizada' then return; end if;
  select * into c from public.campaign where id = 1;
  w := _battle->'result'->>'winner';
  if w = 'creator' then winner := g.creator_id; elsif w = 'opponent' then winner := g.opponent_id; end if;
  select coalesce(sum(v::int),0) into vc from jsonb_array_elements_text(coalesce(_battle->'vp'->'creator','[]'::jsonb)) v;
  select coalesce(sum(v::int),0) into vo from jsonb_array_elements_text(coalesce(_battle->'vp'->'opponent','[]'::jsonb)) v;
  for u, side in select x.u, x.s from (values (g.creator_id,'creator'), (g.creator_ally_id,'creator'), (g.opponent_id,'opponent'), (g.opponent_ally_id,'opponent')) x(u, s) where x.u is not null loop
    res := case when w = side then 'victoria' when w in ('creator','opponent') then 'derrota' else 'empate' end;
    if res = 'victoria' then update public.profiles set imperial_credits = imperial_credits + c.reward_win, renown = renown + 10 where id = u;
    elsif res = 'derrota' then update public.profiles set imperial_credits = imperial_credits + c.reward_loss, renown = renown + 2 where id = u;
    else update public.profiles set imperial_credits = imperial_credits + c.reward_loss, renown = renown + 4 where id = u; end if;
    cas := coalesce(_battle->'casualtiesByUser'->(u::text), case when u = g.creator_id then _battle->'casualties'->'creator' when u = g.opponent_id then _battle->'casualties'->'opponent' end);
    perform public.process_veterans(u, _game, cas->'veterans', res);
    perform public.apply_casualties(u, _game, cas);
    insert into public.battle_records (game_id, user_id, result, vp_for, vp_against, points, models_lost, engines_destroyed, conquest, mvp) values
      (_game, u, res, case when side = 'creator' then vc else vo end, case when side = 'creator' then vo else vc end, g.points,
       coalesce((cas->>'models')::int, 0),
       coalesce((_battle->'casualties'->(case when side = 'creator' then 'opponent' else 'creator' end)->>'engines')::int, 0),
       g.region_id is not null, _battle->'result'->'mvp'->>side)
      on conflict do nothing;
  end loop;
  select * into a from public.region_attacks where game_id = _game and resolved_at is null;
  if a.id is null then return; end if;
  select * into r from public.regions where id = a.region_id;
  if winner = a.attacker_id and r.owner_id = a.defender_id then
    if r.is_spaceport then
      update public.regions set owner_id = null, is_spaceport = false, owned_since = null where owner_id = a.defender_id;
      update public.region_attacks set resolved_at = now(), result = 'anulada' where attacker_id = a.defender_id and resolved_at is null;
    end if;
    perform public.give_region(a.region_id, a.attacker_id, c.reward_capture);
    update public.region_attacks set resolved_at = now(), result = case when r.is_spaceport then 'espaciopuerto_destruido' else 'batalla_atacante' end where id = a.id;
  else
    update public.region_attacks set resolved_at = now(), result = 'batalla_defensor' where id = a.id;
  end if;
end $$;


--
-- Name: set_approval(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_approval(_user uuid, _approved boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'forbidden'; end if;
  update public.profiles set approved = _approved where id = _user;
end $$;


--
-- Name: set_default_stance(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_default_stance(_plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;IF NOT public.naval_plan_valid(_plan,auth.uid()) THEN RAISE EXCEPTION 'plan';END IF;INSERT INTO public.naval_stances(user_id,plan) VALUES(auth.uid(),_plan) ON CONFLICT(user_id) DO UPDATE SET plan=EXCLUDED.plan,updated_at=now();END $$;


--
-- Name: set_raid_plan(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_raid_plan(_raid uuid, _plan jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE r public.naval_raids;uid uuid:=auth.uid();BEGIN PERFORM pg_advisory_xact_lock(72401020);SELECT * INTO r FROM public.naval_raids WHERE id=_raid FOR UPDATE;IF uid IS NULL OR r.id IS NULL OR uid NOT IN(r.attacker_id,r.defender_id) THEN RAISE EXCEPTION 'forbidden';END IF;IF r.status<>'pendiente' OR r.deadline<=now() THEN RAISE EXCEPTION 'locked';END IF;IF NOT public.naval_plan_valid(_plan,uid) THEN RAISE EXCEPTION 'plan';END IF;IF uid=r.attacker_id THEN UPDATE public.naval_private_plans SET attacker_plan=_plan WHERE raid_id=_raid;ELSE UPDATE public.naval_private_plans SET defender_plan=_plan WHERE raid_id=_raid;END IF;END $$;


--
-- Name: ship_abort_course(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_abort_course() RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s public.ships; p public.ship_travel_private; secs int; eta timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  PERFORM public.ship_travel_tick();
  SELECT * INTO s FROM public.ships WHERE user_id = uid FOR UPDATE;
  IF s.user_id IS NULL THEN RAISE EXCEPTION 'no ship'; END IF;
  IF s.arrives_at IS NULL OR s.travel_from IS NULL THEN RAISE EXCEPTION 'not traveling'; END IF;
  SELECT * INTO p FROM public.ship_travel_private WHERE user_id = uid FOR UPDATE;
  IF p.user_id IS NULL THEN RAISE EXCEPTION 'not traveling'; END IF;
  IF p.destination = s.travel_from THEN RAISE EXCEPTION 'already returning'; END IF;
  secs := greatest(60, extract(epoch FROM now() - p.started_at)::int);
  eta := now() + make_interval(secs => secs);
  UPDATE public.ships SET arrives_at = eta WHERE user_id = uid;
  UPDATE public.ship_travel_private SET destination = s.travel_from, started_at = now() WHERE user_id = uid;
  RETURN eta;
END $$;


--
-- Name: ship_assert_capacity(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_assert_capacity(_uid uuid, _oc numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ships WHERE user_id=_uid) THEN RAISE EXCEPTION 'no ship'; END IF;
 IF _oc IS NULL OR EXISTS(SELECT 1 FROM public.wh40k_squads WHERE user_id=_uid AND status NOT IN ('fallen','dismissed') AND oc_cost IS NULL) THEN RAISE EXCEPTION 'OC unavailable'; END IF;
 IF _oc>0 AND public.ship_oc_used(_uid)+_oc>public.ship_capacity(_uid) THEN RAISE EXCEPTION 'cargo full'; END IF;
END $$;


--
-- Name: ship_assert_job_slot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_assert_job_slot() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_tick();PERFORM 1 FROM public.ships WHERE user_id=auth.uid() FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'no ship';END IF;IF public.ship_busy(auth.uid()) THEN RAISE EXCEPTION 'ship busy';END IF;IF (SELECT count(*) FROM public.build_queue WHERE user_id=auth.uid())>=5 THEN RAISE EXCEPTION 'queue full';END IF;END $$;


--
-- Name: ship_base_hull(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_base_hull(_uid uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT CASE public.ship_fleet(_uid) WHEN 'tau' THEN 22 WHEN 'aeldari' THEN 24 WHEN 'drukhari' THEN 22 WHEN 'orks' THEN 40 WHEN 'daemons' THEN 28 WHEN 'necrons' THEN 34 WHEN 'tyranids' THEN 36 WHEN 'votann' THEN 36 WHEN 'genestealer' THEN 28 ELSE 30 END $$;


--
-- Name: ship_busy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_busy(_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS(SELECT 1 FROM public.naval_raids WHERE status IN ('pendiente','enfrentado') AND _uid IN (attacker_id,defender_id)) $$;


--
-- Name: ship_capacity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_capacity(_uid uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM public.ships WHERE user_id=_uid)
 THEN floor((100+100*public.mod_level(_uid,'bodegas'))*public.faction_hold_factor((SELECT army_faction FROM public.profiles WHERE id=_uid))*(1+public.region_rate(_uid,'bastion')))::int ELSE 0 END $$;


--
-- Name: ship_fleet(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_fleet(_uid uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT CASE WHEN army_faction='drukhari' THEN 'drukhari' WHEN army_faction='genestealer-cults' THEN 'genestealer' WHEN army_race='humanity' THEN CASE WHEN army_faction IN ('chaos-space-marines','chaos-knights','death-guard','emperors-children','thousand-sons','world-eaters') THEN 'chaos' ELSE 'imperium' END ELSE COALESCE(army_race,'imperium') END FROM public.profiles WHERE id=_uid
$$;


--
-- Name: ship_max_hull(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_max_hull(_uid uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT public.ship_base_hull(_uid) + 8 * COALESCE((SELECT level FROM public.ship_modules WHERE user_id=_uid AND module='casco'),0) $$;


--
-- Name: ship_module_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_module_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid;BEGIN uid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;IF public.ship_busy(uid) AND (TG_OP='DELETE' OR (TG_OP='INSERT' AND NEW.building_until IS NOT NULL) OR (TG_OP='UPDATE' AND (NEW.building_until IS DISTINCT FROM OLD.building_until OR NEW.damaged_until IS DISTINCT FROM OLD.damaged_until))) THEN RAISE EXCEPTION 'ship busy';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;


--
-- Name: ship_oc_used(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_oc_used(_uid uuid) RETURNS numeric
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT COALESCE(sum(oc_cost),0) FROM public.wh40k_squads WHERE user_id=_uid AND status NOT IN ('fallen','dismissed') $$;


--
-- Name: ship_process_jobs(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_process_jobs(_uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE q public.build_queue;oldmax integer;newmax integer;
BEGIN
 PERFORM pg_advisory_xact_lock(72401020);PERFORM 1 FROM public.ships WHERE user_id=_uid FOR UPDATE;
 IF public.ship_busy(_uid) THEN RETURN;END IF;PERFORM public.ship_start_queued_at(_uid,now());
 LOOP
 SELECT * INTO q FROM public.build_queue WHERE user_id=_uid AND started_at IS NOT NULL FOR UPDATE;
 EXIT WHEN q.id IS NULL OR q.finishes_at>now();
 IF q.kind='build' THEN oldmax:=public.ship_max_hull(_uid);UPDATE public.ship_modules SET level=q.target_level,building_until=NULL WHERE user_id=_uid AND module=q.module;newmax:=public.ship_max_hull(_uid);UPDATE public.ships SET hull_hp=least(newmax,COALESCE(hull_hp,oldmax)+greatest(0,newmax-oldmax)) WHERE user_id=_uid;
 ELSIF q.kind='module_repair' THEN UPDATE public.ship_modules SET damaged=false,damaged_until=NULL WHERE user_id=_uid AND module=q.module;
 ELSE UPDATE public.ships SET hull_hp=least(public.ship_max_hull(_uid),hull_hp+q.repair_amount),hull_repair_until=NULL,hull_repair_target=NULL WHERE user_id=_uid;END IF;
 DELETE FROM public.build_queue WHERE id=q.id;PERFORM public.ship_start_queued_at(_uid,q.finishes_at);
 END LOOP;
END $$;


--
-- Name: ship_set_course(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_set_course(_body text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s public.ships; secs int; eta timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM pg_advisory_xact_lock(72401020);
  PERFORM public.ship_travel_tick();
  IF NOT EXISTS (SELECT 1 FROM public.celestial_bodies WHERE id = _body AND playable) THEN RAISE EXCEPTION 'bad body'; END IF;
  SELECT * INTO s FROM public.ships WHERE user_id = uid FOR UPDATE;
  IF s.user_id IS NULL THEN RAISE EXCEPTION 'no ship'; END IF;
  IF s.body_id IS NULL THEN RAISE EXCEPTION 'in warp'; END IF;
  IF s.body_id = _body THEN RAISE EXCEPTION 'already there'; END IF;
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  secs := public.travel_seconds(s.body_id, _body);
  eta := now() + make_interval(secs => secs);
  UPDATE public.ships SET travel_from = body_id, body_id = NULL, arrives_at = eta WHERE user_id = uid;
  INSERT INTO public.ship_travel_private (user_id, destination) VALUES (uid, _body)
    ON CONFLICT (user_id) DO UPDATE SET destination = EXCLUDED.destination, started_at = now();
  RETURN eta;
END $$;


--
-- Name: ship_start_queued(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_start_queued(_uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN PERFORM pg_advisory_xact_lock(72401020);PERFORM public.ship_start_queued_at(_uid,now());END $$;


--
-- Name: ship_start_queued_at(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_start_queued_at(_uid uuid, _at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE q public.build_queue;t public.module_types;seconds integer;yard integer;
BEGIN
 IF public.ship_busy(_uid) OR EXISTS(SELECT 1 FROM public.build_queue WHERE user_id=_uid AND started_at IS NOT NULL) THEN RETURN;END IF;
 SELECT * INTO q FROM public.build_queue WHERE user_id=_uid ORDER BY created_at,sequence LIMIT 1 FOR UPDATE;
 IF q.id IS NULL THEN RETURN;END IF;
 SELECT * INTO t FROM public.module_types WHERE id=q.module;yard:=public.mod_level(_uid,'forja');
 seconds:=COALESCE(q.duration_seconds,CASE q.kind WHEN 'build' THEN greatest(1,round(t.base_hours*q.target_level*(1-0.15*yard))::int)*3600 WHEN 'module_repair' THEN greatest(1,t.base_hours*greatest(q.target_level,1)/2)*3600 ELSE ceil(120*q.repair_amount*(1-0.15*yard))::int END);
 UPDATE public.build_queue SET started_at=_at,finishes_at=_at+make_interval(secs=>greatest(1,seconds)) WHERE id=q.id;
 IF q.kind='build' THEN INSERT INTO public.ship_modules(user_id,module,level,building_until) VALUES(_uid,q.module,q.target_level-1,_at+make_interval(secs=>greatest(1,seconds))) ON CONFLICT(user_id,module) DO UPDATE SET building_until=EXCLUDED.building_until;
 ELSIF q.kind='module_repair' THEN UPDATE public.ship_modules SET damaged_until=_at+make_interval(secs=>greatest(1,seconds)) WHERE user_id=_uid AND module=q.module;
 ELSE UPDATE public.ships SET hull_repair_until=_at+make_interval(secs=>greatest(1,seconds)),hull_repair_target=least(public.ship_max_hull(_uid),hull_hp+q.repair_amount) WHERE user_id=_uid;END IF;
END $$;


--
-- Name: ship_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_status() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE uid uuid:=auth.uid();bal integer;protected integer;BEGIN IF uid IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM public.ship_tick();SELECT imperial_credits INTO bal FROM public.profiles WHERE id=uid;protected:=floor(bal*0.10*least(3,public.mod_level(uid,'caja_creditos')))::int;RETURN jsonb_build_object('max_hull',public.ship_max_hull(uid),'capacity',public.ship_capacity(uid),'used_oc',public.ship_oc_used(uid),'unknown_oc',(SELECT count(*) FROM public.wh40k_squads WHERE user_id=uid AND status NOT IN('fallen','dismissed') AND oc_cost IS NULL),'protected_credits',protected,'exposed_credits',bal-protected,'recruitment_reduction',10*least(3,public.mod_level(uid,'astropatico')),'busy',public.ship_busy(uid),'server_now',now());END $$;


--
-- Name: ship_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden';END IF;PERFORM pg_advisory_xact_lock(72401020);PERFORM public.campaign_tick();PERFORM public.resolve_raids();PERFORM public.ship_process_jobs(auth.uid());END $$;


--
-- Name: ship_training_seconds(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_training_seconds(_uid uuid, _points integer) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT ceil(36*_points*(1-0.10*least(3,public.mod_level(_uid,'astropatico')))*(1-public.region_rate(_uid,'colmena')))::int $$;


--
-- Name: ship_travel_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_travel_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.ships s SET body_id = p.destination, travel_from = NULL, arrives_at = NULL
    FROM public.ship_travel_private p WHERE p.user_id = s.user_id AND s.arrives_at IS NOT NULL AND s.arrives_at <= now();
  DELETE FROM public.ship_travel_private p USING public.ships s WHERE s.user_id = p.user_id AND s.arrives_at IS NULL;
END $$;


--
-- Name: ship_warp_until(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_warp_until(_uid uuid) RETURNS timestamp with time zone
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
 SELECT max(resolved_at)+interval '48 hours'+make_interval(hours=>(public.region_rate(_uid,'puerto')*60)::int) FROM public.naval_raids WHERE defender_id=_uid AND status='resuelto' AND resolved_at >= (SELECT oath_sworn_at FROM public.profiles WHERE id=_uid) $$;


--
-- Name: ship_work_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ship_work_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ BEGIN IF public.ship_busy(COALESCE(NEW.user_id,OLD.user_id)) THEN RAISE EXCEPTION 'ship busy';END IF;IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;


--
-- Name: strategos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.strategos() RETURNS TABLE(id uuid, leader_name text, force_name text, allegiance public.allegiance, faction text, legion text, portrait_path text, renown integer, map_color text, map_emblem text, battles integer, wins integer, losses integer, draws integer, regions integer, spaceport text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.leader_name, p.force_name, p.allegiance, p.faction, p.legion, p.portrait_path, p.renown, p.map_color, p.map_emblem,
    (select count(*)::int from games g where g.status = 'finalizada' and p.id in (g.creator_id, g.opponent_id)),
    (select count(*)::int from games g where g.status = 'finalizada' and ((g.creator_id = p.id and g.battle->'result'->>'winner' = 'creator') or (g.opponent_id = p.id and g.battle->'result'->>'winner' = 'opponent'))),
    (select count(*)::int from games g where g.status = 'finalizada' and ((g.creator_id = p.id and g.battle->'result'->>'winner' = 'opponent') or (g.opponent_id = p.id and g.battle->'result'->>'winner' = 'creator'))),
    (select count(*)::int from games g where g.status = 'finalizada' and p.id in (g.creator_id, g.opponent_id) and g.battle->'result'->>'winner' = 'empate'),
    (select count(*)::int from regions r where r.owner_id = p.id),
    (select r.name from regions r where r.owner_id = p.id and r.is_spaceport limit 1)
  from profiles p
  where p.approved and p.oath_sworn_at is not null and auth.uid() is not null
  order by p.renown desc, p.leader_name;
$$;


--
-- Name: support_tick(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.support_tick(_uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.ship_supports (user_id) values (_uid) on conflict do nothing;
  update public.ship_supports set orbital_charged = true, orbital_ready_at = null where user_id = _uid and orbital_ready_at is not null and orbital_ready_at <= now();
  update public.ship_supports set pods = pods + pods_building, pods_building = 0, pods_ready_at = null where user_id = _uid and pods_ready_at is not null and pods_ready_at <= now();
  update public.engine_damage set repair_until = repair_until where false;
  delete from public.engine_damage where user_id = _uid and repair_until is not null and repair_until <= now();
end $$;


--
-- Name: sync_my_veterans(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_my_veterans() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  perform public.sync_veterans(auth.uid());
end $$;


--
-- Name: sync_veterans(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_veterans(_uid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare r record; act int; need int; kd text;
begin
  for r in
    select u.unit_id, coalesce(ci.quantity, 0) q from (
      select unit_id from public.collection_items where user_id = _uid
      union select unit_id from public.veterans where user_id = _uid and status = 'activo') u
    left join public.collection_items ci on ci.user_id = _uid and ci.unit_id = u.unit_id
  loop
    kd := public.veteran_kind(r.unit_id);
    if kd is null then continue; end if;
    select count(*) into act from public.veterans where user_id = _uid and unit_id = r.unit_id and status = 'activo';
    need := r.q - act;
    if need > 0 then
      update public.veterans set status = 'activo' where id in (
        select id from public.veterans where user_id = _uid and unit_id = r.unit_id and status = 'recuperando' order by renown desc limit need);
      get diagnostics act = row_count;
      need := need - act;
      insert into public.veterans (user_id, unit_id, kind) select _uid, r.unit_id, kd from generate_series(1, greatest(0, need));
    elsif need < 0 then
      update public.veterans set status = 'retirado' where id in (
        select id from public.veterans where user_id = _uid and unit_id = r.unit_id and status = 'activo' order by renown asc, created_at desc limit -need);
    end if;
  end loop;
end $$;


--
-- Name: system_ships(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.system_ships() RETURNS TABLE(user_id uuid, name text, body_id text, travel_from text, arrives_at timestamp with time zone, destination text, leader_name text, army_faction text, map_color text, map_emblem text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.ship_travel_tick();
  RETURN QUERY SELECT s.user_id, s.name, s.body_id, s.travel_from,
    CASE WHEN s.user_id = auth.uid() THEN s.arrives_at END,
    CASE WHEN s.user_id = auth.uid() THEN p2.destination END,
    p.leader_name, p.army_faction, p.map_color, p.map_emblem
  FROM public.ships s JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN public.ship_travel_private p2 ON p2.user_id = s.user_id
  WHERE p.approved AND p.oath_sworn_at IS NOT NULL;
END $$;


--
-- Name: travel_seconds(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.travel_seconds(_a text, _b text) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE WHEN _a IS NULL OR _b IS NULL THEN 0 WHEN _a = _b THEN 0
    WHEN a.orbit = b.orbit THEN 10800
    ELSE greatest(10800, round(604800 * abs(a.orbit - b.orbit) / 6.0)::int) END
  FROM public.celestial_bodies a, public.celestial_bodies b WHERE a.id = _a AND b.id = _b $$;


--
-- Name: use_honour(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.use_honour(_id uuid, _game uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_game_player(_game, auth.uid()) or not exists (select 1 from public.games where id = _game and status in ('aceptada','en_curso')) then raise exception 'forbidden'; end if;
  update public.honours set used_at = now(), used_game = _game where id = _id and user_id = auth.uid() and used_at is null;
  if not found then raise exception 'not available'; end if;
end $$;


--
-- Name: use_support(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.use_support(_game uuid, _kind text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.is_game_player(_game, auth.uid()) or not exists (select 1 from public.games where id = _game and status in ('aceptada','en_curso')) then raise exception 'forbidden'; end if;
  perform public.support_tick(auth.uid());
  if _kind = 'orbital' then
    if not (select orbital_charged from public.ship_supports where user_id = auth.uid()) then raise exception 'not charged'; end if;
    update public.ship_supports set orbital_charged = false where user_id = auth.uid();
  elsif _kind = 'pod' then
    if (select pods from public.ship_supports where user_id = auth.uid()) < 1 then raise exception 'no pods'; end if;
    update public.ship_supports set pods = pods - 1 where user_id = auth.uid();
  else raise exception 'bad kind'; end if;
end $$;


--
-- Name: validate_40k_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_40k_list() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare fac text;
begin
  if new.game_system <> '40k' then return new; end if;
  select army_faction into fac from public.profiles where id = new.user_id;
  if fac is null or new.army_faction is distinct from fac then raise exception 'list must use your army faction'; end if;
  if new.list_format not in ('normal', 'patrulla') then raise exception 'bad format'; end if;
  if new.list_format = 'patrulla' and coalesce(new.roster->>'patrolId', '') = '' then raise exception 'patrol required'; end if;
  if new.points <= 0 then raise exception 'bad battle size'; end if;
  return new;
end $$;


--
-- Name: validate_army_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_army_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE race_map jsonb := '{"humanity":["space-marines","grey-knights","adepta-sororitas","adeptus-custodes","adeptus-mechanicus","astra-militarum","imperial-agents","imperial-knights","chaos-space-marines","chaos-knights","death-guard","emperors-children","thousand-sons","world-eaters"],"daemons":["chaos-daemons"],"aeldari":["aeldari","drukhari"],"tau":["tau-empire"],"orks":["orks"],"necrons":["necrons"],"tyranids":["tyranids","genestealer-cults"],"votann":["leagues-of-votann"]}'::jsonb;
variant_map jsonb := '{"space-marines":["imperial-fists","iron-hands","salamanders","raven-guard","ultramarines","white-scars","black-templars","blood-angels","dark-angels","deathwatch","space-wolves"],"aeldari":["harlequins","ynnari"]}'::jsonb;
BEGIN
IF TG_OP = 'UPDATE' AND OLD.oath_sworn_at IS NOT NULL AND NEW.oath_sworn_at IS NULL THEN
  NEW.army_race := NULL; NEW.army_faction := NULL; NEW.army_variant := NULL;
END IF;
IF NEW.army_race IS NULL AND NEW.army_faction IS NULL AND NEW.army_variant IS NULL THEN RETURN NEW; END IF;
IF NEW.army_race IS NULL OR NEW.army_faction IS NULL OR NOT COALESCE((race_map -> NEW.army_race) ? NEW.army_faction, false) THEN RAISE EXCEPTION 'Invalid race/faction selection'; END IF;
IF NEW.army_variant IS NOT NULL AND NOT COALESCE((variant_map -> NEW.army_faction) ? NEW.army_variant, false) THEN RAISE EXCEPTION 'Invalid faction variant'; END IF;
IF current_user = 'authenticated' AND TG_OP = 'UPDATE' AND (NEW.army_race,NEW.army_faction,NEW.army_variant) IS DISTINCT FROM (OLD.army_race,OLD.army_faction,OLD.army_variant) THEN
 IF NOT OLD.approved THEN RAISE EXCEPTION 'Account approval required'; END IF;
 IF OLD.army_faction IS NOT NULL AND OLD.oath_sworn_at IS NOT NULL THEN RAISE EXCEPTION 'Army identity already confirmed'; END IF;
END IF;
RETURN NEW;
END $$;


--
-- Name: veteran_kind(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.veteran_kind(_unit integer) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when k.category = 'titan' then 'titan'
    when k.category = 'caballero' then 'caballero'
    when k.name ~* '(command|archmagos|praetor|consul|tribune|centurion|delegatus)' then 'personaje'
    else null end
  from public.unit_catalog k where k.unit_id = _unit
$$;


--
-- Name: wh40k_apply_result(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_apply_result(_game uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE g public.games; b jsonb; c public.campaign; vc int; vo int; w text; side text; u uuid; res text;
  k text; v jsonb; s public.wh40k_squads; ml int; wl int; alive int; wleft int; dead boolean; a public.region_attacks; atk_wins boolean; lost int;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR g.status <> 'en_curso' THEN RAISE EXCEPTION 'not in battle'; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  vc := coalesce(nullif(b->'vp'->>'creator', '')::int, 0); vo := coalesce(nullif(b->'vp'->>'opponent', '')::int, 0);
  w := CASE WHEN vc > vo THEN 'creator' WHEN vo > vc THEN 'opponent' ELSE 'empate' END;
  b := b || jsonb_build_object('phase', 'finalizada', 'applied', true, 'result', jsonb_build_object('winner', w, 'reason', 'Puntos de victoria'));
  UPDATE public.games SET battle = b, status = 'finalizada' WHERE id = _game;
  SELECT * INTO c FROM public.campaign WHERE id = 1;
  IF jsonb_typeof(coalesce(b->'losses', '{}'::jsonb)) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(b->'losses') LOOP
      BEGIN
        SELECT * INTO s FROM public.wh40k_squads WHERE id = k::uuid FOR UPDATE;
      EXCEPTION WHEN others THEN s.id := NULL; END;
      IF s.id IS NULL OR (s.user_id <> g.creator_id AND s.user_id <> g.opponent_id) THEN CONTINUE; END IF;
      ml := least(coalesce(nullif(v->>'models', '')::int, 0), s.models_alive);
      wl := least(coalesce(nullif(v->>'wounds', '')::int, 0), coalesce(s.wounds_left, 0));
      IF ml = 0 AND wl = 0 THEN CONTINUE; END IF;
      alive := s.models_alive - ml;
      wleft := CASE WHEN s.wounds_max IS NULL THEN NULL ELSE s.wounds_left - wl END;
      dead := alive = 0 OR (wleft IS NOT NULL AND wleft = 0);
      UPDATE public.wh40k_squads SET models_alive = CASE WHEN dead THEN 0 ELSE alive END,
        wounds_left = CASE WHEN dead THEN 0 ELSE wleft END,
        status = CASE WHEN dead THEN 'fallen' WHEN alive < s.models OR (wleft IS NOT NULL AND wleft < s.wounds_max) THEN 'damaged' ELSE 'ready' END,
        fallen_at = CASE WHEN dead THEN now() ELSE fallen_at END WHERE id = s.id;
      INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, game_id, models_lost, wounds_lost, note)
        VALUES (s.id, s.user_id, 'battle', _game, ml, wl, left('Batalla · ' || w, 200));
      IF dead THEN INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, game_id) VALUES (s.id, s.user_id, 'fallen', _game); END IF;
    END LOOP;
  END IF;
  FOR u, side IN SELECT x.u, x.s FROM (VALUES (g.creator_id, 'creator'), (g.opponent_id, 'opponent')) x(u, s) WHERE x.u IS NOT NULL LOOP
    res := CASE WHEN w = side THEN 'victoria' WHEN w IN ('creator', 'opponent') THEN 'derrota' ELSE 'empate' END;
    IF res = 'victoria' THEN UPDATE public.profiles SET imperial_credits = imperial_credits + c.reward_win, renown = renown + 10 WHERE id = u;
    ELSIF res = 'derrota' THEN UPDATE public.profiles SET imperial_credits = imperial_credits + c.reward_loss, renown = renown + 2 WHERE id = u;
    ELSE UPDATE public.profiles SET imperial_credits = imperial_credits + c.reward_loss, renown = renown + 4 WHERE id = u; END IF;
    SELECT coalesce(sum(least(coalesce(nullif(val->>'models', '')::int, 0), sq.models_alive)), 0) INTO lost
      FROM jsonb_each(coalesce(b->'losses', '{}'::jsonb)) e(key, val)
      JOIN public.wh40k_squads sq ON sq.id = e.key::uuid AND sq.user_id = u;
    INSERT INTO public.battle_records (game_id, user_id, result, vp_for, vp_against, points, models_lost, engines_destroyed, conquest)
      VALUES (_game, u, res, CASE WHEN side = 'creator' THEN vc ELSE vo END, CASE WHEN side = 'creator' THEN vo ELSE vc END, g.points, lost, 0, g.region_id IS NOT NULL);
  END LOOP;
  IF g.region_id IS NOT NULL THEN
    SELECT * INTO a FROM public.region_attacks WHERE game_id = _game AND resolved_at IS NULL FOR UPDATE;
    IF a.id IS NOT NULL THEN
      atk_wins := (w = 'creator' AND g.creator_id = a.attacker_id) OR (w = 'opponent' AND g.opponent_id = a.attacker_id);
      IF atk_wins THEN
        PERFORM public.give_region(a.region_id, a.attacker_id, c.reward_capture);
        UPDATE public.region_attacks SET resolved_at = now(), result = 'batalla_atacante' WHERE id = a.id;
      ELSE
        UPDATE public.region_attacks SET resolved_at = now(), result = 'batalla_defensor' WHERE id = a.id;
      END IF;
    END IF;
  END IF;
END $$;


--
-- Name: wh40k_attack_region(integer, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_attack_region(_region integer, _kind text, _points integer, _list uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); l public.army_lists; owner uuid; g uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _kind NOT IN ('normal', 'patrulla') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _points IS NULL OR _points < 100 OR _points > 10000 THEN RAISE EXCEPTION 'bad points'; END IF;
  SELECT owner_id INTO owner FROM public.regions WHERE id = _region;
  IF owner IS NULL OR owner = uid THEN RAISE EXCEPTION 'not enemy region'; END IF;
  SELECT * INTO l FROM public.army_lists WHERE id = _list AND user_id = uid;
  IF l.id IS NULL OR l.game_system <> '40k' THEN RAISE EXCEPTION 'bad list'; END IF;
  IF l.list_format IS DISTINCT FROM _kind THEN RAISE EXCEPTION 'list kind mismatch'; END IF;
  IF l.points > _points THEN RAISE EXCEPTION 'list over points'; END IF;
  IF NOT public.list_40k_playable(_list) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
  PERFORM public.claim_region(_region, 'batalla');
  SELECT game_id INTO g FROM public.region_attacks WHERE region_id = _region AND attacker_id = uid AND resolved_at IS NULL AND kind = 'attack' ORDER BY created_at DESC LIMIT 1;
  IF g IS NULL THEN RAISE EXCEPTION 'attack not created'; END IF;
  UPDATE public.games SET battle_type = _kind, points = _points, creator_list_id = _list WHERE id = g;
  RETURN g;
END $$;


--
-- Name: wh40k_battle_ready(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_battle_ready(_game uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; b jsonb; ready jsonb; side text; own_list uuid;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF uid IS NULL OR g.id IS NULL OR (uid IS DISTINCT FROM g.creator_id AND uid IS DISTINCT FROM g.opponent_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.opponent_id IS NULL OR NOT (g.status = 'aceptada' OR (g.status = 'abierta' AND g.region_id IS NOT NULL)) THEN RAISE EXCEPTION 'not accepted'; END IF;
  side := CASE WHEN uid = g.creator_id THEN 'creator' ELSE 'opponent' END;
  own_list := CASE WHEN side = 'creator' THEN g.creator_list_id ELSE g.opponent_list_id END;
  IF own_list IS NULL THEN RAISE EXCEPTION 'own list required'; END IF;
  IF NOT public.list_40k_playable(own_list) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  IF coalesce(b->>'phase', 'previa') <> 'previa' THEN RAISE EXCEPTION 'battle already started'; END IF;
  ready := jsonb_set(coalesce(b->'ready', '{}'::jsonb), ARRAY[side], 'true'::jsonb);
  b := jsonb_set(b, '{ready}', ready);
  IF coalesce((ready->>'creator')::boolean, false) AND coalesce((ready->>'opponent')::boolean, false) THEN
    IF g.creator_list_id IS NULL OR g.opponent_list_id IS NULL THEN RAISE EXCEPTION 'lists required'; END IF;
    IF NOT public.list_40k_playable(g.creator_list_id) OR NOT public.list_40k_playable(g.opponent_list_id) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
    b := b || jsonb_build_object('phase', 'batalla', 'vp', jsonb_build_object('creator', 0, 'opponent', 0), 'losses', '{}'::jsonb, 'log', '[]'::jsonb);
    UPDATE public.games SET battle = b, status = 'en_curso', started_at = now(), accepted_at = coalesce(accepted_at, now()) WHERE id = _game;
  ELSE
    UPDATE public.games SET battle = b WHERE id = _game;
  END IF;
  RETURN b;
END $$;


--
-- Name: wh40k_battle_tick(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_battle_tick(_game uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE g public.games; b jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR g.status <> 'en_curso' THEN RETURN; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  IF coalesce(b->>'disputed', 'false') = 'true' THEN RETURN; END IF;
  IF b->>'confirm_deadline' IS NOT NULL AND (b->>'confirm_deadline')::timestamptz <= now()
     AND (b->'confirm'->>'creator' IS NOT NULL OR b->'confirm'->>'opponent' IS NOT NULL) THEN
    PERFORM public.wh40k_apply_result(_game);
  END IF;
END $$;


--
-- Name: wh40k_cancel_training(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_cancel_training(_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid:=auth.uid(); s public.wh40k_squads; refund integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(72401020);
 SELECT * INTO s FROM public.wh40k_squads WHERE id=_id AND user_id=uid FOR UPDATE;
 IF s.id IS NULL OR s.status NOT IN ('training','retraining','restoring') OR s.ready_at <= now() THEN RAISE EXCEPTION 'not in progress'; END IF;
 SELECT cost INTO refund FROM public.wh40k_squad_history WHERE squad_id=_id AND kind = CASE s.status WHEN 'training' THEN 'recruited' WHEN 'retraining' THEN 'retrain_started' ELSE 'restore_started' END ORDER BY created_at DESC LIMIT 1;
 refund:=COALESCE(refund,0);
 IF s.status='training' THEN
   DELETE FROM public.wh40k_squad_history WHERE squad_id=_id;
   DELETE FROM public.wh40k_squads WHERE id=_id;
 ELSE
   UPDATE public.wh40k_squads SET status=CASE s.status WHEN 'retraining' THEN 'fallen' ELSE 'damaged' END, ready_at=NULL WHERE id=_id;
   INSERT INTO public.wh40k_squad_history(squad_id,user_id,kind,cost,note) VALUES(_id,uid,'cancelled',-refund,'Orden cancelada');
 END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits+refund WHERE id=uid;
 RETURN refund;
END $$;


--
-- Name: wh40k_compendium(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_compendium() RETURNS TABLE(kind text, id uuid, played_at timestamp with time zone, creator_id uuid, opponent_id uuid, winner_id uuid, draw boolean, battle_type text, points integer, vp_creator integer, vp_opponent integer, reason text, region_name text, summaries jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 'partida', g.id, coalesce(g.started_at, g.created_at), g.creator_id, g.opponent_id,
    CASE g.battle->'result'->>'winner' WHEN 'creator' THEN g.creator_id WHEN 'opponent' THEN g.opponent_id END,
    coalesce(g.battle->'result'->>'winner','') = 'empate', g.battle_type, g.points,
    coalesce((g.battle->'vp'->>'creator')::int,0), coalesce((g.battle->'vp'->>'opponent')::int,0),
    coalesce(g.battle->'result'->>'reason',''), r.name, g.summaries
  FROM public.games g LEFT JOIN public.regions r ON r.id = g.region_id
  WHERE g.status = 'finalizada' AND auth.uid() IS NOT NULL
  UNION ALL
  SELECT 'autoresolucion', a.id, a.resolved_at, a.attacker_id, a.defender_id,
    CASE WHEN a.result LIKE '%_atacante' THEN a.attacker_id WHEN a.result LIKE '%_defensor' THEN a.defender_id END,
    false, NULL, NULL, NULL, NULL, a.result, r.name, a.summaries
  FROM public.region_attacks a JOIN public.regions r ON r.id = a.region_id
  WHERE a.resolved_at IS NOT NULL AND a.defender_id IS NOT NULL AND auth.uid() IS NOT NULL
    AND a.result NOT LIKE 'batalla_%' AND a.result NOT IN ('cancelada','anulada')
  ORDER BY 3 DESC NULLS LAST
  LIMIT 200
$$;


--
-- Name: wh40k_confirm_end(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_confirm_end(_game uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; b jsonb; side text; confirm jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR (uid <> g.creator_id AND uid <> g.opponent_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.status <> 'en_curso' THEN RAISE EXCEPTION 'not in battle'; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  IF coalesce(b->>'disputed', 'false') = 'true' THEN RAISE EXCEPTION 'disputed'; END IF;
  side := CASE WHEN uid = g.creator_id THEN 'creator' ELSE 'opponent' END;
  confirm := coalesce(b->'confirm', '{}'::jsonb);
  IF confirm->>side IS NOT NULL THEN RETURN b; END IF;
  confirm := jsonb_set(confirm, ARRAY[side], to_jsonb(now()));
  b := jsonb_set(b, '{confirm}', confirm) || jsonb_build_object('phase', 'cierre');
  IF b->>'confirm_deadline' IS NULL THEN b := jsonb_set(b, '{confirm_deadline}', to_jsonb(now() + interval '24 hours')); END IF;
  UPDATE public.games SET battle = b WHERE id = _game;
  IF confirm->>'creator' IS NOT NULL AND confirm->>'opponent' IS NOT NULL THEN PERFORM public.wh40k_apply_result(_game); END IF;
  RETURN b;
END $$;


--
-- Name: wh40k_create_game(text, integer, uuid, uuid, text, timestamp with time zone, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_create_game(_kind text, _points integer, _opponent uuid, _list uuid, _notes text, _scheduled timestamp with time zone, _excluded uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); l public.army_lists; gid uuid;
BEGIN
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND approved) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _kind NOT IN ('normal', 'patrulla') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _points IS NULL OR _points < 100 OR _points > 10000 THEN RAISE EXCEPTION 'bad points'; END IF;
  IF _opponent IS NOT NULL AND (_opponent = uid OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _opponent AND approved)) THEN RAISE EXCEPTION 'bad opponent'; END IF;
  SELECT * INTO l FROM public.army_lists WHERE id = _list AND user_id = uid;
  IF l.id IS NULL OR l.game_system <> '40k' THEN RAISE EXCEPTION 'bad list'; END IF;
  IF l.list_format IS DISTINCT FROM _kind THEN RAISE EXCEPTION 'list kind mismatch'; END IF;
  IF l.points > _points THEN RAISE EXCEPTION 'list over points'; END IF;
  IF NOT public.list_40k_playable(_list) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
  INSERT INTO public.games (creator_id, opponent_id, size, points, scenario_random, notes, creator_list_id, scheduled_at, battle_type)
    VALUES (uid, _opponent, 'batalla', _points, false, left(coalesce(_notes, ''), 500), _list, _scheduled, _kind) RETURNING id INTO gid;
  IF _opponent IS NULL AND _excluded IS NOT NULL THEN
    INSERT INTO public.game_exclusions (game_id, user_id)
      SELECT gid, x FROM unnest(_excluded) x WHERE x <> uid AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = x);
  END IF;
  RETURN gid;
END $$;


--
-- Name: wh40k_dismiss_squad(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_dismiss_squad(_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.wh40k_squads WHERE id=_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  DELETE FROM public.wh40k_squad_history WHERE squad_id=_id;
END $$;


--
-- Name: wh40k_dispute(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_dispute(_game uuid, _note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; b jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR (uid <> g.creator_id AND uid <> g.opponent_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.status <> 'en_curso' THEN RAISE EXCEPTION 'not in battle'; END IF;
  b := coalesce(g.battle, '{}'::jsonb);
  IF b->'confirm'->>'creator' IS NULL AND b->'confirm'->>'opponent' IS NULL THEN RAISE EXCEPTION 'nothing to dispute'; END IF;
  IF coalesce(b->>'disputed', 'false') = 'true' THEN RAISE EXCEPTION 'already disputed'; END IF;
  UPDATE public.games SET battle = b || jsonb_build_object('disputed', true, 'dispute_note', left(coalesce(_note, ''), 300)) WHERE id = _game;
END $$;


--
-- Name: wh40k_game_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_game_state(_game uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; reveal boolean; adm boolean;
BEGIN
  adm := public.has_role(coalesce(uid, '00000000-0000-0000-0000-000000000000'::uuid), 'admin');
  PERFORM public.wh40k_battle_tick(_game);
  SELECT * INTO g FROM public.games WHERE id = _game;
  IF g.id IS NULL OR (uid <> g.creator_id AND uid <> g.opponent_id AND NOT adm) THEN RAISE EXCEPTION 'forbidden'; END IF;
  reveal := coalesce(g.battle->>'phase', 'previa') <> 'previa';
  RETURN jsonb_build_object(
    'game', to_jsonb(g),
    'lists', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'side', CASE WHEN l.id = g.creator_list_id THEN 'creator' ELSE 'opponent' END,
        'id', l.id, 'name', l.name, 'points', l.points, 'list_format', l.list_format,
        'army_faction', l.army_faction, 'owner_id', l.user_id,
        'roster', CASE WHEN reveal OR l.user_id = uid THEN l.roster ELSE NULL END))
      FROM public.army_lists l WHERE l.id IN (g.creator_list_id, g.opponent_list_id)), '[]'::jsonb),
    'squads', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.wh40k_squads s
      WHERE s.user_id IN (g.creator_id, g.opponent_id) AND s.status <> 'dismissed'), '[]'::jsonb)
  );
END $$;


--
-- Name: wh40k_rename_squad(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_rename_squad(_id uuid, _name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF length(btrim(coalesce(_name,''))) > 60 THEN RAISE EXCEPTION 'name too long'; END IF;
  UPDATE public.wh40k_squads SET nickname=btrim(coalesce(_name,'')) WHERE id=_id AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
END $$;


--
-- Name: wh40k_report_battle(uuid, uuid, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_report_battle(_id uuid, _game uuid, _models_lost integer, _wounds_lost integer, _note text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s public.wh40k_squads; alive integer; wl integer; dead boolean;
BEGIN
  SELECT * INTO s FROM public.wh40k_squads WHERE id=_id AND user_id=uid FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF s.status NOT IN ('ready','damaged') THEN RAISE EXCEPTION 'not deployable'; END IF;
  IF _game IS NOT NULL AND NOT public.is_game_player(_game, uid) THEN RAISE EXCEPTION 'not your game'; END IF;
  _models_lost := greatest(coalesce(_models_lost,0),0); _wounds_lost := greatest(coalesce(_wounds_lost,0),0);
  alive := greatest(s.models_alive - _models_lost, 0);
  wl := CASE WHEN s.wounds_max IS NULL THEN NULL ELSE greatest(s.wounds_left - _wounds_lost, 0) END;
  dead := alive = 0 OR (wl IS NOT NULL AND wl = 0);
  UPDATE public.wh40k_squads SET models_alive = CASE WHEN dead THEN 0 ELSE alive END, wounds_left = CASE WHEN dead THEN 0 ELSE wl END,
    status = CASE WHEN dead THEN 'fallen' WHEN alive < models OR (wl IS NOT NULL AND wl < wounds_max) THEN 'damaged' ELSE 'ready' END,
    fallen_at = CASE WHEN dead THEN now() ELSE fallen_at END WHERE id=_id;
  INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, game_id, models_lost, wounds_lost, note)
    VALUES (_id, uid, 'battle', _game, least(_models_lost, s.models_alive), coalesce(least(_wounds_lost, s.wounds_left),0), left(coalesce(_note,''),200));
  IF dead THEN INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, game_id) VALUES (_id, uid, 'fallen', _game); RETURN 'fallen'; END IF;
  RETURN 'ok';
END $$;


--
-- Name: wh40k_restore_squad(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_restore_squad(_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s public.wh40k_squads; price integer; cost integer; bal integer;
BEGIN
  SELECT * INTO s FROM public.wh40k_squads WHERE id=_id AND user_id=uid FOR UPDATE;
  IF s.id IS NULL OR s.status <> 'damaged' THEN RAISE EXCEPTION 'not damaged'; END IF;
  price := public.wh40k_squad_price(s);
  cost := ceil(price::numeric * (s.models - s.models_alive) / s.models)::int
        + CASE WHEN s.wounds_max IS NULL OR s.wounds_max = 0 THEN 0 ELSE ceil(price::numeric * (s.wounds_max - s.wounds_left) / s.wounds_max)::int END;
  cost := greatest(cost, 1);
  SELECT imperial_credits INTO bal FROM public.profiles WHERE id=uid FOR UPDATE;
  IF bal < cost THEN RAISE EXCEPTION 'credits'; END IF;
  UPDATE public.profiles SET imperial_credits = imperial_credits - cost WHERE id=uid;
  UPDATE public.wh40k_squads SET status='restoring', ready_at = now() + interval '36 seconds' * cost WHERE id=_id;
  INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, cost) VALUES (_id, uid, 'restore_started', cost);
  RETURN cost;
END $$;


--
-- Name: wh40k_retrain_squad(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_retrain_squad(_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid:=auth.uid(); s public.wh40k_squads; price integer; cost integer; bal integer; oc numeric;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(72401020);
 SELECT * INTO s FROM public.wh40k_squads WHERE id=_id AND user_id=uid FOR UPDATE;
 IF s.id IS NULL OR s.status<>'fallen' THEN RAISE EXCEPTION 'not fallen'; END IF;
 SELECT oc_per_model*s.models INTO oc FROM public.wh40k_unit_prices WHERE faction=s.faction AND unit_name=s.unit_name AND models=s.models;
 PERFORM public.ship_assert_capacity(uid,oc);
 price:=public.wh40k_squad_price(s); cost:=ceil(price*0.75)::int;
 SELECT imperial_credits INTO bal FROM public.profiles WHERE id=uid FOR UPDATE;
 IF bal<cost THEN RAISE EXCEPTION 'credits'; END IF;
 UPDATE public.profiles SET imperial_credits=imperial_credits-cost WHERE id=uid;
 UPDATE public.wh40k_squads SET status='retraining',oc_cost=oc,ready_at=now()+make_interval(secs=>public.ship_training_seconds(uid,price)) WHERE id=_id;
 INSERT INTO public.wh40k_squad_history(squad_id,user_id,kind,cost) VALUES(_id,uid,'retrain_started',cost);
 RETURN cost;
END $$;


--
-- Name: wh40k_sanitize_battle(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_sanitize_battle(_battle jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
DECLARE vc int := 0; vo int := 0; losses jsonb := '{}'::jsonb; lg jsonb := '[]'::jsonb; k text; v jsonb; m int; w int;
BEGIN
  IF (_battle->'vp'->>'creator') ~ '^\d{1,4}$' THEN vc := least((_battle->'vp'->>'creator')::int, 9999); END IF;
  IF (_battle->'vp'->>'opponent') ~ '^\d{1,4}$' THEN vo := least((_battle->'vp'->>'opponent')::int, 9999); END IF;
  IF jsonb_typeof(coalesce(_battle->'losses', '{}'::jsonb)) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(_battle->'losses') LOOP
      IF k ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}$' AND jsonb_typeof(v) = 'object' THEN
        m := 0; w := 0;
        IF (v->>'models') ~ '^\d{1,4}$' THEN m := least((v->>'models')::int, 9999); END IF;
        IF (v->>'wounds') ~ '^\d{1,4}$' THEN w := least((v->>'wounds')::int, 9999); END IF;
        IF m > 0 OR w > 0 THEN losses := losses || jsonb_build_object(k, jsonb_build_object('models', m, 'wounds', w)); END IF;
      END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(coalesce(_battle->'log', '[]'::jsonb)) = 'array' THEN
    SELECT coalesce(jsonb_agg(left(e, 200)), '[]'::jsonb) INTO lg
    FROM (SELECT jsonb_array_elements_text(_battle->'log') AS e LIMIT 100) t;
  END IF;
  RETURN jsonb_build_object('vp', jsonb_build_object('creator', vc, 'opponent', vo), 'losses', losses, 'log', lg);
END $_$;


--
-- Name: wh40k_save_battle(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_save_battle(_game uuid, _battle jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; cur jsonb; clean jsonb;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR (uid <> g.creator_id AND uid <> g.opponent_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.status <> 'en_curso' THEN RAISE EXCEPTION 'not in battle'; END IF;
  cur := coalesce(g.battle, '{}'::jsonb);
  IF coalesce(cur->>'disputed', 'false') = 'true' THEN RAISE EXCEPTION 'disputed'; END IF;
  clean := public.wh40k_sanitize_battle(_battle);
  UPDATE public.games SET battle = cur || clean WHERE id = _game;
END $$;


--
-- Name: wh40k_set_game_list(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_set_game_list(_game uuid, _list uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); g public.games; l public.army_lists;
BEGIN
  SELECT * INTO g FROM public.games WHERE id = _game FOR UPDATE;
  IF g.id IS NULL OR (uid <> g.creator_id AND uid <> g.opponent_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF g.status NOT IN ('abierta', 'aceptada') OR coalesce(g.battle->>'phase', 'previa') <> 'previa' THEN RAISE EXCEPTION 'battle already started'; END IF;
  SELECT * INTO l FROM public.army_lists WHERE id = _list AND user_id = uid;
  IF l.id IS NULL OR l.game_system <> '40k' THEN RAISE EXCEPTION 'bad list'; END IF;
  IF l.list_format IS DISTINCT FROM g.battle_type THEN RAISE EXCEPTION 'list kind mismatch'; END IF;
  IF l.points > g.points THEN RAISE EXCEPTION 'list over points'; END IF;
  IF NOT public.list_40k_playable(_list) THEN RAISE EXCEPTION 'list needs recruited units'; END IF;
  IF uid = g.creator_id THEN UPDATE public.games SET creator_list_id = _list WHERE id = _game;
  ELSE UPDATE public.games SET opponent_list_id = _list WHERE id = _game; END IF;
END $$;


--
-- Name: wh40k_set_loadout(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_set_loadout(_id uuid, _loadout jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE k text; v jsonb;
BEGIN
  IF jsonb_typeof(_loadout) <> 'object' THEN RAISE EXCEPTION 'bad loadout'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_loadout)) > 60 THEN RAISE EXCEPTION 'bad loadout'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(_loadout) LOOP
    IF length(k) > 120 OR jsonb_typeof(v) <> 'number' OR (v::text)::numeric < 0 OR (v::text)::numeric > 100 OR (v::text)::numeric <> trunc((v::text)::numeric) THEN
      RAISE EXCEPTION 'bad loadout';
    END IF;
  END LOOP;
  UPDATE public.wh40k_squads SET loadout = _loadout
   WHERE id = _id AND user_id = auth.uid() AND status <> 'dismissed';
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.wh40k_squad_history(squad_id, user_id, kind, note) VALUES (_id, auth.uid(), 'loadout', '');
END $$;


--
-- Name: wh40k_set_squad_photo(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_set_squad_photo(_id uuid, _path text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _path IS NOT NULL AND (length(_path) > 200 OR _path NOT LIKE auth.uid()::text || '/units/%') THEN RAISE EXCEPTION 'invalid path'; END IF;
  UPDATE public.wh40k_squads SET photo_path = _path WHERE id = _id AND user_id = auth.uid() AND status <> 'dismissed';
  IF NOT FOUND THEN RAISE EXCEPTION 'squad not found'; END IF;
END $$;


--
-- Name: wh40k_set_summary(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_set_summary(_kind text, _id uuid, _text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); t text := left(btrim(coalesce(_text,'')), 2000);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _kind = 'partida' THEN
    UPDATE public.games SET summaries = CASE WHEN t = '' THEN summaries - uid::text ELSE summaries || jsonb_build_object(uid::text, t) END
    WHERE id = _id AND status = 'finalizada' AND uid IN (creator_id, opponent_id);
  ELSIF _kind = 'autoresolucion' THEN
    UPDATE public.region_attacks SET summaries = CASE WHEN t = '' THEN summaries - uid::text ELSE summaries || jsonb_build_object(uid::text, t) END
    WHERE id = _id AND resolved_at IS NOT NULL AND uid IN (attacker_id, defender_id);
  ELSE RAISE EXCEPTION 'invalid kind'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'not a participant'; END IF;
END $$;


--
-- Name: wh40k_squads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wh40k_squads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    faction text NOT NULL,
    unit_name text NOT NULL,
    models integer NOT NULL,
    models_alive integer NOT NULL,
    wounds_max integer,
    wounds_left integer,
    points integer DEFAULT 0 NOT NULL,
    nickname text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'training'::text NOT NULL,
    ready_at timestamp with time zone,
    fallen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    loadout jsonb DEFAULT '{}'::jsonb NOT NULL,
    oc_cost numeric,
    photo_path text
);


--
-- Name: wh40k_squad_price(public.wh40k_squads); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_squad_price(s public.wh40k_squads) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce((SELECT points FROM public.wh40k_unit_prices WHERE faction=s.faction AND unit_name=s.unit_name AND models=s.models), s.points)
$$;


--
-- Name: wh40k_sync_recruits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_sync_recruits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE r record; n integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES (CASE WHEN TG_OP<>'INSERT' THEN OLD.user_id END, CASE WHEN TG_OP<>'INSERT' THEN OLD.faction END, CASE WHEN TG_OP<>'INSERT' THEN OLD.unit_name END, CASE WHEN TG_OP<>'INSERT' THEN OLD.models END),
                                  (CASE WHEN TG_OP<>'DELETE' THEN NEW.user_id END, CASE WHEN TG_OP<>'DELETE' THEN NEW.faction END, CASE WHEN TG_OP<>'DELETE' THEN NEW.unit_name END, CASE WHEN TG_OP<>'DELETE' THEN NEW.models END)) v(u,f,un,m) WHERE u IS NOT NULL LOOP
    SELECT count(*) INTO n FROM public.wh40k_squads WHERE user_id=r.u AND faction=r.f AND unit_name=r.un AND models=r.m AND status='ready';
    IF n = 0 THEN DELETE FROM public.wh40k_recruits WHERE user_id=r.u AND faction=r.f AND unit_name=r.un AND models=r.m;
    ELSE INSERT INTO public.wh40k_recruits (user_id, faction, unit_name, models, quantity) VALUES (r.u,r.f,r.un,r.m,n)
      ON CONFLICT (user_id, faction, unit_name, models) DO UPDATE SET quantity=excluded.quantity, updated_at=now();
    END IF;
  END LOOP;
  RETURN NULL;
END $$;


--
-- Name: wh40k_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wh40k_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE uid uuid := auth.uid(); s record;
BEGIN
  FOR s IN SELECT * FROM public.wh40k_squads WHERE user_id=uid AND status IN ('training','restoring','retraining') AND ready_at <= now() FOR UPDATE LOOP
    UPDATE public.wh40k_squads SET status='ready', models_alive=models, wounds_left=wounds_max WHERE id=s.id;
    INSERT INTO public.wh40k_squad_history (squad_id, user_id, kind, note) VALUES (s.id, uid,
      CASE s.status WHEN 'training' THEN 'ready' WHEN 'restoring' THEN 'restored' ELSE 'retrained' END, '');
  END LOOP;
END $$;


--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: admin_bootstrap_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_bootstrap_state (
    id integer DEFAULT 1 NOT NULL,
    claimed boolean DEFAULT false NOT NULL,
    CONSTRAINT admin_bootstrap_state_id_check CHECK ((id = 1))
);


--
-- Name: army_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.army_lists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    points integer DEFAULT 3000 NOT NULL,
    mode text DEFAULT 'libre'::text NOT NULL,
    gamemode text DEFAULT 'standard'::text NOT NULL,
    slots jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    formations jsonb DEFAULT '[]'::jsonb NOT NULL,
    game_system text DEFAULT 'legions'::text NOT NULL,
    army_faction text,
    list_format text DEFAULT 'normal'::text NOT NULL,
    roster jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT army_lists_gamemode_check CHECK ((gamemode = ANY (ARRAY['standard'::text, 'titandeath'::text]))),
    CONSTRAINT army_lists_mode_check CHECK ((mode = ANY (ARRAY['libre'::text, 'coleccion'::text])))
);


--
-- Name: battle_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.battle_records (
    game_id uuid NOT NULL,
    user_id uuid NOT NULL,
    result text NOT NULL,
    vp_for integer DEFAULT 0 NOT NULL,
    vp_against integer DEFAULT 0 NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    models_lost integer DEFAULT 0 NOT NULL,
    engines_destroyed integer DEFAULT 0 NOT NULL,
    conquest boolean DEFAULT false NOT NULL,
    mvp text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: build_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.build_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    module text NOT NULL,
    target_level integer NOT NULL,
    cost integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sequence bigint NOT NULL,
    kind text DEFAULT 'build'::text NOT NULL,
    started_at timestamp with time zone,
    finishes_at timestamp with time zone,
    duration_seconds integer,
    repair_amount integer DEFAULT 0 NOT NULL,
    CONSTRAINT build_queue_kind_check CHECK ((kind = ANY (ARRAY['build'::text, 'module_repair'::text, 'hull_repair'::text])))
);


--
-- Name: build_queue_sequence_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.build_queue ALTER COLUMN sequence ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.build_queue_sequence_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign (
    id integer DEFAULT 1 NOT NULL,
    phase text DEFAULT 'aproximacion'::text NOT NULL,
    number integer DEFAULT 1 NOT NULL,
    started_at timestamp with time zone,
    reward_neutral integer DEFAULT 100 NOT NULL,
    reward_capture integer DEFAULT 200 NOT NULL,
    reward_win integer DEFAULT 500 NOT NULL,
    reward_loss integer DEFAULT 150 NOT NULL,
    CONSTRAINT campaign_id_check CHECK ((id = 1)),
    CONSTRAINT campaign_phase_check CHECK ((phase = ANY (ARRAY['aproximacion'::text, 'conquista'::text])))
);


--
-- Name: celestial_bodies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.celestial_bodies (
    id text NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'planet'::text NOT NULL,
    parent_id text,
    biome text NOT NULL,
    orbit integer NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    playable boolean DEFAULT false NOT NULL,
    status text DEFAULT 'locked'::text NOT NULL,
    CONSTRAINT celestial_bodies_status_check CHECK ((status = ANY (ARRAY['locked'::text, 'open'::text])))
);


--
-- Name: collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_items (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    unit_id integer NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT collection_items_quantity_check CHECK (((quantity >= 0) AND (quantity <= 999)))
);


--
-- Name: engine_damage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_damage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    wounds_lost integer NOT NULL,
    max_wounds integer NOT NULL,
    repair_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    veteran_id uuid
);


--
-- Name: game_exclusions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_exclusions (
    game_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: honours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.honours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    bearer text DEFAULT ''::text NOT NULL,
    ability text NOT NULL,
    used_at timestamp with time zone,
    used_game uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    veteran_id uuid
);


--
-- Name: lost_engines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lost_engines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    game_id uuid,
    lost_at timestamp with time zone DEFAULT now() NOT NULL,
    veteran_id uuid
);


--
-- Name: module_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_types (
    id text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    base_cost integer NOT NULL,
    base_hours integer NOT NULL,
    max_level integer DEFAULT 3 NOT NULL,
    sort integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: naval_private_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naval_private_plans (
    raid_id uuid NOT NULL,
    attacker_plan jsonb DEFAULT '[]'::jsonb NOT NULL,
    defender_plan jsonb
);


--
-- Name: naval_raids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naval_raids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attacker_id uuid NOT NULL,
    defender_id uuid NOT NULL,
    deadline timestamp with time zone NOT NULL,
    attacker_plan jsonb DEFAULT '["fuego", "abordaje", "lanza"]'::jsonb NOT NULL,
    defender_plan jsonb,
    status text DEFAULT 'pendiente'::text NOT NULL,
    winner text,
    loot integer DEFAULT 0 NOT NULL,
    report jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    block_number integer DEFAULT 1 NOT NULL,
    attacker_ready boolean DEFAULT false NOT NULL,
    defender_ready boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN naval_raids.attacker_plan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.naval_raids.attacker_plan IS 'DEPRECATED for pending plans: active plans are hidden in naval_private_plans; public report contains revealed orders only.';


--
-- Name: COLUMN naval_raids.defender_plan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.naval_raids.defender_plan IS 'DEPRECATED for pending plans: active plans are hidden in naval_private_plans.';


--
-- Name: naval_stances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.naval_stances (
    user_id uuid NOT NULL,
    plan jsonb DEFAULT '["escudos", "fuego", "abordaje"]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pod_bay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_bay (
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    quantity integer DEFAULT 0 NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    leader_name text,
    force_name text,
    portrait_path text,
    allegiance public.allegiance,
    faction text,
    legion text,
    imperial_credits integer DEFAULT 2200 NOT NULL,
    renown integer DEFAULT 0 NOT NULL,
    oath_sworn_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    email text,
    previous_allegiance public.allegiance,
    map_color text DEFAULT '#5fc8ff'::text NOT NULL,
    map_emblem text DEFAULT '✠'::text NOT NULL,
    forge_gift_claimed boolean DEFAULT false NOT NULL,
    army_race text,
    army_faction text,
    army_variant text
);


--
-- Name: COLUMN profiles.forge_gift_claimed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.forge_gift_claimed IS 'DEPRECATED: Legions Imperialis forge Warhound gift removed';


--
-- Name: COLUMN profiles.army_race; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.army_race IS '40k onboarding race; legacy campaign allegiance is retained separately.';


--
-- Name: COLUMN profiles.army_faction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.army_faction IS '40k catalogue army ID, independent of legacy Legions Imperialis faction.';


--
-- Name: COLUMN profiles.army_variant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.army_variant IS 'Optional official chapter or force variant from the 40k catalogue.';


--
-- Name: recruit_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recruit_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    quantity integer NOT NULL,
    cost integer NOT NULL,
    ready_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recruit_orders_quantity_check CHECK ((quantity > 0))
);


--
-- Name: region_attacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_attacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    region_id integer NOT NULL,
    attacker_id uuid NOT NULL,
    defender_id uuid,
    kind text NOT NULL,
    game_id uuid,
    deadline timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_attacker_confirmed boolean DEFAULT false NOT NULL,
    auto_defender_confirmed boolean DEFAULT false NOT NULL,
    summaries jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT region_attacks_kind_check CHECK ((kind = ANY (ARRAY['claim'::text, 'attack'::text])))
);


--
-- Name: regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regions (
    id integer NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'yermo'::text NOT NULL,
    neighbors integer[] DEFAULT '{}'::integer[] NOT NULL,
    owner_id uuid,
    is_spaceport boolean DEFAULT false NOT NULL,
    owned_since timestamp with time zone,
    continent integer DEFAULT 0 NOT NULL,
    scenario_id uuid,
    body_id text DEFAULT 'medusa-5'::text NOT NULL,
    CONSTRAINT regions_type_check CHECK ((type = ANY (ARRAY['yermo'::text, 'colmena'::text, 'dique'::text, 'forja'::text, 'mina'::text, 'puerto'::text, 'arsenal'::text, 'bastion'::text])))
);


--
-- Name: scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ship_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ship_modules (
    user_id uuid NOT NULL,
    module text NOT NULL,
    level integer DEFAULT 0 NOT NULL,
    building_until timestamp with time zone,
    damaged boolean DEFAULT false NOT NULL,
    damaged_until timestamp with time zone
);


--
-- Name: ship_travel_private; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ship_travel_private (
    user_id uuid NOT NULL,
    destination text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ships (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    region text DEFAULT 'Órbita alta'::text NOT NULL,
    last_income_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    hull_hp integer,
    hull_repair_until timestamp with time zone,
    hull_repair_target integer,
    body_id text DEFAULT 'medusa-5'::text,
    travel_from text,
    arrives_at timestamp with time zone
);


--
-- Name: unit_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_catalog (
    unit_id integer NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    cost integer NOT NULL,
    hours integer NOT NULL,
    CONSTRAINT unit_catalog_category_check CHECK ((category = ANY (ARRAY['infanteria'::text, 'blindado'::text, 'caballero'::text, 'titan'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: veteran_battles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veteran_battles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    veteran_id uuid NOT NULL,
    game_id uuid,
    result text NOT NULL,
    renown_gained integer DEFAULT 0 NOT NULL,
    honour text,
    destroyed boolean DEFAULT false NOT NULL,
    wounds_lost integer DEFAULT 0 NOT NULL,
    mvp boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: veterans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veterans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    unit_id integer NOT NULL,
    kind text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    renown integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'activo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wh40k_recruits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wh40k_recruits (
    user_id uuid NOT NULL,
    faction text NOT NULL,
    unit_name text NOT NULL,
    models integer NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wh40k_squad_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wh40k_squad_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    squad_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    game_id uuid,
    models_lost integer DEFAULT 0 NOT NULL,
    wounds_lost integer DEFAULT 0 NOT NULL,
    cost integer DEFAULT 0 NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wh40k_unit_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wh40k_unit_prices (
    faction text NOT NULL,
    unit_name text NOT NULL,
    models integer NOT NULL,
    points integer NOT NULL,
    epic_hero boolean DEFAULT false NOT NULL,
    wounds integer,
    oc_per_model numeric
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: FUNCTION achievement_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.achievement_stats() TO anon;
GRANT ALL ON FUNCTION public.achievement_stats() TO authenticated;
GRANT ALL ON FUNCTION public.achievement_stats() TO service_role;


--
-- Name: FUNCTION admin_adjust(_uid uuid, _credits integer, _renown integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_adjust(_uid uuid, _credits integer, _renown integer) TO anon;
GRANT ALL ON FUNCTION public.admin_adjust(_uid uuid, _credits integer, _renown integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_adjust(_uid uuid, _credits integer, _renown integer) TO service_role;


--
-- Name: FUNCTION admin_cancel_raid(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_cancel_raid(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.admin_cancel_raid(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_cancel_raid(_id uuid) TO service_role;


--
-- Name: FUNCTION admin_clear_damage(_id uuid, _restore_lost boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_clear_damage(_id uuid, _restore_lost boolean) TO anon;
GRANT ALL ON FUNCTION public.admin_clear_damage(_id uuid, _restore_lost boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_clear_damage(_id uuid, _restore_lost boolean) TO service_role;


--
-- Name: FUNCTION admin_finish_travel(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_finish_travel(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_finish_travel(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_finish_travel(_uid uuid) TO service_role;


--
-- Name: FUNCTION admin_force_queues(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_force_queues(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_force_queues(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_force_queues(_uid uuid) TO service_role;


--
-- Name: FUNCTION admin_force_region(_region integer, _uid uuid, _spaceport boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_force_region(_region integer, _uid uuid, _spaceport boolean) TO anon;
GRANT ALL ON FUNCTION public.admin_force_region(_region integer, _uid uuid, _spaceport boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_force_region(_region integer, _uid uuid, _spaceport boolean) TO service_role;


--
-- Name: TABLE games; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.games TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.games TO authenticated;
GRANT ALL ON TABLE public.games TO service_role;


--
-- Name: FUNCTION admin_games(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_games() TO anon;
GRANT ALL ON FUNCTION public.admin_games() TO authenticated;
GRANT ALL ON FUNCTION public.admin_games() TO service_role;


--
-- Name: FUNCTION admin_grant_honour(_uid uuid, _unit integer, _bearer text, _ability text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_grant_honour(_uid uuid, _unit integer, _bearer text, _ability text) TO anon;
GRANT ALL ON FUNCTION public.admin_grant_honour(_uid uuid, _unit integer, _bearer text, _ability text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_grant_honour(_uid uuid, _unit integer, _bearer text, _ability text) TO service_role;


--
-- Name: FUNCTION admin_import_unit_oc(_rows jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_import_unit_oc(_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_import_unit_oc(_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_import_unit_oc(_rows jsonb) TO service_role;


--
-- Name: FUNCTION admin_remove_honour(_id uuid, _restore boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_remove_honour(_id uuid, _restore boolean) TO anon;
GRANT ALL ON FUNCTION public.admin_remove_honour(_id uuid, _restore boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_remove_honour(_id uuid, _restore boolean) TO service_role;


--
-- Name: FUNCTION admin_repair_module(_uid uuid, _module text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_repair_module(_uid uuid, _module text) TO anon;
GRANT ALL ON FUNCTION public.admin_repair_module(_uid uuid, _module text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_repair_module(_uid uuid, _module text) TO service_role;


--
-- Name: FUNCTION admin_reset_campaign(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_reset_campaign() TO anon;
GRANT ALL ON FUNCTION public.admin_reset_campaign() TO authenticated;
GRANT ALL ON FUNCTION public.admin_reset_campaign() TO service_role;


--
-- Name: FUNCTION admin_resolve_attack(_id uuid, _winner text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_resolve_attack(_id uuid, _winner text) TO anon;
GRANT ALL ON FUNCTION public.admin_resolve_attack(_id uuid, _winner text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_resolve_attack(_id uuid, _winner text) TO service_role;


--
-- Name: FUNCTION admin_resolve_battle(_game uuid, _action text, _battle jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_resolve_battle(_game uuid, _action text, _battle jsonb) TO anon;
GRANT ALL ON FUNCTION public.admin_resolve_battle(_game uuid, _action text, _battle jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.admin_resolve_battle(_game uuid, _action text, _battle jsonb) TO service_role;


--
-- Name: FUNCTION admin_restart_campaign_safe(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_restart_campaign_safe() TO anon;
GRANT ALL ON FUNCTION public.admin_restart_campaign_safe() TO authenticated;
GRANT ALL ON FUNCTION public.admin_restart_campaign_safe() TO service_role;


--
-- Name: FUNCTION admin_set_body_status(_body text, _status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_body_status(_body text, _status text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_body_status(_body text, _status text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_body_status(_body text, _status text) TO service_role;


--
-- Name: FUNCTION admin_set_phase(_phase text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_phase(_phase text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_phase(_phase text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_phase(_phase text) TO service_role;


--
-- Name: FUNCTION admin_set_supports(_uid uuid, _charged boolean, _pods integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_supports(_uid uuid, _charged boolean, _pods integer) TO anon;
GRANT ALL ON FUNCTION public.admin_set_supports(_uid uuid, _charged boolean, _pods integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_supports(_uid uuid, _charged boolean, _pods integer) TO service_role;


--
-- Name: FUNCTION admin_set_unit(_uid uuid, _unit integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_unit(_uid uuid, _unit integer, _qty integer) TO anon;
GRANT ALL ON FUNCTION public.admin_set_unit(_uid uuid, _unit integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_unit(_uid uuid, _unit integer, _qty integer) TO service_role;


--
-- Name: FUNCTION admin_skip_waits(_uid uuid, _include_attacks boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_skip_waits(_uid uuid, _include_attacks boolean) TO anon;
GRANT ALL ON FUNCTION public.admin_skip_waits(_uid uuid, _include_attacks boolean) TO authenticated;
GRANT ALL ON FUNCTION public.admin_skip_waits(_uid uuid, _include_attacks boolean) TO service_role;


--
-- Name: FUNCTION apply_casualties(_uid uuid, _game uuid, _c jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.apply_casualties(_uid uuid, _game uuid, _c jsonb) TO anon;
GRANT ALL ON FUNCTION public.apply_casualties(_uid uuid, _game uuid, _c jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.apply_casualties(_uid uuid, _game uuid, _c jsonb) TO service_role;


--
-- Name: FUNCTION build_module(_module text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.build_module(_module text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.build_module(_module text) TO authenticated;
GRANT ALL ON FUNCTION public.build_module(_module text) TO service_role;


--
-- Name: FUNCTION build_pods(_qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.build_pods(_qty integer) TO anon;
GRANT ALL ON FUNCTION public.build_pods(_qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.build_pods(_qty integer) TO service_role;


--
-- Name: FUNCTION campaign_players(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.campaign_players() TO anon;
GRANT ALL ON FUNCTION public.campaign_players() TO authenticated;
GRANT ALL ON FUNCTION public.campaign_players() TO service_role;


--
-- Name: FUNCTION campaign_players_40k(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.campaign_players_40k() FROM PUBLIC;
GRANT ALL ON FUNCTION public.campaign_players_40k() TO authenticated;
GRANT ALL ON FUNCTION public.campaign_players_40k() TO service_role;


--
-- Name: FUNCTION campaign_tick(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.campaign_tick() TO anon;
GRANT ALL ON FUNCTION public.campaign_tick() TO authenticated;
GRANT ALL ON FUNCTION public.campaign_tick() TO service_role;


--
-- Name: FUNCTION cancel_campaign_operation(_attack uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_campaign_operation(_attack uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_campaign_operation(_attack uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_campaign_operation(_attack uuid) TO service_role;


--
-- Name: FUNCTION cancel_claim(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_claim() TO anon;
GRANT ALL ON FUNCTION public.cancel_claim() TO authenticated;
GRANT ALL ON FUNCTION public.cancel_claim() TO service_role;


--
-- Name: FUNCTION cancel_queued(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_queued(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_queued(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_queued(_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_raid(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_raid(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_raid(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_raid(_id uuid) TO service_role;


--
-- Name: FUNCTION cancel_recruit(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cancel_recruit(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_recruit(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_recruit(_id uuid) TO service_role;


--
-- Name: FUNCTION claim_region(_region integer, _size text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.claim_region(_region integer, _size text) TO anon;
GRANT ALL ON FUNCTION public.claim_region(_region integer, _size text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_region(_region integer, _size text) TO service_role;


--
-- Name: FUNCTION cleanup_deleted_player(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_deleted_player() TO anon;
GRANT ALL ON FUNCTION public.cleanup_deleted_player() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_deleted_player() TO service_role;


--
-- Name: FUNCTION cleanup_wh40k_squads(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_wh40k_squads() TO anon;
GRANT ALL ON FUNCTION public.cleanup_wh40k_squads() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_wh40k_squads() TO service_role;


--
-- Name: FUNCTION collect_daily_income(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.collect_daily_income() TO anon;
GRANT ALL ON FUNCTION public.collect_daily_income() TO authenticated;
GRANT ALL ON FUNCTION public.collect_daily_income() TO service_role;


--
-- Name: FUNCTION confirm_attack_auto_resolution(_attack uuid, _confirm boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confirm_attack_auto_resolution(_attack uuid, _confirm boolean) TO anon;
GRANT ALL ON FUNCTION public.confirm_attack_auto_resolution(_attack uuid, _confirm boolean) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_attack_auto_resolution(_attack uuid, _confirm boolean) TO service_role;


--
-- Name: FUNCTION conquest_lists_only(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.conquest_lists_only() TO anon;
GRANT ALL ON FUNCTION public.conquest_lists_only() TO authenticated;
GRANT ALL ON FUNCTION public.conquest_lists_only() TO service_role;


--
-- Name: FUNCTION create_ship(_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_ship(_name text) TO anon;
GRANT ALL ON FUNCTION public.create_ship(_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_ship(_name text) TO service_role;


--
-- Name: FUNCTION daily_income_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.daily_income_status() TO anon;
GRANT ALL ON FUNCTION public.daily_income_status() TO authenticated;
GRANT ALL ON FUNCTION public.daily_income_status() TO service_role;


--
-- Name: FUNCTION declare_raid(_defender uuid, _plan jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.declare_raid(_defender uuid, _plan jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.declare_raid(_defender uuid, _plan jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.declare_raid(_defender uuid, _plan jsonb) TO service_role;


--
-- Name: FUNCTION delete_game(_game uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_game(_game uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_game(_game uuid) TO service_role;


--
-- Name: FUNCTION demolish_module(_module text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.demolish_module(_module text) TO anon;
GRANT ALL ON FUNCTION public.demolish_module(_module text) TO authenticated;
GRANT ALL ON FUNCTION public.demolish_module(_module text) TO service_role;


--
-- Name: FUNCTION dismiss_40k(_unit text, _models integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dismiss_40k(_unit text, _models integer, _qty integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dismiss_40k(_unit text, _models integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_40k(_unit text, _models integer, _qty integer) TO service_role;


--
-- Name: FUNCTION dismiss_unit(_unit integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dismiss_unit(_unit integer, _qty integer) TO anon;
GRANT ALL ON FUNCTION public.dismiss_unit(_unit integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_unit(_unit integer, _qty integer) TO service_role;


--
-- Name: FUNCTION dismiss_unit_and_veterans(_unit integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dismiss_unit_and_veterans(_unit integer, _qty integer) TO anon;
GRANT ALL ON FUNCTION public.dismiss_unit_and_veterans(_unit integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.dismiss_unit_and_veterans(_unit integer, _qty integer) TO service_role;


--
-- Name: FUNCTION dup_advantage(_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.dup_advantage(_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.dup_advantage(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.dup_advantage(_uid uuid) TO service_role;


--
-- Name: FUNCTION faction_hold_factor(_faction text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.faction_hold_factor(_faction text) TO anon;
GRANT ALL ON FUNCTION public.faction_hold_factor(_faction text) TO authenticated;
GRANT ALL ON FUNCTION public.faction_hold_factor(_faction text) TO service_role;


--
-- Name: FUNCTION game_full(g public.games); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.game_full(g public.games) TO anon;
GRANT ALL ON FUNCTION public.game_full(g public.games) TO authenticated;
GRANT ALL ON FUNCTION public.game_full(g public.games) TO service_role;


--
-- Name: FUNCTION game_lists(_game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.game_lists(_game uuid) TO anon;
GRANT ALL ON FUNCTION public.game_lists(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.game_lists(_game uuid) TO service_role;


--
-- Name: TABLE ship_supports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ship_supports TO anon;
GRANT ALL ON TABLE public.ship_supports TO authenticated;
GRANT ALL ON TABLE public.ship_supports TO service_role;


--
-- Name: FUNCTION get_supports(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_supports() TO anon;
GRANT ALL ON FUNCTION public.get_supports() TO authenticated;
GRANT ALL ON FUNCTION public.get_supports() TO service_role;


--
-- Name: FUNCTION give_region(_region integer, _uid uuid, _reward integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.give_region(_region integer, _uid uuid, _reward integer) TO anon;
GRANT ALL ON FUNCTION public.give_region(_region integer, _uid uuid, _reward integer) TO authenticated;
GRANT ALL ON FUNCTION public.give_region(_region integer, _uid uuid, _reward integer) TO service_role;


--
-- Name: FUNCTION grant_honour(_unit integer, _bearer text, _ability text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.grant_honour(_unit integer, _bearer text, _ability text) TO anon;
GRANT ALL ON FUNCTION public.grant_honour(_unit integer, _bearer text, _ability text) TO authenticated;
GRANT ALL ON FUNCTION public.grant_honour(_unit integer, _bearer text, _ability text) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION honour_cost(_ability text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.honour_cost(_ability text) TO anon;
GRANT ALL ON FUNCTION public.honour_cost(_ability text) TO authenticated;
GRANT ALL ON FUNCTION public.honour_cost(_ability text) TO service_role;


--
-- Name: FUNCTION is_excluded(_game uuid, _user uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_excluded(_game uuid, _user uuid) TO anon;
GRANT ALL ON FUNCTION public.is_excluded(_game uuid, _user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_excluded(_game uuid, _user uuid) TO service_role;


--
-- Name: FUNCTION is_game_creator(_game uuid, _user uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_game_creator(_game uuid, _user uuid) TO anon;
GRANT ALL ON FUNCTION public.is_game_creator(_game uuid, _user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_game_creator(_game uuid, _user uuid) TO service_role;


--
-- Name: FUNCTION is_game_player(_game uuid, _user uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_game_player(_game uuid, _user uuid) TO anon;
GRANT ALL ON FUNCTION public.is_game_player(_game uuid, _user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_game_player(_game uuid, _user uuid) TO service_role;


--
-- Name: FUNCTION join_game(_game uuid, _side text, _list uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.join_game(_game uuid, _side text, _list uuid) TO anon;
GRANT ALL ON FUNCTION public.join_game(_game uuid, _side text, _list uuid) TO authenticated;
GRANT ALL ON FUNCTION public.join_game(_game uuid, _side text, _list uuid) TO service_role;


--
-- Name: FUNCTION land_region(_region integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.land_region(_region integer) TO anon;
GRANT ALL ON FUNCTION public.land_region(_region integer) TO authenticated;
GRANT ALL ON FUNCTION public.land_region(_region integer) TO service_role;


--
-- Name: FUNCTION leave_game(_game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.leave_game(_game uuid) TO anon;
GRANT ALL ON FUNCTION public.leave_game(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.leave_game(_game uuid) TO service_role;


--
-- Name: FUNCTION list_40k_playable(_list uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_40k_playable(_list uuid) TO anon;
GRANT ALL ON FUNCTION public.list_40k_playable(_list uuid) TO authenticated;
GRANT ALL ON FUNCTION public.list_40k_playable(_list uuid) TO service_role;


--
-- Name: FUNCTION list_players(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.list_players() TO anon;
GRANT ALL ON FUNCTION public.list_players() TO authenticated;
GRANT ALL ON FUNCTION public.list_players() TO service_role;


--
-- Name: FUNCTION load_pod_unit(_unit integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.load_pod_unit(_unit integer, _qty integer) TO anon;
GRANT ALL ON FUNCTION public.load_pod_unit(_unit integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.load_pod_unit(_unit integer, _qty integer) TO service_role;


--
-- Name: FUNCTION load_pods(_qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.load_pods(_qty integer) TO anon;
GRANT ALL ON FUNCTION public.load_pods(_qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.load_pods(_qty integer) TO service_role;


--
-- Name: FUNCTION mod_level(_uid uuid, _m text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mod_level(_uid uuid, _m text) TO anon;
GRANT ALL ON FUNCTION public.mod_level(_uid uuid, _m text) TO authenticated;
GRANT ALL ON FUNCTION public.mod_level(_uid uuid, _m text) TO service_role;


--
-- Name: FUNCTION naval_apply_crits(_uid uuid, _n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_apply_crits(_uid uuid, _n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_apply_crits(_uid uuid, _n integer) TO service_role;


--
-- Name: FUNCTION naval_beats(_a text, _b text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.naval_beats(_a text, _b text) TO anon;
GRANT ALL ON FUNCTION public.naval_beats(_a text, _b text) TO authenticated;
GRANT ALL ON FUNCTION public.naval_beats(_a text, _b text) TO service_role;


--
-- Name: FUNCTION naval_continue(_raid uuid, _plan jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_continue(_raid uuid, _plan jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_continue(_raid uuid, _plan jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.naval_continue(_raid uuid, _plan jsonb) TO service_role;


--
-- Name: FUNCTION naval_finish(_id uuid, _winner text, _reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_finish(_id uuid, _winner text, _reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_finish(_id uuid, _winner text, _reason text) TO service_role;


--
-- Name: FUNCTION naval_normal_plan(_p jsonb, _uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_normal_plan(_p jsonb, _uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_normal_plan(_p jsonb, _uid uuid) TO service_role;


--
-- Name: FUNCTION naval_order_module(_o text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.naval_order_module(_o text) TO anon;
GRANT ALL ON FUNCTION public.naval_order_module(_o text) TO authenticated;
GRANT ALL ON FUNCTION public.naval_order_module(_o text) TO service_role;


--
-- Name: FUNCTION naval_plan_valid(_p jsonb, _uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_plan_valid(_p jsonb, _uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_plan_valid(_p jsonb, _uid uuid) TO service_role;


--
-- Name: FUNCTION naval_raids_view(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_raids_view() FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_raids_view() TO authenticated;
GRANT ALL ON FUNCTION public.naval_raids_view() TO service_role;


--
-- Name: FUNCTION naval_roll(_n integer, _target integer, OUT hits integer, OUT sixes integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_roll(_n integer, _target integer, OUT hits integer, OUT sixes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_roll(_n integer, _target integer, OUT hits integer, OUT sixes integer) TO service_role;


--
-- Name: FUNCTION naval_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.naval_stats() TO anon;
GRANT ALL ON FUNCTION public.naval_stats() TO authenticated;
GRANT ALL ON FUNCTION public.naval_stats() TO service_role;


--
-- Name: FUNCTION naval_valid_plan(_p jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.naval_valid_plan(_p jsonb) TO anon;
GRANT ALL ON FUNCTION public.naval_valid_plan(_p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.naval_valid_plan(_p jsonb) TO service_role;


--
-- Name: FUNCTION naval_withdraw(_raid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.naval_withdraw(_raid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.naval_withdraw(_raid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.naval_withdraw(_raid uuid) TO service_role;


--
-- Name: FUNCTION no_simulated_40k_lists_in_games(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.no_simulated_40k_lists_in_games() TO anon;
GRANT ALL ON FUNCTION public.no_simulated_40k_lists_in_games() TO authenticated;
GRANT ALL ON FUNCTION public.no_simulated_40k_lists_in_games() TO service_role;


--
-- Name: FUNCTION pod_capacity(_lvl integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pod_capacity(_lvl integer) TO anon;
GRANT ALL ON FUNCTION public.pod_capacity(_lvl integer) TO authenticated;
GRANT ALL ON FUNCTION public.pod_capacity(_lvl integer) TO service_role;


--
-- Name: FUNCTION process_veterans(_uid uuid, _game uuid, _v jsonb, _res text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.process_veterans(_uid uuid, _game uuid, _v jsonb, _res text) TO anon;
GRANT ALL ON FUNCTION public.process_veterans(_uid uuid, _game uuid, _v jsonb, _res text) TO authenticated;
GRANT ALL ON FUNCTION public.process_veterans(_uid uuid, _game uuid, _v jsonb, _res text) TO service_role;


--
-- Name: FUNCTION protect_conquest_game(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_conquest_game() TO anon;
GRANT ALL ON FUNCTION public.protect_conquest_game() TO authenticated;
GRANT ALL ON FUNCTION public.protect_conquest_game() TO service_role;


--
-- Name: FUNCTION protect_profile(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_profile() TO anon;
GRANT ALL ON FUNCTION public.protect_profile() TO authenticated;
GRANT ALL ON FUNCTION public.protect_profile() TO service_role;


--
-- Name: FUNCTION recharge_orbital(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recharge_orbital() TO anon;
GRANT ALL ON FUNCTION public.recharge_orbital() TO authenticated;
GRANT ALL ON FUNCTION public.recharge_orbital() TO service_role;


--
-- Name: FUNCTION recover_engine(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recover_engine(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.recover_engine(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recover_engine(_id uuid) TO service_role;


--
-- Name: FUNCTION recruit_40k(_unit text, _models integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recruit_40k(_unit text, _models integer, _qty integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recruit_40k(_unit text, _models integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.recruit_40k(_unit text, _models integer, _qty integer) TO service_role;


--
-- Name: FUNCTION recruit_unit(_unit integer, _qty integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recruit_unit(_unit integer, _qty integer) TO anon;
GRANT ALL ON FUNCTION public.recruit_unit(_unit integer, _qty integer) TO authenticated;
GRANT ALL ON FUNCTION public.recruit_unit(_unit integer, _qty integer) TO service_role;


--
-- Name: FUNCTION region_rate(_uid uuid, _type text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.region_rate(_uid uuid, _type text) TO authenticated;
GRANT ALL ON FUNCTION public.region_rate(_uid uuid, _type text) TO service_role;


--
-- Name: FUNCTION region_types_of(_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.region_types_of(_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.region_types_of(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.region_types_of(_uid uuid) TO service_role;


--
-- Name: FUNCTION rename_ship(_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rename_ship(_name text) TO anon;
GRANT ALL ON FUNCTION public.rename_ship(_name text) TO authenticated;
GRANT ALL ON FUNCTION public.rename_ship(_name text) TO service_role;


--
-- Name: FUNCTION rename_veteran(_id uuid, _name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rename_veteran(_id uuid, _name text) TO anon;
GRANT ALL ON FUNCTION public.rename_veteran(_id uuid, _name text) TO authenticated;
GRANT ALL ON FUNCTION public.rename_veteran(_id uuid, _name text) TO service_role;


--
-- Name: FUNCTION repair_engine(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.repair_engine(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.repair_engine(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.repair_engine(_id uuid) TO service_role;


--
-- Name: FUNCTION repair_hull(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repair_hull() FROM PUBLIC;
GRANT ALL ON FUNCTION public.repair_hull() TO authenticated;
GRANT ALL ON FUNCTION public.repair_hull() TO service_role;


--
-- Name: FUNCTION repair_module(_module text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.repair_module(_module text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.repair_module(_module text) TO authenticated;
GRANT ALL ON FUNCTION public.repair_module(_module text) TO service_role;


--
-- Name: FUNCTION reset_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_profile() TO authenticated;
GRANT ALL ON FUNCTION public.reset_profile() TO service_role;


--
-- Name: FUNCTION resolve_raid(_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_raid(_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_raid(_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_raids(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_raids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_raids() TO service_role;


--
-- Name: FUNCTION respond_game(_game uuid, _accept boolean, _list uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.respond_game(_game uuid, _accept boolean, _list uuid) TO anon;
GRANT ALL ON FUNCTION public.respond_game(_game uuid, _accept boolean, _list uuid) TO authenticated;
GRANT ALL ON FUNCTION public.respond_game(_game uuid, _accept boolean, _list uuid) TO service_role;


--
-- Name: FUNCTION save_battle(_game uuid, _battle jsonb, _status text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_battle(_game uuid, _battle jsonb, _status text) TO anon;
GRANT ALL ON FUNCTION public.save_battle(_game uuid, _battle jsonb, _status text) TO authenticated;
GRANT ALL ON FUNCTION public.save_battle(_game uuid, _battle jsonb, _status text) TO service_role;


--
-- Name: FUNCTION set_approval(_user uuid, _approved boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_approval(_user uuid, _approved boolean) TO anon;
GRANT ALL ON FUNCTION public.set_approval(_user uuid, _approved boolean) TO authenticated;
GRANT ALL ON FUNCTION public.set_approval(_user uuid, _approved boolean) TO service_role;


--
-- Name: FUNCTION set_default_stance(_plan jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_default_stance(_plan jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_default_stance(_plan jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_default_stance(_plan jsonb) TO service_role;


--
-- Name: FUNCTION set_raid_plan(_raid uuid, _plan jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_raid_plan(_raid uuid, _plan jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_raid_plan(_raid uuid, _plan jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.set_raid_plan(_raid uuid, _plan jsonb) TO service_role;


--
-- Name: FUNCTION ship_abort_course(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_abort_course() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_abort_course() TO authenticated;
GRANT ALL ON FUNCTION public.ship_abort_course() TO service_role;


--
-- Name: FUNCTION ship_assert_capacity(_uid uuid, _oc numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_assert_capacity(_uid uuid, _oc numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_assert_capacity(_uid uuid, _oc numeric) TO service_role;


--
-- Name: FUNCTION ship_assert_job_slot(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_assert_job_slot() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_assert_job_slot() TO service_role;


--
-- Name: FUNCTION ship_base_hull(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_base_hull(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_base_hull(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_busy(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_busy(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_busy(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_capacity(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_capacity(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_capacity(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_fleet(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_fleet(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_fleet(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_max_hull(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_max_hull(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_max_hull(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_module_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ship_module_guard() TO anon;
GRANT ALL ON FUNCTION public.ship_module_guard() TO authenticated;
GRANT ALL ON FUNCTION public.ship_module_guard() TO service_role;


--
-- Name: FUNCTION ship_oc_used(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_oc_used(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_oc_used(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_process_jobs(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_process_jobs(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_process_jobs(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_set_course(_body text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ship_set_course(_body text) TO anon;
GRANT ALL ON FUNCTION public.ship_set_course(_body text) TO authenticated;
GRANT ALL ON FUNCTION public.ship_set_course(_body text) TO service_role;


--
-- Name: FUNCTION ship_start_queued(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_start_queued(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_start_queued(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_start_queued_at(_uid uuid, _at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_start_queued_at(_uid uuid, _at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_start_queued_at(_uid uuid, _at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION ship_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_status() TO authenticated;
GRANT ALL ON FUNCTION public.ship_status() TO service_role;


--
-- Name: FUNCTION ship_tick(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_tick() TO service_role;
GRANT ALL ON FUNCTION public.ship_tick() TO authenticated;


--
-- Name: FUNCTION ship_training_seconds(_uid uuid, _points integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_training_seconds(_uid uuid, _points integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_training_seconds(_uid uuid, _points integer) TO service_role;


--
-- Name: FUNCTION ship_travel_tick(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_travel_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_travel_tick() TO authenticated;
GRANT ALL ON FUNCTION public.ship_travel_tick() TO service_role;


--
-- Name: FUNCTION ship_warp_until(_uid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ship_warp_until(_uid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_warp_until(_uid uuid) TO service_role;


--
-- Name: FUNCTION ship_work_guard(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ship_work_guard() TO anon;
GRANT ALL ON FUNCTION public.ship_work_guard() TO authenticated;
GRANT ALL ON FUNCTION public.ship_work_guard() TO service_role;


--
-- Name: FUNCTION strategos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.strategos() TO anon;
GRANT ALL ON FUNCTION public.strategos() TO authenticated;
GRANT ALL ON FUNCTION public.strategos() TO service_role;


--
-- Name: FUNCTION support_tick(_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.support_tick(_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.support_tick(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.support_tick(_uid uuid) TO service_role;


--
-- Name: FUNCTION sync_my_veterans(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_my_veterans() TO anon;
GRANT ALL ON FUNCTION public.sync_my_veterans() TO authenticated;
GRANT ALL ON FUNCTION public.sync_my_veterans() TO service_role;


--
-- Name: FUNCTION sync_veterans(_uid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_veterans(_uid uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_veterans(_uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_veterans(_uid uuid) TO service_role;


--
-- Name: FUNCTION system_ships(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.system_ships() TO anon;
GRANT ALL ON FUNCTION public.system_ships() TO authenticated;
GRANT ALL ON FUNCTION public.system_ships() TO service_role;


--
-- Name: FUNCTION travel_seconds(_a text, _b text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.travel_seconds(_a text, _b text) TO anon;
GRANT ALL ON FUNCTION public.travel_seconds(_a text, _b text) TO authenticated;
GRANT ALL ON FUNCTION public.travel_seconds(_a text, _b text) TO service_role;


--
-- Name: FUNCTION use_honour(_id uuid, _game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.use_honour(_id uuid, _game uuid) TO anon;
GRANT ALL ON FUNCTION public.use_honour(_id uuid, _game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.use_honour(_id uuid, _game uuid) TO service_role;


--
-- Name: FUNCTION use_support(_game uuid, _kind text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.use_support(_game uuid, _kind text) TO anon;
GRANT ALL ON FUNCTION public.use_support(_game uuid, _kind text) TO authenticated;
GRANT ALL ON FUNCTION public.use_support(_game uuid, _kind text) TO service_role;


--
-- Name: FUNCTION validate_40k_list(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_40k_list() TO anon;
GRANT ALL ON FUNCTION public.validate_40k_list() TO authenticated;
GRANT ALL ON FUNCTION public.validate_40k_list() TO service_role;


--
-- Name: FUNCTION validate_army_identity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_army_identity() TO anon;
GRANT ALL ON FUNCTION public.validate_army_identity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_army_identity() TO service_role;


--
-- Name: FUNCTION veteran_kind(_unit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.veteran_kind(_unit integer) TO anon;
GRANT ALL ON FUNCTION public.veteran_kind(_unit integer) TO authenticated;
GRANT ALL ON FUNCTION public.veteran_kind(_unit integer) TO service_role;


--
-- Name: FUNCTION wh40k_apply_result(_game uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_apply_result(_game uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_apply_result(_game uuid) TO service_role;


--
-- Name: FUNCTION wh40k_attack_region(_region integer, _kind text, _points integer, _list uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_attack_region(_region integer, _kind text, _points integer, _list uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_attack_region(_region integer, _kind text, _points integer, _list uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_attack_region(_region integer, _kind text, _points integer, _list uuid) TO service_role;


--
-- Name: FUNCTION wh40k_battle_ready(_game uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_battle_ready(_game uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_battle_ready(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_battle_ready(_game uuid) TO service_role;


--
-- Name: FUNCTION wh40k_battle_tick(_game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_battle_tick(_game uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_battle_tick(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_battle_tick(_game uuid) TO service_role;


--
-- Name: FUNCTION wh40k_cancel_training(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_cancel_training(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_cancel_training(_id uuid) TO service_role;


--
-- Name: FUNCTION wh40k_compendium(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_compendium() FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_compendium() TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_compendium() TO service_role;


--
-- Name: FUNCTION wh40k_confirm_end(_game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_confirm_end(_game uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_confirm_end(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_confirm_end(_game uuid) TO service_role;


--
-- Name: FUNCTION wh40k_create_game(_kind text, _points integer, _opponent uuid, _list uuid, _notes text, _scheduled timestamp with time zone, _excluded uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_create_game(_kind text, _points integer, _opponent uuid, _list uuid, _notes text, _scheduled timestamp with time zone, _excluded uuid[]) TO anon;
GRANT ALL ON FUNCTION public.wh40k_create_game(_kind text, _points integer, _opponent uuid, _list uuid, _notes text, _scheduled timestamp with time zone, _excluded uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_create_game(_kind text, _points integer, _opponent uuid, _list uuid, _notes text, _scheduled timestamp with time zone, _excluded uuid[]) TO service_role;


--
-- Name: FUNCTION wh40k_dismiss_squad(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_dismiss_squad(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_dismiss_squad(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_dismiss_squad(_id uuid) TO service_role;


--
-- Name: FUNCTION wh40k_dispute(_game uuid, _note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_dispute(_game uuid, _note text) TO anon;
GRANT ALL ON FUNCTION public.wh40k_dispute(_game uuid, _note text) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_dispute(_game uuid, _note text) TO service_role;


--
-- Name: FUNCTION wh40k_game_state(_game uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_game_state(_game uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_game_state(_game uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_game_state(_game uuid) TO service_role;


--
-- Name: FUNCTION wh40k_rename_squad(_id uuid, _name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_rename_squad(_id uuid, _name text) TO anon;
GRANT ALL ON FUNCTION public.wh40k_rename_squad(_id uuid, _name text) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_rename_squad(_id uuid, _name text) TO service_role;


--
-- Name: FUNCTION wh40k_report_battle(_id uuid, _game uuid, _models_lost integer, _wounds_lost integer, _note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_report_battle(_id uuid, _game uuid, _models_lost integer, _wounds_lost integer, _note text) TO anon;
GRANT ALL ON FUNCTION public.wh40k_report_battle(_id uuid, _game uuid, _models_lost integer, _wounds_lost integer, _note text) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_report_battle(_id uuid, _game uuid, _models_lost integer, _wounds_lost integer, _note text) TO service_role;


--
-- Name: FUNCTION wh40k_restore_squad(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_restore_squad(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_restore_squad(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_restore_squad(_id uuid) TO service_role;


--
-- Name: FUNCTION wh40k_retrain_squad(_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_retrain_squad(_id uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_retrain_squad(_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_retrain_squad(_id uuid) TO service_role;


--
-- Name: FUNCTION wh40k_sanitize_battle(_battle jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_sanitize_battle(_battle jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_sanitize_battle(_battle jsonb) TO service_role;


--
-- Name: FUNCTION wh40k_save_battle(_game uuid, _battle jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_save_battle(_game uuid, _battle jsonb) TO anon;
GRANT ALL ON FUNCTION public.wh40k_save_battle(_game uuid, _battle jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_save_battle(_game uuid, _battle jsonb) TO service_role;


--
-- Name: FUNCTION wh40k_set_game_list(_game uuid, _list uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_set_game_list(_game uuid, _list uuid) TO anon;
GRANT ALL ON FUNCTION public.wh40k_set_game_list(_game uuid, _list uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_set_game_list(_game uuid, _list uuid) TO service_role;


--
-- Name: FUNCTION wh40k_set_loadout(_id uuid, _loadout jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_set_loadout(_id uuid, _loadout jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_set_loadout(_id uuid, _loadout jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_set_loadout(_id uuid, _loadout jsonb) TO service_role;


--
-- Name: FUNCTION wh40k_set_squad_photo(_id uuid, _path text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_set_squad_photo(_id uuid, _path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_set_squad_photo(_id uuid, _path text) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_set_squad_photo(_id uuid, _path text) TO service_role;


--
-- Name: FUNCTION wh40k_set_summary(_kind text, _id uuid, _text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_set_summary(_kind text, _id uuid, _text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_set_summary(_kind text, _id uuid, _text text) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_set_summary(_kind text, _id uuid, _text text) TO service_role;


--
-- Name: TABLE wh40k_squads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wh40k_squads TO anon;
GRANT ALL ON TABLE public.wh40k_squads TO authenticated;
GRANT ALL ON TABLE public.wh40k_squads TO service_role;


--
-- Name: FUNCTION wh40k_squad_price(s public.wh40k_squads); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_squad_price(s public.wh40k_squads) FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_squad_price(s public.wh40k_squads) TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_squad_price(s public.wh40k_squads) TO service_role;


--
-- Name: FUNCTION wh40k_sync_recruits(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.wh40k_sync_recruits() FROM PUBLIC;
GRANT ALL ON FUNCTION public.wh40k_sync_recruits() TO service_role;


--
-- Name: FUNCTION wh40k_tick(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wh40k_tick() TO anon;
GRANT ALL ON FUNCTION public.wh40k_tick() TO authenticated;
GRANT ALL ON FUNCTION public.wh40k_tick() TO service_role;


--
-- Name: TABLE admin_bootstrap_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_bootstrap_state TO anon;
GRANT ALL ON TABLE public.admin_bootstrap_state TO authenticated;
GRANT ALL ON TABLE public.admin_bootstrap_state TO service_role;


--
-- Name: TABLE army_lists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.army_lists TO anon;
GRANT ALL ON TABLE public.army_lists TO authenticated;
GRANT ALL ON TABLE public.army_lists TO service_role;


--
-- Name: TABLE battle_records; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.battle_records TO anon;
GRANT ALL ON TABLE public.battle_records TO authenticated;
GRANT ALL ON TABLE public.battle_records TO service_role;


--
-- Name: TABLE build_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.build_queue TO anon;
GRANT ALL ON TABLE public.build_queue TO authenticated;
GRANT ALL ON TABLE public.build_queue TO service_role;


--
-- Name: SEQUENCE build_queue_sequence_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.build_queue_sequence_seq TO anon;
GRANT ALL ON SEQUENCE public.build_queue_sequence_seq TO authenticated;
GRANT ALL ON SEQUENCE public.build_queue_sequence_seq TO service_role;


--
-- Name: TABLE campaign; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.campaign TO anon;
GRANT ALL ON TABLE public.campaign TO authenticated;
GRANT ALL ON TABLE public.campaign TO service_role;


--
-- Name: TABLE celestial_bodies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.celestial_bodies TO anon;
GRANT ALL ON TABLE public.celestial_bodies TO authenticated;
GRANT ALL ON TABLE public.celestial_bodies TO service_role;


--
-- Name: TABLE collection_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.collection_items TO anon;
GRANT ALL ON TABLE public.collection_items TO authenticated;
GRANT ALL ON TABLE public.collection_items TO service_role;


--
-- Name: TABLE engine_damage; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engine_damage TO anon;
GRANT ALL ON TABLE public.engine_damage TO authenticated;
GRANT ALL ON TABLE public.engine_damage TO service_role;


--
-- Name: TABLE game_exclusions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_exclusions TO anon;
GRANT ALL ON TABLE public.game_exclusions TO authenticated;
GRANT ALL ON TABLE public.game_exclusions TO service_role;


--
-- Name: TABLE honours; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.honours TO anon;
GRANT ALL ON TABLE public.honours TO authenticated;
GRANT ALL ON TABLE public.honours TO service_role;


--
-- Name: TABLE lost_engines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.lost_engines TO anon;
GRANT ALL ON TABLE public.lost_engines TO authenticated;
GRANT ALL ON TABLE public.lost_engines TO service_role;


--
-- Name: TABLE module_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.module_types TO anon;
GRANT ALL ON TABLE public.module_types TO authenticated;
GRANT ALL ON TABLE public.module_types TO service_role;


--
-- Name: TABLE naval_private_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.naval_private_plans TO anon;
GRANT ALL ON TABLE public.naval_private_plans TO authenticated;
GRANT ALL ON TABLE public.naval_private_plans TO service_role;


--
-- Name: TABLE naval_raids; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.naval_raids TO anon;
GRANT ALL ON TABLE public.naval_raids TO authenticated;
GRANT ALL ON TABLE public.naval_raids TO service_role;


--
-- Name: TABLE naval_stances; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.naval_stances TO anon;
GRANT ALL ON TABLE public.naval_stances TO authenticated;
GRANT ALL ON TABLE public.naval_stances TO service_role;


--
-- Name: TABLE pod_bay; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pod_bay TO anon;
GRANT ALL ON TABLE public.pod_bay TO authenticated;
GRANT ALL ON TABLE public.pod_bay TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE recruit_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recruit_orders TO anon;
GRANT ALL ON TABLE public.recruit_orders TO authenticated;
GRANT ALL ON TABLE public.recruit_orders TO service_role;


--
-- Name: TABLE region_attacks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.region_attacks TO anon;
GRANT ALL ON TABLE public.region_attacks TO authenticated;
GRANT ALL ON TABLE public.region_attacks TO service_role;


--
-- Name: TABLE regions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.regions TO anon;
GRANT ALL ON TABLE public.regions TO authenticated;
GRANT ALL ON TABLE public.regions TO service_role;


--
-- Name: TABLE scenarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.scenarios TO anon;
GRANT ALL ON TABLE public.scenarios TO authenticated;
GRANT ALL ON TABLE public.scenarios TO service_role;


--
-- Name: TABLE ship_modules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ship_modules TO anon;
GRANT ALL ON TABLE public.ship_modules TO authenticated;
GRANT ALL ON TABLE public.ship_modules TO service_role;


--
-- Name: TABLE ship_travel_private; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ship_travel_private TO anon;
GRANT ALL ON TABLE public.ship_travel_private TO authenticated;
GRANT ALL ON TABLE public.ship_travel_private TO service_role;


--
-- Name: TABLE ships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ships TO anon;
GRANT ALL ON TABLE public.ships TO authenticated;
GRANT ALL ON TABLE public.ships TO service_role;


--
-- Name: TABLE unit_catalog; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.unit_catalog TO anon;
GRANT ALL ON TABLE public.unit_catalog TO authenticated;
GRANT ALL ON TABLE public.unit_catalog TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE veteran_battles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.veteran_battles TO anon;
GRANT ALL ON TABLE public.veteran_battles TO authenticated;
GRANT ALL ON TABLE public.veteran_battles TO service_role;


--
-- Name: TABLE veterans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.veterans TO anon;
GRANT ALL ON TABLE public.veterans TO authenticated;
GRANT ALL ON TABLE public.veterans TO service_role;


--
-- Name: TABLE wh40k_recruits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wh40k_recruits TO anon;
GRANT ALL ON TABLE public.wh40k_recruits TO authenticated;
GRANT ALL ON TABLE public.wh40k_recruits TO service_role;


--
-- Name: TABLE wh40k_squad_history; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wh40k_squad_history TO anon;
GRANT ALL ON TABLE public.wh40k_squad_history TO authenticated;
GRANT ALL ON TABLE public.wh40k_squad_history TO service_role;


--
-- Name: TABLE wh40k_unit_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wh40k_unit_prices TO anon;
GRANT ALL ON TABLE public.wh40k_unit_prices TO authenticated;
GRANT ALL ON TABLE public.wh40k_unit_prices TO service_role;


--
-- PostgreSQL database dump complete
--


--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6 (Debian 18.6-3)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: admin_bootstrap_state admin_bootstrap_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_bootstrap_state
    ADD CONSTRAINT admin_bootstrap_state_pkey PRIMARY KEY (id);


--
-- Name: army_lists army_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.army_lists
    ADD CONSTRAINT army_lists_pkey PRIMARY KEY (id);


--
-- Name: battle_records battle_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.battle_records
    ADD CONSTRAINT battle_records_pkey PRIMARY KEY (game_id, user_id);


--
-- Name: build_queue build_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_queue
    ADD CONSTRAINT build_queue_pkey PRIMARY KEY (id);


--
-- Name: campaign campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_pkey PRIMARY KEY (id);


--
-- Name: celestial_bodies celestial_bodies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.celestial_bodies
    ADD CONSTRAINT celestial_bodies_pkey PRIMARY KEY (id);


--
-- Name: collection_items collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_items
    ADD CONSTRAINT collection_items_pkey PRIMARY KEY (user_id, unit_id);


--
-- Name: engine_damage engine_damage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_damage
    ADD CONSTRAINT engine_damage_pkey PRIMARY KEY (id);


--
-- Name: game_exclusions game_exclusions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_exclusions
    ADD CONSTRAINT game_exclusions_pkey PRIMARY KEY (game_id, user_id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: honours honours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.honours
    ADD CONSTRAINT honours_pkey PRIMARY KEY (id);


--
-- Name: lost_engines lost_engines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lost_engines
    ADD CONSTRAINT lost_engines_pkey PRIMARY KEY (id);


--
-- Name: module_types module_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_types
    ADD CONSTRAINT module_types_pkey PRIMARY KEY (id);


--
-- Name: naval_private_plans naval_private_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naval_private_plans
    ADD CONSTRAINT naval_private_plans_pkey PRIMARY KEY (raid_id);


--
-- Name: naval_raids naval_raids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naval_raids
    ADD CONSTRAINT naval_raids_pkey PRIMARY KEY (id);


--
-- Name: naval_stances naval_stances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naval_stances
    ADD CONSTRAINT naval_stances_pkey PRIMARY KEY (user_id);


--
-- Name: pod_bay pod_bay_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_bay
    ADD CONSTRAINT pod_bay_pkey PRIMARY KEY (user_id, unit_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: recruit_orders recruit_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruit_orders
    ADD CONSTRAINT recruit_orders_pkey PRIMARY KEY (id);


--
-- Name: region_attacks region_attacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_attacks
    ADD CONSTRAINT region_attacks_pkey PRIMARY KEY (id);


--
-- Name: regions regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_pkey PRIMARY KEY (id);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: ship_modules ship_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_modules
    ADD CONSTRAINT ship_modules_pkey PRIMARY KEY (user_id, module);


--
-- Name: ship_supports ship_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_supports
    ADD CONSTRAINT ship_supports_pkey PRIMARY KEY (user_id);


--
-- Name: ship_travel_private ship_travel_private_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_travel_private
    ADD CONSTRAINT ship_travel_private_pkey PRIMARY KEY (user_id);


--
-- Name: ships ships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_pkey PRIMARY KEY (user_id);


--
-- Name: unit_catalog unit_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_catalog
    ADD CONSTRAINT unit_catalog_pkey PRIMARY KEY (unit_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: veteran_battles veteran_battles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veteran_battles
    ADD CONSTRAINT veteran_battles_pkey PRIMARY KEY (id);


--
-- Name: veterans veterans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veterans
    ADD CONSTRAINT veterans_pkey PRIMARY KEY (id);


--
-- Name: wh40k_recruits wh40k_recruits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wh40k_recruits
    ADD CONSTRAINT wh40k_recruits_pkey PRIMARY KEY (user_id, faction, unit_name, models);


--
-- Name: wh40k_squad_history wh40k_squad_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wh40k_squad_history
    ADD CONSTRAINT wh40k_squad_history_pkey PRIMARY KEY (id);


--
-- Name: wh40k_squads wh40k_squads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wh40k_squads
    ADD CONSTRAINT wh40k_squads_pkey PRIMARY KEY (id);


--
-- Name: wh40k_unit_prices wh40k_unit_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wh40k_unit_prices
    ADD CONSTRAINT wh40k_unit_prices_pkey PRIMARY KEY (faction, unit_name, models);


--
-- Name: naval_active_participants_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX naval_active_participants_idx ON public.naval_raids USING btree (status, deadline);


--
-- Name: naval_raids_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX naval_raids_pending ON public.naval_raids USING btree (status, deadline);


--
-- Name: region_attacks_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX region_attacks_one_active ON public.region_attacks USING btree (attacker_id) WHERE (resolved_at IS NULL);


--
-- Name: region_attacks_one_per_region; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX region_attacks_one_per_region ON public.region_attacks USING btree (region_id) WHERE (resolved_at IS NULL);


--
-- Name: regions_body_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regions_body_idx ON public.regions USING btree (body_id);


--
-- Name: ship_job_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ship_job_order ON public.build_queue USING btree (user_id, created_at, sequence);


--
-- Name: ship_one_active_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ship_one_active_job ON public.build_queue USING btree (user_id) WHERE (started_at IS NOT NULL);


--
-- Name: veterans_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veterans_user_idx ON public.veterans USING btree (user_id, unit_id);


--
-- Name: wh40k_squad_history_squad_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wh40k_squad_history_squad_id_idx ON public.wh40k_squad_history USING btree (squad_id);


--
-- Name: wh40k_squads_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wh40k_squads_user_id_idx ON public.wh40k_squads USING btree (user_id);


--
-- Name: profiles cleanup_deleted_player; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_deleted_player AFTER DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_player();


--
-- Name: profiles cleanup_wh40k_squads; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_wh40k_squads BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.cleanup_wh40k_squads();


--
-- Name: games conquest_lists_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER conquest_lists_only BEFORE INSERT OR UPDATE OF creator_list_id, opponent_list_id ON public.games FOR EACH ROW EXECUTE FUNCTION public.conquest_lists_only();


--
-- Name: games games_protect_conquest; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER games_protect_conquest BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.protect_conquest_game();


--
-- Name: ship_modules guard_naval_module_work; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_naval_module_work BEFORE INSERT OR DELETE OR UPDATE ON public.ship_modules FOR EACH ROW EXECUTE FUNCTION public.ship_module_guard();


--
-- Name: build_queue guard_naval_queue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_naval_queue BEFORE INSERT OR DELETE ON public.build_queue FOR EACH ROW EXECUTE FUNCTION public.ship_work_guard();


--
-- Name: games no_simulated_40k_lists_in_games; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_simulated_40k_lists_in_games BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION public.no_simulated_40k_lists_in_games();


--
-- Name: profiles profiles_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile();


--
-- Name: profiles profiles_validate_army_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_validate_army_identity BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_army_identity();


--
-- Name: army_lists validate_40k_list; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_40k_list BEFORE INSERT OR UPDATE ON public.army_lists FOR EACH ROW EXECUTE FUNCTION public.validate_40k_list();


--
-- Name: wh40k_squads wh40k_squads_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wh40k_squads_sync AFTER INSERT OR DELETE OR UPDATE ON public.wh40k_squads FOR EACH ROW EXECUTE FUNCTION public.wh40k_sync_recruits();


--
-- Name: build_queue build_queue_module_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.build_queue
    ADD CONSTRAINT build_queue_module_fkey FOREIGN KEY (module) REFERENCES public.module_types(id);


--
-- Name: celestial_bodies celestial_bodies_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.celestial_bodies
    ADD CONSTRAINT celestial_bodies_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.celestial_bodies(id);


--
-- Name: game_exclusions game_exclusions_game_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_exclusions
    ADD CONSTRAINT game_exclusions_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE;


--
-- Name: games games_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE SET NULL;


--
-- Name: naval_private_plans naval_private_plans_raid_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.naval_private_plans
    ADD CONSTRAINT naval_private_plans_raid_id_fkey FOREIGN KEY (raid_id) REFERENCES public.naval_raids(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: recruit_orders recruit_orders_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recruit_orders
    ADD CONSTRAINT recruit_orders_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.unit_catalog(unit_id);


--
-- Name: region_attacks region_attacks_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_attacks
    ADD CONSTRAINT region_attacks_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.regions(id);


--
-- Name: regions regions_body_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_body_id_fkey FOREIGN KEY (body_id) REFERENCES public.celestial_bodies(id);


--
-- Name: regions regions_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regions
    ADD CONSTRAINT regions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id);


--
-- Name: ship_modules ship_modules_module_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_modules
    ADD CONSTRAINT ship_modules_module_fkey FOREIGN KEY (module) REFERENCES public.module_types(id);


--
-- Name: ship_travel_private ship_travel_private_destination_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_travel_private
    ADD CONSTRAINT ship_travel_private_destination_fkey FOREIGN KEY (destination) REFERENCES public.celestial_bodies(id);


--
-- Name: ship_travel_private ship_travel_private_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ship_travel_private
    ADD CONSTRAINT ship_travel_private_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.ships(user_id) ON DELETE CASCADE;


--
-- Name: ships ships_body_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_body_id_fkey FOREIGN KEY (body_id) REFERENCES public.celestial_bodies(id);


--
-- Name: ships ships_travel_from_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ships
    ADD CONSTRAINT ships_travel_from_fkey FOREIGN KEY (travel_from) REFERENCES public.celestial_bodies(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: veteran_battles veteran_battles_veteran_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veteran_battles
    ADD CONSTRAINT veteran_battles_veteran_id_fkey FOREIGN KEY (veteran_id) REFERENCES public.veterans(id) ON DELETE CASCADE;


--
-- Name: unit_catalog admin catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin catalog" ON public.unit_catalog TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: regions admin edits regions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin edits regions" ON public.regions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: module_types admin write module types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin write module types" ON public.module_types TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: scenarios admin write scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin write scenarios" ON public.scenarios TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: admin_bootstrap_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_bootstrap_state ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_items admins read collections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read collections" ON public.collection_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: engine_damage admins read engine damage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read engine damage" ON public.engine_damage FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: lost_engines admins read lost engines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read lost engines" ON public.lost_engines FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles admins read profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ship_supports admins read supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read supports" ON public.ship_supports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: army_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.army_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: battle_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.battle_records ENABLE ROW LEVEL SECURITY;

--
-- Name: build_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.build_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign ENABLE ROW LEVEL SECURITY;

--
-- Name: celestial_bodies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.celestial_bodies ENABLE ROW LEVEL SECURITY;

--
-- Name: honours club reads honours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club reads honours" ON public.honours FOR SELECT TO authenticated USING (true);


--
-- Name: battle_records club reads records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club reads records" ON public.battle_records FOR SELECT TO authenticated USING (true);


--
-- Name: veteran_battles club reads veteran battles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club reads veteran battles" ON public.veteran_battles FOR SELECT TO authenticated USING (true);


--
-- Name: veterans club reads veterans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "club reads veterans" ON public.veterans FOR SELECT TO authenticated USING (true);


--
-- Name: collection_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

--
-- Name: games create games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "create games" ON public.games FOR INSERT TO authenticated WITH CHECK (((creator_id = auth.uid()) AND (status = 'abierta'::text)));


--
-- Name: games creator deletes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "creator deletes" ON public.games FOR DELETE TO authenticated USING (((creator_id = auth.uid()) AND (status <> 'aceptada'::text)));


--
-- Name: game_exclusions creator manages exclusions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "creator manages exclusions" ON public.game_exclusions TO authenticated USING (public.is_game_creator(game_id, auth.uid())) WITH CHECK (public.is_game_creator(game_id, auth.uid()));


--
-- Name: games creator updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "creator updates" ON public.games FOR UPDATE TO authenticated USING ((creator_id = auth.uid())) WITH CHECK ((creator_id = auth.uid()));


--
-- Name: engine_damage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_damage ENABLE ROW LEVEL SECURITY;

--
-- Name: game_exclusions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_exclusions ENABLE ROW LEVEL SECURITY;

--
-- Name: games; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

--
-- Name: honours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.honours ENABLE ROW LEVEL SECURITY;

--
-- Name: lost_engines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lost_engines ENABLE ROW LEVEL SECURITY;

--
-- Name: module_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_types ENABLE ROW LEVEL SECURITY;

--
-- Name: naval_private_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.naval_private_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: naval_raids; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.naval_raids ENABLE ROW LEVEL SECURITY;

--
-- Name: naval_stances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.naval_stances ENABLE ROW LEVEL SECURITY;

--
-- Name: collection_items own collection read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own collection read" ON public.collection_items FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: engine_damage own engine damage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own engine damage" ON public.engine_damage FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: wh40k_squad_history own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own history" ON public.wh40k_squad_history FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: army_lists own lists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own lists" ON public.army_lists TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: lost_engines own lost engines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own lost engines" ON public.lost_engines FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ship_modules own modules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own modules" ON public.ship_modules FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: recruit_orders own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own orders" ON public.recruit_orders FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: pod_bay own pod bay; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own pod bay" ON public.pod_bay FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles own profile insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles own profile read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles own profile update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: build_queue own queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own queue" ON public.build_queue FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: wh40k_recruits own recruits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own recruits" ON public.wh40k_recruits FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: user_roles own roles read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: wh40k_squads own squads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own squads" ON public.wh40k_squads FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: naval_stances own stance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own stance" ON public.naval_stances FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ship_supports own supports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own supports" ON public.ship_supports FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ship_travel_private own travel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own travel" ON public.ship_travel_private FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: naval_raids participants read raids; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "participants read raids" ON public.naval_raids FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pod_bay; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_bay ENABLE ROW LEVEL SECURITY;

--
-- Name: wh40k_unit_prices prices readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prices readable" ON public.wh40k_unit_prices FOR SELECT TO authenticated USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: region_attacks read attacks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read attacks" ON public.region_attacks FOR SELECT TO authenticated USING (true);


--
-- Name: celestial_bodies read bodies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read bodies" ON public.celestial_bodies FOR SELECT TO authenticated USING (true);


--
-- Name: campaign read campaign; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read campaign" ON public.campaign FOR SELECT TO authenticated USING (true);


--
-- Name: unit_catalog read catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read catalog" ON public.unit_catalog FOR SELECT TO authenticated USING (true);


--
-- Name: module_types read module types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read module types" ON public.module_types FOR SELECT TO authenticated USING (true);


--
-- Name: regions read regions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read regions" ON public.regions FOR SELECT TO authenticated USING (true);


--
-- Name: scenarios read scenarios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read scenarios" ON public.scenarios FOR SELECT TO authenticated USING (true);


--
-- Name: ships read ships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read ships" ON public.ships FOR SELECT TO authenticated USING (true);


--
-- Name: recruit_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recruit_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: region_attacks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.region_attacks ENABLE ROW LEVEL SECURITY;

--
-- Name: regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

--
-- Name: scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: games see games; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see games" ON public.games FOR SELECT TO authenticated USING (((auth.uid() = creator_id) OR (auth.uid() = opponent_id) OR (auth.uid() = creator_ally_id) OR (auth.uid() = opponent_ally_id) OR ((status = 'abierta'::text) AND (NOT public.is_excluded(id, auth.uid())))));


--
-- Name: ship_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ship_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: ship_supports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ship_supports ENABLE ROW LEVEL SECURITY;

--
-- Name: ship_travel_private; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ship_travel_private ENABLE ROW LEVEL SECURITY;

--
-- Name: ships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ships ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: veteran_battles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veteran_battles ENABLE ROW LEVEL SECURITY;

--
-- Name: veterans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.veterans ENABLE ROW LEVEL SECURITY;

--
-- Name: wh40k_recruits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wh40k_recruits ENABLE ROW LEVEL SECURITY;

--
-- Name: wh40k_squad_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wh40k_squad_history ENABLE ROW LEVEL SECURITY;

--
-- Name: wh40k_squads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wh40k_squads ENABLE ROW LEVEL SECURITY;

--
-- Name: wh40k_unit_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wh40k_unit_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
