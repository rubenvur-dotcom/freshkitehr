import React, { useEffect, useState, useCallback } from 'react';
import { supabase, LeaveRequest, Profile } from '../../lib/supabase';
import { getLeaveTypeCalendarColor, formatDate } from '../../lib/utils';
import { LeaveTypeBadge } from '../../components/LeaveTypeBadge';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '../../components/ui/button';

type RequestWithProfile = LeaveRequest & { profiles: Profile };

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const LeaveCalendarPage: React.FC = () => {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [requests, setRequests] = useState<RequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase
      .from('leave_requests')
      .select('*, profiles(*)')
      .eq('status', 'Approved')
      .order('start_date');
    if (data) setRequests(data as RequestWithProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().split('T')[0];

  // Build grid cells: nulls for leading empty cells, then date strings
  const cells: (string | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
  ];

  const getRequestsOnDay = (dateStr: string) =>
    requests.filter((r) => r.start_date <= dateStr && r.end_date >= dateStr);

  // All approved leave events for this month
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const monthEvents = requests.filter(
    (r) => r.start_date <= monthEnd && r.end_date >= monthStart
  );

  const goToPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };

  const goToNext = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(todayStr);
  };

  const selectedRequests = selectedDay ? getRequestsOnDay(selectedDay) : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">All approved leave across the team</p>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday} className="border-gray-200 text-sm">
          Today
        </Button>
      </div>

      {/* Leave type legend */}
      <div className="flex flex-wrap gap-4">
        {['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid'].map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getLeaveTypeCalendarColor(type) }}
            />
            <span className="text-xs text-gray-600">{type}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Month navigation header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <Button variant="ghost" size="sm" onClick={goToPrev} className="w-9 h-9 p-0 rounded-lg">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="font-semibold text-gray-900 text-base">
              {MONTHS[month]} {year}
            </h2>
            <Button variant="ghost" size="sm" onClick={goToNext} className="w-9 h-9 p-0 rounded-lg">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {cells.map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[88px] border-b border-r border-gray-50 bg-gray-50/30"
                  />
                );
              }

              const dayNum = parseInt(dateStr.split('-')[2], 10);
              const dayRequests = getRequestsOnDay(dateStr);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDay;
              const isWeekend = new Date(dateStr).getDay() === 0 || new Date(dateStr).getDay() === 6;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={[
                    'min-h-[88px] border-b border-r border-gray-50 p-1.5 cursor-pointer transition-colors',
                    isSelected ? 'bg-[#0D9488]/5 ring-1 ring-inset ring-[#CCFBF1]' : '',
                    !isSelected && isWeekend ? 'bg-gray-50/60 hover:bg-gray-50' : '',
                    !isSelected && !isWeekend ? 'hover:bg-gray-50/80' : '',
                  ].join(' ')}
                >
                  <div className={[
                    'w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium mb-1 mx-auto',
                    isToday ? 'bg-[#0D9488] text-white font-bold' : '',
                    !isToday && isWeekend ? 'text-gray-300' : '',
                    !isToday && !isWeekend ? 'text-gray-700' : '',
                  ].join(' ')}>
                    {dayNum}
                  </div>
                  <div className="space-y-0.5">
                    {dayRequests.slice(0, 2).map((req) => (
                      <div
                        key={req.id}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white truncate leading-tight"
                        style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }}
                      >
                        {req.profiles?.full_name?.split(' ')[0]}
                      </div>
                    ))}
                    {dayRequests.length > 2 && (
                      <div className="px-1 text-[10px] text-gray-400 font-medium">
                        +{dayRequests.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel: selected day detail + month event list */}
        <div className="space-y-4">
          {/* Selected day detail */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 min-h-[200px]">
            {selectedDay ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">
                      {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-MU', {
                        weekday: 'long', day: 'numeric', month: 'long',
                      })}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedRequests.length === 0
                        ? 'No approved leave'
                        : `${selectedRequests.length} ${selectedRequests.length === 1 ? 'person' : 'people'} on leave`}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDay(null)}
                    className="text-gray-300 hover:text-gray-500 text-xl leading-none w-6 h-6 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>

                {selectedRequests.length === 0 ? (
                  <div className="py-6 text-center">
                    <CalendarDays className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">No approved leave on this day.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedRequests.map((req) => (
                      <div key={req.id} className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div
                          className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                          style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-900 truncate">{req.profiles?.full_name}</p>
                          <p className="text-xs text-gray-500">{req.profiles?.department}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <LeaveTypeBadge value={req.leave_type} />
                            <span className="text-xs text-gray-400">{req.working_days}d</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8">
                <CalendarDays className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-500 text-center">Click any day to see who is on leave.</p>
              </div>
            )}
          </div>

          {/* This month's approved leave events */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">
                Approved Leave — {MONTHS[month]}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{monthEvents.length} event{monthEvents.length !== 1 ? 's' : ''}</p>
            </div>

            {loading ? (
              <div className="p-5 space-y-3 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-100 mt-1.5 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3 w-28 bg-gray-100 rounded" />
                      <div className="h-3 w-40 bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : monthEvents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-gray-400">No approved leave this month.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto scrollbar-thin">
                {monthEvents.map((req) => (
                  <div key={req.id} className="px-5 py-3 flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: getLeaveTypeCalendarColor(req.leave_type) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-xs text-gray-900 truncate">{req.profiles?.full_name}</p>
                        <LeaveTypeBadge value={req.leave_type} className="flex-shrink-0 text-[10px] px-1.5 py-0" />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(req.start_date)} – {formatDate(req.end_date)} · {req.working_days}d
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
