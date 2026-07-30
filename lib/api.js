import axios from 'axios';

// Use relative /api path so all requests route through Next.js rewrite proxy.
// The proxy forwards to the backend server-side — the browser never makes a
// cross-origin request, so no CORS headers are needed.
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('sfa_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue = [];

// Auto-refresh on 401 (skipped for auth endpoints — they have no session to refresh)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original.url?.includes('/auth/');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('sfa_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('sfa_access_token',  data.accessToken);
        localStorage.setItem('sfa_refresh_token', data.refreshToken);

        refreshQueue.forEach(({ resolve }) => resolve(data.accessToken));
        refreshQueue = [];

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        refreshQueue.forEach(({ reject }) => reject(refreshError));
        refreshQueue = [];
        ['sfa_access_token', 'sfa_refresh_token', 'sfa_user'].forEach(k => localStorage.removeItem(k));
        if (typeof window !== 'undefined') window.location.href = '/login';
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Typed API methods
export const authApi = {
  login:   (data) => api.post('/auth/login', data),
  logout:  ()     => api.post('/auth/logout'),
  refresh: (data) => api.post('/auth/refresh', data),
};

export const customerApi = {
  list:          (params)      => api.get('/customers', { params }),
  getById:       (id)          => api.get(`/customers/${id}`),
  get:           (id)          => api.get(`/customers/${id}`),
  create:        (data)        => api.post('/customers', data),
  update:        (id, data)    => api.put(`/customers/${id}`, data),
  delete:        (id)          => api.delete(`/customers/${id}`),
  restore:       (id)          => api.post(`/customers/${id}/restore`),
  getProducts:   (id)              => api.get(`/customers/${id}/products`),
  setProducts:   (id, productIds)  => api.put(`/customers/${id}/products`, productIds),
  recordCreditPayment: (id, data)   => api.post(`/customers/${id}/credit/payments`, data),
  getCreditPayments:   (id, params) => api.get(`/customers/${id}/credit/payments`, { params }),
  getReturns:          (id, params) => api.get(`/customers/${id}/returns`, { params }),
  getDamages:          (id, params) => api.get(`/customers/${id}/damages`, { params }),
  branches:            (id, params) => api.get(`/customers/${id}/branches`, { params }),
  branchSummary:       (id)         => api.get(`/customers/${id}/branch-summary`),
  quickCreate: (data)   => api.post('/customers/pos', data),
  listPos:     (params) => api.get('/customers/pos', { params }),
  export: (format, params) => api.get('/customers/export', { params: { ...params, format }, responseType: 'blob' }),
  downloadImportTemplate: () => api.get('/customers/import-template', { responseType: 'blob' }),
  importCustomers: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // Override the instance's default 'application/json' header so the browser sets the
    // correct 'multipart/form-data; boundary=...' for this request instead.
    return api.post('/customers/import', formData, {
      headers: { 'Content-Type': undefined },
    });
  },
};

export const productApi = {
  list:   (params)      => api.get('/products', { params }),
  get:    (id)          => api.get(`/products/${id}`),
  create: (data)        => api.post('/products', data),
  update: (id, data)    => api.put(`/products/${id}`, data),
  delete: (id)          => api.delete(`/products/${id}`),
};

export const pricingApi = {
  resolve:               (productId, customerId) => api.post('/pricing/resolve', { productId, customerId }),
  tiers:                 (productId, customerId) => api.get('/pricing/tiers', { params: { productId, customerId } }),
  customerOverrides:     (customerId)  => api.get('/pricing/customer-overrides', { params: { customerId } }),
  listBatchPrices:       (params)      => api.get('/batch-prices', { params }),
  createBatchPrice:      (data)        => api.post('/batch-prices', data),
  updateBatchPrice:      (id, data)    => api.put(`/batch-prices/${id}`, data),
  deleteBatchPrice:      (id)          => api.delete(`/batch-prices/${id}`),
  listPromotions:        (params)      => api.get('/promotions', { params }),
  createPromotion:       (data)        => api.post('/promotions', data),
  updatePromotion:       (id, data)    => api.put(`/promotions/${id}`, data),
  getPromotionHistory:   (id)          => api.get(`/promotions/${id}/history`),
};

