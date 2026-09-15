import React, { useState } from 'react';
import { useOrders } from '../../hooks/useFirestore';
import { useSettings } from '../../context/SettingsContext';
import PinModal from '../../components/PinModal';
import './Owner.css';

export default function Orders() {
  const { orders, updateOrder } = useOrders();
  const { settings } = useSettings();

  // Cancel flow state
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showPinForCancel, setShowPinForCancel] = useState(false);

  const activeOrders = orders.filter(
    o => !['served', 'delivered', 'cancelled', 'billed', 'collected'].includes(o.status)
  );

  // ── Status change — intercept 'cancelled' ────────────────────
  function handleStatusChange(orderId, newStatus) {
    if (newStatus === 'cancelled') {
      setCancelTargetId(orderId);
      setCancelReason('');
    } else {
      updateOrder(orderId, { status: newStatus });
    }
  }

  // ── Confirm cancel (after reason entered) ────────────────────
  async function doCancel() {
    if (!cancelTargetId) return;
    await updateOrder(cancelTargetId, {
      status: 'cancelled',
      cancellationReason: cancelReason.trim() || 'No reason provided',
    });
    setCancelTargetId(null);
    setCancelReason('');
  }

  function confirmCancel() {
    if (settings.pinEnabled) {
      window.__pendingSave = doCancel;
      setShowPinForCancel(true);
    } else {
      doCancel();
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📋 Orders</h1>
        <p className="page-subtitle">All active orders across tables, delivery and takeaway</p>
      </div>

      <div className="content-area">
        <div className="queue-list">
          {activeOrders.length === 0 ? (
            <div className="empty-state card">
              <div className="empty-state-icon">📋</div>
              <h3>No active orders</h3>
              <p>All caught up! New orders can be placed from Tables, Delivery or Takeaway.</p>
            </div>
          ) : activeOrders.map(o => (
            <div key={o.id} className="queue-card">
              <div className="queue-card-header">
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <span className={`badge ${o.type === 'dine-in' ? 'badge-info' : o.type === 'delivery' ? 'badge-warning' : 'badge-success'}`}>
                      {o.type === 'dine-in' ? '🪑' : o.type === 'delivery' ? '🚗' : '🥡'} {o.type}
                    </span>
                    {o.type === 'dine-in' && <span className="badge badge-muted">Table {o.tableNumber}</span>}
                  </div>
                  <h4>{o.customerName || `Table ${o.tableNumber}`}</h4>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent)' }}>
                    Rs {o.totalAmount?.toLocaleString()}
                  </div>
                  {/* Status select — 'cancelled' triggers the modal */}
                  <select
                    className="input"
                    style={{ marginTop: 6, fontSize: '0.8rem', padding: '4px 8px', width: 'auto' }}
                    value={o.status}
                    onChange={e => handleStatusChange(o.id, e.target.value)}
                  >
                    {['pending','preparing','ready','served','cancelled'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="order-items-list">
                {o.items?.map((item, i) => (
                  <div key={i} className="order-item-row">
                    <span className="order-item-name">{item.name}</span>
                    <span className="order-item-qty">×{item.qty}</span>
                    <span className="order-item-price">Rs {(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {o.kitchenNote && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg-glass)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  📝 {o.kitchenNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Cancel Order Modal ──────────────────────────────────────── */}
      {cancelTargetId && !showPinForCancel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCancelTargetId(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🚫 Cancel Order</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setCancelTargetId(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 16 }}>
              This will permanently cancel the order. Please provide a reason.
            </p>
            <div className="input-group">
              <label className="input-label">Cancellation Reason</label>
              <textarea
                className="input"
                placeholder="e.g. Customer left, item unavailable..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                style={{ minHeight: 80, resize: 'vertical' }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setCancelTargetId(null)}>
                Keep Order
              </button>
              <button className="btn btn-danger" style={{ flex: 1, justifyContent: 'center' }} onClick={confirmCancel}>
                {settings.pinEnabled ? '🔐 Cancel Order' : '🚫 Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Modal for cancel ────────────────────────────────────── */}
      {showPinForCancel && (
        <PinModal
          title="🔐 Enter PIN to cancel order"
          onSuccess={async () => {
            setShowPinForCancel(false);
            if (window.__pendingSave) {
              await window.__pendingSave();
              window.__pendingSave = null;
            }
          }}
          onCancel={() => {
            setShowPinForCancel(false);
            window.__pendingSave = null;
            setCancelTargetId(null);
          }}
        />
      )}
    </div>
  );
}
