import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';

export default function PaymentHistory() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'restaurants'), snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Extract all payment history entries from all restaurants
  const allPayments = restaurants.flatMap(r => 
    (r.paymentHistory || []).map(p => ({
      ...p,
      restaurantId: r.id,
      restaurantName: r.name,
      isDemo: r.isDemo
    }))
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalRevenue = allPayments
    .filter(p => !p.isDemo)
    .reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">📜 Payment History</h1>
          <p className="page-subtitle">Complete log of all subscription payments and renewals</p>
        </div>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Collection</div>
           <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--success-light)' }}>Rs {totalRevenue.toLocaleString()}</div>
        </div>
      </div>

      <div className="content-area">
        {loading ? (
          <div className="empty-state card"><div className="spinner" /></div>
        ) : allPayments.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-state-icon">📜</div>
            <h3>No payment records</h3>
            <p>Once you log payments from the dashboard, they will appear here.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    {['Date', 'Restaurant', 'Plan', 'Amount Paid', 'New Expiry'].map(h => (
                      <th key={h} style={{ padding: '16px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 600 }}>{new Date(p.date).toLocaleDateString()}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(p.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.restaurantName}</div>
                          {p.isDemo && <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>🧪 DEMO</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {p.restaurantId}</div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ background: 'var(--bg-lighter)', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', border: '1px solid var(--border)' }}>
                           {p.planName}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--success-light)' }}>
                          Rs {Number(p.amount).toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--info)' }}>{p.newDueDate}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Extension Granted</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