export const orderApi = {
  list:    (params) => api.get('/orders', { params }),
  getById: (id)     => api.get(`/orders/${id}`),
  get:     (id)     => api.get(`/orders/${id}`),
  create:  (data)   => api.post('/orders', data),
  submit:  (id)     => api.post(`/orders/${id}/submit`),
  approve: (id)     => api.post(`/orders/${id}/approve`),
  cancel:  (id)     => api.post(`/orders/${id}/cancel`),
  export:  (format, params) => api.get('/orders/export', { params: { ...params, format }, responseType: 'blob' }),
  exportDetails: (id) => api.get(`/orders/${id}/export-details`, { responseType: 'blob' }),
  exportDetailsBulk: (params) => api.get('/orders/export-details', { params, responseType: 'blob' }),
};

export const returnApi = {
  list:         (params)       => api.get('/returns', { params }),
  updateStatus: (id, status)   => api.patch(`/returns/${id}/status`, null, { params: { status } }),
  pdf:          (id)           => api.get(`/returns/${id}/pdf`, { responseType: 'blob' }),
};

export const damageApi = {
  list:         (params)       => api.get('/damages', { params }),
  updateStatus: (id, status)   => api.patch(`/damages/${id}/status`, null, { params: { status } }),
  pdf:          (id)           => api.get(`/damages/${id}/pdf`, { responseType: 'blob' }),
};

export const invoiceApi = {
  list:     (params)  => api.get('/invoices', { params }),
  get:      (id)      => api.get(`/invoices/${id}`),
  generate: (orderId) => api.post(`/invoices/generate/${orderId}`),
  pdf:      (id)      => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
  export:   (format, params) => api.get('/invoices/export', { params: { ...params, format }, responseType: 'blob' }),
  exportDetails: (id) => api.get(`/invoices/${id}/export-details`, { responseType: 'blob' }),
  exportDetailsBulk: (params) => api.get('/invoices/export-details', { params, responseType: 'blob' }),
  payments:      (id)       => api.get(`/invoices/${id}/payments`),
  recordPayment: (id, data) => api.post(`/invoices/${id}/payments`, data),
};

export const reportApi = {
  salesSummary:    (params) => api.get('/reports/sales', { params }),
  customerSales:   (params) => api.get('/reports/customers', { params }),
  performanceStats:(params) => api.get('/reports/performance', { params }),
  export:          (params) => api.get('/reports/export', { params, responseType: 'blob' }),
};

export const mileageApi = {
  report: (params) => api.get('/mileage/report', { params }),
};

export const userApi = {
  list:         (params)      => api.get('/users', { params }),
  get:          (id)          => api.get(`/users/${id}`),
  create:       (data)        => api.post('/users', data),
  update:       (id, data)    => api.put(`/users/${id}`, data),
  toggleStatus: (id)          => api.patch(`/users/${id}/toggle-status`),
  changeRole:   (id, roleId)  => api.patch(`/users/${id}/role`, null, { params: { roleId } }),
  roles:        ()             => api.get('/roles'),
  findByCustomer: (customerId) => api.get(`/users/by-customer/${customerId}`),
  recovery:     (key)          => api.get('/users/recovery', { params: { key } }),
};

export const categoryApi = {
  list:   ()           => api.get('/product-categories'),
  create: (data)       => api.post('/product-categories', data),
  update: (id, data)   => api.put(`/product-categories/${id}`, data),
  delete: (id)         => api.delete(`/product-categories/${id}`),
};

export const customerGroupApi = {
  list:   (params)     => api.get('/customer-groups', { params }),
  get:    (id)         => api.get(`/customer-groups/${id}`),
  create: (data)       => api.post('/customer-groups', data),
  update: (id, data)   => api.put(`/customer-groups/${id}`, data),
  delete: (id)         => api.delete(`/customer-groups/${id}`),
};

export const productGroupApi = {
  list:   (params)     => api.get('/product-groups', { params }),
  get:    (id)         => api.get(`/product-groups/${id}`),
  create: (data)       => api.post('/product-groups', data),
  update: (id, data)   => api.put(`/product-groups/${id}`, data),
  delete: (id)         => api.delete(`/product-groups/${id}`),
  byProduct:     (productId)            => api.get(`/product-groups/by-product/${productId}`),
  setForProduct: (productId, groupIds)  => api.put(`/product-groups/by-product/${productId}`, { groupIds }),
};

