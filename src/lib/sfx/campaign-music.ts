/** Música de la campaña guardada en el bucket privado «musica» de Supabase. */
import { supabase } from "@/integrations/supabase/client";
import { refreshRemoteMusic, setRemoteMusicResolver, type MusicSlot } from "./engine";

export const MUSIC_FILES: Record<MusicSlot, string> = {
  musica_tension: "aproximacion.mp3",
  musica_combate: "combate.mp3",
};

let installed = false;
/** Conecta el motor de audio con el almacenamiento privado (una vez). */
export function installCampaignMusic() {
  if (installed) return;
  installed = true;
  setRemoteMusicResolver(async (slot) => {
    const { data, error } = await supabase.storage
      .from("musica")
      .createSignedUrl(MUSIC_FILES[slot], 60 * 60 * 6);
    return error ? null : data.signedUrl;
  });
}

/** Sube (o reemplaza) una pista de la campaña. Solo administradores. */
export async function uploadCampaignMusic(slot: MusicSlot, file: File) {
  const { error } = await supabase.storage
    .from("musica")
    .upload(MUSIC_FILES[slot], file, { upsert: true, contentType: file.type || "audio/mpeg" });
  if (error) throw error;
  refreshRemoteMusic(slot);
}

export async function campaignMusicExists(slot: MusicSlot): Promise<boolean> {
  const { data } = await supabase.storage.from("musica").list("", { search: MUSIC_FILES[slot] });
  return !!data?.some((f) => f.name === MUSIC_FILES[slot]);
}
