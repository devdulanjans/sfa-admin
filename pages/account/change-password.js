import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth, useAuth } from '../../lib/auth';
import { authApi } from '../../lib/api';
import toast from 'react-hot-toast';

function ChangePasswordPage() {
  const { user, refreshPermissions, logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const newPassword = watch('newPassword');

  async function onSubmit(data) {
    setSubmitting(true);
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed');
      reset();
      // Picks up mustChangePassword: false from the server via a token refresh — otherwise
      // the forced-change gate in withAuth would keep bouncing back here after a reset.
      await refreshPermissions();
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout title="Change Password">
      <div className="max-w-md">
        {user?.mustChangePassword && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your password was reset by an administrator. Please set a new password to continue.
          </div>
        )}

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                {...register('currentPassword', { required: true })}
                className="input"
                autoComplete="current-password"
              />
              {errors.currentPassword && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>

            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                {...register('newPassword', { required: true, minLength: 8 })}
                className="input"
                autoComplete="new-password"
              />
              {errors.newPassword && <p className="text-red-500 text-xs mt-1">At least 8 characters</p>}
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                {...register('confirmPassword', {
                  required: true,
                  validate: (v) => v === newPassword || 'Passwords do not match',
                })}
                className="input"
                autoComplete="new-password"
              />
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Change Password'}
            </button>
          </form>
        </div>

        {user?.mustChangePassword && (
          <button
            onClick={logout}
            className="mt-4 text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Not you? Log out
          </button>
        )}
      </div>
    </Layout>
  );
}

// Empty roles + no permission key — every authenticated account, of any role, must be
// able to reach its own password change, independent of whatever module permissions
// it's been granted.
export default withAuth(ChangePasswordPage, [], null);
