const STATUS_MAP = {
  // Order statuses
  DRAFT:     'badge-gray',
  SUBMITTED: 'badge-blue',
  APPROVED:  'badge-cyan',
  INVOICED:  'badge-green',
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
  // User statuses
  ACTIVE:    'badge-green',
  INACTIVE:  'badge-gray',
  SUSPENDED: 'badge-red',
  // Drawer session statuses
  OPEN:      'badge-blue',
  CLOSED:    'badge-gray',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_MAP[status] || 'badge-gray';
  return <span className={cls}>{status?.replace('_', ' ')}</span>;
}