export const unitApi = {
  list:   ()           => api.get('/units'),
  create: (data)       => api.post('/units', data),
  update: (id, data)   => api.put(`/units/${id}`, data),
  delete: (id)         => api.delete(`/units/${id}`),
};

export const settingsApi = {
  list:   ()              => api.get('/settings'),
  update: (key, value)    => api.put(`/settings/${key}`, { value }),
};

export const companyProfileApi = {
  get:    ()      => api.get('/company-profile'),
  update: (data)  => api.put('/company-profile', data),
  uploadLogo: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // Override the instance's default 'application/json' header so the browser sets the
    // correct 'multipart/form-data; boundary=...' for this request instead.
    return api.post('/company-profile/logo', formData, {
      headers: { 'Content-Type': undefined },
    });
  },
};

export const licenseApi = {
  get:    ()     => api.get('/platform/license'),
  update: (data) => api.put('/platform/license', data),
};

export const distributorApi = {
  list:         (params)          => api.get('/distributors', { params }),
  get:          (id)              => api.get(`/distributors/${id}`),
  byUser:       (userId)          => api.get(`/distributors/by-user/${userId}`),
  create:       (data)            => api.post('/distributors', data),
  update:       (id, data)        => api.put(`/distributors/${id}`, data),
  toggleStatus: (id)              => api.patch(`/distributors/${id}/toggle-status`),
  assignUser:   (id, userId)      => api.post(`/distributors/${id}/users/${userId}`),
  unassignUser: (id, userId)      => api.delete(`/distributors/${id}/users/${userId}`),
};

export const moduleApi = {
  list: () => api.get('/modules'),
};

export const permissionApi = {
  listAll:            ()           => api.get('/permissions'),
  getUserPermissions: (userId)     => api.get(`/users/${userId}/permissions`),
  setUserPermissions: (userId, permissions) => api.put(`/users/${userId}/permissions`, { permissions }),
};

export const accessLogApi = {
  list: (params) => api.get('/access-logs', { params }),
  log:  (data)   => api.post('/access-logs', data),
};

export const inventoryApi = {
  listStock:     (params)            => api.get('/inventory/stock', { params }),
  getStock:      (productId)         => api.get(`/inventory/stock/${productId}`),
  adjustStock:   (data)              => api.post('/inventory/stock/adjust', data),
  receiveStock:  (data)              => api.post('/inventory/stock/receive', data),
  listBatches:   (productId)         => api.get(`/inventory/batches/${productId}`),
  listMovements: (params)            => api.get('/inventory/movements', { params }),
};

export const posApi = {
  createSale: (data)  => api.post('/pos/sales', data),
  listSales:  (params) => api.get('/pos/sales', { params }),
  getSale:    (id)    => api.get(`/pos/sales/${id}`),
  voidSale:   (id)    => api.post(`/pos/sales/${id}/void`),
  recordSalePayment: (saleId, data) => api.post(`/pos/sales/${saleId}/payments`, data),
  getSalePayments:   (saleId)       => api.get(`/pos/sales/${saleId}/payments`),
  listCreditBills:   (params)       => api.get('/pos/credit/bills', { params }),
  creditTotalDue:    (params)       => api.get('/pos/credit/bills/total-due', { params }),
  dashboard:         (params)       => api.get('/pos/dashboard', { params }),
  report:            (params)       => api.get('/pos/reports', { params }),
  reportCashiers:    ()             => api.get('/pos/reports/cashiers'),
  reportExport:      (format, params) => api.get('/pos/reports/export', { params: { ...params, format }, responseType: 'blob' }),
  dailyReport:       (params)       => api.get('/pos/reports/daily', { params }),
};

export const drawerApi = {
  openSession:    (data)       => api.post('/pos/drawer/open', data),
  current:        ()           => api.get('/pos/drawer/current'),
  recordMovement: (id, data)   => api.post(`/pos/drawer/${id}/movements`, data),
  closeSession:   (id, data)   => api.post(`/pos/drawer/${id}/close`, data),
  listSessions:   (params)     => api.get('/pos/drawer/sessions', { params }),
};

export const dashboardApi = {
  salesReps: () => api.get('/dashboard/sales-reps'),
};

