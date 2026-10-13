import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../lib/api';

// Shown on the route pages while the global "Apply Sales Routes" setting is off — routes can
// still be built and assigned ahead of time, but reps aren't restricted by them yet.
export default function RoutesDisabledNotice() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.list().then(r => r.data),
    staleTime: 60_000,
  });
  const setting = (settings || []).find(s => s.key === 'sales_routes_enabled');
  if (!settings || setting?.value === 'true') return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-semibold">Sales routes are switched off.</span>{' '}
      You can create and assign routes now, but sales reps won&apos;t be limited to them until{' '}
      <span className="font-medium">Apply Sales Routes to Sales Reps</span> is turned on in{' '}
      <Link href="/settings/general" className="font-medium underline hover:text-amber-900">
        General Settings
      </Link>.
    </div>
  );
}
