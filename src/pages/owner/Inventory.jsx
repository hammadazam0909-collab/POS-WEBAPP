import React, { useState, useMemo } from 'react';
import { useInventory, useAudits } from '../../hooks/useFirestore';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import './Owner.css';
import StockAudit from './StockAudit';

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'oz', 'lb', 'cup', 'tbsp', 'tsp'];

const EMPTY_FORM = { name: '', quantity: '', unit: 'g', lowStockThreshold: '', costPerUnit: '' };

export default function Inventory() {
  const { items, loading, addItem, updateItem, deleteItem } = useInventory();
  const { restaurant } = useAuth();
  const { audits, addAudit, updateAudit } = useAudits();
  const { settings } = useSettings();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'low' | 'ok'
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'audit' | 'history'
  const [viewingAudit, setViewingAudit] = useState(null);
  const [editingAudit, setEditingAudit] = useState(null);

  // Adjust-stock modal
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState('add'); // 'add' | 'remove' | 'set'

  // ── Derived lists ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) list = list.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (filter === 'low') list = list.filter(i => i.quantity <= (i.lowStockThreshold || 0));
    if (filter === 'ok') list = list.filter(i => i.quantity > (i.lowStockThreshold || 0));
    return list;
  }, [items, search, filter]);

  const lowStockCount = useMemo(() => items.filter(i => i.quantity <= (i.lowStockThreshold || 0)).length, [items]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit || 'g',
      lowStockThreshold: String(item.lowStockThreshold ?? ''),
      costPerUnit: String(item.costPerUnit ?? ''),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || form.quantity === '') return;
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        quantity: parseFloat(form.quantity) || 0,
        unit: form.unit,
        lowStockThreshold: form.lowStockThreshold !== '' ? parseFloat(form.lowStockThreshold) : 0,
        costPerUnit: form.costPerUnit !== '' ? parseFloat(form.costPerUnit) : 0,
      };
      if (editingId) await updateItem(editingId, data);
      else await addItem(data);
      setShowForm(false);
    } finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this inventory item? This cannot be undone.')) return;
    await deleteItem(id);
  }

  // ── Adjust stock modal ────────────────────────────────────────────────────
  function openAdjust(item) {
    setAdjustItem(item);
    setAdjustQty('');
    setAdjustType('add');
  }

  async function saveAdjust() {
    if (!adjustItem || adjustQty === '') return;
    const val = parseFloat(adjustQty);
    if (isNaN(val) || val < 0) return;
    let newQty;
    if (adjustType === 'set') newQty = val;
    else if (adjustType === 'add') newQty = (adjustItem.quantity || 0) + val;
    else newQty = Math.max(0, (adjustItem.quantity || 0) - val);
    setSaving(true);
    try {
      await updateItem(adjustItem.id, { quantity: newQty });
      setAdjustItem(null);
    } finally { setSaving(false); }
  }

  // ── Print Stock Audit Report ─────────────────────────────────────────────
  function handlePrintAudit(audit) {
    const dateStr = audit.createdAt?.toDate ? new Date(audit.createdAt.toDate()).toLocaleString() : new Date().toLocaleString();
    const userName = audit.user?.name || 'Admin';

    // Fallbacks: calculate dynamic sums of difference and valueDiff directly from items
    const calculatedDiffValue = (audit.items || []).reduce((acc, cur) => acc + (parseFloat(cur.valueDiff) || 0), 0);
    const totalDiffValue = audit.totalDiffValue !== undefined && audit.totalDiffValue !== 0 ? audit.totalDiffValue : calculatedDiffValue;

    const itemsHtml = (audit.items || []).map(item => {
      const u = item.unit || items.find(i => i.id === item.id || i.name.toLowerCase() === item.name.toLowerCase())?.unit || '';
      const diffStr = item.difference > 0 ? `+${item.difference.toFixed(2)}` : item.difference.toFixed(2);
      return `
        <tr>
          <td style="padding:2px 0; text-align:left; text-transform:lowercase">${item.name}</td>
          <td style="padding:2px 0; text-align:center">${Number(item.systemStock || 0).toFixed(2)}</td>
          <td style="padding:2px 0; text-align:center">${Number(item.physicalCount || 0).toFixed(2)}</td>
          <td style="padding:2px 0; text-align:right; font-weight:bold">${diffStr} ${u}</td>
        </tr>
      `;
    }).join('');

    const groupedUnitDiffs = (audit.items || []).reduce((acc, cur) => {
      const lookupUnit = cur.unit || items.find(i => i.id === cur.id || i.name.toLowerCase() === cur.name.toLowerCase())?.unit || 'units';
      const unit = lookupUnit.toLowerCase().trim();
      const diffQty = cur.differenceQty !== undefined ? cur.differenceQty : (cur.difference || 0);
      if (diffQty !== 0) {
        if (!acc[unit]) acc[unit] = 0;
        acc[unit] += diffQty;
      }
      return acc;
    }, {});

    const groupedDiffsHtml = Object.entries(groupedUnitDiffs).map(([unit, val]) => `
      <div class="meta-row">
        <span>${unit.toUpperCase()}:</span>
        <span>${val > 0 ? '+' : ''}${val.toFixed(2)} ${unit}</span>
      </div>
    `).join('') || '<div style="text-align:center; color:#333">No quantity variance</div>';

    const html = `
      <html>
        <head>
          <title>Stock Audit - ${dateStr}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              font-weight: 600; 
              padding: 8px; 
              max-width: 300px; 
              margin: 0 auto; 
              color: #000; 
              background: #fff; 
            }
            .text-center { text-align: center; }
            .bold { font-weight: 900; }
            .logo-wrap { text-align: center; margin-bottom: 5px; }
            .logo-wrap img { max-width: 100px; max-height: 60px; object-fit: contain; }
            .header-title { font-size: 14px; font-weight: 900; margin: 5px 0; }
            .restaurant-name { font-size: 15px; font-weight: 900; margin-bottom: 8px; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-weight: 600; }
            .line-dashed { border-top: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin: 5px 0; }
            th { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; font-size: 11px; font-weight: 900; text-transform: uppercase; }
            td { font-size: 12px; font-weight: 700; padding: 2px 0; }
            .footer { margin-top: 12px; font-size: 10px; font-weight: 600; text-align: center; line-height: 1.4; }
            @media print {
              body { margin: 0; padding: 5px; }
            }
          </style>
        </head>
        <body>
          <div class="logo-wrap">
            ${restaurant?.logo ? `<img src="${restaurant.logo}" alt="Logo" />` : '<h2>🏪</h2>'}
          </div>
          <div class="text-center bold header-title">Stock Audit Slip</div>
          <div class="text-center bold restaurant-name">${restaurant?.name || 'Restaurant Name'}</div>
          
          <div class="meta-row"><span>Receipt: Audit</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
          <div class="meta-row"><span>Date:</span><span>${dateStr}</span></div>
          <div class="meta-row"><span>Audited By:</span><span>${userName}</span></div>
          
          <div class="line-dashed"></div>
          <div class="bold" style="font-size: 11px; margin-bottom: 4px; text-transform: uppercase;">Total Qty Diff by Unit:</div>
          <div>
            ${groupedDiffsHtml}
          </div>
          
          <div class="line-dashed"></div>
          <div class="meta-row bold" style="font-size: 13px">
            <span>TOTAL VALUE DIFF:</span>
            <span>Rs ${totalDiffValue.toLocaleString()}</span>
          </div>

          ${audit.remarks ? `
            <div class="line-dashed"></div>
            <div style="font-size: 11px; font-weight: bold;">
              Remarks: <span style="font-weight: normal; font-style: italic; white-space: pre-wrap;">${audit.remarks}</span>
            </div>
          ` : ''}

          <div class="line-dashed"></div>

          <table>
            <thead>
              <tr>
                <th style="text-align:left; width:40%">Item</th>
                <th style="text-align:center; width:20%">Sys</th>
                <th style="text-align:center; width:20%">Phy</th>
                <th style="text-align:right; width:20%">Diff</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="line-dashed"></div>
          <div class="footer">
            <div>AR POS Thermal Receipt Printer Output</div>
            <div>Generated on: ${new Date().toLocaleString()}</div>
            <div class="text-center" style="margin-top:10px; font-weight:bold">AR POS | 0322-4776071</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 400);
    }
  }

  // ── Status helpers ────────────────────────────────────────────────────────
  function getStockStatus(item) {
    const threshold = item.lowStockThreshold || 0;
    if (threshold === 0) return 'ok';
    if (item.quantity <= 0) return 'empty';
    if (item.quantity <= threshold) return 'low';
    return 'ok';
  }

  const statusStyle = {
    ok: { color: 'var(--success-light)', bg: 'var(--success-bg)', label: '✅ In Stock' },
    low: { color: 'var(--warning)', bg: 'var(--warning-bg)', label: '⚠️ Low Stock' },
    empty: { color: 'var(--danger-light)', bg: 'var(--danger-bg)', label: '🚫 Out of Stock' },
  };

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">🏪 Inventory</h1>
            <p className="page-subtitle">Manage ingredient stock — auto-deducted when orders are placed</p>
          </div>
          <button id="addInventoryBtn" className="btn btn-primary" onClick={openAdd}>+ Add Ingredient</button>
        </div>
      </div>

      <div className="content-area">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['stock', '📦 Current Stock'], ['audit', '📝 Stock Audit'], ['history', '📜 History']].map(([key, label]) => (
            <button
              key={key}
              className={`btn ${activeTab === key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(key)}
            >{label}</button>
          ))}
        </div>

        {activeTab === 'stock' && (
          <>

            {/* ── Low-stock alert banner ── */}
            {lowStockCount > 0 && (
              <div className="inv-alert-banner">
                <span>⚠️</span>
                <span><strong>{lowStockCount} ingredient{lowStockCount > 1 ? 's' : ''}</strong> {lowStockCount > 1 ? 'are' : 'is'} at or below low-stock threshold.</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setFilter('low')}>View Low Stock</button>
              </div>
            )}

            {/* ── Stats row ── */}
            <div className="inv-stats-row">
              {[
                { label: 'Total Items', value: items.length, icon: '📦' },
                { label: 'In Stock', value: items.filter(i => getStockStatus(i) === 'ok').length, icon: '✅' },
                { label: 'Low Stock', value: items.filter(i => getStockStatus(i) === 'low').length, icon: '⚠️' },
                { label: 'Out of Stock', value: items.filter(i => getStockStatus(i) === 'empty').length, icon: '🚫' },
              ].map(s => (
                <div key={s.label} className="inv-stat-card">
                  <div className="inv-stat-icon">{s.icon}</div>
                  <div>
                    <div className="inv-stat-value">{s.value}</div>
                    <div className="inv-stat-label">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Filters + Search ── */}
            <div className="inv-controls">
              <div className="menu-search-wrap" style={{ flex: 1, maxWidth: 340, marginBottom: 0 }}>
                <span className="menu-search-icon">🔍</span>
                <input
                  id="inventorySearch"
                  className="input menu-search-input"
                  placeholder="Search ingredients…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && <button className="menu-search-clear" onClick={() => setSearch('')}>✕</button>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['all', 'All'], ['low', '⚠️ Low'], ['ok', '✅ OK']].map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setFilter(key)}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* ── Table ── */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <div className="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state card">
                <div className="empty-state-icon">📦</div>
                <h3>{items.length === 0 ? 'No ingredients yet' : 'No results'}</h3>
                <p>{items.length === 0 ? 'Add your first ingredient to start tracking stock' : 'Try a different search or filter'}</p>
                {items.length === 0 && (
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>Add Ingredient</button>
                )}
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="inv-table">
                    <thead>
                      <tr>
                        {['Ingredient', 'Stock', 'Unit', 'Low-Stock Alert', 'Cost/Unit', 'Status', 'Actions'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(item => {
                        const status = getStockStatus(item);
                        const st = statusStyle[status];
                        return (
                          <tr key={item.id}>
                            <td>
                              <div className="inv-item-name">{item.name}</div>
                            </td>
                            <td>
                              <div className="inv-qty-wrap">
                                <span className={`inv-qty ${status === 'empty' ? 'inv-qty-empty' : status === 'low' ? 'inv-qty-low' : ''}`}>
                                  {(item.quantity ?? 0).toLocaleString()}
                                </span>
                                {item.unit && <span className="inv-unit-badge">{item.unit}</span>}
                              </div>
                            </td>
                            <td><span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{item.unit || '—'}</span></td>
                            <td>
                              {item.lowStockThreshold > 0
                                ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{item.lowStockThreshold.toLocaleString()} {item.unit}</span>
                                : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                              }
                            </td>
                            <td>
                              {item.costPerUnit > 0
                                ? <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem' }}>Rs {item.costPerUnit}</span>
                                : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                              }
                            </td>
                            <td>
                              <span className="inv-status-badge" style={{ color: st.color, background: st.bg }}>
                                {st.label}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  id={`adjustStock-${item.id}`}
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openAdjust(item)}
                                  title="Adjust stock"
                                >📊 Adjust</button>
                                <button
                                  id={`editInv-${item.id}`}
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openEdit(item)}
                                  title="Edit"
                                >✏️</button>
                                <button
                                  id={`deleteInv-${item.id}`}
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDelete(item.id)}
                                  title="Delete"
                                >🗑</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'audit' && (
          <StockAudit
            items={items}
            updateItem={updateItem}
            user={restaurant}
            addAudit={addAudit}
            updateAudit={updateAudit}
            editingAudit={editingAudit}
            clearEditingAudit={() => setEditingAudit(null)}
          />
        )}

        {activeTab === 'history' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {audits.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No audit history yet.</div>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Total Diff (Qty)</th>
                    <th>Total Diff (Value)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map(audit => (
                    <tr key={audit.id}>
                      <td>{audit.createdAt?.toDate ? new Date(audit.createdAt.toDate()).toLocaleString() : '—'}</td>
                      <td>{audit.user?.name || 'Admin'}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                          {Object.entries(
                            (audit.items || []).reduce((acc, cur) => {
                              const lookupUnit = cur.unit || items.find(i => i.id === cur.id || i.name.toLowerCase() === cur.name.toLowerCase())?.unit || 'units';
                              const unit = lookupUnit.toLowerCase().trim();
                              const diffQty = cur.differenceQty !== undefined ? cur.differenceQty : (cur.difference || 0);
                              if (diffQty !== 0) {
                                if (!acc[unit]) acc[unit] = 0;
                                acc[unit] += diffQty;
                              }
                              return acc;
                            }, {})
                          ).map(([unit, val]) => (
                            <span key={unit} style={{ fontSize: '0.8rem', fontWeight: 700, color: val < 0 ? 'var(--danger-light)' : 'var(--success-light)', marginRight: 6 }}>
                              {val > 0 ? '+' : ''}{val.toFixed(2)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
                            </span>
                          ))}
                          {Object.keys(
                            (audit.items || []).reduce((acc, cur) => {
                              const lookupUnit = cur.unit || items.find(i => i.id === cur.id || i.name.toLowerCase() === cur.name.toLowerCase())?.unit || 'units';
                              const unit = lookupUnit.toLowerCase().trim();
                              const diffQty = cur.differenceQty !== undefined ? cur.differenceQty : (cur.difference || 0);
                              if (diffQty !== 0) {
                                if (!acc[unit]) acc[unit] = 0;
                                acc[unit] += diffQty;
                              }
                              return acc;
                            }, {})
                          ).length === 0 && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: (audit.totalDiffValue || 0) < 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
                        Rs {Math.abs(audit.totalDiffValue || 0).toLocaleString()}
                      </td>
                      <td>
                        <span className="inv-status-badge" style={{
                          color: audit.status === 'final' ? 'var(--success-light)' : 'var(--warning)',
                          background: audit.status === 'final' ? 'var(--success-bg)' : 'var(--warning-bg)'
                        }}>
                          {audit.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {audit.status === 'draft' ? (
                            <button className="btn btn-primary btn-sm" onClick={() => { setEditingAudit(audit); setActiveTab('audit'); }}>✏️ Edit</button>
                          ) : (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={() => setViewingAudit(audit)}>👁️ View</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => handlePrintAudit(audit)} title="Print / Download PDF">🖨️ Print</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>{editingId ? '✏️ Edit Ingredient' : '📦 Add Ingredient'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className="input-group">
              <label className="input-label">Ingredient Name *</label>
              <input
                id="invNameInput"
                className="input"
                placeholder="e.g. Chicken Breast"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Current Stock *</label>
                <input
                  id="invQtyInput"
                  className="input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Unit *</label>
                <select
                  id="invUnitSelect"
                  className="input"
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Low-Stock Alert Threshold</label>
                <input
                  id="invThresholdInput"
                  className="input"
                  type="number"
                  min="0"
                  placeholder={`e.g. 500 ${form.unit}`}
                  value={form.lowStockThreshold}
                  onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Cost per Unit (Rs)</label>
                <input
                  id="invCostInput"
                  className="input"
                  type="number"
                  min="0"
                  placeholder="optional"
                  value={form.costPerUnit}
                  onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button
                id="saveInvBtn"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.quantity === ''}
              >
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Ingredient'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Stock Modal ── */}
      {adjustItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAdjustItem(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>📊 Adjust Stock — {adjustItem.name}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setAdjustItem(null)}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Current Stock</span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)' }}>
                {(adjustItem.quantity ?? 0).toLocaleString()} {adjustItem.unit}
              </span>
            </div>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['add', '➕ Add'], ['remove', '➖ Remove'], ['set', '📌 Set To']].map(([key, label]) => (
                <button
                  key={key}
                  className={`btn ${adjustType === key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setAdjustType(key)}
                >{label}</button>
              ))}
            </div>

            <div className="input-group">
              <label className="input-label">
                {adjustType === 'add' ? `Amount to Add (${adjustItem.unit})` :
                  adjustType === 'remove' ? `Amount to Remove (${adjustItem.unit})` :
                    `Set Stock To (${adjustItem.unit})`}
              </label>
              <input
                id="adjustQtyInput"
                className="input"
                type="number"
                min="0"
                placeholder="0"
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                autoFocus
                style={{ fontSize: '1.1rem', fontWeight: 700 }}
              />
            </div>

            {/* Preview */}
            {adjustQty !== '' && !isNaN(parseFloat(adjustQty)) && (
              <div style={{ background: 'var(--bg-glass)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>New Stock Will Be</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                    {Math.max(0,
                      adjustType === 'set' ? parseFloat(adjustQty) :
                        adjustType === 'add' ? (adjustItem.quantity || 0) + parseFloat(adjustQty) :
                          (adjustItem.quantity || 0) - parseFloat(adjustQty)
                    ).toLocaleString()} {adjustItem.unit}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAdjustItem(null)}>Cancel</button>
              <button
                id="saveAdjustBtn"
                className="btn btn-primary"
                onClick={saveAdjust}
                disabled={saving || adjustQty === '' || isNaN(parseFloat(adjustQty))}
              >
                {saving ? 'Saving…' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewingAudit && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingAudit(null)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>📜 Audit Details</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewingAudit(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Date & Time</div>
                <div style={{ fontWeight: 600 }}>{viewingAudit.createdAt?.toDate ? new Date(viewingAudit.createdAt.toDate()).toLocaleString() : '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Audit By</div>
                <div style={{ fontWeight: 600 }}>{viewingAudit.user?.name || 'Admin'}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-glass)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Total Difference (Value)</span>
                <span style={{ fontWeight: 700, color: (viewingAudit.totalDiffValue || 0) < 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
                  Rs {Math.abs(viewingAudit.totalDiffValue || 0).toLocaleString()}
                </span>
              </div>

              {/* Quantity variance grouped by unit type */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Total Difference (Quantity) by Unit:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
                  {Object.entries(
                    (viewingAudit.items || []).reduce((acc, cur) => {
                      const lookupUnit = cur.unit || items.find(i => i.id === cur.id || i.name.toLowerCase() === cur.name.toLowerCase())?.unit || 'units';
                      const unit = lookupUnit.toLowerCase().trim();
                      const diffQty = cur.differenceQty !== undefined ? cur.differenceQty : (cur.difference || 0);
                      if (diffQty !== 0) {
                        if (!acc[unit]) acc[unit] = 0;
                        acc[unit] += diffQty;
                      }
                      return acc;
                    }, {})
                  ).map(([unit, val]) => (
                    <div key={unit} style={{ fontSize: '0.85rem', fontWeight: 700, color: val < 0 ? 'var(--danger-light)' : val > 0 ? 'var(--success-light)' : 'inherit' }}>
                      {val > 0 ? '+' : ''}{val.toFixed(2)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>{unit}</span>
                    </div>
                  ))}
                  {Object.keys(
                    (viewingAudit.items || []).reduce((acc, cur) => {
                      const lookupUnit = cur.unit || items.find(i => i.id === cur.id || i.name.toLowerCase() === cur.name.toLowerCase())?.unit || 'units';
                      const unit = lookupUnit.toLowerCase().trim();
                      const diffQty = cur.differenceQty !== undefined ? cur.differenceQty : (cur.difference || 0);
                      if (diffQty !== 0) {
                        if (!acc[unit]) acc[unit] = 0;
                        acc[unit] += diffQty;
                      }
                      return acc;
                    }, {})
                  ).length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No quantity variance</div>
                  )}
                </div>
              </div>

              {viewingAudit.remarks && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 6 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Remarks</div>
                  <div style={{ fontSize: '0.9rem' }}>{viewingAudit.remarks}</div>
                </div>
              )}
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th>System</th>
                    <th>Physical</th>
                    <th>Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingAudit.items?.map(item => {
                    const u = item.unit || items.find(i => i.id === item.id || i.name.toLowerCase() === item.name.toLowerCase())?.unit || '';
                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.systemStock?.toFixed(2)} {u}</td>
                        <td>{item.physicalCount?.toFixed(2)} {u}</td>
                        <td style={{ color: item.difference < 0 ? 'var(--danger-light)' : item.difference > 0 ? 'var(--success-light)' : 'inherit' }}>
                          {item.difference > 0 ? '+' : ''}{item.difference?.toFixed(2)} {u}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={() => handlePrintAudit(viewingAudit)}>🖨️ Print / Download</button>
              <button className="btn btn-secondary" onClick={() => setViewingAudit(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
