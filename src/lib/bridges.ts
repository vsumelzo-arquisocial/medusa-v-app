import imperium from "@/assets/bridges/imperium.jpg";
import chaos from "@/assets/bridges/chaos.jpg";
import daemons from "@/assets/bridges/daemons.jpg";
import aeldari from "@/assets/bridges/aeldari.jpg";
import drukhari from "@/assets/bridges/drukhari.jpg";
import tau from "@/assets/bridges/tau.jpg";
import orks from "@/assets/bridges/orks.jpg";
import necrons from "@/assets/bridges/necrons.jpg";
import tyranids from "@/assets/bridges/tyranids.jpg";
import votann from "@/assets/bridges/votann.jpg";
import { get40kFaction } from "@/lib/warhammer40k-factions";

const BY_RACE: Record<string, string> = { daemons, aeldari, tau, orks, necrons, tyranids, votann };

/** Picks the command-bridge artwork that matches the player's chosen army. */
export function bridgeImageFor(race: string | null, faction: string | null): string {
  if (faction === "drukhari") return drukhari;
  if (race === "humanity") return get40kFaction(faction ?? "")?.group === "chaos" ? chaos : imperium;
  return BY_RACE[race ?? ""] ?? imperium;
}
