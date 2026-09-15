import React, { useMemo } from 'react';
import { useOrders, useTables } from '../../../hooks/useFirestore';
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
      // Closed period
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

export default function OwnerDashboard() {
  const { restaurant } = useAuth();
  const { settings } = useSettings();
  const { orders } = useOrders(null, {});
  const { tables } = useTables();
  const navigate = useNavigate();

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

    const activeOrders = orders.filter(
      o => !['served', 'delivered', 'collected', 'cancelled', 'billed'].includes(o.status)
    );

    const occupiedTableIds = new Set(
      orders
        .filter(o => !['cancelled', 'billed'].includes(o.status) && o.type === 'dine-in')
        .map(o => o.tableId)
        .filter(Boolean)
    );
    const occupiedCount = occupiedTableIds.size;

    const pendingDelivery = orders.filter(
      o => o.type === 'delivery' && !['delivered', 'cancelled', 'billed'].includes(o.status)
    );

    const todayCount = todayOrders.filter(o => o.status !== 'cancelled').length;

    return { revenue, activeOrders, occupiedCount, pendingDelivery, todayCount };
  }, [orders, tables, settings?.openTime, settings?.closeTime]);

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
      sub: `${stats.todayCount} orders`,
      value: `Rs ${stats.revenue.toLocaleString()}`,
      color: 'var(--accent)',
      bg: 'rgba(245,158,11,0.1)',
    },
    {
      icon: '📋',
      label: 'Active Orders',
      sub: 'across all types',
      value: stats.activeOrders.length,
      color: 'var(--info)',
      bg: 'var(--info-bg)',
    },
    {
      icon: '🪑',
      label: 'Occupied Tables',
      sub: `of ${tables.length} total`,
      value: `${stats.occupiedCount} / ${tables.length}`,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
    },
    {
      icon: '🚗',
      label: 'Pending Delivery',
      sub: 'not yet delivered',
      value: stats.pendingDelivery.length,
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
            <button id="qaTables"   className="btn btn-primary"   onClick={() => navigate('/owner/tables')}>🪑 Manage Tables</button>
            <button id="qaNewOrder" className="btn btn-secondary" onClick={() => navigate('/owner/orders')}>📋 View Orders</button>
            <button id="qaDelivery" className="btn btn-secondary" onClick={() => navigate('/owner/delivery')}>🚗 New Delivery</button>
            <button id="qaTakeaway" className="btn btn-secondary" onClick={() => navigate('/owner/takeaway')}>🥡 New Takeaway</button>
            <button id="qaHistory"  className="btn btn-secondary" onClick={() => navigate('/owner/history')}>📜 History</button>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Recent Orders</h3>
          {recentOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <h3>No orders yet</h3>
              <p>Start taking orders to see them here</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Type','Customer/Table','Items','Amount','Status','Time'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${o.type === 'dine-in' ? 'badge-info' : o.type === 'delivery' ? 'badge-warning' : 'badge-success'}`}>
                          {o.type === 'dine-in' ? '🪑' : o.type === 'delivery' ? '🚗' : '🥡'} {o.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                        {o.type === 'dine-in' ? `Table ${o.tableNumber || '—'}` : o.customerName || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{o.items?.length || 0} items</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>
                        Rs {(o.totalAmount || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <StatusBadge status={o.status} />
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

function StatusBadge({ status }) {
  const map = {
    pending:   ['badge-warning', '⏳ Pending'],
    preparing: ['badge-info',    '👨‍🍳 Preparing'],
    ready:     ['badge-success', '✅ Ready'],
    served:    ['badge-muted',   '🍽️ Served'],
    delivered: ['badge-muted',   '📦 Delivered'],
    collected: ['badge-muted',   '🥡 Collected'],
    billed:    ['badge-warning', '💰 Billed'],
    cancelled: ['badge-danger',  '❌ Cancelled'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
