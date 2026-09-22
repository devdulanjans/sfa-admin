import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth';
import { tenantApi } from './api';

/**
 * The channels an actor may pick from when creating something channel-owned
 * (a user, product, customer, ...). SUPER_ADMIN sees every channel on the
 * platform; anyone else only ever sees their own memberships — GET /api/tenants
 * is Super-Admin-only, so a non-Super-Admin actor must go through /api/tenants/my
 * instead, which works for any authenticated user.
 *
 * `needsPicker` is true only once there's more than one option — a single-channel
 * actor never needs to be asked, the same channel is implied either way.
 */
export function useAccessibleTenants({ enabled = true } = {}) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const multiTenantEnabled = user?.multiTenantEnabled ?? true;

  const { data, isLoading } = useQuery({
    queryKey: ['accessible-tenants', isSuperAdmin],
    queryFn: () => isSuperAdmin
      ? tenantApi.list({ size: 100 }).then(r => r.data.content ?? [])
      : tenantApi.my().then(r => r.data ?? []),
    enabled: enabled && !!user && multiTenantEnabled,
  });

  const tenants = (data || []).filter(t => t.status === 'ACTIVE');
  return { tenants, isLoading, needsPicker: tenants.length > 1 };
}
