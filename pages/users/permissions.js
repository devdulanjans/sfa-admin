import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { withAuth } from '../../lib/auth';
import { userApi, moduleApi, permissionApi } from '../../lib/api';

// ── Module tree node (parent with children) ────────────────────────────────

function ModuleGroup({ mod, grantedKeys, onToggle }) {
  const childCodes = mod.children.map(c => c.code);
  const checkedCount = childCodes.filter(k => grantedKeys.has(k)).length;
  const allChecked  = checkedCount === childCodes.length;
  const someChecked = checkedCount > 0 && !allChecked;

  function toggleAll() {
    childCodes.forEach(k => onToggle(k, !allChecked));
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Parent header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <input
          type="checkbox"
          checked={allChecked}
          ref={el => { if (el) el.indeterminate = someChecked; }}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <span className="text-base leading-none">{mod.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{mod.name}</p>
          <p className="text-xs text-gray-400 font-mono">{mod.code}</p>
        </div>
        <span className="text-xs text-gray-400">{checkedCount}/{childCodes.length} granted</span>
      </div>

      {/* Sub-modules */}
      <div className="divide-y divide-gray-100">
        {mod.children.map(sub => (
          <ModuleLeaf
            key={sub.code}
            mod={sub}
            checked={grantedKeys.has(sub.code)}
            onToggle={() => onToggle(sub.code)}
            indent
          />
        ))}
      </div>
    </div>
  );
}

// ── Leaf module row ─────────────────────────────────────────────────────────

function ModuleLeaf({ mod, checked, onToggle, indent }) {
  return (
    <label className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors ${indent ? 'pl-10' : 'border border-gray-200 rounded-xl'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-base leading-none">{mod.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{mod.name}</p>
        {mod.url && <p className="text-xs text-gray-400 font-mono">{mod.url}</p>}
      </div>
      <code className="text-xs text-gray-300 font-mono hidden sm:block">{mod.code}</code>
    </label>
  );
}

// ── Action permission row ───────────────────────────────────────────────────

function ActionItem({ action, checked, onToggle }) {
  return (
    <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{action.label}</p>
        {action.description && <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>}
      </div>
      <code className="text-xs text-gray-300 font-mono hidden sm:block shrink-0">{action.key}</code>
    </label>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

function PermissionsPage() {
  const [users, setUsers]               = useState([]);
  const [modules, setModules]           = useState([]);  // tree from /api/modules
  const [actions, setActions]           = useState([]);  // ACTION_* from /api/permissions
  const [selectedUser, setSelectedUser] = useState(null);
  const [grantedKeys, setGrantedKeys]   = useState(new Set());
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [search, setSearch]             = useState('');

  useEffect(() => {
    userApi.list({ size: 200 }).then(({ data }) => {
      setUsers((data.content || data).filter(u => u.role !== 'SUPER_ADMIN'));
    }).catch(() => {});

    moduleApi.list().then(({ data }) => setModules(data || [])).catch(() => {});

    permissionApi.listAll().then(({ data }) => {
      setActions((data || []).filter(p => p.key?.startsWith('ACTION_')));
    }).catch(() => {});
  }, []);

  const selectUser = useCallback((user) => {
    setSelectedUser(user);
    setSaved(false);
    setLoadingPerms(true);
    permissionApi.getUserPermissions(user.id)
      .then(({ data }) => setGrantedKeys(new Set(data)))
      .catch(() => setGrantedKeys(new Set()))
      .finally(() => setLoadingPerms(false));
  }, []);

  // Toggle a single key; if forced is provided, set to that value
  function toggle(key, forced) {
    setSaved(false);
    setGrantedKeys(prev => {
      const next = new Set(prev);
      const newVal = forced !== undefined ? forced : !prev.has(key);
      newVal ? next.add(key) : next.delete(key);
      return next;
    });
  }

  async function save() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await permissionApi.setUserPermissions(selectedUser.id, [...grantedKeys]);
      setSaved(true);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter(u =>
    !search ||
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  // Separate leaf modules (no children) from parent modules
  const leafModules   = modules.filter(m => m.children.length === 0);
  const parentModules = modules.filter(m => m.children.length > 0);

  return (
    <Layout title="User Permissions">
      <div className="flex gap-6" style={{ height: 'calc(100vh - 120px)', minHeight: 0 }}>

        {/* ── Left: user list ─────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Select User</h2>
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  selectedUser?.id === u.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{u.fullName || u.username}</p>
                <p className="text-xs text-gray-500 truncate">{u.email}</p>
                <span className="inline-block mt-0.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  {u.role}
                </span>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No users found</p>
            )}
          </div>
        </div>

        {/* ── Right: permission matrix ─────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-w-0">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <p className="text-sm font-medium">Select a user to manage permissions</p>
                <p className="text-xs text-gray-300 mt-1">Modules and sub-modules will appear here</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedUser.fullName || selectedUser.username}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedUser.email}
                    <span className="ml-2 inline-block bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs">
                      {selectedUser.role}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
                  <button
                    onClick={save}
                    disabled={saving || loadingPerms}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Permissions'}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="overflow-y-auto flex-1 p-5">
                {loadingPerms ? (
                  <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                    Loading permissions...
                  </div>
                ) : (
                  <div className="space-y-8">

                    {/* ── Modules with sub-modules ──────────────────────── */}
                    {parentModules.length > 0 && (
                      <section>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                          Modules with Sub-modules
                        </h3>
                        <div className="space-y-3">
                          {parentModules.map(mod => (
                            <ModuleGroup
                              key={mod.code}
                              mod={mod}
                              grantedKeys={grantedKeys}
                              onToggle={toggle}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* ── Standalone modules (no sub-modules) ──────────── */}
                    {leafModules.length > 0 && (
                      <section>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                          Modules
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {leafModules.map(mod => (
                            <ModuleLeaf
                              key={mod.code}
                              mod={mod}
                              checked={grantedKeys.has(mod.code)}
                              onToggle={() => toggle(mod.code)}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* ── Action permissions ────────────────────────────── */}
                    {actions.length > 0 && (
                      <section>
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                          Actions
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {actions.map(a => (
                            <ActionItem
                              key={a.key}
                              action={a}
                              checked={grantedKeys.has(a.key)}
                              onToggle={() => toggle(a.key)}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {modules.length === 0 && actions.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-8">
                        No modules configured
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default withAuth(PermissionsPage, [], 'MOD_USER_PERMS');
