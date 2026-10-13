import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { notificationSettingsApi } from '../../lib/api';
import toast from 'react-hot-toast';

const WHATSAPP_TEMPLATE_BODY = `Hello {{1}}, thank you for your business with {{2}}.
Your {{3}} {{4}} dated {{5}} has been created.
Items: {{6}}
Total: {{7}}`;

function SectionCard({ title, description, children, right }) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        checked ? 'bg-brand-600' : 'bg-gray-200',
      ].join(' ')}
    >
      <span className={[
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200',
        checked ? 'translate-x-5' : 'translate-x-0',
      ].join(' ')} />
    </button>
  );
}

function TestSend({ channel, placeholder, disabled }) {
  const [to, setTo] = useState('');
  const mutation = useMutation({
    mutationFn: () => notificationSettingsApi.test({ channel, to }).then(r => r.data),
    onSuccess: (r) => r.sent ? toast.success(`Test sent to ${r.recipient}`) : toast.error(r.message, { duration: 8000 }),
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Test failed'),
  });
  return (
    <div className="flex gap-2 items-end border-t border-gray-100 pt-4">
      <div className="flex-1">
        <label className="label">Send a test (uses the saved settings)</label>
        <input className="input" placeholder={placeholder} value={to} onChange={e => setTo(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn-secondary disabled:opacity-50"
        disabled={disabled || !to.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Sending…' : 'Send Test'}
      </button>
    </div>
  );
}

function NotificationSettingsPage() {
  const qc = useQueryClient();

  const { data: settings, isLoading, isError, error } = useQuery({
    queryKey: ['notification-settings'],
    queryFn:  () => notificationSettingsApi.get().then(r => r.data),
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { isDirty } } = useForm();

  useEffect(() => {
    if (!settings) return;
    reset({
      emailEnabled:             settings.emailEnabled,
      smtpHost:                 settings.smtpHost ?? '',
      smtpPort:                 settings.smtpPort ?? '',
      smtpUsername:             settings.smtpUsername ?? '',
      smtpPassword:             '',
      clearSmtpPassword:        false,
      smtpSecurity:             settings.smtpSecurity ?? 'STARTTLS',
      fromEmail:                settings.fromEmail ?? '',
      fromName:                 settings.fromName ?? '',
      whatsappEnabled:          settings.whatsappEnabled,
      whatsappPhoneNumberId:    settings.whatsappPhoneNumberId ?? '',
      whatsappAccessToken:      '',
      clearWhatsappAccessToken: false,
      whatsappTemplateName:     settings.whatsappTemplateName ?? '',
      whatsappTemplateLanguage: settings.whatsappTemplateLanguage ?? '',
    });
  }, [settings, reset]);

  const saveMutation = useMutation({
    mutationFn: (d) => notificationSettingsApi.update({
      ...d,
      smtpPort: d.smtpPort === '' || d.smtpPort == null ? null : Number(d.smtpPort),
    }),
    onSuccess: () => {
      toast.success('Notification settings saved');
      qc.invalidateQueries({ queryKey: ['notification-settings'] });
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save notification settings', { duration: 6000 }),
  });

  if (isLoading) {
    return <Layout title="Notifications"><div className="card p-8 animate-pulse h-64" /></Layout>;
  }
  if (isError) {
    return (
      <Layout title="Notifications">
        <div className="card p-8 text-sm text-red-500">
          {error?.response?.data?.detail ?? error?.message ?? 'Failed to load notification settings'}
        </div>
      </Layout>
    );
  }

  const emailEnabled    = watch('emailEnabled');
  const whatsappEnabled = watch('whatsappEnabled');
  const ownSmtp         = !!watch('smtpHost')?.trim();
  const ownWhatsapp     = !!watch('whatsappPhoneNumberId')?.trim();
  const security        = watch('smtpSecurity');

  return (
    <Layout title="Notifications">
      <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="max-w-3xl space-y-6">
        <p className="text-sm text-gray-500">
          Settings for the <b>currently selected channel</b>. When a switch is on, the customer receives the order
          details when an order is submitted and the invoice details when an invoice is created. The customer&apos;s
          Email and WhatsApp Number come from the customer record.
        </p>

        {/* ── Email ───────────────────────────────────────────── */}
        <SectionCard
          title="Email"
          description="Send order / invoice details from this channel's own mailbox."
          right={<Switch label="Email notifications" checked={!!emailEnabled}
                   onChange={v => setValue('emailEnabled', v, { shouldDirty: true })} />}
        >
          {!ownSmtp && (
            <p className={`text-xs rounded-md px-3 py-2 ${settings.serverEmailAvailable ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {settings.serverEmailAvailable
                ? `No SMTP server entered — the server default mailbox (${settings.serverFromEmail}) will be used.`
                : 'Enter this channel\'s SMTP server below — there is no server default mailbox.'}
            </p>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="label">SMTP Host</label>
              <input {...register('smtpHost')} className="input" placeholder="e.g. smtp.gmail.com" />
            </div>
            <div>
              <label className="label">Port</label>
              <input type="number" {...register('smtpPort')} className="input"
                     placeholder={security === 'SSL' ? '465' : '587'} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Security</label>
              <select {...register('smtpSecurity')} className="input">
                <option value="STARTTLS">STARTTLS (port 587)</option>
                <option value="SSL">SSL/TLS (port 465)</option>
                <option value="NONE">None</option>
              </select>
            </div>
            <div>
              <label className="label">Username</label>
              <input {...register('smtpUsername')} className="input" autoComplete="off" placeholder="e.g. sales@company.lk" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" {...register('smtpPassword')} className="input" autoComplete="new-password"
                     placeholder={settings.smtpPasswordSet ? '•••••••• (saved)' : ''} />
              {settings.smtpPasswordSet && (
                <label className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  <input type="checkbox" {...register('clearSmtpPassword')} /> Remove saved password
                </label>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From Email</label>
              <input type="email" {...register('fromEmail')} className="input" placeholder="Defaults to the username" disabled={!ownSmtp} />
            </div>
            <div>
              <label className="label">From Name</label>
              <input {...register('fromName')} className="input" placeholder="Defaults to the company name" />
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Gmail / Google Workspace: use smtp.gmail.com, STARTTLS, port 587 and an App Password (not your normal password).
            Customer replies go to the email in Company Profile.
          </p>
          <TestSend channel="EMAIL" placeholder="you@example.com" disabled={isDirty} />
        </SectionCard>

        {/* ── WhatsApp ────────────────────────────────────────── */}
        <SectionCard
          title="WhatsApp"
          description="Send order / invoice details from this channel's WhatsApp Business number (Meta WhatsApp Cloud API)."
          right={<Switch label="WhatsApp notifications" checked={!!whatsappEnabled}
                   onChange={v => setValue('whatsappEnabled', v, { shouldDirty: true })} />}
        >
          {!ownWhatsapp && (
            <p className={`text-xs rounded-md px-3 py-2 ${settings.serverWhatsappAvailable ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {settings.serverWhatsappAvailable
                ? 'No phone number ID entered — the server default WhatsApp number will be used.'
                : 'Enter this channel\'s WhatsApp phone number ID and access token below — there is no server default WhatsApp number.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone Number ID</label>
              <input {...register('whatsappPhoneNumberId')} className="input" placeholder="From Meta → WhatsApp → API Setup" />
            </div>
            <div>
              <label className="label">Access Token</label>
              <input type="password" {...register('whatsappAccessToken')} className="input" autoComplete="new-password"
                     placeholder={settings.whatsappAccessTokenSet ? '•••••••• (saved)' : 'Permanent system-user token'} />
              {settings.whatsappAccessTokenSet && (
                <label className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                  <input type="checkbox" {...register('clearWhatsappAccessToken')} /> Remove saved token
                </label>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Template Name</label>
              <input {...register('whatsappTemplateName')} className="input" placeholder="sales_document_summary" />
            </div>
            <div>
              <label className="label">Template Language</label>
              <input {...register('whatsappTemplateLanguage')} className="input" placeholder="en" />
            </div>
          </div>
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">Required message template (create it in WhatsApp Manager, category Utility)</summary>
            <pre className="mt-2 bg-gray-50 rounded-md p-3 whitespace-pre-wrap text-gray-700">{WHATSAPP_TEMPLATE_BODY}</pre>
            <p className="mt-1">
              {'{{1}}'} customer name, {'{{2}}'} company name, {'{{3}}'} order / invoice, {'{{4}}'} number,
              {' {{5}}'} date, {'{{6}}'} items, {'{{7}}'} total. Messages fail until Meta approves the template.
            </p>
          </details>
          <TestSend channel="WHATSAPP" placeholder="e.g. 0771234567" disabled={isDirty} />
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          {isDirty && <span className="text-xs text-gray-400">Save before sending a test.</span>}
          <button type="submit" className="btn-primary" disabled={!isDirty || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Layout>
  );
}

export default withAuth(NotificationSettingsPage, [], 'MOD_SETTINGS_NOTIFICATIONS');
