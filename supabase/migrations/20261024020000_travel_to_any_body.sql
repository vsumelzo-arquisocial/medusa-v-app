-- Permitir viajar a cualquier cuerpo celeste (también gigantes gaseosos e Ignis), aunque no sea conquistable.
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
  IF public.ship_busy(uid) THEN RAISE EXCEPTION 'ship busy'; END IF;
  secs := public.travel_seconds(s.body_id, _body);
  eta := now() + make_interval(secs => secs);
  UPDATE public.ships SET travel_from = body_id, body_id = NULL, arrives_at = eta WHERE user_id = uid;
  INSERT INTO public.ship_travel_private (user_id, destination) VALUES (uid, _body)
    ON CONFLICT (user_id) DO UPDATE SET destination = EXCLUDED.destination, started_at = now();
  RETURN eta;
END $$;
