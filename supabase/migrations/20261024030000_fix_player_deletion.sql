-- Al eliminar un jugador, cleanup_deleted_player quita sus listas de las partidas (SET ..._list_id = NULL).
-- Este trigger revalidaba también las listas del rival en esa misma fila y, si ya no eran jugables
-- (por ejemplo, tras reiniciar su perfil), abortaba el borrado con 'list needs recruited units'.
-- Ahora solo se validan las listas que se asignan o cambian en la operación.
CREATE OR REPLACE FUNCTION public.no_simulated_40k_lists_in_games() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare changed uuid[];
begin
  if tg_op = 'INSERT' then
    changed := array[new.creator_list_id, new.opponent_list_id, new.creator_ally_list_id, new.opponent_ally_list_id];
  else
    changed := array[
      case when new.creator_list_id is distinct from old.creator_list_id then new.creator_list_id end,
      case when new.opponent_list_id is distinct from old.opponent_list_id then new.opponent_list_id end,
      case when new.creator_ally_list_id is distinct from old.creator_ally_list_id then new.creator_ally_list_id end,
      case when new.opponent_ally_list_id is distinct from old.opponent_ally_list_id then new.opponent_ally_list_id end
    ];
  end if;
  if exists (select 1 from public.army_lists l where l.id = any(changed)
             and l.game_system = '40k' and not public.list_40k_playable(l.id)) then
    raise exception 'list needs recruited units';
  end if;
  return new;
end $$;
