/*
  # Create employee-documents Storage Bucket + Policies

  Creates a private Supabase Storage bucket for employee documents and
  sets up RLS-based access policies so only authorised users can
  read/write files.

  ## Bucket
  - Name: employee-documents
  - Private (public = false)
  - Max file size: 10 MB
  - Allowed MIME types: PDF, Word, PNG, JPEG

  ## Storage Policies
  - Employees can only SELECT (download) objects whose path starts with their own auth.uid()
  - Admins can SELECT, INSERT, UPDATE, DELETE any object in the bucket
*/

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Employees can download their own files (path starts with their uid)
CREATE POLICY "Employees can read own document files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_admin()
    )
  );

-- Admins can upload files
CREATE POLICY "Admins can upload document files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND is_admin()
  );

-- Admins can delete files
CREATE POLICY "Admins can delete document files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND is_admin()
  );

-- Admins can update files
CREATE POLICY "Admins can update document files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND is_admin()
  );
