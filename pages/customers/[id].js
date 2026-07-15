import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import StatusBadge from '../../components/StatusBadge';
import RecordCreditPaymentModal from '../../components/RecordCreditPaymentModal';
import { withAuth, useAuth } from '../../lib/auth';
import { customerApi, productApi, userApi, posApi } from '../../lib/api';
import toast from 'react-hot-toast';
import { formatAmount } from '../../lib/format';

function CustomerDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const qc = useQueryClient();
  const isNew = id === 'new';
  const { user } = useAuth();

  const [showPicker, setShowPicker]       = useState(false);
  const [selectedIds, setSelectedIds]     = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [payBill, setPayBill]             = useState(null);

  // Portal credentials state — shown on both new & existing customers
  const [portalOpen, setPortalOpen]       = useState(isNew); // open by default on create
  const [creds, setCreds]                 = useState({ username: '', email: '', password: '', confirm: '' });
  const [resetMode, setResetMode]         = useState(false);
  const [newPassword, setNewPassword]     = useState('');
  const [portalSaving, setPortalSaving]   = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerApi.getById(id).then(r => r.data),
    enabled: !!id && !isNew,
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ size: 1000 }).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d.content ?? []);
    }),
  });

  const { data: assignedProducts } = useQuery({
    queryKey: ['customer-products', id],
    queryFn: () => customerApi.getProducts(id).then(r => r.data),
    enabled: !!id && !isNew,
  });

  const { data: creditBillsData } = useQuery({
    queryKey: ['customer-credit-bills', id],
    queryFn: () => posApi.listCreditBills({ customerId: id, size: 50 }).then(r => r.data),
    enabled: !!id && !isNew,
  });
  const creditBills = creditBillsData?.content ?? [];

  const { data: creditPaymentsData } = useQuery({
    queryKey: ['customer-credit-payments', id],
    queryFn: () => customerApi.getCreditPayments(id, { size: 10 }).then(r => r.data),
    enabled: !!id && !isNew,
  });
  const creditPayments = creditPaymentsData?.content ?? [];

  const { data: returnsData } = useQuery({
    queryKey: ['customer-returns', id],
    queryFn: () => customerApi.getReturns(id, { size: 10 }).then(r => r.data),
    enabled: !!id && !isNew,
  });
  const returns = returnsData?.content ?? [];

  const { data: damagesData } = useQuery({
    queryKey: ['customer-damages', id],
    queryFn: () => customerApi.getDamages(id, { size: 10 }).then(r => r.data),
    enabled: !!id && !isNew,
  });
  const damages = damagesData?.content ?? [];

  const payMutation = useMutation({
    mutationFn: ({ saleId, body }) => posApi.recordSalePayment(saleId, body),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['customer-credit-bills', id] });
      qc.invalidateQueries({ queryKey: ['customer-credit-payments', id] });
      qc.invalidateQueries({ queryKey: ['customer', id] });
      setPayBill(null);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? err.response?.data?.message ?? 'Failed to record payment'),
  });

  // Fetch existing portal user for this customer
  const { data: portalUser, refetch: refetchPortalUser } = useQuery({
    queryKey: ['customer-portal-user', id],
    queryFn: () => userApi.findByCustomer(id).then(r => r.data).catch(() => null),
    enabled: !!id && !isNew,
    retry: false,
  });

  // Fetch roles to find the CUSTOMER role ID
  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => userApi.roles().then(r => r.data),
  });
  const customerRole = roles.find(r => r.name === 'CUSTOMER');

  const { register, handleSubmit, reset, watch, control, formState: { errors, isDirty } } = useForm({
    defaultValues: { visibilityRule: 'ALL', taxRate: 18, addresses: [{ label: '', addressLine: '' }] },
  });

  const { fields: addressFields, append: appendAddress, remove: removeAddress } = useFieldArray({
    control,
    name: 'addresses',
    keyName: 'fieldKey',
  });

  const [watchedCode, watchedName, watchedEmail, visibilityRule] =
    watch(['customerCode', 'name', 'email', 'visibilityRule']);

  useEffect(() => {
    if (customer) {
      const data = { ...customer };
      if (!data.addresses || data.addresses.length === 0) {
        data.addresses = [{ label: '', addressLine: '' }];
      }
      reset(data);
    }
  }, [customer, reset]);

  useEffect(() => {
    if (assignedProducts) setSelectedIds(assignedProducts.map(p => p.id));
  }, [assignedProducts]);

  // Derive the "source of truth" for customer fields (form values for new, fetched data for existing)
  const effectiveCode  = isNew ? watchedCode  : customer?.customerCode;
  const effectiveName  = isNew ? watchedName  : customer?.name;
  const effectiveEmail = isNew ? watchedEmail : customer?.email;

  function buildSuggestedUsername(code, name) {
    const base = code?.trim()
      ? code.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
      : (name ?? '').trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '_');
    return base || 'customer';
  }

  function generatePassword() {
    const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower  = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const syms   = '@#$!';
    const all    = upper + lower + digits + syms;
    const rand   = (str) => str[Math.floor(Math.random() * str.length)];
    // Guarantee at least one of each class, then pad to 12
    const core = rand(upper) + rand(lower) + rand(digits) + rand(syms);
    const rest = Array.from({ length: 8 }, () => rand(all)).join('');
    return (core + rest).split('').sort(() => Math.random() - 0.5).join('');
  }

  // Auto-fill credentials when the portal section opens or when customer data arrives
  useEffect(() => {
    if (!portalOpen || portalUser) return;
    const suggested = buildSuggestedUsername(effectiveCode, effectiveName);
    const pwd = generatePassword();
    setCreds(prev => ({
      username: prev.username || suggested,
      email:    prev.email    || effectiveEmail || '',
      password: prev.password || pwd,
      confirm:  prev.confirm  || pwd,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalOpen, effectiveCode, effectiveName, effectiveEmail]);

  const mutation = useMutation({
    mutationFn: async (body) => {
      const res = isNew
        ? await customerApi.create(body)
        : await customerApi.update(id, body);

      if (body.visibilityRule === 'ASSIGNED') {
        await customerApi.setProducts(res.data.id, selectedIds);
      }
      return res;
    },
    onSuccess: async (res) => {
      const savedId = res.data.id;

      // If credentials were filled in, create the portal account now that we have the customer ID
      if (isNew && creds.username.trim() && creds.password.length >= 8 && creds.password === creds.confirm && customerRole) {
        try {
          await userApi.create({
            username:      creds.username.trim(),
            email:         creds.email.trim() || res.data.email || '',
            fullName:      res.data.name,
            password:      creds.password,
            roleId:        customerRole.id,
            customerId:    savedId,
            distributorIds: [],
            customerIds:    [],
          });
          toast.success('Customer created with portal account');
        } catch (err) {
          toast.success('Customer created');
          toast.error('Portal account failed: ' + (err.response?.data?.message ?? err.response?.data?.detail ?? 'unknown error'));
        }
      } else {
        toast.success(isNew ? 'Customer created' : 'Customer updated');
      }

      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-products', id] });
      if (isNew) router.push(`/customers/${savedId}`);
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Save failed'),
  });

  // Create portal account (only called on existing customers; new customers handled in onSuccess)
  async function handleCreatePortal() {
    if (!creds.username.trim()) { toast.error('Username is required'); return; }
    if (!creds.email.trim())    { toast.error('Email is required');    return; }
    if (creds.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (creds.password !== creds.confirm) { toast.error('Passwords do not match'); return; }
    if (!customerRole) { toast.error('CUSTOMER role not found in system'); return; }

    setPortalSaving(true);
    try {
      await userApi.create({
        username:     creds.username.trim(),
        email:        creds.email.trim(),
        fullName:     customer?.name ?? creds.username.trim(),
        password:     creds.password,
        roleId:       customerRole.id,
        customerId:   id,
        distributorIds: [],
        customerIds:    [],
      });
      toast.success('Portal account created');
      setCreds({ username: '', email: '', password: '', confirm: '' });
      setPortalOpen(false);
      refetchPortalUser();
    } catch (err) {
      toast.error(err.response?.data?.message ?? err.response?.data?.detail ?? 'Failed to create account');
    } finally {
      setPortalSaving(false);
    }
  }

  // Reset portal password
  async function handleResetPassword() {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!portalUser) return;
    setPortalSaving(true);
    try {
      await userApi.update(portalUser.id, {
        fullName:       portalUser.fullName,
        email:          portalUser.email,
        roleId:         portalUser.roleId,
        password:       newPassword,
        distributorIds: [],
        customerIds:    [],
      });
      toast.success('Password reset successfully');
      setResetMode(false);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail ?? 'Failed to reset password');
    } finally {
      setPortalSaving(false);
    }
  }

  // Toggle portal user active/inactive
  async function handleTogglePortalStatus() {
    if (!portalUser) return;
    try {
      await userApi.toggleStatus(portalUser.id);
      toast.success('Portal account status updated');
      refetchPortalUser();
    } catch {
      toast.error('Failed to update status');
    }
  }

  if (!isNew && isLoading) {
    return (
      <Layout title="Customer">
        <div className="card p-8 animate-pulse h-64" />
      </Layout>
    );
  }

  const activeProducts = allProducts.filter(p => p.status === 'ACTIVE');
  const filteredProducts = productSearch.trim()
    ? activeProducts.filter(p =>
        p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.productCode?.toLowerCase().includes(productSearch.toLowerCase()))
    : activeProducts;

  const allSelected = filteredProducts.length > 0 &&
    filteredProducts.every(p => selectedIds.includes(p.id));

  function toggleProduct(productId) {
    setSelectedIds(prev =>
      prev.includes(productId)
        ? prev.filter(x => x !== productId)
        : [...prev, productId]
    );
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredProducts.find(p => p.id === id)));
    } else {
      setSelectedIds(prev => [
        ...prev,
        ...filteredProducts.filter(p => !prev.includes(p.id)).map(p => p.id),
      ]);
    }
  }

  const hasPortalUser = !!portalUser;

  return (
    <Layout title={isNew ? 'New Customer' : customer?.name ?? 'Customer'}>
      <div className="space-y-5 w-full">

        {/* ── Customer form ────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">
              {isNew ? 'New Customer' : 'Edit Customer'}
            </h2>
            {customer && <StatusBadge status={customer.status} />}
          </div>

          <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Customer Code *</label>
                <input {...register('customerCode', { required: true })} className="input" />
                {errors.customerCode && <p className="text-red-500 text-xs mt-1">Required</p>}
              </div>
              <div>
                <label className="label">Name *</label>
                <input {...register('name', { required: true })} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Contact Person</label>
                <input {...register('contactPerson')} className="input" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input {...register('phone')} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Email</label>
                <input type="email" {...register('email')} className="input" />
              </div>
              <div>
                <label className="label">Location</label>
                <input placeholder="e.g. Colombo" {...register('location')} className="input" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">
                  Addresses <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => appendAddress({ label: '', addressLine: '' })}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Add Address
                </button>
              </div>
              {addressFields.map((field, index) => (
                <div key={field.fieldKey} className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex gap-2 mb-2">
                    <input
                      placeholder="Label (e.g. Registered, Delivery)"
                      {...register(`addresses.${index}.label`, { required: 'Label required' })}
                      className="input flex-1"
                    />
                    {addressFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAddress(index)}
                        className="px-2 text-red-400 hover:text-red-600 text-lg leading-none"
                        title="Remove address"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <textarea
                    placeholder="Full address"
                    rows={2}
                    {...register(`addresses.${index}.addressLine`, { required: 'Address required' })}
                    className="input resize-none w-full"
                  />
                  {errors.addresses?.[index]?.label && (
                    <p className="text-red-500 text-xs mt-1">{errors.addresses[index].label.message}</p>
                  )}
                  {errors.addresses?.[index]?.addressLine && (
                    <p className="text-red-500 text-xs mt-1">{errors.addresses[index].addressLine.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Tax Number</label>
                <input {...register('taxNumber')} className="input" />
              </div>
              <div>
                <label className="label">Tax Type</label>
                <select {...register('taxType')} className="input">
                  <option value="STANDARD">Standard</option>
                  <option value="EXEMPT">Exempt</option>
                  <option value="ZERO_RATED">Zero Rated</option>
                </select>
              </div>
              <div>
                <label className="label">Tax Rate %</label>
                <input type="number" step="0.01" min="0" max="100" {...register('taxRate')} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Credit Limit</label>
                <input type="number" step="0.01" {...register('creditLimit')} className="input" />
              </div>
              <div>
                <label className="label">Credit Days</label>
                <input type="number" min="0" placeholder="e.g. 30" {...register('creditDays', { valueAsNumber: true })} className="input" />
              </div>
              <div>
                <label className="label">Visibility Rule</label>
                <select {...register('visibilityRule')} className="input">
                  <option value="ALL">All Products</option>
                  <option value="ASSIGNED">Assigned Only</option>
                </select>
              </div>
            </div>

            {visibilityRule === 'ASSIGNED' && user?.sfaEnabled && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Assigned Products</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {selectedIds.length === 0
                        ? 'No products assigned — salesperson will see no products'
                        : `${selectedIds.length} product${selectedIds.length === 1 ? '' : 's'} assigned`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="btn-primary text-sm py-1.5 px-3"
                  >
                    {selectedIds.length === 0 ? 'Select Products' : 'Edit Products'}
                  </button>
                </div>
                {selectedIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedIds.slice(0, 8).map(pid => {
                      const p = allProducts.find(x => x.id === pid);
                      return p ? (
                        <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                          {p.name}
                          <button type="button" onClick={() => toggleProduct(pid)} className="ml-0.5 text-blue-500 hover:text-blue-700">×</button>
                        </span>
                      ) : null;
                    })}
                    {selectedIds.length > 8 && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-600">
                        +{selectedIds.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="btn-primary"
                disabled={mutation.isPending || (!isNew && !isDirty && visibilityRule !== 'ASSIGNED')}
              >
                {mutation.isPending ? 'Saving…' : isNew ? 'Create Customer' : 'Save Changes'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => router.back()}>
                Back
              </button>
            </div>
          </form>
        </div>

        {/* ── Customer Credit card (POS-licensed) ─────────────────────────────── */}
        {!isNew && customer && user?.posEnabled && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Customer Credit</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">
                  Current Balance{' '}
                  <span className={`font-semibold ${Number(customer.currentBalance) > 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    LKR {formatAmount(customer.currentBalance)}
                  </span>
                </span>
                <span className="text-gray-500">
                  Credit Limit{' '}
                  <span className="font-semibold text-gray-700">
                    {customer.creditLimit != null ? `LKR ${formatAmount(customer.creditLimit)}` : '—'}
                  </span>
                </span>
              </div>
            </div>

            {creditBills.length === 0 ? (
              <p className="text-sm text-gray-400">No credit bills for this customer.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Sale #</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Total</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Paid</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Balance Due</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {creditBills.map(bill => (
                      <tr key={bill.id}>
                        <td className="px-3 py-2 font-mono text-xs">{bill.saleNumber}</td>
                        <td className="px-3 py-2">{new Date(bill.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatAmount(bill.total)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatAmount(bill.amountPaid)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">
                          {formatAmount(bill.balanceDue)}
                        </td>
                        <td className="px-3 py-2"><StatusBadge status={bill.creditStatus} /></td>
                        <td className="px-3 py-2 text-right">
                          {bill.creditStatus !== 'PAID' && (
                            <button onClick={() => setPayBill(bill)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                              Record Payment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {creditPayments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Recent Payments</p>
                <div className="space-y-1.5">
                  {creditPayments.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5 last:border-0">
                      <span className="text-gray-500">
                        {new Date(p.createdAt).toLocaleDateString()} · {p.paymentMethod}
                        {p.notes && <span className="italic"> — {p.notes}</span>}
                      </span>
                      <span className="font-semibold tabular-nums">LKR {formatAmount(p.amount)}</span>
                    </div>
                  ))}
                </div>
                <a href={`/pos/credit`} className="mt-2 inline-block text-xs text-blue-600 hover:text-blue-800 font-medium">
                  View all in Customer Credit →
                </a>
              </div>
            )}
          </div>
        )}

        {payBill && (
          <RecordCreditPaymentModal
            bill={payBill}
            isPending={payMutation.isPending}
            onSubmit={(body) => payMutation.mutate({ saleId: payBill.id, body })}
            onClose={() => setPayBill(null)}
          />
        )}

        {/* ── Returns card ─────────────────────────────────────────────────────── */}
        {!isNew && customer && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Returns</h3>
            {returns.length === 0 ? (
              <p className="text-sm text-gray-400">No returns for this customer.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Return #</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Order</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Products</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Reason</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {returns.map(r => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono text-xs">{r.returnNumber}</td>
                        <td className="px-3 py-2">{r.order?.orderNumber ?? '—'}</td>
                        <td className="px-3 py-2">
                          {(r.items ?? []).map((it, i) => (
                            <div key={i} className="text-xs whitespace-nowrap">
                              {it.product?.name ?? '—'} <span className="text-gray-400">× {Number(it.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Damages card ─────────────────────────────────────────────────────── */}
        {!isNew && customer && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Damages</h3>
            {damages.length === 0 ? (
              <p className="text-sm text-gray-400">No damages recorded for this customer.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Damage #</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Products</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {damages.map(d => (
                      <tr key={d.id}>
                        <td className="px-3 py-2 font-mono text-xs">{d.damageNumber}</td>
                        <td className="px-3 py-2">
                          {(d.items ?? []).map((it, i) => (
                            <div key={i} className="text-xs whitespace-nowrap">
                              {it.product?.name ?? '—'} <span className="text-gray-400">× {Number(it.quantity).toLocaleString()}</span>
                            </div>
                          ))}
                        </td>
                        <td className="px-3 py-2 max-w-xs truncate" title={d.description}>{d.description}</td>
                        <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {d.damageDate ? new Date(d.damageDate).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Portal Access card ─────────────────────────────────────────────── */}
        {(
          <div className="card p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-purple-100">
                  <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.657-1.343-3-3-3s-3 1.343-3 3 1.343 3 3 3 3-1.343 3-3zm6 8v-1a6 6 0 00-12 0v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                <h3 className="text-sm font-semibold text-gray-900">Customer Portal Access</h3>
              </div>
              {!hasPortalUser && !isNew && (
                <button
                  type="button"
                  onClick={() => setPortalOpen(v => !v)}
                  className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                >
                  {portalOpen ? '− Cancel' : '+ Create Account'}
                </button>
              )}
              {isNew && (
                <span className="text-xs text-purple-500 font-medium italic">Optional — set up with customer</span>
              )}
            </div>

            {/* Existing user info */}
            {hasPortalUser && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{portalUser.username}</p>
                    <p className="text-xs text-gray-500">{portalUser.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      portalUser.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {portalUser.status}
                    </span>
                    <button
                      type="button"
                      onClick={handleTogglePortalStatus}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      {portalUser.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setResetMode(v => !v); setNewPassword(''); }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      {resetMode ? 'Cancel' : 'Reset Password'}
                    </button>
                  </div>
                </div>

                {resetMode && (
                  <ResetPasswordRow
                    value={newPassword}
                    onChange={setNewPassword}
                    onSubmit={handleResetPassword}
                    saving={portalSaving}
                    generatePassword={generatePassword}
                  />
                )}
              </div>
            )}

            {/* Create account form */}
            {!hasPortalUser && portalOpen && (
              <div className="mt-4 rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
                <p className="text-xs text-purple-700 font-medium">
                  This creates a login for the customer to place orders through the Customer Portal app.
                  Fields are pre-filled from customer details — you can change them before saving.
                </p>

                {/* Username + Email */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">
                      Username *
                      <span className="ml-1 font-normal text-gray-400 text-xs">(must be unique)</span>
                    </label>
                    <input
                      type="text"
                      value={creds.username}
                      onChange={e => setCreds(c => ({ ...c, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                      className="input font-mono"
                      placeholder="e.g. cust_001"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="label">
                      Email *
                      <span className="ml-1 font-normal text-gray-400 text-xs">(must be unique)</span>
                    </label>
                    <input
                      type="email"
                      value={creds.email}
                      onChange={e => setCreds(c => ({ ...c, email: e.target.value }))}
                      className="input"
                      placeholder="customer@example.com"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Password row with show/hide + regenerate */}
                <PasswordRow creds={creds} setCreds={setCreds} generatePassword={generatePassword} />

                <div className="flex gap-2 pt-1">
                  {!isNew && (
                    <button
                      type="button"
                      onClick={handleCreatePortal}
                      disabled={portalSaving}
                      className="btn-primary"
                    >
                      {portalSaving ? 'Creating…' : 'Create Portal Account'}
                    </button>
                  )}
                  {isNew && (
                    <p className="text-xs text-purple-600 self-center">
                      Portal account will be created automatically when you save the customer above.
                    </p>
                  )}
                  {!isNew && (
                    <button
                      type="button"
                      onClick={() => setPortalOpen(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Empty state — only on existing customers with no account and form closed */}
            {!isNew && !hasPortalUser && !portalOpen && (
              <p className="mt-3 text-sm text-gray-400">
                No portal account — customer cannot log in to the app yet.
              </p>
            )}
          </div>
        )}

        {/* ── Product Picker Modal ─────────────────────────────────────────── */}
        {showPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowPicker(false)} />
            <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Select Products</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedIds.length} selected</p>
                </div>
                <button type="button" onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="px-5 py-3 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search by name or code…"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="input w-full"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between px-5 py-2 border-b border-gray-100 bg-gray-50">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  {allSelected ? 'Deselect all' : 'Select all'} ({filteredProducts.length})
                </label>
                {selectedIds.length > 0 && (
                  <button type="button" onClick={() => setSelectedIds([])} className="text-xs text-red-500 hover:text-red-700">Clear all</button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 px-2 py-2">
                {filteredProducts.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">No products found</p>
                ) : (
                  filteredProducts.map(p => {
                    const checked = selectedIds.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">
                            {p.productCode}
                            {p.categoryName ? ` · ${p.categoryName}` : ''}
                            {p.unitName ? ` · ${p.unitName}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-gray-600 shrink-0">
                          {p.defaultPrice != null ? `LKR ${formatAmount(p.defaultPrice)}` : ''}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">{selectedIds.length} product{selectedIds.length !== 1 ? 's' : ''} selected</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowPicker(false)} className="btn-secondary">Cancel</button>
                  <button type="button" onClick={() => setShowPicker(false)} className="btn-primary">Done</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function ResetPasswordRow({ value, onChange, onSubmit, saving, generatePassword }) {
  const [show, setShow] = useState(false);
  function regen() { onChange(generatePassword()); }
  return (
    <div className="flex gap-2 items-end mt-2">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">New Password <span className="font-normal text-gray-400 text-xs">(min 8 chars)</span></label>
          <button type="button" onClick={regen} className="text-xs text-purple-600 hover:text-purple-800 font-medium">↻ Suggest</button>
        </div>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => onChange(e.target.value)}
            className="input pr-10 font-mono"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            tabIndex={-1}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={saving}
        className="btn-primary whitespace-nowrap"
      >
        {saving ? 'Saving…' : 'Set Password'}
      </button>
    </div>
  );
}

// Reusable password row: text/password toggle + confirm + regenerate button
function PasswordRow({ creds, setCreds, generatePassword }) {
  const [show, setShow] = useState(false);
  const passwordsMatch = creds.password && creds.confirm && creds.password === creds.confirm;
  const mismatch = creds.confirm && creds.password !== creds.confirm;

  function regen() {
    const pwd = generatePassword();
    setCreds(c => ({ ...c, password: pwd, confirm: pwd }));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Password * <span className="font-normal text-gray-400 text-xs">(min 8 chars)</span></label>
            <button
              type="button"
              onClick={regen}
              className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
              title="Generate a new strong password"
            >
              ↻ Suggest
            </button>
          </div>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={creds.password}
              onChange={e => setCreds(c => ({ ...c, password: e.target.value }))}
              className="input pr-10 font-mono"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              tabIndex={-1}
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div>
          <label className="label">Confirm Password *</label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={creds.confirm}
              onChange={e => setCreds(c => ({ ...c, confirm: e.target.value }))}
              className={`input pr-8 font-mono ${mismatch ? 'border-red-400 focus:ring-red-400' : passwordsMatch ? 'border-green-400' : ''}`}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {passwordsMatch && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</span>
            )}
          </div>
          {mismatch && <p className="text-red-500 text-xs mt-1">Passwords do not match</p>}
        </div>
      </div>
    </div>
  );
}

export default withAuth(CustomerDetailPage, ['SUPER_ADMIN', 'SALES_MANAGER']);
