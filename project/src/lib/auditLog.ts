import { supabase } from './supabase';

export async function logAudit(
  actorId: string,
  actorName: string,
  action: string,
  resourceType: string,
  resourceId?: string,
  details?: Record<string, unknown>,
) {
  await supabase.from('audit_logs').insert({
    actor_id:      actorId,
    actor_name:    actorName,
    action,
    resource_type: resourceType,
    resource_id:   resourceId ?? null,
    details:       details ?? null,
  });
}
