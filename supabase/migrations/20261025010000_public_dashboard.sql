-- Dashboard público (televisor del club): solo datos de campaña, sin datos personales
-- ni destinos ocultos de las naves en el warp. Accesible sin iniciar sesión.
CREATE OR REPLACE FUNCTION public.public_dashboard() RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
  WITH pl AS (
    SELECT p.id, p.force_name, p.leader_name, p.army_faction, p.map_color, p.map_emblem
    FROM public.profiles p
    WHERE p.approved AND p.oath_sworn_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'server_now', now(),
    'campaign', (SELECT jsonb_build_object('number', c.number, 'phase', c.phase) FROM public.campaign c WHERE c.id = 1),
    'bodies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'status', b.status, 'playable', b.playable) ORDER BY b.sort) FROM public.celestial_bodies b), '[]'),
    'players', COALESCE((SELECT jsonb_agg(to_jsonb(pl)) FROM pl), '[]'),
    'regions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'body_id', r.body_id, 'owner_id', r.owner_id, 'is_spaceport', r.is_spaceport) ORDER BY r.id) FROM public.regions r), '[]'),
    'fleet', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'name', s.name, 'body_id', s.body_id, 'travel_from', s.travel_from,
        'force_name', pl.force_name, 'map_color', pl.map_color, 'map_emblem', pl.map_emblem))
      FROM public.ships s JOIN pl ON pl.id = s.user_id), '[]'),
    'naval', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'attacker_id', r.attacker_id, 'defender_id', r.defender_id,
        'block', r.block_number, 'deadline', r.deadline,
        'attacker_hull', r.duel_state #> '{attacker,hull}', 'attacker_max', r.duel_state #> '{attacker,maxHull}',
        'defender_hull', r.duel_state #> '{defender,hull}', 'defender_max', r.duel_state #> '{defender,maxHull}',
        'mode', r.duel_state -> 'mode') ORDER BY r.created_at DESC)
      FROM public.naval_raids r WHERE r.status IN ('pendiente', 'enfrentado')), '[]'),
    'ground', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'region', rg.name, 'body_id', rg.body_id,
        'attacker_id', a.attacker_id, 'defender_id', a.defender_id, 'deadline', a.deadline) ORDER BY a.deadline)
      FROM public.region_attacks a JOIN public.regions rg ON rg.id = a.region_id WHERE a.resolved_at IS NULL), '[]')
  )
$$;
REVOKE ALL ON FUNCTION public.public_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_dashboard() TO anon, authenticated;
