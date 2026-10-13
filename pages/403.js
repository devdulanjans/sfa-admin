import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

export default function AccessDenied() {
  const router = useRouter();
  const { user, logout } = useAuth();

  // withAuth redirects here via router.replace(), which overwrites the current history
  // entry instead of pushing a new one — so router.back() from this page can land on
  // whatever was open before login (or nowhere at all) rather than a real previous page.
  // Only offer it when there's actual history to go back to.
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.74-2.97L13.74 4a2 2 0 00-3.48 0L3.26 16.03A2 2 0 005.07 19z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-1">
          You do not have permission to view this page.
        </p>
        {user && (
          <p className="text-sm text-gray-400 mb-6">
            Logged in as <span className="font-medium text-gray-600">{user.fullName || user.username}</span>
            {' '}({user.role})
          </p>
        )}
        <p className="text-sm text-gray-500 mb-8">
          If you believe this is an error, please contact your system administrator to have the
          necessary permissions granted to your account.
        </p>

        <div className="flex gap-3 justify-center flex-wrap">
          {canGoBack && (
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go Back
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-brand-600 rounded-lg text-sm font-medium text-white hover:bg-brand-700"
          >
            Home
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
