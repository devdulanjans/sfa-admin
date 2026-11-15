const STATUS_MAP = {
  // Order statuses
  DRAFT:     'badge-gray',
  SUBMITTED: 'badge-blue',
  APPROVED:  'badge-cyan',
  PARTIALLY_INVOICED: 'badge-amber',
  INVOICED:  'badge-green',
  OVERDUE:   'badge-red',
  CANCELLED: 'badge-red',
  // Invoice statuses
  ISSUED:    'badge-blue',
  PAID:      'badge-green',
  // Credit statuses
  UNPAID:         'badge-red',
  PARTIALLY_PAID: 'badge-amber',
  NOT_APPLICABLE: 'badge-gray',
  // Return statuses
  PENDING:   'badge-amber',
  PROCESSED: 'badge-green',
  REJECTED:  'badge-red',
  // Lead statuses
  CONVERTED: 'badge-green',
  // User statuses
  ACTIVE:    'badge-green',
  INACTIVE:  'badge-gray',
  SUSPENDED: 'badge-red',
  // Drawer session statuses
  OPEN:      'badge-blue',
  CLOSED:    'badge-gray',
};

/** An invoice's status, shown as OVERDUE when it's unpaid past its due date. */
export function InvoiceStatus({ inv }) {
  if (inv.status !== 'CANCELLED' && inv.status !== 'PAID' && inv.overdue) {
    return <span className="badge-red">OVERDUE</span>;
  }
  return <StatusBadge status={inv.status} />;
}

export default function StatusBadge({ status }) {
  const cls = STATUS_MAP[status] || 'badge-gray';
  return <span className={cls}>{status?.replaceAll('_', ' ')}</span>;
}
