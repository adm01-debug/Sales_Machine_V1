CREATE POLICY "authenticated read message-media" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'message-media');
CREATE POLICY "authenticated upload message-media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'message-media' AND auth.uid() = owner);
CREATE POLICY "owners delete message-media" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'message-media' AND auth.uid() = owner);