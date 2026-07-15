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
  getProducts:   (id)              => api.get(`/customers/${id}/products`),
  setProducts:   (id, productIds)  => api.put(`/customers/${id}/products`, productIds),
  recordCreditPayment: (id, data)   => api.post(`/customers/${id}/credit/payments`, data),
  getCreditPayments:   (id, params) => api.get(`/customers/${id}/credit/payments`, { params }),
  getReturns:          (id, params) => api.get(`/customers/${id}/returns`, { params }),
  getDamages:          (id, params) => api.get(`/customers/${id}/damages`, { params }),
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
};

export const returnApi = {
  list:         (params)       => api.get('/returns', { params }),
  updateStatus: (id, status)   => api.patch(`/returns/${id}/status`, null, { params: { status } }),
};

export const damageApi = {
  list:         (params)       => api.get('/damages', { params }),
  updateStatus: (id, status)   => api.patch(`/damages/${id}/status`, null, { params: { status } }),
};

export const invoiceApi = {
  list:     (params)  => api.get('/invoices', { params }),
  get:      (id)      => api.get(`/invoices/${id}`),
  generate: (orderId) => api.post(`/invoices/generate/${orderId}`),
  pdf:      (id)      => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
};

export const reportApi = {
  salesSummary:    (params) => api.get('/reports/sales', { params }),
  customerSales:   (params) => api.get('/reports/customers', { params }),
  performanceStats:(params) => api.get('/reports/performance', { params }),
  export:          (params) => api.get('/reports/export', { params, responseType: 'blob' }),
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
};

export const categoryApi = {
  list:   ()           => api.get('/product-categories'),
  create: (data)       => api.post('/product-categories', data),
  update: (id, data)   => api.put(`/product-categories/${id}`, data),
  delete: (id)         => api.delete(`/product-categories/${id}`),
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
