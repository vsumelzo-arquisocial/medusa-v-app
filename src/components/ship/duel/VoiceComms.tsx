import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Play, Send, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { play } from "@/lib/sfx/engine";

const MAX_SECONDS = 10;

interface VoiceRow {
  id: string;
  path: string;
  sender: string;
  recipient: string;
  block: number;
  seconds: number;
  created_at: string;
}

const voiceTable = () => supabase.from("naval_voice" as never);

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/**
 * Mensajes de voz del duelo: un audio de hasta 10 s por jugador y bloque. Se borra en cuanto el
 * rival lo escucha (o a las 24 h si nadie lo escucha), para no guardar nada.
 */
export function VoiceComms({
  raidId,
  uid,
  peerId,
  peerName,
  block,
  onSent,
}: {
  raidId: string;
  uid: string;
  peerId: string;
  peerName: string;
  block: number;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const key = ["naval-voice", raidId];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data } = await voiceTable()
        .select("id,path,sender,recipient,block,seconds,created_at")
        .eq("raid_id", raidId)
        .order("created_at");
      return (data ?? []) as unknown as VoiceRow[];
    },
  });
  const inbox = rows.filter((r) => r.recipient === uid);
  const sentThisBlock = rows.some((r) => r.sender === uid && r.block === block);
  const seenInbox = useRef(0);
  useEffect(() => {
    if (inbox.length > seenInbox.current) play("registro", { gain: 0.8 });
    seenInbox.current = inbox.length;
  }, [inbox.length]);

  const [rec, setRec] = useState<{ t: number } | null>(null);
  const [clip, setClip] = useState<{ blob: Blob; seconds: number; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);

  async function start() {
    const mime = pickMime();
    if (!navigator.mediaDevices?.getUserMedia || mime === "") {
      toast.error("Este navegador no permite grabar audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        const seconds = Math.min(MAX_SECONDS, (performance.now() - started.current) / 1000);
        const blob = new Blob(chunks, { type: mime.split(";")[0] ?? mime });
        setRec(null);
        if (seconds >= 0.5) setClip({ blob, seconds, url: URL.createObjectURL(blob) });
      };
      recorder.current = mr;
      started.current = performance.now();
      mr.start();
      setRec({ t: 0 });
      timer.current = window.setInterval(() => {
        const t = (performance.now() - started.current) / 1000;
        if (t >= MAX_SECONDS) {
          if (mr.state === "recording") mr.stop();
        } else setRec({ t });
      }, 100);
    } catch {
      toast.error("Sin acceso al micrófono.");
    }
  }

  async function send() {
    if (!clip) return;
    setBusy(true);
    const ext = clip.blob.type.includes("mp4")
      ? "m4a"
      : clip.blob.type.includes("ogg")
        ? "ogg"
        : "webm";
    const path = `${raidId}/${uid}/${crypto.randomUUID()}.${ext}`;
    try {
      const up = await supabase.storage
        .from("voz")
        .upload(path, clip.blob, { contentType: clip.blob.type, upsert: false });
      if (up.error) throw up.error;
      const ins = await voiceTable().insert({
        raid_id: raidId,
        sender: uid,
        recipient: peerId,
        block,
        path,
        seconds: Math.round(clip.seconds * 10) / 10,
      } as never);
      if (ins.error) {
        await supabase.storage.from("voz").remove([path]);
        throw ins.error;
      }
      setClip(null);
      onSent();
      play("click");
      toast.success(`Mensaje enviado a ${peerName}`);
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enviar el audio");
    } finally {
      setBusy(false);
    }
  }

  async function listen(r: VoiceRow) {
    const { data, error } = await supabase.storage.from("voz").download(r.path);
    if (error || !data) {
      toast.error("El mensaje ya no está disponible.");
      await qc.invalidateQueries({ queryKey: key });
      return;
    }
    const url = URL.createObjectURL(data);
    const audio = new Audio(url);
    const wipe = async () => {
      URL.revokeObjectURL(url);
      await supabase.storage.from("voz").remove([r.path]);
      await voiceTable().delete().eq("id", r.id);
      await qc.invalidateQueries({ queryKey: key });
    };
    audio.onended = () => void wipe();
    audio.onerror = () => void wipe();
    play("radar_ping", { gain: 0.5 });
    await audio.play().catch(() => void wipe());
  }

  return (
    <section
      aria-label="Mensajes de voz"
      className="space-y-2 rounded border border-border p-2 text-sm"
    >
      {inbox.map((r) => (
        <Button
          key={r.id}
          variant="outline"
          className="w-full justify-start border-amber-500/60 text-amber-200 motion-safe:animate-pulse"
          onClick={() => void listen(r)}
        >
          <Play /> {peerName} te ha enviado un mensaje ({Math.round(r.seconds)} s) · se borra al
          escucharlo
        </Button>
      ))}
      {rec ? (
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={() => recorder.current?.stop()}>
            <Square /> Parar
          </Button>
          <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-red-500"
              style={{ width: `${(rec.t / MAX_SECONDS) * 100}%` }}
            />
          </div>
          <span className="tabular-nums text-xs">{Math.ceil(MAX_SECONDS - rec.t)} s</span>
        </div>
      ) : clip ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void new Audio(clip.url).play()}>
            <Play /> Oír ({clip.seconds.toFixed(0)} s)
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void send()}>
            <Send /> Enviar a {peerName}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setClip(null)} aria-label="Descartar">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={sentThisBlock}
          onClick={() => void start()}
        >
          <Mic />
          {sentThisBlock ? "Mensaje de esta ronda enviado" : `Mensaje de voz a ${peerName} (10 s)`}
        </Button>
      )}
    </section>
  );
}
