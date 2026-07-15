import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

// Ordered list of module codes → their landing URLs.
// The first one the user has access to is where they land after login.
const MODULE_ROUTES = [
  { key: 'MOD_DASHBOARD',    url: '/dashboard'   },
  { key: 'MOD_ORDERS',       url: '/orders'       },
  { key: 'MOD_CUSTOMERS',    url: '/customers'    },
  { key: 'MOD_INVOICES',     url: '/invoices'     },
  { key: 'MOD_POS_TERMINAL', url: '/pos'          },
  { key: 'MOD_PRODUCTS',     url: '/products'     },
  { key: 'MOD_BATCH_PRICE',  url: '/pricing'      },
  { key: 'MOD_PROMOTIONS',   url: '/pricing/promotions' },
  { key: 'MOD_RETURNS',      url: '/returns'      },
  { key: 'MOD_DAMAGES',      url: '/damages'      },
  { key: 'MOD_INV_STOCK',    url: '/inventory'    },
  { key: 'MOD_RPT_SALES',    url: '/reports/sales'},
  { key: 'MOD_USER_LIST',    url: '/users'        },
  { key: 'MOD_DISTRIBUTORS', url: '/distributors' },
  { key: 'MOD_SETTINGS_GENERAL', url: '/settings/general' },
];

export default function IndexPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role === 'PLATFORM_OWNER') { router.replace('/platform/license'); return; }

    const perms = user.permissions || [];
    const isWildcard = perms.includes('*');

    if (isWildcard) { router.replace('/dashboard'); return; }

    const first = MODULE_ROUTES.find(m => perms.includes(m.key));
    router.replace(first ? first.url : '/no-access');
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
