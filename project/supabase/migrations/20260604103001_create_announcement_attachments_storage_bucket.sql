/*
  # Announcement Attachments Storage Bucket

  Creates a private Supabase Storage bucket for announcement file attachments.

  ## Bucket
  - Name: announcement-attachments
  - Private (public = false)
  - Max file size: 20 MB
  - Allowed MIME types: PDF, PNG, JPEG, Excel (xlsx/xls)

  ## Storage Policies
  - All authenticated users can download attachment files
  - Only admins can upload, update, or delete attachment files
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-attachments',
  'announcement-attachments',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can download announcement attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'announcement-attachments');

CREATE POLICY "Admins can upload announcement attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND is_admin()
  );

CREATE POLICY "Admins can delete announcement attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'announcement-attachments'
    AND is_admin()
  );

CREATE POLICY "Admins can update announcement attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'announcement-attachments'
    AND is_admin()
  );
