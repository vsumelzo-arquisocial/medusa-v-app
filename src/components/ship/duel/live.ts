import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DuelSignal = "orders" | "voice" | "mode";

/**
 * Enlace en vivo de un duelo: presencia (¿está el rival conectado ahora?) y avisos instantáneos
 * («he fijado órdenes», «te he mandado un audio»…) para refrescar sin esperar al sondeo.
 */
export function useDuelLink(
  raidId: string | null,
  uid: string,
  peerId: string,
  onSignal: (s: DuelSignal) => void,
) {
  const [online, setOnline] = useState<boolean | null>(null);
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const handler = useRef(onSignal);
  handler.current = onSignal;
  useEffect(() => {
    if (!raidId || !uid) return;
    let ch: ReturnType<typeof supabase.channel>;
    try {
      ch = supabase.channel(`duel:${raidId}`, { config: { presence: { key: uid } } });
    } catch {
      return;
    }
    const sync = () => setOnline(Object.keys(ch.presenceState()).includes(peerId));
    ch.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        const p = payload as { from?: string; type?: DuelSignal };
        if (p.from !== uid && p.type) handler.current(p.type);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    chan.current = ch;
    return () => {
      chan.current = null;
      void supabase.removeChannel(ch);
    };
  }, [raidId, uid, peerId]);
  const send = (type: DuelSignal) => {
    void chan.current?.send({ type: "broadcast", event: "signal", payload: { from: uid, type } });
  };
  return { online, send };
}
