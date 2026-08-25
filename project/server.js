const express = require('express');
const path = require('path');

try { require('dotenv').config({ path: '.env.production' }); } catch(e) {}

let createClient;
try { ({ createClient } = require('@supabase/supabase-js')); } catch(e) {
  console.warn('[WARN] @supabase/supabase-js not available — admin API disabled');
}

const app = express();
const PORT = process.env.PORT || process.env.NODE_PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── Supabase admin client (server-side only) ─────────────────────────────────
const SUPABASE_URL         = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const adminClient = createClient && SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

// ─── JWT verification middleware ──────────────────────────────────────────────
async function verifyAdmin(req, res, next) {
  if (!adminClient) {
    return res.status(503).json({ error: 'Admin API not configured' });
  }
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = auth.slice(7);
  try {
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, is_active, full_name')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin' || !profile.is_active) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.adminUser = { id: user.id, email: user.email, name: profile.full_name };
    next();
  } catch (e) {
    console.error('[verifyAdmin]', e.message);
    res.status(500).json({ error: 'Internal error' });
  }
}

async function logAudit(actorId, actorName, action, resourceType, resourceId, details) {
  if (!adminClient) return;
  await adminClient.from('audit_logs').insert({
    actor_id: actorId, actor_name: actorName, action,
    resource_type: resourceType, resource_id: resourceId ?? null, details: details ?? null,
  });
}

// ─── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '1mb' }));

// ─── Admin API endpoints ──────────────────────────────────────────────────────
app.post('/api/admin/users/list', verifyAdmin, async (req, res) => {
  try {
    const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (error) return res.status(500).json({ error: error.message });
    const users = (data.users ?? []).map(u => ({
      id: u.id, email: u.email ?? '', created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      banned_until: u.banned_until ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
    }));
    res.json({ users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/invite', verifyAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) return res.status(400).json({ error: error.message });
    await logAudit(req.adminUser.id, req.adminUser.name, 'user_invited', 'auth_user', undefined, { email });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/delete', verifyAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return res.status(400).json({ error: error.message });
    await logAudit(req.adminUser.id, req.adminUser.name, 'user_deleted', 'auth_user', userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/update-email', verifyAdmin, async (req, res) => {
  const { userId, email } = req.body;
  if (!userId || !email) return res.status(400).json({ error: 'userId and email required' });
  try {
    const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, { email });
    if (authErr) return res.status(400).json({ error: authErr.message });
    await adminClient.from('profiles').update({ email }).eq('id', userId);
    await logAudit(req.adminUser.id, req.adminUser.name, 'user_email_updated', 'auth_user', userId, { newEmail: email });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/reset-password', verifyAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { error } = await adminClient.auth.admin.generateLink({ type: 'recovery', email });
    if (error) return res.status(400).json({ error: error.message });
    await logAudit(req.adminUser.id, req.adminUser.name, 'password_reset_sent', 'auth_user', undefined, { email });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users/set-role', verifyAdmin, async (req, res) => {
  const { userId, action } = req.body;
  if (!userId || !['ban', 'unban', 'signout'].includes(action)) {
    return res.status(400).json({ error: 'userId and action required' });
  }
  try {
    let error;
    if (action === 'ban') {
      ({ error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '87600h' }));
    } else if (action === 'unban') {
      ({ error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' }));
    } else {
      ({ error } = await adminClient.auth.admin.signOut(userId, 'global'));
    }
    if (error) return res.status(400).json({ error: error.message });
    const auditAction = action === 'ban' ? 'user_disabled' : action === 'unban' ? 'user_enabled' : 'user_force_signed_out';
    await logAudit(req.adminUser.id, req.adminUser.name, auditAction, 'auth_user', userId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Storage move (service-role, bypasses RLS) ───────────────────────────────
app.post('/api/admin/storage/move', verifyAdmin, async (req, res) => {
  const { fromPath, toPath, docId, newUrl } = req.body;
  if (!fromPath || !toPath || !docId || !newUrl) {
    return res.status(400).json({ error: 'fromPath, toPath, docId and newUrl required' });
  }
  try {
    const { error: moveErr } = await adminClient.storage
      .from('employee-documents')
      .move(fromPath, toPath);
    if (moveErr) return res.status(400).json({ error: moveErr.message });
    const { error: dbErr } = await adminClient
      .from('employee_documents')
      .update({ file_url: newUrl })
      .eq('id', docId);
    if (dbErr) return res.status(500).json({ error: dbErr.message });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Static React build ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: true,
  maxAge: IS_PRODUCTION ? '1d' : 0,
}));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`KiteHR running on port ${PORT}`);
  if (!adminClient) console.warn('[WARN] SUPABASE_SERVICE_KEY not set — admin API disabled');
});
