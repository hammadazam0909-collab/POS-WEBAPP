import React, { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const AVAILABLE_PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tables', label: 'Dine-in (Tables)' },
  { id: 'takeaway', label: 'Takeaway' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'orders', label: 'Kitchen & Active Orders' },
  { id: 'menu', label: 'Menu Manager' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'vendors', label: 'Vendor Management' },
  { id: 'staff', label: 'Staff' },
  { id: 'history', label: 'Order History' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' }
];

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  const [form, setForm] = useState({
    id: '',
    name: '',
    amount: '',
    planType: 'restaurant',
    allowedPages: ['dashboard', 'settings']
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscription_plans'), snap => {
      setPlans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  function handleAdd() {
    setIsEdit(false);
    setForm({
      id: '',
      name: '',
      amount: '',
      planType: 'restaurant',
      allowedPages: ['dashboard', 'settings']
    });
    setShowModal(true);
  }

  function handleEdit(plan) {
    setIsEdit(true);
    setForm({
      id: plan.id,
      name: plan.name || '',
      amount: plan.amount || '',
      planType: plan.planType || 'restaurant',
      allowedPages: plan.allowedPages || []
    });
    setShowModal(true);
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this subscription plan?')) return;
    try {
      await deleteDoc(doc(db, 'subscription_plans', id));
    } catch (err) {
      alert('Error deleting plan: ' + err.message);
    }
  }

  function togglePage(pageId) {
    setForm(prev => {
      const allowed = prev.allowedPages;
      if (allowed.includes(pageId)) {
        return { ...prev, allowedPages: allowed.filter(p => p !== pageId) };
      } else {
        return { ...prev, allowedPages: [...allowed, pageId] };
      }
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name || form.amount === '') {
      alert('Name and amount are required');
      return;
    }
    setSaving(true);
    try {
      const planData = {
        name: form.name,
        amount: Number(form.amount),
        planType: form.planType || 'restaurant',
        allowedPages: form.allowedPages,
        updatedAt: new Date().toISOString()
      };

      if (isEdit) {
        await updateDoc(doc(db, 'subscription_plans', form.id), planData);
      } else {
        const newId = form.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        await setDoc(doc(db, 'subscription_plans', newId), {
          ...planData,
          createdAt: new Date().toISOString()
        });
      }
      setShowModal(false);
    } catch (err) {
      alert('Error saving plan: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredPlans = plans.filter(p => {
    const type = p.planType || 'restaurant';
    return activeTab === 'all' || type === activeTab;
  });

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">💳 Subscription Plans</h1>
            <p className="page-subtitle">Manage subscription tiers and allowed features</p>
          </div>
          <button className="btn btn-primary" onClick={handleAdd}>+ Add Plan</button>
        </div>
      </div>

      <div className="content-area">
        {/* Tabs for Plan Types */}
        <div className="menu-categories" style={{ marginBottom: 20 }}>
          <button className={`cat-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Tiers</button>
          <button className={`cat-btn ${activeTab === 'restaurant' ? 'active' : ''}`} onClick={() => setActiveTab('restaurant')}>🍽️ Restaurant Plans</button>
          <button className={`cat-btn ${activeTab === 'retail' ? 'active' : ''}`} onClick={() => setActiveTab('retail')}>🛍️ Retail Plans</button>
        </div>

        {filteredPlans.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-state-icon">💳</div>
            <h3>No Subscription Plans</h3>
            <p>Create your first plan to start managing features</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {filteredPlans.map(plan => (
              <div key={plan.id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, color: 'var(--accent)' }}>{plan.name}</h3>
                    <span className={`badge ${plan.planType === 'retail' ? 'badge-info' : 'badge-success'}`} style={{ marginTop: 6, display: 'inline-block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                      {plan.planType === 'retail' ? '🛍️ Retail Plan' : '🍽️ Restaurant Plan'}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>
                    Rs {Number(plan.amount).toLocaleString()}
                  </div>
                </div>
                <div style={{ flex: 1, marginBottom: 16 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Included Features:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(plan.allowedPages || []).map(pageId => {
                      const page = AVAILABLE_PAGES.find(p => p.id === pageId);
                      return (
                        <span key={pageId} style={{ background: 'var(--bg-lighter)', padding: '4px 8px', borderRadius: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {page ? page.label : pageId}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleEdit(plan)}>✏️ Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(plan.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{isEdit ? '✏️ Edit Plan' : '➕ New Plan'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSave}>
              <div className="input-group">
                <label className="input-label">Plan Name *</label>
                <input className="input" placeholder="e.g. Basic, Premium, Gold" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
              </div>

              <div className="input-group">
                <label className="input-label">Monthly Amount (Rs) *</label>
                <input className="input" type="number" placeholder="e.g. 5000" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>

              <div className="input-group">
                <label className="input-label">Plan Type *</label>
                <select className="input" value={form.planType || 'restaurant'} onChange={e => {
                  const newType = e.target.value;
                  const validPages = newType === 'retail' 
                    ? form.allowedPages.filter(p => !['tables', 'orders', 'delivery'].includes(p))
                    : form.allowedPages;
                  setForm(f => ({ ...f, planType: newType, allowedPages: validPages }));
                }} required>
                  <option value="restaurant">🍽️ Restaurant Plan</option>
                  <option value="retail">🛍️ Retail Plan</option>
                </select>
              </div>

              <div className="input-group">
                <label className="input-label">Allowed Features / Pages</label>
                <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, maxHeight: 200, overflowY: 'auto' }}>
                  {AVAILABLE_PAGES.filter(page => {
                    if (form.planType === 'retail') {
                      return !['tables', 'orders', 'delivery'].includes(page.id);
                    }
                    return true;
                  }).map(page => {
                    let displayLabel = page.label;
                    if (form.planType === 'retail') {
                      if (page.id === 'takeaway') displayLabel = 'POS Checkout';
                      if (page.id === 'menu') displayLabel = 'Product Manager';
                    }
                    return (
                      <label key={page.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={form.allowedPages.includes(page.id)}
                          onChange={() => togglePage(page.id)}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                        />
                        <span>{displayLabel}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Plan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
