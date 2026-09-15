import React, { useMemo } from 'react';
import { useOrders, useInventory } from '../../../hooks/useFirestore';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../../context/SettingsContext';
import '../Owner.css';

function getBusinessDate(date, openTime = '00:00', closeTime = '23:59') {
  const d = date?.toDate ? date.toDate() : new Date(date);
  const ot = typeof openTime === 'string' ? openTime : '00:00';
  const ct = typeof closeTime === 'string' ? closeTime : '23:59';
  const [openH, openM] = ot.split(':').map(Number);
  const [closeH, closeM] = ct.split(':').map(Number);
  
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  const currentMins = d.getHours() * 60 + d.getMinutes();
  
  const businessDate = new Date(d);
  
  if (closeMins < openMins) {
    if (currentMins >= closeMins && currentMins < openMins) {
      // Closed
    } else if (currentMins < closeMins) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  } else {
    if (currentMins < openMins) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  }
  return businessDate;
}

function formatLocalDate(date) {
  const d = date?.toDate ? date.toDate() : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function RetailDashboard() {
  const { restaurant } = useAuth();
  const { settings } = useSettings();
  const { orders } = useOrders(null, {});
  const { items: inventoryItems } = useInventory();
  const navigate = useNavigate();

  const lowStockCount = useMemo(() => {
    return inventoryItems.filter(item => {
      const minLimit = Number(item.minLimit) || 0;
      const currentQty = Number(item.quantity) || 0;
      return currentQty <= minLimit;
    }).length;
  }, [inventoryItems]);

  const stats = useMemo(() => {
    const todayBizDateStr = formatLocalDate(getBusinessDate(new Date(), settings?.openTime, settings?.closeTime));

    const todayOrders = orders.filter(o => {
      const dateToCheck = o.orderPlacedAt || o.billedAt;
      if (!dateToCheck) return false;
      const bizDateStr = formatLocalDate(getBusinessDate(dateToCheck, settings?.openTime, settings?.closeTime));
      return bizDateStr === todayBizDateStr;
    });

    const revenue = todayOrders
      .filter(o => ['billed', 'served', 'delivered', 'collected'].includes(o.status))
      .reduce((s, o) => s + ((o.totalAmount || 0) - (o.refundedAmount || 0)), 0);

    const todayCount = todayOrders.filter(o => o.status !== 'cancelled').length;

    const itemsSoldToday = todayOrders
      .filter(o => ['billed', 'served', 'delivered', 'collected'].includes(o.status))
      .reduce((sum, o) => sum + (o.items?.reduce((s, i) => s + (Number(i.qty) || 0), 0) || 0), 0);

    return { revenue, todayCount, itemsSoldToday };
  }, [orders, settings?.openTime, settings?.closeTime]);

  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => {
        const ta = a.orderPlacedAt?.toDate ? a.orderPlacedAt.toDate() : new Date(a.orderPlacedAt || 0);
        const tb = b.orderPlacedAt?.toDate ? b.orderPlacedAt.toDate() : new Date(b.orderPlacedAt || 0);
        return tb - ta;
      })
      .slice(0, 8);
  }, [orders]);

  const statCards = [
    {
      icon: '💰',
      label: "Today's Revenue",
      sub: `${stats.todayCount} sales`,
      value: `Rs ${stats.revenue.toLocaleString()}`,
      color: 'var(--accent)',
      bg: 'rgba(245,158,11,0.1)',
    },
    {
      icon: '🧾',
      label: "Today's Sales",
      sub: 'completed sales',
      value: stats.todayCount,
      color: 'var(--info)',
      bg: 'var(--info-bg)',
    },
    {
      icon: '📦',
      label: 'Items Sold Today',
      sub: 'total item units',
      value: stats.itemsSoldToday,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    {
      icon: '⚠️',
      label: 'Low Stock Items',
      sub: 'require replenishment',
      value: lowStockCount,
      color: 'var(--danger-light)',
      bg: 'var(--danger-bg)',
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back, {restaurant?.name} 👋</p>
      </div>

      <div className="content-area">
        <div className="stats-grid">
          {statCards.map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg }}>
                <span style={{ fontSize: '1.3rem' }}>{s.icon}</span>
              </div>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Quick Actions</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button id="qaTakeaway" className="btn btn-primary" onClick={() => navigate('/owner/takeaway')}>🛒 POS Checkout</button>
            <button id="qaInventory" className="btn btn-secondary" onClick={() => navigate('/owner/inventory')}>📦 Inventory</button>
            <button id="qaVendors" className="btn btn-secondary" onClick={() => navigate('/owner/vendors')}>🤝 Vendors</button>
            <button id="qaHistory"  className="btn btn-secondary" onClick={() => navigate('/owner/history')}>📜 History</button>
            <button id="qaAnalytics" className="btn btn-secondary" onClick={() => navigate('/owner/analytics')}>📊 Analytics</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Recent Transactions</h3>
          {recentOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No sales yet</h3>
              <p>Start processing checkouts to see them here</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Sale ID', 'Customer / Cashier', 'Items', 'Amount', 'Status', 'Time'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        #{o.id?.slice(-5).toUpperCase()}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                        {o.customerName || 'Walk-in'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{o.items?.length || 0} items</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                        Rs {(o.totalAmount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${o.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>
                          {o.status === 'cancelled' ? '❌ Cancelled' : '✅ Collected'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {o.orderPlacedAt?.toDate ? o.orderPlacedAt.toDate().toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
