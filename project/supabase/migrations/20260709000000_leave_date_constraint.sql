-- M3: server-side date validation — prevent end_date before start_date
ALTER TABLE leave_requests
  ADD CONSTRAINT IF NOT EXISTS check_leave_dates CHECK (end_date >= start_date);
