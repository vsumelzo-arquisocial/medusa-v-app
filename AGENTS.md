<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Only `collect_daily_income` grants income under lock; economy uses SECURITY DEFINER RPCs and server time — why: prevent forged credits, cooldown bypass and duplicate collection.
- Conquest and system travel run in SECURITY DEFINER RPCs: landing/claims need an open `celestial_bodies` row and the ship there; `ship_set_course` hides destinations in `ship_travel_private`; `travel_seconds` mirrors `travelSeconds`; `region_rate` counts the ship's body only — why: no forged territory, bonuses or tracking.
- 40k battles use locked RPCs: `wh40k_create_game`/`wh40k_set_game_list` (list mandatory, hidden until start, editable before), `wh40k_battle_ready` (mutual start), `wh40k_save_battle` (sanitized vp/losses), `wh40k_confirm_end` (dual confirm; 24h auto-confirm via `wh40k_battle_tick`), `wh40k_dispute`/`admin_resolve_battle`; only `wh40k_apply_result` applies squad casualties, rewards and region resolution — why: results, fichas and territory must not be forgeable.
- Mutual attack auto-resolution uses a locked RPC with persisted per-participant consent — why: either player can propose without unilateral or duplicate territorial reward.
- Operation limits use per-kind/player locks; withdrawals use operation IDs — why: prevent parallel bypass and wrong cancellation.
- Player help is mounted once in the root layout and selects tutorials by pathname from a shared catalogue — why: consistent contextual help without duplicating controls.
- Player deletion uses server-authorized Auth Admin and a profile-delete cleanup trigger; finished matches keep rivals' results — why: remove account and progress together without exposing credentials or others' history.
- Campaign restart resolves active operations, detaches unfinished games from territory and invalidates cached views without touching battle status or personal progress — why: an old battle must not conquer a region in the new campaign.
- Achievements and ranking points are computed client-side in `src/lib/achievements.ts` from the `achievement_stats` RPC — why: rules stay readable.
- Legacy veterans sync through `sync_veterans` and `process_veterans`; honour IDs match SQL pools — why: preserve historical unique-unit results without forged honours.
- Voluntary reserve dismissal uses an atomic RPC reconciling veteran status; retired cards are hidden while fallen remain — why: removed units disappear immediately without erasing combat deaths.
- Naval duels use private plans and participant-only `naval_raids_view`; locked RPCs enforce hull, consent and settlement; archived reports render recorded rounds only — why: no forged results or historical hull from current ships.
- Root `FactionAtmosphere` applies profile-derived tokens and crests including portals; `ShipExterior` renders RPC hull/travel state without mutations — why: shared identity; effects never invent damage.
- `ship_status` and recruit RPCs enforce full-unit OC and economy; `ship_warp_until` derives protection from defender resolution — why: clients cannot bypass capacity or post-combat protection.
- Verified administrators import sourced OC with `admin_import_unit_oc`; unknown mixed profiles remain unpriced — why: never invent OC.
- Admin delegation uses server functions checking the caller's database role; bootstrap is out-of-band without embedded credentials — why: prevent self-granted privileges.
- First signup receives admin/approval through a locked one-time bootstrap; resets never reopen it — why: prevent concurrent/deleted-admin escalation.
- Signup password checks use a shared browser-safe policy with unit tests; hosted rules are configured separately in Cloud Auth — why: form validation cannot govern direct Auth requests.
- Sync map land+sea neighbors to DB; each island needs sea exits — why: shared IDs hide isolation. Restore references/triggers after remix.
- `reset_profile` atomically clears all personal progress under the economy lock; preserve account, approval, roles and rivals’ finished results — why: no old-army units or queued refunds survive.
- Keep sourced 40k catalogue at `/facciones` with URLs/version/date; validate race/faction/variant fields while preserving legacy identity — why: retain progress without inventing rules.
- Art uses army identity; `campaign-forces` uses `campaign_players_40k`, not allegiance — why: Xenos stay distinct; only unowned regions are neutral.
- 40k lists are import-only `army_lists` (`game_system='40k'`); `list_40k_playable` checks recruits; `recruit_40k` charges current points, epic heroes once — why: prevent forged rosters/economy.
- Read nested `AGENTS.md` before editing there.
- Recruitment deficits combine ready stock with preparing squads; playability uses ready stock only — why: prevent duplicate orders without enabling unfinished units.
- Ship work uses locked five-slot FIFO RPCs; upgrades use `build_module` and its UI helper, not catalogue prices — why: preserve repairs/refunds.
- Compendium: `wh40k_compendium` read, `wh40k_set_summary` participant write; no game deletion — why: retain history.
