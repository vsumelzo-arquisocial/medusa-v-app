-- Bucket de retratos (privado, 5 MB) y sus políticas, igual que en Lovable Cloud.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('portraits', 'portraits', false, 5242880)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "club reads portraits" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'portraits'::text));
CREATE POLICY "own portraits delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'portraits'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "own portraits insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'portraits'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "own portraits read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'portraits'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "own portraits update" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'portraits'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- Los archivos antiguos no se migraron desde Lovable: limpiar referencias rotas.
UPDATE public.profiles SET portrait_path = NULL WHERE portrait_path IS NOT NULL;
UPDATE public.wh40k_squads SET photo_path = NULL WHERE photo_path IS NOT NULL;
