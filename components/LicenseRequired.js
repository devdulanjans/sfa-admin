import { useRouter } from 'next/router';

const PACKAGE_LABEL = { SFA: 'SFA', POS: 'POS' };

export default function LicenseRequired({ licensePackage }) {
  const router = useRouter();
  const label = PACKAGE_LABEL[licensePackage] || licensePackage;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Not Included in Your License</h1>
        <p className="text-gray-500 mb-6">
          The <span className="font-medium text-gray-700">{label}</span> package is not enabled for this
          installation.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Contact your system provider to upgrade your license if you need access to this feature.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go Back
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
