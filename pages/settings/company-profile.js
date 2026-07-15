import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { companyProfileApi } from '../../lib/api';
import toast from 'react-hot-toast';

function SectionCard({ title, description, children }) {
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function CompanyProfilePage() {
  const qc = useQueryClient();
  const fileInputRef = useRef(null);
  const [logoCacheBust, setLogoCacheBust] = useState(0);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => companyProfileApi.get().then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm();

  useEffect(() => {
    if (profile) {
      reset({
        companyName:            profile.companyName,
        phone:                  profile.phone ?? '',
        email:                  profile.email ?? '',
        website:                profile.website ?? '',
        registeredAddress:      profile.registeredAddress ?? '',
        operatingAddress:       profile.operatingAddress ?? '',
        taxId:                  profile.taxId ?? '',
        vatRegistrationNumber:  profile.vatRegistrationNumber ?? '',
        vatRatePct:             profile.vatRatePct ?? '0',
        bankName:               profile.bankName ?? '',
        bankAccountName:        profile.bankAccountName ?? '',
        bankAccountNumber:      profile.bankAccountNumber ?? '',
        bankBranch:             profile.bankBranch ?? '',
        bankSwiftCode:          profile.bankSwiftCode ?? '',
      });
    }
  }, [profile, reset]);

  const saveMutation = useMutation({
    mutationFn: (body) => companyProfileApi.update(body),
    onSuccess: () => {
      toast.success('Company profile saved');
      qc.invalidateQueries({ queryKey: ['company-profile'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save company profile'),
  });

  const logoMutation = useMutation({
    mutationFn: (file) => companyProfileApi.uploadLogo(file),
    onSuccess: () => {
      toast.success('Logo uploaded');
      setLogoCacheBust(v => v + 1);
      qc.invalidateQueries({ queryKey: ['company-profile'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to upload logo'),
  });

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Logo must be an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be 2MB or smaller'); return; }
    logoMutation.mutate(file);
  }

  if (isLoading) {
    return (
      <Layout title="Company Profile">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  return (
    <Layout title="Company Profile">
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="max-w-3xl space-y-6">
        <SectionCard title="Logo" description="Shown on invoice PDFs and POS receipts.">
          <div className="flex items-center gap-4">
            {profile?.logoUrl ? (
              <img
                src={`${profile.logoUrl}?v=${logoCacheBust}`}
                alt="Company logo"
                className="h-16 w-16 rounded-lg border border-gray-200 object-contain p-1"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">
                No logo
              </div>
            )}
            <div>
              <input
                ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={handleLogoChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoMutation.isPending}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                {logoMutation.isPending ? 'Uploading…' : profile?.logoUrl ? 'Replace Logo' : 'Upload Logo'}
              </button>
              <p className="mt-1 text-xs text-gray-400">PNG or JPG, up to 2MB.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Company Info">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Company Name *</label>
              <input {...register('companyName', { required: true })} className="input" />
              {errors.companyName && <p className="text-red-500 text-xs mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register('phone')} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" {...register('email')} className="input" />
            </div>
            <div>
              <label className="label">Website</label>
              <input {...register('website')} className="input" placeholder="https://…" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Addresses">
          <div>
            <label className="label">Registered Address</label>
            <textarea {...register('registeredAddress')} rows={2} className="input resize-none" />
          </div>
          <div>
            <label className="label">Operating Address</label>
            <textarea {...register('operatingAddress')} rows={2} className="input resize-none" />
          </div>
        </SectionCard>

        <SectionCard title="Tax / VAT">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Tax ID (TIN)</label>
              <input {...register('taxId')} className="input" />
            </div>
            <div>
              <label className="label">VAT Registration No.</label>
              <input {...register('vatRegistrationNumber')} className="input" />
            </div>
            <div>
              <label className="label">VAT Rate %</label>
              <input type="number" step="0.01" min="0" max="100" {...register('vatRatePct')} className="input" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Bank Details" description="Shown on invoice PDFs for payment instructions.">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Bank Name</label>
              <input {...register('bankName')} className="input" />
            </div>
            <div>
              <label className="label">Account Name</label>
              <input {...register('bankAccountName')} className="input" />
            </div>
            <div>
              <label className="label">Account Number</label>
              <input {...register('bankAccountNumber')} className="input" />
            </div>
            <div>
              <label className="label">Branch</label>
              <input {...register('bankBranch')} className="input" />
            </div>
            <div>
              <label className="label">SWIFT Code</label>
              <input {...register('bankSwiftCode')} className="input" />
            </div>
          </div>
        </SectionCard>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={saveMutation.isPending || !isDirty}>
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

export default withAuth(CompanyProfilePage, [], 'MOD_SETTINGS_COMPANY_PROFILE');
