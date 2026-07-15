import clsx from 'clsx';

export default function StatCard({ label, value, sub, icon, color = 'blue', trend }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red:   'bg-red-50 text-red-600',
    purple:'bg-purple-50 text-purple-600',
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
          {trend !== undefined && (
            <p className={clsx('text-xs font-medium mt-1', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>
        {icon && (
          <div className={clsx('rounded-xl p-3 text-xl flex-shrink-0', colors[color])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
