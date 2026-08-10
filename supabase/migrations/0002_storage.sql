-- Orbital — artifact storage
--
-- The bucket holds user uploads: sketches, screenshots, PDFs and audio.
--
-- It is private and has no policies for authenticated users, which under RLS
-- means only the service role can reach it. That is deliberate. Uploads and
-- reads both go through short-lived signed URLs minted server-side in
-- lib/server/supabase/storage.ts, after the request has been authorised by the
-- service layer. Adding a permissive policy here would create a second,
-- unaudited way in.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'orbital-artifacts',
  'orbital-artifacts',
  false,
  26214400, -- 25 MB, matching MAX_UPLOAD_BYTES in lib/domain/input.ts
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/avif',
    'application/pdf',
    'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/mp4'
  ]
)
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;
