import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOrders } from '../../hooks/useFirestore';
import { useTimer } from '../../hooks/useTimer';
import { useNavigate } from 'react-router-dom';
import './Kitchen.css';

const DINE_MAX = 1800;
const DELIVERY_MAX = 2700;

function KitchenTimer({ orderPlacedAt, maxTime, stopped }) {
  const { urgency, elapsedDisplay, remainingDisplay } = useTimer(orderPlacedAt, maxTime, stopped);
  const cls = `kt-timer kt-timer-${urgency}`;
  return (
    <div className={cls}>
      <span>⏱</span>
      <span>{elapsedDisplay}</span>
      {urgency === 'overdue' ? <span className="kt-overdue-badge">LATE</span> : <span>({remainingDisplay} left)</span>}
    </div>
  );
}


export default function KitchenDisplay() {
  const { restaurant, logout } = useAuth();
  const navigate = useNavigate();
  const { orders: allOrders, updateOrder } = useOrders();
  const [filter, setFilter] = useState('all');
  const prevPendingCount = useRef(0);
  const prevNewItemsCount = useRef(0);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const audioRef = useRef(new Audio('/notification.wav'));

  // Mobile audio unlock on first interaction
  useEffect(() => {
    const unlock = () => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          document.removeEventListener('click', unlock);
          console.log('Audio unlocked successfully');
        }).catch(e => console.error('Audio unlock failed:', e));
      }
    };
    document.addEventListener('click', unlock);
    return () => document.removeEventListener('click', unlock);
  }, []);

  // Active kitchen orders only
  const orders = allOrders.filter(o =>
    ['pending', 'preparing', 'ready', 'out-for-delivery'].includes(o.status)
  );

  // Sound alert on new order or reload with pending orders
  useEffect(() => {
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const currentNewItemsCount = orders.reduce((acc, o) => acc + (o.items?.filter(i => i.isNew).length || 0), 0);
    
    const playSound = () => {
      audioRef.current.loop = true;
      audioRef.current.play().catch(e => console.error('Audio play failed:', e));
      setTimeout(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }, 5000);
    };

    if (!initialCheckDone) {
      if (pendingCount > 0 || currentNewItemsCount > 0) {
        playSound();
      }
      setInitialCheckDone(true);
    } else {
      if (pendingCount > prevPendingCount.current || currentNewItemsCount > prevNewItemsCount.current) {
        playSound();
      }
    }
    prevPendingCount.current = pendingCount;
    prevNewItemsCount.current = currentNewItemsCount;
  }, [orders, initialCheckDone]);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.type === filter);

  async function markItemDone(orderId, itemIndex) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    const items = order.items.map((i, idx) => idx === itemIndex ? { ...i, status: i.status === 'done' ? 'pending' : 'done' } : i);
    await updateOrder(orderId, { items });
  }

  async function markReady(orderId) {
    await updateOrder(orderId, { status: 'ready' });
  }

  async function markPreparing(orderId) {
    await updateOrder(orderId, { status: 'preparing' });
  }

  return (
    <div className="kitchen-root">
      {/* Header */}
      <div className="kitchen-header">
        <div className="kitchen-header-left">
          <div className="kitchen-logo">
            <img src="/logo.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="kitchen-title">Kitchen Display</div>
            <div className="kitchen-rest">{restaurant?.name}</div>
          </div>
        </div>

        <div className="kitchen-filters">
          {[['all','All'],['dine-in','🪑 Dine-in'],['delivery','🚗 Delivery'],['takeaway','🥡 Takeaway']].map(([key, label]) => (
            <button key={key} id={`kf-${key}`} className={`kf-btn ${filter === key ? 'kf-btn-active' : ''}`} onClick={() => setFilter(key)}>
              {label}
              {key !== 'all' && <span className="kf-count">{orders.filter(o => o.type === key).length}</span>}
              {key === 'all' && <span className="kf-count">{orders.length}</span>}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

          <button id="kitchenLogout" className="btn btn-secondary btn-sm" onClick={() => { logout(); navigate('/'); }}>
            🚪 Exit
          </button>
        </div>
      </div>

      {/* Tickets grid */}
      {filtered.length === 0 ? (
        <div className="kitchen-empty">
          <div style={{ fontSize: '4rem', marginBottom: 16 }}>🍳</div>
          <h2>All caught up!</h2>
          <p>No pending orders right now</p>
        </div>
      ) : (
        <div className="kitchen-grid">
          {filtered.map(order => {
            const maxTime = order.type === 'delivery' ? DELIVERY_MAX : DINE_MAX;
            const urgency = getUrgency(order.orderPlacedAt, maxTime);
            const allDone = order.items?.every(i => i.status === 'done');
            return (
              <div key={order.id} id={`ticket-${order.id}`} className={`kitchen-ticket kt-${urgency} ${order.status === 'pending' ? 'kt-blink' : ''}`}>
                {/* Ticket header */}
                <div className="kt-header">
                  <div className="kt-type-badge">
                    {order.type === 'dine-in' ? `🪑 Table ${order.tableNumber}` : order.type === 'delivery' ? '🚗 Delivery' : '🥡 Takeaway'}
                  </div>
                  <KitchenTimer orderPlacedAt={order.orderPlacedAt} maxTime={maxTime} stopped={order.status === 'ready'} />
                </div>

                {order.customerName && (
                  <div className="kt-customer">{order.customerName}</div>
                )}

                {/* Items */}
                <div className="kt-items">
                  {order.items?.map((item, i) => (
                    <div
                      key={i}
                      id={`item-${order.id}-${i}`}
                      className={`kt-item ${item.status === 'done' ? 'kt-item-done' : ''}`}
                      onClick={() => markItemDone(order.id, i)}
                    >
                      <div className="kt-item-check">{item.status === 'done' ? '✓' : ''}</div>
                      <span className="kt-item-qty">×{item.qty}</span>
                      <span className="kt-item-name">
                        {item.name}
                        {item.isNew && <span style={{ background: '#ffc107', color: '#000', fontSize: '0.7rem', padding: '3px 6px', borderRadius: '4px', marginLeft: 8, fontWeight: '900', boxShadow: '0 0 5px rgba(0,0,0,0.3)' }}>NEW</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {order.kitchenNote && (
                  <div className="kt-note">📝 {order.kitchenNote}</div>
                )}

                {/* Actions */}
                <div className="kt-actions">
                  {order.status === 'pending' && (
                    <button id={`startBtn-${order.id}`} className="kt-btn kt-btn-start" onClick={() => markPreparing(order.id)}>
                      👨‍🍳 Start Preparing
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button id={`readyBtn-${order.id}`} className={`kt-btn kt-btn-ready ${allDone ? 'kt-btn-ready-pulse' : ''}`} onClick={() => markReady(order.id)}>
                      ✅ Mark Ready
                    </button>
                  )}
                  {order.status === 'ready' && (
                    <div className="kt-ready-label">✅ READY — Waiting for pickup</div>
                  )}
                  {order.status === 'out-for-delivery' && (
                    <div className="kt-ready-label">🚗 Out for Delivery</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getUrgency(orderPlacedAt, max) {
  if (!orderPlacedAt) return 'safe';
  const startMs = orderPlacedAt?.toDate ? orderPlacedAt.toDate().getTime() : new Date(orderPlacedAt).getTime();
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  if (elapsed > max) return 'overdue';
  if (elapsed / max >= 0.85) return 'danger';
  if (elapsed / max >= 0.5) return 'warning';
  return 'safe';
}
