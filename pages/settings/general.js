import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { settingsApi } from '../../lib/api';
import toast from 'react-hot-toast';

const SETTING_META = {
  isOrderPrevent: {
    label:       'Auto-Invoice on Order Creation',
    description: 'When enabled, every new order is automatically approved and converted to an invoice immediately — no manual steps required. When disabled, orders follow the normal flow: Draft → Submitted → Approved → Invoice.',
  },
  pos_tax_enabled: {
    label:       'Calculate Tax in POS',
    description: 'When enabled, POS sales calculate and show tax per item as usual. When disabled, POS sales are billed with no tax at all — the tax line is hidden and nothing is added to totals.',
  },
  pos_auto_print_receipt: {
    label:       'Auto-Print Receipt on Sale',
    description: 'When enabled, the receipt prints automatically as soon as a POS sale completes. When disabled, the cashier must print manually from the sale confirmation screen.',
  },
  show_promotion_as_discount: {
    label:       'Show Free Promotion Items as Discount',
    description: 'When enabled, free items from Buy-X-Get-Y promotions are added to orders/invoices as a real priced line with the value shown as a Discount field, instead of a LKR 0.00 line. Applies to every customer and every order.',
  },
  mileage_management_enabled: {
    label:       'Mileage Management',
    description: 'When enabled, sales reps must record start/end odometer mileage for each work session, and the Mileage report is available. When disabled, the feature is hidden everywhere.',
  },
  invoice_print_preview_enabled: {
    label:       'Show Print Preview (Debug)',
    description: 'When enabled, printing an Invoice, Damage Note, or Return Note on the mobile app shows a receipt preview before printing. When disabled (recommended), it prints directly to the Bluetooth printer with no preview. Intended for debugging only — leave off in production.',
  },
  return_damage_price_qty_enabled: {
    label:       'Show Price & Quantity on Return/Damage',
    description: 'When enabled (default), the mobile app shows each product\'s unit price and line/total value when creating a Return or Damage request. When disabled, only the product name and quantity input are shown — quantity itself is still required either way.',
  },
  lead_auto_convert_to_customer: {
    label:       'Automatically convert Lead into Customer',
    description: 'When enabled, every lead a sales rep creates is converted into a customer immediately. When disabled (default), leads stay pending until a user with the "Convert Leads" permission (e.g. an ASM/RSM) approves the conversion from the Leads page.',
  },
  sales_routes_enabled: {
    label:       'Apply Sales Routes to Sales Reps',
    description: 'When enabled, a sales rep who has a route assigned for the day (Routes → Assign Route) sees only that route\'s customers in the mobile app, in stop order, with the route shown on their dashboard. Reps with no route that day still see all their customers. When disabled (default), routes are not applied to sales reps at all — you can still create and assign routes ahead of time.',
  },
  promotion_manual_selection: {
    label:       'Let Sales Reps Choose Between Multiple Promotions',
    description: 'When enabled (default), if more than one promotion applies to a product, the sales rep is shown all of them and must pick which one to apply. When disabled, the system applies the best match automatically: a discount promotion always prices the item, and a Buy-X-Get-Y promotion still independently grants its free item — both stack rather than one silently overriding the other.',
  },
  location_tracking_enabled: {
    label:       'Track Sales Rep Location',
    description: 'When enabled, the mobile app records the sales rep\'s GPS location continuously while they are logged in — in the foreground and in the background — and the server detects customer visits from it (geofencing). View the trails and visits in Routes → Field Tracking. When disabled, no location is recorded and uploads are ignored.',
  },
};

const NUMBER_SETTING_META = {
  pos_print_copies_default: {
    label:       'Default Receipt Copies',
    description: 'Default number of receipt copies printed per POS sale. Cashiers can still adjust the copy count for an individual sale.',
    min: 1,
    max: 10,
  },
  location_tracking_interval_seconds: {
    label:       'Location Tracking Interval (seconds)',
    description: 'How often the mobile app records a location while tracking is on. Lower values give a more detailed trail but use more battery and data. Default 30.',
    min: 5,
    max: 600,
  },
  location_tracking_distance_meters: {
    label:       'Location Tracking Minimum Movement (metres)',
    description: 'A new location is recorded only after the rep has moved at least this far (0 = record on every interval, even when standing still). Default 25.',
    min: 0,
    max: 1000,
  },
  geofence_radius_meters: {
    label:       'Customer Geofence Radius (metres)',
    description: 'A rep counts as "at" a customer when they are within this distance of the customer\'s saved location. Customers without a saved location are never detected. Default 100.',
    min: 10,
    max: 2000,
  },
  geofence_min_dwell_minutes: {
    label:       'Minimum Visit Duration (minutes)',
    description: 'How long a rep must stay inside a customer\'s geofence for it to count as a visit — filters out simply driving past. Default 2.',
    min: 0,
    max: 120,
  },
};

function NumberSettingRow({ setting, meta, onSave, isPending }) {
  const [value, setValue] = useState(setting.value);
  useEffect(() => { setValue(setting.value); }, [setting.value]);

  const dirty = value !== setting.value;

  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{meta.label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{meta.description}</p>
        {setting.updatedAt && (
          <p className="mt-1 text-xs text-gray-400">Last changed: {new Date(setting.updatedAt).toLocaleString()}</p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <input
          type="number" min={meta.min} max={meta.max}
          className="input w-20 text-center"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button
          onClick={() => onSave(Math.max(meta.min, Math.min(meta.max, parseInt(value, 10) || meta.min)).toString())}
          disabled={!dirty || isPending}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function GeneralSettingsPage() {
  const qc = useQueryClient();

  const { data: settings, isLoading, isError, error } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => settingsApi.list().then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }) => settingsApi.update(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Setting saved');
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save setting'),
  });

  function toggle(setting) {
    const next = setting.value === 'true' ? 'false' : 'true';
    updateMutation.mutate({ key: setting.key, value: next });
  }

  const booleanSettings = (settings ?? []).filter(s => s.value === 'true' || s.value === 'false');
  const numberSettings  = (settings ?? []).filter(s => NUMBER_SETTING_META[s.key]);

  return (
    <Layout title="General Settings">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-gray-500">
          System-wide behaviour switches. Changes take effect immediately for all new operations.
        </p>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : isError ? (
          <div className="text-center py-12 text-sm text-red-500">
            Failed to load settings: {error?.response?.data?.detail ?? error?.message ?? 'Unknown error'}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {booleanSettings.length === 0 && numberSettings.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">No configurable settings found.</div>
            )}
            {numberSettings.map(setting => (
              <NumberSettingRow
                key={setting.key}
                setting={setting}
                meta={NUMBER_SETTING_META[setting.key]}
                isPending={updateMutation.isPending}
                onSave={(value) => updateMutation.mutate({ key: setting.key, value })}
              />
            ))}
            {booleanSettings.map(setting => {
              const meta    = SETTING_META[setting.key] ?? { label: setting.key, description: setting.description ?? '' };
              const enabled = setting.value === 'true';
              return (
                <div key={setting.key} className="flex items-start justify-between gap-6 px-5 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{meta.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                    {setting.updatedAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        Last changed: {new Date(setting.updatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(setting)}
                    disabled={updateMutation.isPending}
                    className={[
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                      'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                      enabled ? 'bg-brand-600' : 'bg-gray-200',
                    ].join(' ')}
                    role="switch"
                    aria-checked={enabled}
                  >
                    <span
                      className={[
                        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0',
                        'transition-transform duration-200',
                        enabled ? 'translate-x-5' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default withAuth(GeneralSettingsPage, [], 'MOD_SETTINGS_GENERAL');
