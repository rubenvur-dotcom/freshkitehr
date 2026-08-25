/*
  # Seed Demo Users and Leave Data

  Creates three demo accounts for testing and inserts 5 sample leave requests.
*/

DO $$
DECLARE
  admin_id uuid;
  bilaal_id uuid;
  maxime_id uuid;
BEGIN
  -- Create admin user
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@freshkite.net';
  IF admin_id IS NULL THEN
    admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@freshkite.net',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"full_name": "Arshad H.", "department": "Management", "role": "admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), admin_id,
      json_build_object('sub', admin_id::text, 'email', 'admin@freshkite.net')::jsonb,
      'email', admin_id::text, now(), now(), now()
    );
  END IF;

  -- Create bilaal user
  SELECT id INTO bilaal_id FROM auth.users WHERE email = 'bilaal@freshkite.net';
  IF bilaal_id IS NULL THEN
    bilaal_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      bilaal_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'bilaal@freshkite.net',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"full_name": "Bilaal R.", "department": "Tech", "role": "employee"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), bilaal_id,
      json_build_object('sub', bilaal_id::text, 'email', 'bilaal@freshkite.net')::jsonb,
      'email', bilaal_id::text, now(), now(), now()
    );
  END IF;

  -- Create maxime user
  SELECT id INTO maxime_id FROM auth.users WHERE email = 'maxime@freshkite.net';
  IF maxime_id IS NULL THEN
    maxime_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      maxime_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'maxime@freshkite.net',
      crypt('Password123!', gen_salt('bf')),
      now(),
      '{"full_name": "Maxime D.", "department": "Project Management", "role": "employee"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), maxime_id,
      json_build_object('sub', maxime_id::text, 'email', 'maxime@freshkite.net')::jsonb,
      'email', maxime_id::text, now(), now(), now()
    );
  END IF;

  -- Upsert profiles
  INSERT INTO profiles (id, email, full_name, department, role, is_active, annual_entitlement, sick_entitlement)
  VALUES
    (admin_id, 'admin@freshkite.net', 'Arshad H.', 'Management', 'admin', true, 20, 10),
    (bilaal_id, 'bilaal@freshkite.net', 'Bilaal R.', 'Tech', 'employee', true, 20, 10),
    (maxime_id, 'maxime@freshkite.net', 'Maxime D.', 'Project Management', 'employee', true, 20, 10)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department,
    role = EXCLUDED.role,
    annual_entitlement = EXCLUDED.annual_entitlement,
    sick_entitlement = EXCLUDED.sick_entitlement;

  -- Insert sample leave requests
  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, working_days, reason, status, admin_comment, created_at, updated_at)
  VALUES
    (bilaal_id, 'Annual', '2025-05-19', '2025-05-23', 5, 'Family vacation to Rodrigues Island.', 'Approved', 'Enjoy your holiday!', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days'),
    (bilaal_id, 'Sick', '2025-04-07', '2025-04-08', 2, 'Flu and fever.', 'Approved', NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days'),
    (bilaal_id, 'Annual', '2025-06-09', '2025-06-13', 5, 'Personal travel plans.', 'Pending', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
    (maxime_id, 'Emergency', '2025-04-14', '2025-04-14', 1, 'Family emergency.', 'Approved', 'Hope everything is okay.', NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days'),
    (maxime_id, 'Annual', '2025-05-26', '2025-05-30', 5, 'Pre-planned holiday.', 'Rejected', 'Clash with key project deadline. Please reschedule.', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days');

END $$;
