import React, { useState, useMemo, useEffect } from 'react';
import './Owner.css';

export default function StockAudit({ items, updateItem, user, addAudit, updateAudit, editingAudit, clearEditingAudit }) {
  const [auditStarted, setAuditStarted] = useState(false);
  const [physicalCounts, setPhysicalCounts] = useState({}); // { itemId: value }
  const [remarks, setRemarks] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'matched' | 'variance'

  useEffect(() => {
    if (editingAudit) {
      setAuditStarted(true);
      setRemarks(editingAudit.remarks || '');
      const counts = {};
      editingAudit.items?.forEach(i => {
        counts[i.id] = i.physicalCount;
      });
      setPhysicalCounts(counts);
    }
  }, [editingAudit]);

  const auditDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const auditTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Calculate differences
  const auditData = useMemo(() => {
    return items.map(item => {
      const systemStock = parseFloat(item.quantity || 0);
      const physicalCount = physicalCounts[item.id] !== undefined ? parseFloat(physicalCounts[item.id]) : systemStock;
      const difference = physicalCount - systemStock;
      const valueDiff = difference * parseFloat(item.costPerUnit || 0);

      let status = 'Matched';
      if (difference !== 0) status = 'Variance';

      return {
        ...item,
        systemStock,
        physicalCount,
        difference,
        valueDiff,
        status
      };
    });
  }, [items, physicalCounts]);

  const filteredData = useMemo(() => {
    let list = auditData;
    if (search.trim()) {
      list = list.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()));
    }
    if (filter === 'matched') {
      list = list.filter(i => i.status === 'Matched');
    }
    if (filter === 'variance') {
      list = list.filter(i => i.status === 'Variance');
    }
    return list;
  }, [auditData, search, filter]);

  const totalDiffQty = auditData.reduce((acc, cur) => acc + cur.difference, 0);
  const totalDiffValue = auditData.reduce((acc, cur) => acc + cur.valueDiff, 0);
  const varianceCount = auditData.filter(i => i.status === 'Variance').length;
  const matchedCount = auditData.filter(i => i.status === 'Matched').length;

  const groupedUnitDiffs = useMemo(() => {
    const diffs = {};
    auditData.forEach(item => {
      if (item.difference !== 0) {
        const unit = (item.unit || 'units').toLowerCase().trim();
        if (!diffs[unit]) {
          diffs[unit] = 0;
        }
        diffs[unit] += item.difference;
      }
    });
    return diffs;
  }, [auditData]);

  const handleCountChange = (itemId, val) => {
    setPhysicalCounts(prev => ({ ...prev, [itemId]: val }));
  };

  const handleFinalize = async () => {
    if (!window.confirm('Are you sure you want to finalize this audit? This will lock the records and automatically adjust your system inventory to match the physical counts.')) return;

    try {
      const payload = {
        date: auditDate,
        time: auditTime,
        user: user || { name: 'Admin' },
        totalDiffQty,
        totalDiffValue,
        remarks,
        status: 'final',
        items: auditData.map(i => ({
          id: i.id,
          name: i.name,
          systemStock: i.systemStock,
          physicalCount: i.physicalCount,
          difference: i.difference,
          valueDiff: i.valueDiff,
          unit: i.unit || ''
        }))
      };

      if (editingAudit?.id) {
        await updateAudit(editingAudit.id, payload);
        clearEditingAudit();
      } else {
        await addAudit(payload);
      }

      // Automatically apply adjustments to system stock
      for (const item of auditData) {
        if (item.difference !== 0) {
          await updateItem(item.id, { quantity: item.physicalCount });
        }
      }

      alert('Audit finalized and system stock adjusted successfully!');
      setAuditStarted(false);
    } catch (err) {
      console.error(err);
      alert('Failed to finalize audit.');
    }
  };


  const handleSaveDraft = async () => {
    try {
      const payload = {
        date: auditDate,
        time: auditTime,
        user: user || { name: 'Admin' },
        totalDiffQty,
        totalDiffValue,
        remarks,
        status: 'draft',
        items: auditData.map(i => ({
          id: i.id,
          name: i.name,
          systemStock: i.systemStock,
          physicalCount: i.physicalCount,
          difference: i.difference,
          valueDiff: i.valueDiff,
          unit: i.unit || ''
        }))
      };

      if (editingAudit?.id) {
        await updateAudit(editingAudit.id, payload);
        clearEditingAudit();
      } else {
        await addAudit(payload);
      }

      alert('Draft saved successfully!');
      setAuditStarted(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save draft.');
    }
  };

  if (!auditStarted) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
        <h3>Closing Stock Audit</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Compare system stock with physical count to identify differences and control wastage.</p>
        <button className="btn btn-primary btn-lg" onClick={() => setAuditStarted(true)}>🚀 Start New Audit</button>
      </div>
    );
  }

  return (
    <div className="stock-audit-container">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Closing Stock Audit</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Compare system stock with physical count</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input className="input" type="text" value={auditDate} readOnly style={{ width: 150 }} />
          </div>
          <button className="btn btn-primary" onClick={() => alert('History view not implemented')}>📜 Audit History</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="inv-stat-card">
          <div className="inv-stat-icon">🕒</div>
          <div>
            <div className="inv-stat-value" style={{ fontSize: '1rem' }}>{auditTime}</div>
            <div className="inv-stat-label">Started At</div>
          </div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-icon">👤</div>
          <div>
            <div className="inv-stat-value" style={{ fontSize: '1rem' }}>{user?.name || 'Admin'}</div>
            <div className="inv-stat-label">Audit By</div>
          </div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-icon">📦</div>
          <div>
            <div className="inv-stat-value">{items.length}</div>
            <div className="inv-stat-label">Total Items</div>
          </div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-icon">⚖️</div>
          <div>
            <div className="inv-stat-value" style={{ color: totalDiffQty < 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
              {totalDiffQty.toFixed(2)}
            </div>
            <div className="inv-stat-label">Total Diff (Qty)</div>
          </div>
        </div>
        <div className="inv-stat-card">
          <div className="inv-stat-icon">💰</div>
          <div>
            <div className="inv-stat-value" style={{ color: totalDiffValue < 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
              Rs {Math.abs(totalDiffValue).toLocaleString()}
            </div>
            <div className="inv-stat-label">Total Diff (Value)</div>
          </div>
        </div>
      </div>

      {/* Banner */}
      <div className="inv-alert-banner" style={{ marginBottom: 20 }}>
        <span>ℹ️</span>
        <span>Enter the physical count for each ingredient. Difference is calculated as: <strong>Physical Count - System Stock = Difference</strong></span>
      </div>

      {/* Controls */}
      <div className="inv-controls" style={{ marginBottom: 20 }}>
        <div className="menu-search-wrap" style={{ flex: 1, maxWidth: 340, marginBottom: 0 }}>
          <span className="menu-search-icon">🔍</span>
          <input
            className="input menu-search-input"
            placeholder="Search ingredients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['all', `All (${items.length})`], ['matched', `Matched (${matchedCount})`], ['variance', `Variance (${varianceCount})`]].map(([key, label]) => (
            <button
              key={key}
              className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setFilter(key)}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <table className="inv-table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>System Stock</th>
              <th>Physical Count</th>
              <th>Difference (Qty)</th>
              <th>Difference (Value)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.systemStock.toFixed(2)} {item.unit}</td>
                <td>
                  <input
                    type="number"
                    className="input btn-sm"
                    style={{ width: 80, textAlign: 'right' }}
                    value={physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : item.systemStock}
                    onChange={e => handleCountChange(item.id, e.target.value)}
                  />
                  <span style={{ marginLeft: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.unit}</span>
                </td>
                <td style={{ color: item.difference < 0 ? 'var(--danger-light)' : item.difference > 0 ? 'var(--success-light)' : 'inherit' }}>
                  {item.difference > 0 ? '+' : ''}{item.difference.toFixed(2)}
                </td>
                <td style={{ color: item.valueDiff < 0 ? 'var(--danger-light)' : item.valueDiff > 0 ? 'var(--success-light)' : 'inherit' }}>
                  {item.valueDiff !== 0 ? `Rs ${Math.abs(item.valueDiff).toLocaleString()}` : '—'}
                </td>
                <td>
                  <span className={`inv-status-badge ${item.status === 'Variance' ? 'inv-qty-low' : 'inv-qty-ok'}`} style={{
                    color: item.status === 'Variance' ? 'var(--warning)' : 'var(--success-light)',
                    background: item.status === 'Variance' ? 'var(--warning-bg)' : 'var(--success-bg)'
                  }}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <div>
          <label className="input-label">Remarks</label>
          <textarea
            className="input"
            placeholder="Add any notes about today's audit (wastage, expiry, spillage, staff meal, etc.)"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            style={{ minHeight: 100 }}
          />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Summary</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Total Items</span>
            <span>{items.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span>Matched Items</span>
            <span style={{ color: 'var(--success-light)' }}>{matchedCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span>Variance Items</span>
            <span style={{ color: 'var(--warning)' }}>{varianceCount}</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 8 }}>
              <span>Total Diff (Value)</span>
              <span style={{ color: totalDiffValue < 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
                Rs {Math.abs(totalDiffValue).toLocaleString()}
              </span>
            </div>

            {Object.keys(groupedUnitDiffs).length > 0 && (
              <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>Qty Diff by Unit:</div>
                {Object.entries(groupedUnitDiffs).map(([unit, val]) => (
                  <div key={unit} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{unit}</span>
                    <span style={{ fontWeight: 700, color: val < 0 ? 'var(--danger-light)' : val > 0 ? 'var(--success-light)' : 'inherit' }}>
                      {val > 0 ? '+' : ''}{val.toFixed(2)} {unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn btn-secondary" onClick={() => setAuditStarted(false)}>Cancel Audit</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleSaveDraft}>💾 Save as Draft</button>
          <button className="btn btn-primary" onClick={handleFinalize}>🏁 Finalize Audit</button>
        </div>
      </div>
    </div>
  );
}