export const salesTargetApi = {
  list:   (params)     => api.get('/sales-targets', { params }),
  create: (data)       => api.post('/sales-targets', data),
  update: (id, data)   => api.put(`/sales-targets/${id}`, data),
  delete: (id)         => api.delete(`/sales-targets/${id}`),
};

export const targetHolidayApi = {
  list:   (params)     => api.get('/target-holidays', { params }),
  create: (data)       => api.post('/target-holidays', data),
  delete: (id)         => api.delete(`/target-holidays/${id}`),
};

export const workingCalendarApi = {
  getWeekdays: ()      => api.get('/working-calendar/weekdays'),
  setWeekdays: (days)  => api.put('/working-calendar/weekdays', { days }),
};

export const expenseApi = {
  list:       (params)     => api.get('/expenses', { params }),
  create:     (data)       => api.post('/expenses', data),
  update:     (id, data)   => api.put(`/expenses/${id}`, data),
  delete:     (id)         => api.delete(`/expenses/${id}`),
  categories: ()           => api.get('/expenses/categories'),
};

export const accountsApi = {
  ledger:     (params) => api.get('/accounts/ledger', { params }),
  profitLoss: (params) => api.get('/accounts/profit-loss', { params }),
};

export const chartOfAccountsApi = {
  list:   ()             => api.get('/finance/accounts'),
  create: (data)          => api.post('/finance/accounts', data),
  update: (id, data)      => api.put(`/finance/accounts/${id}`, data),
  delete: (id)            => api.delete(`/finance/accounts/${id}`),
  ledger: (id, params)    => api.get(`/finance/accounts/${id}/ledger`, { params }),
};

export const journalEntryApi = {
  list:   (params)  => api.get('/finance/journal-entries', { params }),
  get:    (id)       => api.get(`/finance/journal-entries/${id}`),
  create: (data)     => api.post('/finance/journal-entries', data),
  void:   (id)       => api.post(`/finance/journal-entries/${id}/void`),
};

export const bankAccountApi = {
  list:         ()          => api.get('/finance/bank-accounts'),
  create:       (data)      => api.post('/finance/bank-accounts', data),
  balance:      (id)        => api.get(`/finance/bank-accounts/${id}/balance`),
  transactions: (id, params) => api.get(`/finance/bank-accounts/${id}/transactions`, { params }),
};

export const vendorApi = {
  list:      (params)     => api.get('/finance/vendors', { params }),
  create:    (data)       => api.post('/finance/vendors', data),
  update:    (id, data)   => api.put(`/finance/vendors/${id}`, data),
  setActive: (id, active) => api.put(`/finance/vendors/${id}/active`, { active }),
};

export const vendorBillApi = {
  list:          (params)     => api.get('/finance/vendor-bills', { params }),
  get:           (id)         => api.get(`/finance/vendor-bills/${id}`),
  create:        (data)       => api.post('/finance/vendor-bills', data),
  payments:      (id)         => api.get(`/finance/vendor-bills/${id}/payments`),
  recordPayment: (id, data)   => api.post(`/finance/vendor-bills/${id}/payments`, data),
};

export const receivableApi = {
  byCustomer:        ()           => api.get('/finance/receivables/customers'),
  invoicesForCustomer: (customerId) => api.get(`/finance/receivables/customers/${customerId}/invoices`),
};

export const taxManagementApi = {
  payable:       ()         => api.get('/finance/tax/payable'),
  ledger:        (params)   => api.get('/finance/tax/ledger', { params }),
  payments:      ()         => api.get('/finance/tax/payments'),
  recordPayment: (data)     => api.post('/finance/tax/payments', data),
};

export const fixedAssetApi = {
  list:         ()             => api.get('/finance/fixed-assets'),
  create:       (data)         => api.post('/finance/fixed-assets', data),
  depreciation: (id)           => api.get(`/finance/fixed-assets/${id}/depreciation`),
  runDepreciation: (periodDate) => api.post('/finance/fixed-assets/depreciation/run', { periodDate }),
};

export const financeReportApi = {
  profitLoss:   (params) => api.get('/finance/reports/profit-loss', { params }),
  balanceSheet: (params) => api.get('/finance/reports/balance-sheet', { params }),
};
