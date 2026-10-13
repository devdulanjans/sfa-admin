import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { workingCalendarApi, targetHolidayApi, settingsApi } from '../../lib/api';
import toast from 'react-hot-toast';

const WEEKDAYS = [
  { code: 'MON', label: 'Monday' },
  { code: 'TUE', label: 'Tuesday' },
  { code: 'WED', label: 'Wednesday' },
  { code: 'THU', label: 'Thursday' },
  { code: 'FRI', label: 'Friday' },
  { code: 'SAT', label: 'Saturday' },
  { code: 'SUN', label: 'Sunday' },
];

function DisabledNotice() {
  return (
    <div className="card p-8 text-center max-w-lg mx-auto mt-8">
      <p className="text-3xl mb-2">📅</p>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Sales Target feature is disabled</h2>
      <p className="text-sm text-gray-500">
        Enable it in <span className="font-medium">Settings → General</span> to configure the working calendar.
      </p>
    </div>
  );
}

function WorkingCalendarPage() {
  const qc = useQueryClient();
  const [selectedDays, setSelectedDays] = useState([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.list().then(r => r.data),
  });
  const enabled = settings?.find(s => s.key === 'sales_target_enabled')?.value === 'true';

  const { data: weekdaysData } = useQuery({
    queryKey: ['working-calendar-weekdays'],
    queryFn: () => workingCalendarApi.getWeekdays().then(r => r.data),
    enabled,
  });

  useEffect(() => {
    if (weekdaysData?.days) setSelectedDays(weekdaysData.days);
  }, [weekdaysData]);

  const thisYear = new Date().getFullYear();
  const { data: holidays, isLoading: holidaysLoading } = useQuery({
    queryKey: ['target-holidays'],
    queryFn: () => targetHolidayApi.list({
      from: `${thisYear}-01-01`,
      to: `${thisYear + 1}-12-31`,
    }).then(r => r.data),
    enabled,
  });

  const saveWeekdaysMutation = useMutation({
    mutationFn: (days) => workingCalendarApi.setWeekdays(days),
    onSuccess: () => { toast.success('Working days updated'); qc.invalidateQueries({ queryKey: ['working-calendar-weekdays'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to update working days'),
  });

  const addHolidayMutation = useMutation({
    mutationFn: (body) => targetHolidayApi.create(body),
    onSuccess: () => {
      toast.success('Holiday added');
      qc.invalidateQueries({ queryKey: ['target-holidays'] });
      setHolidayDate('');
      setHolidayDesc('');
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to add holiday'),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id) => targetHolidayApi.delete(id),
    onSuccess: () => { toast.success('Holiday removed'); qc.invalidateQueries({ queryKey: ['target-holidays'] }); },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to remove holiday'),
  });

  function toggleDay(code) {
    setSelectedDays(prev => prev.includes(code) ? prev.filter(d => d !== code) : [...prev, code]);
  }

  function addHoliday() {
    if (!holidayDate) { toast.error('Pick a date'); return; }
    addHolidayMutation.mutate({ holidayDate, description: holidayDesc || null });
  }

  if (settings && !enabled) {
    return (
      <Layout title="Working Calendar">
        <DisabledNotice />
      </Layout>
    );
  }

  return (
    <Layout title="Working Calendar">
      <div className="space-y-5 max-w-2xl">
        <p className="text-sm text-gray-500">
          Sales targets are spread across a rep's working days each month. Set the weekly pattern and any
          specific holiday dates here — both apply globally to every sales rep.
        </p>

        {/* Weekday pattern */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Working Days of the Week</h2>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-4">
            {WEEKDAYS.map(d => {
              const checked = selectedDays.includes(d.code);
              return (
                <label
                  key={d.code}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 cursor-pointer text-xs font-medium
                    ${checked ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleDay(d.code)} className="rounded border-gray-300 text-brand-600" />
                  {d.label}
                </label>
              );
            })}
          </div>
          <button
            className="btn-primary text-sm"
            disabled={saveWeekdaysMutation.isPending}
            onClick={() => saveWeekdaysMutation.mutate(selectedDays)}
          >
            {saveWeekdaysMutation.isPending ? 'Saving…' : 'Save Working Days'}
          </button>
        </div>

        {/* Holidays */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Holiday Exceptions</h2>
          <div className="flex items-end gap-2 mb-4 flex-wrap">
            <div>
              <label className="label">Date</label>
              <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} className="input" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Description</label>
              <input value={holidayDesc} onChange={e => setHolidayDesc(e.target.value)} placeholder="e.g. Public Holiday" className="input" />
            </div>
            <button className="btn-secondary text-sm" disabled={addHolidayMutation.isPending} onClick={addHoliday}>
              + Add
            </button>
          </div>

          {holidaysLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !holidays?.length ? (
            <p className="text-sm text-gray-400">No holidays configured for this year.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {holidays.map(h => (
                <div key={h.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{h.holidayDate}</span>
                    {h.description && <span className="ml-2 text-xs text-gray-500">{h.description}</span>}
                  </div>
                  <button
                    onClick={() => deleteHolidayMutation.mutate(h.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(WorkingCalendarPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_TARGET_CALENDAR', 'SFA');
