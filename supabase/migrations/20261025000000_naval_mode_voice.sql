-- Combate naval: modo de combate (de una en una / de tres en tres) y mensajes de voz efímeros.

-- 1. Elección de modo de cada jugador (1 = de una en una, 3 = de tres en tres; NULL = sin elegir)
ALTER TABLE public.naval_raids ADD COLUMN IF NOT EXISTS attacker_mode smallint CHECK (attacker_mode IN (1, 3));
ALTER TABLE public.naval_raids ADD COLUMN IF NOT EXISTS defender_mode smallint CHECK (defender_mode IN (1, 3));

-- 2. Mensajes de voz: uno por jugador y bloque, máx. 10 s; se borran al escucharlos o a las 24 h
CREATE TABLE IF NOT EXISTS public.naval_voice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raid_id uuid NOT NULL REFERENCES public.naval_raids(id) ON DELETE CASCADE,
  sender uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block integer NOT NULL,
  path text NOT NULL UNIQUE,
  seconds real NOT NULL DEFAULT 0 CHECK (seconds >= 0 AND seconds <= 11),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raid_id, sender, block)
);
CREATE INDEX IF NOT EXISTS naval_voice_recipient_idx ON public.naval_voice (recipient, raid_id);
CREATE INDEX IF NOT EXISTS naval_voice_created_idx ON public.naval_voice (created_at);
ALTER TABLE public.naval_voice ENABLE ROW LEVEL SECURITY;

-- Rival del usuario en un duelo activo (NULL si no participa). SECURITY DEFINER: naval_raids no es legible directamente.
CREATE OR REPLACE FUNCTION public.naval_voice_peer(_raid uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $$
    SELECT CASE WHEN r.attacker_id = auth.uid() THEN r.defender_id
                WHEN r.defender_id = auth.uid() THEN r.attacker_id END
    FROM public.naval_raids r
    WHERE r.id = _raid AND r.status IN ('pendiente', 'enfrentado')
  $$;
REVOKE ALL ON FUNCTION public.naval_voice_peer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.naval_voice_peer(uuid) TO authenticated;

DROP POLICY IF EXISTS "voice insert" ON public.naval_voice;
DROP POLICY IF EXISTS "voice read" ON public.naval_voice;
DROP POLICY IF EXISTS "voice delete" ON public.naval_voice;

CREATE POLICY "voice insert" ON public.naval_voice FOR INSERT TO authenticated
  WITH CHECK (
    sender = auth.uid()
    AND path LIKE raid_id::text || '/' || auth.uid()::text || '/%'
    AND recipient = public.naval_voice_peer(raid_id)
  );
CREATE POLICY "voice read" ON public.naval_voice FOR SELECT TO authenticated
  USING (recipient = auth.uid() OR sender = auth.uid());
CREATE POLICY "voice delete" ON public.naval_voice FOR DELETE TO authenticated
  USING (recipient = auth.uid() OR sender = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.naval_voice TO authenticated;

-- 3. Almacén privado de los audios (300 KB por audio)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voz', 'voz', false, 307200, ARRAY['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voice upload" ON storage.objects;
DROP POLICY IF EXISTS "voice listen" ON storage.objects;
DROP POLICY IF EXISTS "voice remove" ON storage.objects;

CREATE POLICY "voice upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voz'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.naval_voice_peer(((storage.foldername(name))[1])::uuid) IS NOT NULL
  );
CREATE POLICY "voice listen" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'voz'
    AND EXISTS (
      SELECT 1 FROM public.naval_voice v
      WHERE v.path = name AND (v.recipient = auth.uid() OR v.sender = auth.uid())
    )
  );
CREATE POLICY "voice remove" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'voz'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.naval_voice v WHERE v.path = name AND v.recipient = auth.uid())
    )
  );
