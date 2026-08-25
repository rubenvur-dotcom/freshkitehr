import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      leave_requests: {
        Row: LeaveRequest;
        Insert: Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<LeaveRequest, 'id' | 'created_at'>>;
      };
      leave_policies: {
        Row: LeavePolicy;
        Insert: Omit<LeavePolicy, 'id' | 'updated_at'>;
        Update: Partial<Omit<LeavePolicy, 'id'>>;
      };
    };
  };
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: 'admin' | 'employee';
  is_active: boolean;
  annual_entitlement: number;
  sick_entitlement: number;
  date_of_hire: string | null;
  has_probation: boolean;
  probation_duration_months: number | null;
  probation_end_date: string | null;
  probation_status: 'in_probation' | 'passed' | 'extended';
  total_annual_entitlement: number;
  offboarding_status: 'in_progress' | 'complete' | null;
  separation_reason: 'Resigned' | 'Contract Ended' | 'Terminated' | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  residential_address: string | null;
  national_id: string | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: 'Annual' | 'Sick' | 'Maternity' | 'Paternity' | 'Emergency' | 'Unpaid' | 'Compassionate' | 'Study';
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  admin_comment: string | null;
  submitted_by_admin: boolean;
  is_short_notice: boolean;
  short_notice_reason: string | null;
  study_document_url: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface PermissionRequest {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  reason: string | null;
  status: 'Pending' | 'Approved' | 'Declined';
  admin_comment: string | null;
  converted_to_half_day: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface PolicyNote {
  id: string;
  note_text: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
}

export interface LeavePolicy {
  id: string;
  leave_type: string;
  days_allowed: number;
  description: string;
  color: string;
  is_default: boolean;
  updated_at: string;
}

export type DocumentFolder = 'tax' | 'contract' | 'communication' | 'personal' | 'payslip';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type AnnouncementAudience = 'all' | 'admin' | 'employee';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  target_audience: AnnouncementAudience;
  target_department: string | null;
  author_id: string;
  is_pinned: boolean;
  expires_at: string | null;
  requires_acknowledgement: boolean;
  created_at: string;
  profiles?: Profile;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  folder: DocumentFolder;
  file_name: string;
  file_url: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by: string;
}

export type AnnouncementEmoji = 'like' | 'love' | 'celebrate' | 'applaud' | 'happy' | 'sad';
export interface AnnouncementReaction {
  id: string;
  announcement_id: string;
  user_id: string;
  emoji: AnnouncementEmoji;
  created_at: string;
}

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  author_id: string;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
  profiles?: Pick<Profile, 'full_name' | 'role'>;
}

export interface AnnouncementPoll {
  id: string;
  announcement_id: string;
  question: string;
  is_anonymous: boolean;
  created_at: string;
  options?: AnnouncementPollOption[];
}

export interface AnnouncementPollOption {
  id: string;
  poll_id: string;
  option_text: string;
  display_order: number;
}

export interface AnnouncementPollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  voted_at: string;
  profiles?: Pick<Profile, 'full_name'>;
}

export interface AnnouncementAttachment {
  id: string;
  announcement_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
}

export interface AnnouncementAcknowledgement {
  id: string;
  announcement_id: string;
  user_id: string;
  acknowledged_at: string;
  profiles?: Pick<Profile, 'full_name'>;
}

export type CommentReactionEmoji = 'like' | 'love' | 'happy';

export interface AnnouncementCommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: CommentReactionEmoji;
  created_at: string;
}

export interface AnnouncementReadMarker {
  user_id: string;
  last_read_at: string;
}

export interface AnnouncementCommentSeen {
  user_id: string;
  announcement_id: string;
  last_seen_at: string;
}

export type SeparationReason = 'Resigned' | 'Contract Ended' | 'Terminated';
export type OffboardingStatus = 'in_progress' | 'complete';

export interface OffboardingChecklist {
  id: string;
  employee_id: string;
  initiated_by: string;
  separation_reason: SeparationReason;
  last_working_day: string | null;
  final_employment_date: string | null;
  personal_email: string;
  position: string;
  status: OffboardingStatus;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface OffboardingItem {
  id: string;
  checklist_id: string;
  section: string;
  item_key: string;
  label: string;
  is_checked: boolean;
  is_optional: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  created_at: string;
  checker?: Profile;
}

export interface OffboardingAuditLog {
  id: string;
  checklist_id: string;
  actor_id: string;
  action: 'initiated' | 'item_checked' | 'item_unchecked' | 'completed' | 'info_updated';
  detail: string | null;
  created_at: string;
  actor?: Profile;
}

export type ShirtSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export interface EmployeePersonalData {
  id: string;
  employee_id: string;
  date_of_birth: string | null;
  shirt_size: ShirtSize | null;
  address: string;
  national_id: string;
  blood_group: BloodGroup | null;
  allergies: string;
  updated_at: string;
  created_at: string;
}

export interface EmployeeEmergencyContact {
  id: string;
  employee_id: string;
  contact_name: string;
  relationship: string;
  phone_primary: string;
  phone_alt: string;
  is_primary: boolean;
  updated_at: string;
  created_at: string;
}

export interface HandbookSection {
  id: string;
  display_order: number;
  title: string;
  body: string;
  last_updated_by: string | null;
  updated_at: string;
  created_at: string;
}
