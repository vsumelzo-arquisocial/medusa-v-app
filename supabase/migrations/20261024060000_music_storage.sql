-- Música de la campaña (privada): solo la escuchan los jugadores aprobados y solo la gestionan los administradores.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('musica', 'musica', false, 26214400, ARRAY['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav','audio/aac','audio/mp4'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "approved read music" ON storage.objects;
DROP POLICY IF EXISTS "admin insert music" ON storage.objects;
DROP POLICY IF EXISTS "admin update music" ON storage.objects;
DROP POLICY IF EXISTS "admin delete music" ON storage.objects;

CREATE POLICY "approved read music" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'musica' AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.approved));
CREATE POLICY "admin insert music" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'musica' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update music" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'musica' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete music" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'musica' AND public.has_role(auth.uid(), 'admin'));
