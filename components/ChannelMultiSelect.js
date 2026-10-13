// "Available in channels" picker for channel-owned records (customers, products,
// promotions, batch prices) that may be shared across several channels at once.
// `value` is an array of tenant ids; `homeId` (optional) gets a small "(home)" tag.
export default function ChannelMultiSelect({
  tenants = [],
  value = [],
  onChange,
  homeId,
  isLoading = false,
  label = 'Available in channels',
  required = true,
  showError = false,
  hint = 'Orders are still placed in one channel at a time.',
}) {
  const selected = value ?? [];
  const allSelected = tenants.length > 0 && tenants.every(t => selected.includes(t.id));

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  return (
    <div>
      <label className="label">{label}{required ? ' *' : ''}</label>
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading channels…</p>
      ) : (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : tenants.map(t => t.id))}
            />
            All channels
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 border-t border-gray-100 pt-2">
            {tenants.map(t => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
                <span>{t.name}</span>
                {homeId && t.id === homeId && <span className="text-xs text-gray-400">(home)</span>}
              </label>
            ))}
          </div>
        </div>
      )}
      {showError && selected.length === 0 && (
        <p className="text-red-500 text-xs mt-1">Select at least one channel.</p>
      )}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// Home channel to send alongside `tenantIds`: keep the old home if still selected,
// otherwise the first selected channel.
export function resolveHomeChannel(tenantIds, currentHome) {
  if (!tenantIds || tenantIds.length === 0) return currentHome || undefined;
  return currentHome && tenantIds.includes(currentHome) ? currentHome : tenantIds[0];
}

// Default selection on create: the session's active channel if it's one of the options,
// otherwise the first accessible channel.
export function defaultChannelIds(tenants = [], activeTenantId) {
  if (activeTenantId && tenants.some(t => t.id === activeTenantId)) return [activeTenantId];
  return tenants.length > 0 ? [tenants[0].id] : [];
}

// Initial selection when editing a record: its channelIds, falling back to its home channel.
export function recordChannelIds(record) {
  if (record?.channelIds?.length) return record.channelIds;
  return record?.tenantId ? [record.tenantId] : [];
}

// Small chips listing the channels a record is available in (list-page "Channel" column).
// Ids the viewer can't resolve to a name (channels they don't belong to) collapse into "+N".
export function ChannelChips({ row, tenants = [] }) {
  const byId = Object.fromEntries(tenants.map(t => [t.id, t.name]));
  const ids = row?.channelIds?.length ? row.channelIds : (row?.tenantId ? [row.tenantId] : []);
  const names = [];
  let unknown = 0;
  ids.forEach(id => {
    const n = byId[id] ?? (id === row?.tenantId ? row?.tenantName : null);
    if (n) names.push(n); else unknown++;
  });
  if (names.length === 0 && !unknown) {
    return row?.tenantName
      ? <span className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{row.tenantName}</span>
      : <span className="text-gray-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((n, i) => (
        <span key={i} className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded whitespace-nowrap">{n}</span>
      ))}
      {unknown > 0 && (
        <span className="text-xs font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded whitespace-nowrap"
              title="Channels you don't manage">+{unknown}</span>
      )}
    </div>
  );
}
