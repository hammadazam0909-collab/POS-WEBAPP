import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, doc, updateDoc, getDocs } from 'firebase/firestore';

export default function RestaurantManager() {
  const [restaurants, setRestaurants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [blockReason, setBlockReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'restaurants'), snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const snap = await getDocs(collection(db, 'subscription_plans'));
        setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching plans:", err);
      }
    }
    fetchPlans();
  }, []);

  function openEdit(r) {
    setSelected(r);
    setEditForm({
      name: r.name || '',
      phone: r.phone || '',
      address: r.address || '',
      ownerPin: r.ownerPin || '',
      paymentDueDate: r.paymentDueDate || '',
      status: r.status || 'active',
      logo: r.logo || '',
      planId: r.planId || '',
      customPlanPrice: r.customPlanPrice || '',
      isTrial: r.isTrial || false,
      isDemo: r.isDemo || false,
      businessType: r.businessType || 'restaurant',
      updateFeatures: true,
    });
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      const selectedPlan = plans.find(p => p.id === editForm.planId);
      const { updateFeatures, isTrial, ...restForm } = editForm;
      const dataToSave = { 
        ...restForm,
        isTrial: isTrial || false,
        customPlanPrice: restForm.customPlanPrice ? Number(restForm.customPlanPrice) : null
      };
      
      if (updateFeatures && selectedPlan) {
        dataToSave.allowedPages = selectedPlan.allowedPages || [];
      }

      await updateDoc(doc(db, 'restaurants', selected.id), dataToSave);
      setSelected(null);
    } finally { setSaving(false); }
  }

  async function handleResubscribe() {
    if (!selected || !window.confirm("Are you sure you want to log a new payment and extend the subscription by 30 days?")) return;
    
    const amount = editForm.customPlanPrice || plans.find(p => p.id === editForm.planId)?.amount || 0;
    
    // Calculate new due date: Current Due Date + 30 days
    // If no current due date, use Today + 30 days
    const currentDue = editForm.paymentDueDate ? new Date(editForm.paymentDueDate) : new Date();
    const newDue = new Date(currentDue);
    newDue.setDate(newDue.getDate() + 30);
    const newDueDateStr = newDue.toISOString().split('T')[0];

    const historyEntry = {
      date: new Date().toISOString(),
      amount: Number(amount),
      planName: plans.find(p => p.id === editForm.planId)?.name || 'Custom',
      newDueDate: newDueDateStr
    };

    setSaving(true);
    try {
      await updateDoc(doc(db, 'restaurants', selected.id), {
        paymentDueDate: newDueDateStr,
        paymentHistory: [...(selected.paymentHistory || []), historyEntry]
      });
      // Update local state to reflect changes in UI
      setEditForm(f => ({ ...f, paymentDueDate: newDueDateStr }));
      setSelected(s => ({ ...s, paymentDueDate: newDueDateStr, paymentHistory: [...(s.paymentHistory || []), historyEntry] }));
      alert("Payment logged successfully! New due date: " + newDueDateStr);
    } catch (err) {
      alert("Error logging payment: " + err.message);
    } finally { setSaving(false); }
  }

  async function blockRestaurant() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'restaurants', selected.id), {
        status: 'blocked',
        blockedReason: blockReason || 'Blocked by admin',
      });
      setShowBlockModal(false); setBlockReason('');
    } finally { setSaving(false); }
  }

  async function unblockRestaurant(id) {
    await updateDoc(doc(db, 'restaurants', id), { status: 'active', blockedReason: '' });
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🏪 Restaurant Manager</h1>
        <p className="page-subtitle">View, edit, block and manage all restaurant accounts</p>
      </div>

      <div className="content-area">
        {restaurants.length === 0 ? (
          <div className="empty-state card"><div className="empty-state-icon">🏪</div><h3>No restaurants yet</h3><p>Create your first restaurant to get started</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {restaurants.map(r => (
              <div key={r.id} id={`rest-${r.id}`} className="card" style={{ padding: '18px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h4 style={{ margin: 0 }}>{r.name}</h4>
                      <span className={`badge ${r.status === 'active' ? 'badge-success' : r.status === 'blocked' ? 'badge-danger' : 'badge-warning'}`}>
                        {r.status === 'active' ? '✅ Active' : r.status === 'blocked' ? '🚫 Blocked' : '⚠️ Pending'}
                      </span>
                      <span className="badge badge-muted" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        {r.businessType === 'retail' ? '🛍️ Retail' : '🍽️ Restaurant'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span>🆔 {r.id}</span>
                      {r.phone && <span>📞 {r.phone}</span>}
                      {r.paymentDueDate && <span style={{ color: 'var(--warning)' }}>💳 Due: {r.paymentDueDate}</span>}
                      {r.planId && <span style={{ color: 'var(--accent)' }}>💳 Plan: {plans.find(p => p.id === r.planId)?.name || r.planId}</span>}
                    </div>
                    {r.status === 'blocked' && r.blockedReason && (
                      <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--danger-light)', background: 'var(--danger-bg)', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>
                        ⚠️ {r.blockedReason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button id={`editBtn-${r.id}`} className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>✏️ Edit</button>
                    {r.status !== 'blocked' ? (
                      <button id={`blockBtn-${r.id}`} className="btn btn-danger btn-sm" onClick={() => { setSelected(r); setShowBlockModal(true); }}>🚫 Block</button>
                    ) : (
                      <button id={`unblockBtn-${r.id}`} className="btn btn-success btn-sm" onClick={() => unblockRestaurant(r.id)}>✅ Unblock</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selected && !showBlockModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Edit — {selected.name}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕</button>
            </div>

            {[
              ['name','Restaurant Name','text'],
              ['phone','Phone','text'],
              ['address','Address','text'],
              ['ownerPin','Owner PIN (4 digits)','password'],
              ['paymentDueDate','Payment Due Date','date'],
            ].map(([key, label, type]) => (
              <div key={key} className="input-group">
                <label className="input-label">{label}</label>
                <input className="input" type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}

            <div className="input-group">
              <label className="input-label">Business Type</label>
              <select className="input" value={editForm.businessType || 'restaurant'} onChange={e => {
                const newType = e.target.value;
                setEditForm(f => ({ ...f, businessType: newType, planId: '' }));
              }}>
                <option value="restaurant">🍽️ Restaurant Mode</option>
                <option value="retail">🛍️ Retail Mode</option>
              </select>
            </div>

            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Subscription Plan</label>
                <select className="input" value={editForm.planId || ''} onChange={e => setEditForm(f => ({ ...f, planId: e.target.value }))}>
                  <option value="">None (Default features)</option>
                  {plans.filter(p => (p.planType || 'restaurant') === (editForm.businessType || 'restaurant')).map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Rs {p.amount})</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Custom Price (Rs)</label>
                <input className="input" type="number" placeholder="Override plan price" value={editForm.customPlanPrice || ''} onChange={e => setEditForm(f => ({ ...f, customPlanPrice: e.target.value }))} />
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -12, marginBottom: 18 }}>
              Determines features and billing amount. Custom price overrides the plan's default rate.
              <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--accent)' }}>
                  <input type="checkbox" checked={editForm.updateFeatures} onChange={e => setEditForm(f => ({ ...f, updateFeatures: e.target.checked }))} />
                  Update features immediately
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--success)' }}>
                  <input type="checkbox" checked={editForm.isTrial} onChange={e => setEditForm(f => ({ ...f, isTrial: e.target.checked }))} />
                  🎁 1-Month Promotion / Trial
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--info)' }}>
                  <input type="checkbox" checked={editForm.isDemo} onChange={e => setEditForm(f => ({ ...f, isDemo: e.target.checked }))} />
                  🧪 Demo Account
                </label>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Restaurant Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15, background: 'var(--bg-glass)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                <div style={{ width: 50, height: 50, borderRadius: 6, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {editForm.logo ? (
                    <img src={editForm.logo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontSize: '1.2rem' }}>🖼️</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      if (file.size > 500000) {
                        alert('Logo file too large. Please use an image under 500KB.');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => setEditForm(f => ({ ...f, logo: reader.result }));
                      reader.readAsDataURL(file);
                    }} 
                    style={{ fontSize: '0.8rem' }} 
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>JPG/PNG under 500KB</div>
                </div>
                {editForm.logo && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditForm(f => ({ ...f, logo: '' }))}>✕ Clear</button>
                )}
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
                <option value="pending_payment">Pending Payment</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Cancel</button>
              <button id="saveEditBtn" className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : '💾 Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && selected && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBlockModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>🚫 Block — {selected.name}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBlockModal(false)}>✕</button>
            </div>
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              This will immediately prevent all logins for this restaurant.
            </div>
            <div className="input-group">
              <label className="input-label">Block Reason</label>
              <textarea className="input" placeholder="e.g. Payment overdue since..." value={blockReason} onChange={e => setBlockReason(e.target.value)} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowBlockModal(false)}>Cancel</button>
              <button id="confirmBlockBtn" className="btn btn-danger" onClick={blockRestaurant} disabled={saving}>{saving ? 'Blocking...' : '🚫 Confirm Block'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
