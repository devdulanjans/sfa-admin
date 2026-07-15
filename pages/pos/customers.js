import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Layout from '../../components/Layout';
import DataTable from '../../components/DataTable';
import { withAuth } from '../../lib/auth';
import { customerApi } from '../../lib/api';
import { formatAmount } from '../../lib/format';

const COLUMNS = [
  { key: 'customerCode', label: 'Customer Code' },
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone', render: (v) => v ?? <span className="text-gray-400">—</span> },
  { key: 'createdAt', label: 'Created', render: (v) => v ? new Date(v).toLocaleString() : '—' },
  {
    key: 'currentBalance', label: 'Balance',
    render: (v) => <span className={Number(v) > 0 ? 'font-semibold text-red-600' : ''}>LKR {formatAmount(v)}</span>,
  },
];

function PosCustomersPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pos-customers-list', page, search],
    queryFn: () => customerApi.listPos({ page, size: 20, search: search || undefined }).then(r => r.data),
    keepPreviousData: true,
  });

  const columns = [
    ...COLUMNS,
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <Link href={`/customers/${row.id}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          View
        </Link>
      ),
    },
  ];

  return (
    <Layout title="POS Customers">
      <DataTable
        columns={columns}
        data={data?.content || []}
        loading={isLoading}
        totalPages={data?.totalPages || 1}
        currentPage={page}
        onPageChange={setPage}
        onSearch={(v) => { setSearch(v); setPage(0); }}
        emptyMessage="No customers have been added from POS yet"
      />
    </Layout>
  );
}

export default withAuth(PosCustomersPage, ['SUPER_ADMIN', 'SALES_MANAGER'], 'MOD_POS_CUSTOMERS', 'POS');
