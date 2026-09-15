import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useMenu, useInventory } from '../../../hooks/useFirestore';
import { useAuth } from '../../../context/AuthContext';
import '../Owner.css';

export default function ProductManager() {
  const { restaurant } = useAuth();
  const { categories, loading, updateCategory, addCategory: addCategoryHook } = useMenu();
  const { items: inventoryItems } = useInventory();

  const [selectedCat, setSelectedCat] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', price: '', description: '' });
  const [catName, setCatName] = useState('');
  const [itemForm, setItemForm] = useState({ name: '', price: '', description: '' });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const [recipeTarget, setRecipeTarget] = useState(null);
  const [recipeDraft, setRecipeDraft] = useState([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSaving, setRecipeSaving] = useState(false);

  const handleImportCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaving(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data;
          const deptMap = {};

          data.forEach(rawRow => {
            const row = {};
            for (const key in rawRow) {
              const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase();
              row[cleanKey] = rawRow[key];
            }

            const dept = (row['department'] || 'Uncategorized').trim();
            if (!deptMap[dept]) deptMap[dept] = [];

            deptMap[dept].push({
              name: (row['item name'] || 'Unknown Product').trim(),
              price: 0,
              itemCode: (row['item code'] || '').trim(),
              available: true,
              description: '',
              recipe: [],
            });
          });

          for (const [deptName, items] of Object.entries(deptMap)) {
            const existingCat = categories.find(c => c.name.toLowerCase() === deptName.toLowerCase());
            if (existingCat) {
              const newItems = [...existingCat.items];
              items.forEach(newItem => {
                const idx = newItems.findIndex(i => i.name.toLowerCase() === newItem.name.toLowerCase());
                if (idx >= 0) newItems[idx] = { ...newItems[idx], ...newItem };
                else newItems.push(newItem);
              });
              await updateCategory(existingCat.id, { items: newItems });
            } else {
              await addCategoryHook({ name: deptName, items });
            }
          }
          alert('✅ CSV Products imported successfully!');
        } catch (err) {
          console.error(err);
          alert('Failed to import CSV: ' + err.message);
        } finally {
          setSaving(false);
          e.target.value = null;
        }
      },
      error: (error) => {
        alert('Error parsing CSV: ' + error.message);
        setSaving(false);
      }
    });
  };

  const cat = categories.find(c => c.id === selectedCat);

  async function addCategoryHandler() {
    if (!catName.trim()) return;
    setSaving(true);
    try {
      await addCategoryHook({ name: catName.trim(), items: [] });
      setCatName(''); setShowCatForm(false);
    } finally { setSaving(false); }
  }

  async function addItem() {
    if (!itemForm.name || !itemForm.price || !selectedCat) return;
    setSaving(true);
    try {
      const newItem = {
        name: itemForm.name,
        price: parseFloat(itemForm.price),
        description: itemForm.description,
        available: true,
        recipe: [],
      };
      const existing = cat?.items || [];
      await updateCategory(selectedCat, { items: [...existing, newItem] });
      setItemForm({ name: '', price: '', description: '' });
      setShowItemForm(false);
    } finally { setSaving(false); }
  }

  async function toggleItemAvailability(catId, itemName, current) {
    const catData = categories.find(c => c.id === catId);
    const updated = catData.items.map(i => i.name === itemName ? { ...i, available: !current } : i);
    await updateCategory(catId, { items: updated });
  }

  async function deleteItem(catId, itemName) {
    const catData = categories.find(c => c.id === catId);
    const updated = catData.items.filter(i => i.name !== itemName);
    await updateCategory(catId, { items: updated });
  }

  function openEditItem(catId, index, item) {
    setEditingItem({ catId, index });
    setEditForm({ name: item.name, price: String(item.price ?? ''), description: item.description || '' });
  }

  async function saveEditItem() {
    if (!editForm.name.trim() || editForm.price === '') return;
    setSaving(true);
    try {
      const catData = categories.find(c => c.id === editingItem.catId);
      const updated = catData.items.map((item, i) =>
        i === editingItem.index
          ? { ...item, name: editForm.name.trim(), price: parseFloat(editForm.price), description: editForm.description }
          : item
      );
      await updateCategory(editingItem.catId, { items: updated });
      setEditingItem(null);
    } finally { setSaving(false); }
  }

  async function deleteCategory(catId) {
    if (!window.confirm('Delete this category and all its products?')) return;
    const { db } = await import('../../../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId));
    if (selectedCat === catId) setSelectedCat(null);
  }

  function openRecipeEditor(catId, index, item) {
    setRecipeTarget({ catId, index, itemName: item.name });
    setRecipeDraft(item.recipe ? item.recipe.map(r => ({ ...r })) : []);
    setRecipeSearch('');
  }

  function addIngredientToRecipe(invItem) {
    if (recipeDraft.find(r => r.inventoryId === invItem.id)) return;
    setRecipeDraft(d => [...d, {
      inventoryId: invItem.id,
      inventoryName: invItem.name,
      quantity: 1,
      unit: invItem.unit || 'g',
    }]);
    setRecipeSearch('');
  }

  function updateRecipeIngredient(inventoryId, field, value) {
    setRecipeDraft(d => d.map(r => r.inventoryId === inventoryId ? { ...r, [field]: value } : r));
  }

  function removeRecipeIngredient(inventoryId) {
    setRecipeDraft(d => d.filter(r => r.inventoryId !== inventoryId));
  }

  async function saveRecipe() {
    if (!recipeTarget) return;
    setRecipeSaving(true);
    try {
      const catData = categories.find(c => c.id === recipeTarget.catId);
      const updated = catData.items.map((item, i) =>
        i === recipeTarget.index ? { ...item, recipe: recipeDraft } : item
      );
      await updateCategory(recipeTarget.catId, { items: updated });
      setRecipeTarget(null);
    } finally { setRecipeSaving(false); }
  }

  const getItemCost = (recipe) => {
    if (!recipe || recipe.length === 0) return 0;
    return recipe.reduce((total, ing) => {
      const invItem = inventoryItems.find(i => i.id === ing.inventoryId);
      const unitCost = invItem ? parseFloat(invItem.costPerUnit || 0) : 0;
      return total + (parseFloat(ing.quantity || 0) * unitCost);
    }, 0);
  };

  const recipeInventoryResults = inventoryItems.filter(inv =>
    !recipeDraft.find(r => r.inventoryId === inv.id) &&
    (recipeSearch.trim() === '' || inv.name.toLowerCase().includes(recipeSearch.toLowerCase()))
  ).slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📦 Product Manager</h1>
        <p className="page-subtitle">Manage your retail categories and products</p>
      </div>

      <div className="content-area">
        <div className="two-col" style={{ gridTemplateColumns: '260px 1fr' }}>
          <div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>Categories</h4>
                  <button id="addCatBtn" className="btn btn-primary btn-sm" onClick={() => setShowCatForm(true)} disabled={saving} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>+ Add</button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="file"
                    accept=".csv"
                    style={{ display: 'none' }}
                    ref={fileInputRef}
                    onChange={handleImportCSV}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={saving} style={{ flex: 1, padding: '5px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span>📥</span> {saving ? 'Importing…' : 'Import CSV'}
                  </button>
                </div>
              </div>
              {loading ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {categories.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        id={`cat-${c.name}`}
                        className={`sidebar-link ${selectedCat === c.id ? 'active' : ''}`}
                        style={{
                          flex: 1,
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          outline: 'none',
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderRadius: '8px',
                          background: selectedCat === c.id ? 'rgba(245,158,11,0.12)' : 'transparent',
                          color: selectedCat === c.id ? 'var(--accent)' : 'var(--text-secondary)'
                        }}
                        onClick={() => setSelectedCat(c.id)}
                      >
                        <span style={{ fontWeight: selectedCat === c.id ? 700 : 500 }}>{c.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '12px' }}>
                          {c.items?.length || 0}
                        </span>
                      </button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => deleteCategory(c.id)}>🗑</button>
                    </div>
                  ))}
                  {categories.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No categories yet</p>}
                </div>
              )}
            </div>
          </div>

          <div>
            {!selectedCat ? (
              <div className="empty-state card"><div className="empty-state-icon">👈</div><h3>Select a category</h3><p>Choose a category to manage its products</p></div>
            ) : (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3>{cat?.name}</h3>
                  <button id="addItemBtn" className="btn btn-primary btn-sm" onClick={() => setShowItemForm(true)}>+ Add Product</button>
                </div>
                {cat?.items?.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📦</div><h3>No products yet</h3><p>Add your first product</p></div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Product / Code', 'Price', 'Recipe', 'Available', 'Actions'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cat.items.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              {item.itemCode && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Code: {item.itemCode}</div>}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ color: 'var(--accent)', fontWeight: 700 }}>Rs {item.price?.toLocaleString()}</div>
                              {item.recipe?.length > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, fontWeight: 500 }}>
                                  Cost: Rs {getItemCost(item.recipe).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '10px 12px' }}>
                              <button
                                id={`recipeBtn-${item.name}`}
                                className="btn btn-secondary btn-sm"
                                onClick={() => openRecipeEditor(selectedCat, i, item)}
                                title={item.recipe?.length ? `Assembly: ${item.recipe.length} parts` : 'Set assembly'}
                                style={item.recipe?.length ? { borderColor: 'rgba(16,185,129,0.5)', color: 'var(--success-light)' } : {}}
                              >
                                {item.recipe?.length ? `✅ ${item.recipe.length} parts` : '🧪 Set Assembly'}
                              </button>
                            </td>

                            <td style={{ padding: '10px 12px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={item.available !== false} onChange={() => toggleItemAvailability(selectedCat, item.name, item.available !== false)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
                                <span style={{ fontSize: '0.8rem', color: item.available !== false ? 'var(--success)' : 'var(--danger)' }}>
                                  {item.available !== false ? 'Available' : 'Sold Out'}
                                </span>
                              </label>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  id={`editItem-${item.name}`}
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => openEditItem(selectedCat, i, item)}
                                  title="Edit product"
                                >✏️ Edit</button>
                                <button id={`deleteItem-${item.name}`} className="btn btn-danger btn-sm" onClick={() => deleteItem(selectedCat, item.name)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showCatForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Add Category</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCatForm(false)}>✕</button>
            </div>
            <div className="input-group">
              <label className="input-label">Category Name</label>
              <input className="input" placeholder="e.g. Gift Items, Snacks..." value={catName} onChange={e => setCatName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && addCategoryHandler()} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCatForm(false)}>Cancel</button>
              <button id="saveCatBtn" className="btn btn-primary" onClick={addCategoryHandler} disabled={saving}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showItemForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowItemForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Add Product to {cat?.name}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowItemForm(false)}>✕</button>
            </div>
            <div className="input-group">
              <label className="input-label">Product Name *</label>
              <input className="input" placeholder="e.g. Gift Box" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="input-group">
              <label className="input-label">Price (Rs) *</label>
              <input className="input" type="number" placeholder="0" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input className="input" placeholder="Optional description" value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowItemForm(false)}>Cancel</button>
              <button id="saveItemBtn" className="btn btn-primary" onClick={addItem} disabled={saving}>Save Product</button>
            </div>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingItem(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Edit Product</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingItem(null)}>✕</button>
            </div>
            <div className="input-group">
              <label className="input-label">Product Name *</label>
              <input className="input" placeholder="Product name" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="input-group">
              <label className="input-label">Price (Rs) *</label>
              <input className="input" type="number" placeholder="0" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="input-group">
              <label className="input-label">Description</label>
              <input className="input" placeholder="Optional description" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditingItem(null)}>Cancel</button>
              <button id="saveEditItemBtn" className="btn btn-primary" onClick={saveEditItem} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {recipeTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setRecipeTarget(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div>
                <h3>🧪 Assembly — {recipeTarget.itemName}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Define which inventory items get deducted when this product is sold
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setRecipeTarget(null)}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Product Assembly ({recipeDraft.length})
              </div>

              {recipeDraft.length === 0 ? (
                <div className="recipe-no-ingredients">
                  No assembly parts yet — search below to add
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 32px', gap: 8, padding: '4px 10px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    <span>Part / Product</span><span>Qty per sale</span><span>Unit</span><span />
                  </div>
                  {recipeDraft.map(ing => (
                    <div key={ing.inventoryId} className="recipe-ingredient-row">
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ing.inventoryName}
                      </div>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="any"
                        value={ing.quantity}
                        onChange={e => updateRecipeIngredient(ing.inventoryId, 'quantity', parseFloat(e.target.value) || 0)}
                        style={{ padding: '4px 8px', fontSize: '0.85rem', textAlign: 'right' }}
                      />
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>{ing.unit}</div>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding: '3px 7px' }}
                        onClick={() => removeRecipeIngredient(ing.inventoryId)}
                        title="Remove assembly item"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Add Part from Inventory
              </div>
              {inventoryItems.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '10px 0' }}>
                  ⚠️ No inventory items yet. <a href="/owner/inventory" style={{ color: 'var(--accent)' }}>Go to Inventory</a> to add items first.
                </div>
              ) : (
                <>
                  <div className="menu-search-wrap" style={{ marginBottom: 8 }}>
                    <span className="menu-search-icon">🔍</span>
                    <input
                      id="recipeIngredientSearch"
                      className="input menu-search-input"
                      placeholder="Search items…"
                      value={recipeSearch}
                      onChange={e => setRecipeSearch(e.target.value)}
                      autoFocus={recipeDraft.length > 0}
                    />
                    {recipeSearch && <button className="menu-search-clear" onClick={() => setRecipeSearch('')}>✕</button>}
                  </div>

                  {(recipeSearch.trim() !== '' || recipeDraft.length === 0) && recipeInventoryResults.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {recipeInventoryResults.map(inv => (
                        <button
                          key={inv.id}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => addIngredientToRecipe(inv)}
                        >
                          + {inv.name}
                          <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontSize: '0.72rem' }}>({inv.quantity} {inv.unit})</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {recipeSearch.trim() !== '' && recipeInventoryResults.length === 0 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No matching inventory items found.</div>
                  )}
                </>
              )}
            </div>

            {recipeDraft.length > 0 && (
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--success-light)' }}>✅ Assembly set!</strong> When 1× <strong>{recipeTarget.itemName}</strong> is sold, the following will be deducted:&nbsp;
                {recipeDraft.map((r, i) => (
                  <span key={r.inventoryId}>{r.quantity}{r.unit} {r.inventoryName}{i < recipeDraft.length - 1 ? ', ' : '.'}</span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setRecipeTarget(null)}>Cancel</button>
              <button
                id="saveRecipeBtn"
                className="btn btn-primary"
                onClick={saveRecipe}
                disabled={recipeSaving}
              >
                {recipeSaving ? 'Saving…' : '✅ Save Assembly'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
