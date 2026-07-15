import { useAuth } from '../lib/auth';

export default function NoAccessPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">No Access</h1>

        {user && (
          <p className="text-sm text-gray-500 mb-1">
            Signed in as <span className="font-medium text-gray-700">{user.fullName || user.username}</span>
          </p>
        )}

        <p className="text-gray-500 text-sm mt-4 mb-8 leading-relaxed">
          Your account has no modules assigned yet. Please contact your administrator
          to grant the necessary permissions to your account.
        </p>

        <button
          onClick={logout}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
