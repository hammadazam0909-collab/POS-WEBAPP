import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';

export default function Promotions() {
  const [promotions, setPromotions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    id: '',
    name: '',
    planId: '',
    discountType: 'percentage', // 'percentage' or 'flat'
    discountValue: '',
    isActive: true
  });

  useEffect(() => {
    const unsubPromos = onSnapshot(collection(db, 'promotions'), snap => {
      setPromotions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    const fetchPlans = async () => {
      const snap = await getDocs(collection(db, 'subscription_plans'));
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchPlans();

    return unsubPromos;
  }, []);

  function handleAdd() {
    setIsEdit(false);
    setForm({
      id: '',
      name: '',
      planId: '',
      discountType: 'percentage',
      discountValue: '',
      isActive: true
    });
    setShowModal(true);
  }

  function handleEdit(promo) {
    setIsEdit(true);
    setForm({
      id: promo.id,
      name: promo.name || '',
      planId: promo.planId || '',
      discountType: promo.discountType || 'percentage',
      discountValue: promo.discountValue || '',
      isActive: promo.isActive !== undefined ? promo.isActive : true
    });
    setShowModal(true);
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this promotion?')) return;
    try {
      await deleteDoc(doc(db, 'promotions', id));
    } catch (err) {
      alert('Error deleting promotion: ' + err.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name || !form.planId || form.discountValue === '') {
      alert('All fields are required');
      return;
    }
    setSaving(true);
    try {
      const promoData = {
        name: form.name,
        planId: form.planId,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        isActive: form.isActive,
        updatedAt: new Date().toISOString()
      };

      if (isEdit) {
        await updateDoc(doc(db, 'promotions', form.id), promoData);
      } else {
        const newId = `promo_${Date.now()}`;
        await setDoc(doc(db, 'promotions', newId), {
          ...promoData,
          createdAt: new Date().toISOString()
        });
      }
      setShowModal(false);
    } catch (err) {
      alert('Error saving promotion: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🎁 Promotions</h1>
            <p className="page-subtitle">Manage discounts for subscription plans</p>
          </div>
          <button className="btn btn-primary" onClick={handleAdd}>+ Add Promotion</button>
        </div>
      </div>

      <div className="content-area">
        {promotions.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-state-icon">🎁</div>
            <h3>No Promotions</h3>
            <p>Create your first promotion to offer discounts on plans</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {promotions.map(promo => {
              const plan = plans.find(p => p.id === promo.planId);
              return (
                <div key={promo.id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--accent)' }}>{promo.name}</h3>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Plan: {plan?.name || promo.planId}</div>
                    </div>
                    <span className={`badge ${promo.isActive ? 'badge-success' : 'badge-muted'}`}>
                      {promo.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ flex: 1, marginBottom: 16 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                      {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : `Rs ${Number(promo.discountValue).toLocaleString()} OFF`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleEdit(promo)}>✏️ Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(promo.id)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{isEdit ? '✏️ Edit Promotion' : '➕ New Promotion'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="input-group">
                <label className="input-label">Promotion Name *</label>
                <input className="input" placeholder="e.g. Eid Special, Ramadan Deal" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              <div className="input-group">
                <label className="input-label">Target Plan *</label>
                <select className="input" value={form.planId} onChange={e => setForm(f => ({ ...f, planId: e.target.value }))} required>
                  <option value="">Select a plan</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.planType === 'retail' ? '🛍️ (Retail)' : '🍽️ (Restaurant)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid-2">
                <div className="input-group">
                  <label className="input-label">Discount Type *</label>
                  <select className="input" value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Amount (Rs)</option>
                  </select>
                </div>
                <div className="input-group">
                  <label className="input-label">Value *</label>
                  <input className="input" type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} required />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textTransform: 'none' }}>
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 18, height: 18 }} />
                  Promotion is Active
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Promotion'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
