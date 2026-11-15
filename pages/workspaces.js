import { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { withAuth, useAuth, ADMIN_APP_ROLES, roleLabel } from '../lib/auth';
import { meApi } from '../lib/api';

// Where a role is used when it isn't an admin-panel role.
const ELSEWHERE = {
  SALES_REP: 'Use the AVLIS sales rep mobile app',
  CUSTOMER: 'Use the AVLIS customer app or website',
};

// One account, many roles: invitations waiting for this person, and every workspace (role in
// a business) they hold. Admin-panel roles open here; others say which app they belong to.
function WorkspacesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, switchMembership, reloadSession, logout } = useAuth();
  const [busy, setBusy] = useState(null);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => meApi.invitations().then((r) => r.data),
  });

  async function respond(inv, accept) {
    setBusy(inv.id);
    try {
      await (accept ? meApi.accept(inv.id) : meApi.decline(inv.id));
      toast.success(accept ? `You're now ${roleLabel(inv.role).toLowerCase()} at ${inv.tenantName}` : 'Invitation declined');
      await reloadSession();
      qc.invalidateQueries({ queryKey: ['my-invitations'] });
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  async function open(m) {
    setBusy(m.id);
    try {
      await switchMembership(m.id);
      toast.success(`Working as ${roleLabel(m.role).toLowerCase()} at ${m.tenantName}`);
      router.push('/');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Could not open that workspace');
      setBusy(null);
    }
  }

  const workspaces = user?.memberships || [];

  return (
    <Layout title="Workspaces">
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="text-sm text-gray-600">
          One account can hold different roles in different businesses — owner of one, sales rep for another,
          customer of a third. Choose where you want to work.
        </p>

        {(isLoading || invitations.length > 0) && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">Invitations</h2>
            {isLoading ? (
              <p className="mt-2 text-sm text-amber-800">Loading…</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-amber-100">
                    <div>
                      <p className="font-medium text-gray-900">{inv.tenantName}</p>
                      <p className="text-xs text-gray-500">
                        Invited you as <strong>{roleLabel(inv.role)}</strong>
                        {inv.customerName ? ` for ${inv.customerName}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy === inv.id} onClick={() => respond(inv, true)}
                        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                        Accept
                      </button>
                      <button type="button" disabled={busy === inv.id} onClick={() => respond(inv, false)}
                        className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900">Your workspaces</h2>
          {workspaces.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">
              You don&apos;t have a role in any business yet. When a business invites you, the invitation appears above.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-gray-100">
              {workspaces.map((m) => {
                const here = m.id === user.activeMembershipId;
                const adminRole = ADMIN_APP_ROLES.includes(m.role);
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{m.tenantName}</p>
                      <p className="text-xs text-gray-500">
                        {roleLabel(m.role)}{m.customerName ? ` · ${m.customerName}` : ''}
                      </p>
                    </div>
                    {here ? (
                      <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800">Current</span>
                    ) : adminRole ? (
                      <button type="button" disabled={busy === m.id} onClick={() => open(m)}
                        className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                        {busy === m.id ? 'Opening…' : 'Open'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">{ELSEWHERE[m.role] || 'Not used in the admin panel'}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!user.activeTenant && (
          <p className="text-center text-xs text-gray-500">
            <button type="button" onClick={logout} className="underline">Sign out</button>
          </p>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(WorkspacesPage);
