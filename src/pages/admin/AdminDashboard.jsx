import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function AdminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [renewTarget, setRenewTarget] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'restaurants'), snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    async function fetchPlans() {
      try {
        const snap = await getDocs(collection(db, 'subscription_plans'));
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching plans:", err);
      }
    }
    fetchPlans();

    return unsub;
  }, []);

  const active = restaurants.filter(r => r.status === 'active').length;
  
  const today = new Date();
  const overdueCount = restaurants.filter(r => {
    if (!r.paymentDueDate) return false;
    const due = new Date(r.paymentDueDate);
    return due < today;
  }).length;

  const dueSoonCount = restaurants.filter(r => {
    if (!r.paymentDueDate) return false;
    const due = new Date(r.paymentDueDate);
    const diff = (due - today) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 3;
  }).length;

  const totalMRR = restaurants
    .filter(r => r.status === 'active' && !r.isDemo)
    .reduce((acc, r) => {
      if (r.customPlanPrice) return acc + Number(r.customPlanPrice);
      const plan = plans.find(p => p.id === r.planId);
      return acc + (plan ? Number(plan.amount) : 0);
    }, 0);

  const stats = [
    { icon: '🏪', label: 'Total Restaurants', value: restaurants.length, color: 'var(--info)', bg: 'var(--info-bg)' },
    { icon: '💳', label: 'Projected MRR', value: `Rs ${totalMRR.toLocaleString()}`, color: 'var(--accent)', bg: 'rgba(245, 158, 11, 0.1)' },
    { icon: '🚫', label: 'Overdue Payments', value: overdueCount, color: 'var(--danger-light)', bg: 'var(--danger-bg)' },
    { icon: '⏳', label: 'Due Soon', value: dueSoonCount, color: 'var(--warning)', bg: 'var(--warning-bg)' },
  ];

  async function confirmRenew() {
    if (!renewTarget) return;
    setSaving(true);
    
    const r = renewTarget;
    const amount = r.customPlanPrice || plans.find(p => p.id === r.planId)?.amount || 0;
    const currentDue = r.paymentDueDate ? new Date(r.paymentDueDate) : new Date();
    const newDue = new Date(currentDue);
    newDue.setDate(newDue.getDate() + 30);
    const newDueDateStr = newDue.toISOString().split('T')[0];

    const historyEntry = {
      date: new Date().toISOString(),
      amount: Number(amount),
      planName: plans.find(p => p.id === r.planId)?.name || 'Custom',
      newDueDate: newDueDateStr
    };

    try {
      await updateDoc(doc(db, 'restaurants', r.id), {
        paymentDueDate: newDueDateStr,
        paymentHistory: [...(r.paymentHistory || []), historyEntry]
      });
      setSuccessMsg(`Subscription for ${r.name} has been extended to ${newDueDateStr}.`);
      setRenewTarget(null);
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">System overview — AR POS</p>
        </div>
      </div>

      <div className="content-area">
        <div className="stats-grid">
          {stats.map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon" style={{ background: s.bg }}><span style={{ fontSize: '1.3rem' }}>{s.icon}</span></div>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Recent restaurants */}
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>All Restaurants</h3>
          {restaurants.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🏪</div><h3>No restaurants</h3><p>Create your first restaurant account</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Restaurant','ID','Status','Subscription','Payment Due','Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map(r => {
                    const due = r.paymentDueDate ? new Date(r.paymentDueDate) : null;
                    const isOverdue = due && due < today;
                    const isDueSoon = due && (due - today) / (1000 * 60 * 60 * 24) <= 3 && !isOverdue;

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.name}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.id}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className={`badge ${r.status === 'active' ? 'badge-success' : r.status === 'blocked' ? 'badge-danger' : 'badge-warning'}`}>
                            {r.status === 'active' ? '✅ Active' : r.status === 'blocked' ? '🚫 Blocked' : '⚠️ Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700 }}>
                            Rs {(r.customPlanPrice ? Number(r.customPlanPrice) : (plans.find(p => p.id === r.planId)?.amount || 0)).toLocaleString()}
                          </div>
                          {r.isTrial && <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 800 }}>🎁 1-MONTH PROMO</div>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ color: isOverdue ? 'var(--danger-light)' : isDueSoon ? 'var(--warning)' : 'var(--text-muted)', fontSize: '0.82rem', fontWeight: (isOverdue || isDueSoon) ? 700 : 400 }}>
                            {r.paymentDueDate || '—'}
                          </div>
                          {isOverdue && <span style={{ fontSize: '0.65rem', color: 'var(--danger-light)', fontWeight: 800 }}>🚫 OVERDUE</span>}
                          {isDueSoon && <span style={{ fontSize: '0.65rem', color: 'var(--warning)', fontWeight: 800 }}>⏳ DUE SOON</span>}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {(isOverdue || isDueSoon) && (
                              <button 
                                onClick={() => setRenewTarget(r)}
                                style={{ background: 'var(--success)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                💰 Renew
                              </button>
                            )}
                            <a href={`/admin/dashboard/restaurants`} style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>Edit →</a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RENEW CONFIRMATION MODAL */}
      {renewTarget && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={e => e.target === e.currentTarget && setRenewTarget(null)}>
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center', padding: '30px 24px', border: '2px solid var(--success)', animation: 'popIn 0.3s ease' }}>
             <div style={{ fontSize: '4rem', marginBottom: 15 }}>💳</div>
             <h3 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Confirm Renewal</h3>
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 25 }}>
               You are logging a payment for <strong>{renewTarget.name}</strong>. This will extend their subscription by 30 days.
             </p>
             
             <div style={{ background: 'var(--bg-lighter)', padding: '15px', borderRadius: 12, marginBottom: 25, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Amount to Log</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--success-light)' }}>
                  Rs {(renewTarget.customPlanPrice || plans.find(p => p.id === renewTarget.planId)?.amount || 0).toLocaleString()}
                </div>
             </div>

             <div style={{ display: 'flex', gap: 10 }}>
               <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRenewTarget(null)} disabled={saving}>Cancel</button>
               <button className="btn btn-primary" style={{ flex: 2, background: 'var(--success)', borderColor: 'transparent' }} onClick={confirmRenew} disabled={saving}>
                 {saving ? 'Processing...' : 'Confirm & Renew'}
               </button>
             </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {successMsg && (
        <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setSuccessMsg('')}>
          <div className="modal" style={{ maxWidth: 350, textAlign: 'center', padding: '40px 24px', border: '2px solid var(--accent)', animation: 'popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
             <div style={{ fontSize: '5rem', marginBottom: 20 }}>✅</div>
             <h3 style={{ fontSize: '1.6rem', marginBottom: 10 }}>Done!</h3>
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: 25 }}>{successMsg}</p>
             <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setSuccessMsg('')}>Great!</button>
          </div>
        </div>
      )}
    </div>
  );
}
