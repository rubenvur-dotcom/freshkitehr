/**
 * Employee CSV export utility.
 */

const EXPORT_HEADERS = [
  'first_name', 'last_name', 'email', 'department',
  'job_title', 'employment_type', 'start_date', 'status',
  'date_of_birth', 'emergency_contact_name',
  'emergency_contact_relationship', 'emergency_contact_phone',
];

function toDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function isTestAccount(name: string): boolean {
  return /test|aaa|bbb/i.test(name);
}

export function exportEmployeesCsv(employees: {
  full_name: string;
  email: string;
  department: string | null;
  date_of_hire: string | null;
  is_active: boolean;
  date_of_birth?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
}[]) {
  const real = employees.filter(e => !isTestAccount(e.full_name));

  const rows: string[][] = real.map(e => {
    const nameParts = e.full_name.trim().split(' ');
    const firstName = nameParts[0] ?? '';
    const lastName  = nameParts.slice(1).join(' ');
    return [
      firstName,
      lastName,
      e.email,
      e.department ?? '',
      '',
      'Full-time',
      toDdMmYyyy(e.date_of_hire),
      e.is_active ? 'Active' : 'Inactive',
      toDdMmYyyy(e.date_of_birth ?? null),
      e.emergency_contact_name ?? '',
      e.emergency_contact_relationship ?? '',
      e.emergency_contact_phone ?? '',
    ];
  });

  const csv = [EXPORT_HEADERS, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `FreshkiteHR_Employees_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
