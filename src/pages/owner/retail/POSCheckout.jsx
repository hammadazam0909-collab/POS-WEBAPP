import React, { useState } from 'react';
import { useOrders, useMenu, deductInventoryForItems } from '../../../hooks/useFirestore';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import PinModal from '../../../components/PinModal';
import '../Owner.css';

export default function POSCheckout() {
  const { orders, addOrder, updateOrder } = useOrders('takeaway');
  const { categories } = useMenu();
  const { restaurant } = useAuth();
  const { settings } = useSettings();
  const [form, setForm] = useState({ customerName: '', phone: '', pickupTime: '', note: '' });
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [showFinalBill, setShowFinalBill] = useState(false);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showPinModal, setShowPinModal] = useState(false);
  const [discountType, setDiscountType] = useState('pkr'); // 'pkr' | 'pct'
  const [discountInput, setDiscountInput] = useState('');

  const [cartDiscountType, setCartDiscountType] = useState('pkr'); // 'pkr' | 'pct'
  const [cartDiscountInput, setCartDiscountInput] = useState('');

  function addToCart(item) {
    setCart(c => {
      const e = c.find(i => i.name === item.name);
      if (e) return c.map(i => i.name === item.name ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { ...item, qty: 1 }];
    });
  }

  function changeQty(name, delta) {
    setCart(c => c.map(i => i.name === name ? { ...i, qty: Math.max(1, (Number(i.qty) || 0) + delta) } : i));
  }

  function handleQtyChange(name, value) {
    const val = parseInt(value, 10);
    if (!isNaN(val) && val >= 1) {
      setCart(c => c.map(i => i.name === name ? { ...i, qty: val } : i));
    } else if (value === '') {
      setCart(c => c.map(i => i.name === name ? { ...i, qty: '' } : i));
    }
  }

  function handleQtyBlur(name, qty) {
    const val = parseInt(qty, 10);
    if (isNaN(val) || val < 1) {
      setCart(c => c.map(i => i.name === name ? { ...i, qty: 1 } : i));
    }
  }

  function removeFromCart(name) {
    setCart(c => c.filter(i => i.name !== name));
  }

  const subtotal = cart.reduce((s, i) => s + i.price * (Number(i.qty) || 0), 0);
  const tax = Math.round(subtotal * ((settings.taxRate || 0) / 100));
  const cartDiscVal = parseFloat(cartDiscountInput) || 0;
  const cartDiscountAmount = cartDiscountType === 'pct' ? Math.round((subtotal + tax) * (cartDiscVal / 100)) : cartDiscVal;
  const total = Math.max(0, subtotal + tax - cartDiscountAmount);

  async function handleCheckout() {
    if (!selectedOrderForBill) return;
    setSaving(true);
    try {
      const val = parseFloat(discountInput) || 0;
      const orderSub = selectedOrderForBill.subtotal || 0;
      const orderTax = selectedOrderForBill.tax || 0;
      let discountAmount = 0;
      if (discountType === 'pct') {
        discountAmount = Math.round((orderSub + orderTax) * (val / 100));
      } else {
        discountAmount = val;
      }
      const newTotal = Math.max(0, (orderSub + orderTax) - discountAmount);

      const cashRecVal = parseFloat(cashReceived) || 0;
      const changeAmt = Math.max(0, cashRecVal - newTotal);

      const docRef = await addOrder({
        type: 'takeaway',
        customerName: selectedOrderForBill.customerName,
        phone: selectedOrderForBill.phone || '',
        pickupTime: selectedOrderForBill.pickupTime || '',
        kitchenNote: selectedOrderForBill.kitchenNote || '',
        items: selectedOrderForBill.items,
        subtotal: selectedOrderForBill.subtotal,
        tax: selectedOrderForBill.tax,
        totalAmount: newTotal,
        status: 'collected',
        paymentMethod: paymentMethod,
        discountAmount: discountAmount,
        discountType: discountType,
        discountValue: discountInput,
        cashReceived: cashRecVal,
        changeGiven: changeAmt,
      });
      const finalOrderId = docRef.id;

      if (selectedOrderForBill.items?.length > 0) {
        await deductInventoryForItems(restaurant?.id, selectedOrderForBill.items);
        await updateOrder(finalOrderId, { inventorySynced: true });
      }

      printReceipt({
        id: finalOrderId,
        customerName: selectedOrderForBill.customerName,
        items: selectedOrderForBill.items,
        subtotal: selectedOrderForBill.subtotal,
        tax: selectedOrderForBill.tax,
        totalAmount: newTotal,
        discountAmount: discountAmount,
        cashReceived: cashRecVal,
        changeGiven: changeAmt,
        paymentMethod: paymentMethod,
      });

      setCart([]);
      setForm({ customerName: '', phone: '', pickupTime: '', note: '' });
      setCartDiscountInput('');
      setCartDiscountType('pkr');
      setShowFinalBill(false);
      setSelectedOrderForBill(null);
      setCashReceived('');
      setDiscountInput('');
      setDiscountType('pkr');
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelOrder(orderId) {
    const action = async () => {
      try {
        await updateOrder(orderId, { status: 'cancelled' });
      } catch (err) {
        alert("Error: " + err.message);
      }
    };
    window.__pendingSave = action;
    setShowPinModal(true);
  }

  const baseItems = activeCategory
    ? categories.find(c => c.id === activeCategory)?.items || []
    : categories.flatMap(c => c.items || []);

  const displayItems = searchTerm
    ? baseItems.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : baseItems;

  function printReceipt(o) {
    const items = o.items || [];
    const rows = items.map(i =>
      `<tr>
        <td style="padding:2px 2px; text-transform:lowercase; text-align:left">${i.name}</td>
        <td style="padding:2px 6px; text-align:right">${i.price}</td>
        <td style="padding:2px 6px; text-align:center">${Number(i.qty).toFixed(2)}</td>
        <td style="padding:2px 2px; text-align:right">${(i.price * i.qty)}</td>
      </tr>`
    ).join('');
    const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    const invoiceNote = settings?.invoiceText ? `<div style="margin-top:8px; font-size:10px; text-align:left; color:#333; white-space:pre-wrap">${settings.invoiceText}</div>` : '';
    const cashRec = o.cashReceived || o.paidAmount || 0;
    const changeRet = o.changeGiven !== undefined ? o.changeGiven : (cashRec > (o.totalAmount || 0) ? cashRec - (o.totalAmount || 0) : 0);

    const html = `<html><head><title>Receipt</title>
      <style>
        @page { margin: 0; }
        body{font-family: 'Courier New', Courier, monospace; font-size:12px; font-weight:600; padding:8px; max-width:300px; margin:0 auto; color:#000}
        .text-center{text-align:center}
        .bold{font-weight:bold}
        .logo-wrap{text-align:center; margin-bottom:5px}
        .logo-wrap img{max-width:100px; max-height:60px; object-fit:contain}
        .header-title{font-size:14px; font-weight:bold; margin:5px 0}
        .restaurant-name{font-size:15px; font-weight:bold; margin-bottom:8px}
        .meta-row{display:flex; justify-content:space-between; margin-bottom:2px; font-weight:600}
        .line-dashed{border-top:1px dashed #000; margin:5px 0}
        table{width:100%; border-collapse:collapse}
        th{border-top:1px dashed #000; border-bottom:1px dashed #000; padding:5px 0; font-size:11px; font-weight:900; text-transform:capitalize}
        td{font-size:12px; font-weight:700; padding:2px 0}
        .footer{margin-top:12px; font-size:10px; font-weight:600; line-height:1.4}
        @media print {
          body { margin: 0; padding: 5px; }
        }
      </style></head>
      <body>
        <div class="logo-wrap">
          ${restaurant?.logo ? `<img src="${restaurant.logo}" alt="Logo" />` : '<h2>LOGO</h2>'}
        </div>
        <div class="text-center bold header-title">Sales Invoice</div>
        <div class="text-center bold restaurant-name">${restaurant?.name || 'Retail Shop'}</div>
        
        <div class="meta-row"><span>Mop: ${o.paymentMethod || 'Cash'}</span></div>
        <div class="meta-row"><span>Receipt #: ${o.id?.slice(-5) || 'NEW'}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
        <div class="meta-row"><span>Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString()}</span></div>
        <div class="meta-row"><span>Mode: RETAIL SALE</span></div>
        
        <div class="text-center bold" style="margin:10px 0">Invoice Number: ${o.id?.slice(-6).toUpperCase() || 'NEW'}</div>
        
        <div class="meta-row"><span>Cashier: ${o.customerName || 'Walk-in'}</span>${o.phone ? `<span>Phone: ${o.phone}</span>` : ''}</div>
        
        <table>
          <thead><tr><th style="text-align:left; width:45%; padding:5px 2px">Item</th><th style="text-align:right; width:20%; padding:5px 6px">Price</th><th style="text-align:center; width:15%; padding:5px 6px">Qty</th><th style="text-align:right; width:20%; padding:5px 2px">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        
        <div class="line-dashed"></div>
        <div class="meta-row"><span>Total Items:</span><span>${totalQty.toFixed(2)}</span></div>
        <div class="meta-row"><span>Subtotal:</span><span>${(o.subtotal || 0).toLocaleString()}</span></div>
        <div class="meta-row"><span>Tax:</span><span>${(o.tax || 0).toLocaleString()}</span></div>
        <div class="meta-row bold"><span>Total Without Discount:</span><span>${((o.subtotal || 0) + (o.tax || 0)).toLocaleString()}</span></div>
        
        ${o.discountAmount ? `
        <div class="meta-row" style="color:red"><span>Discount (${Math.round((o.discountAmount / ((o.subtotal || 0) + (o.tax || 0))) * 100)}%):</span><span>- Rs ${(o.discountAmount || 0).toLocaleString()}</span></div>
        ` : ''}
        
        <div class="line-dashed"></div>
        <div class="meta-row bold" style="font-size:13px"><span>Net Payable:</span><span>${(o.totalAmount || 0).toLocaleString()}</span></div>

        ${cashRec > 0 ? `
        <div class="meta-row"><span>Cash Received:</span><span>Rs ${cashRec.toLocaleString()}</span></div>
        <div class="meta-row bold" style="font-size:12px"><span>Return Amount:</span><span>Rs ${changeRet.toLocaleString()}</span></div>
        ` : ''}

        ${invoiceNote}

        <div class="footer">
          <div>Thank you for your business.</div>
          <div>For Contact: ${restaurant?.phone || ''}</div>
          <div class="text-center" style="margin-top:10px; font-weight:bold">AR POS | 0322-4776071</div>
        </div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 400); }
  }

  const completedOrders = orders.filter(o => o.status === 'collected').slice(0, 10);

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">🛒 POS Register</h1>
            <p className="page-subtitle">Process retail sales and checkouts</p>
          </div>
        </div>
      </div>

      <div className="content-area">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Inline POS Checkout Register */}
          <div className="delivery-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, alignItems: 'start' }}>
            
            {/* Left Side: Product Selection */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>📦 Select Products</h3>
                <div style={{ width: '220px' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ padding: '6px 12px', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div className="menu-categories" style={{ marginBottom: 16 }}>
                <button className={`cat-btn ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>All</button>
                {categories.map(c => (
                  <button key={c.id} className={`cat-btn ${activeCategory === c.id ? 'active' : ''}`} onClick={() => setActiveCategory(c.id)}>{c.name}</button>
                ))}
              </div>

              <div className="menu-items-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', maxHeight: '420px', overflowY: 'auto' }}>
                {displayItems.filter(i => i.available !== false).map((item, idx) => (
                  <button key={idx} className="menu-item-btn" onClick={() => addToCart(item)} style={{ padding: '12px' }}>
                    <div className="menu-item-name" style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                    <div className="menu-item-price" style={{ color: 'var(--accent)', fontWeight: 700, marginTop: 4 }}>Rs {item.price?.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Side: Cart Details & Checkout */}
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ margin: 0 }}>🛒 Sales Cart</h3>
              
              <div className="input-group">
                <label className="input-label">Cashier / Order Taker *</label>
                <select
                  className="input"
                  value={(settings.orderTakers || []).includes(form.customerName) ? form.customerName : ''}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                >
                  <option value="">Select Name</option>
                  {(settings.orderTakers || []).map((name, idx) => (
                    <option key={idx} value={name}>{name}</option>
                  ))}
                </select>
                <div style={{ textAlign: 'center', margin: '4px 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>— OR —</div>
                <input 
                  className="input" 
                  placeholder="Walk-in Customer Name" 
                  value={!(settings.orderTakers || []).includes(form.customerName) ? form.customerName : ''} 
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} 
                />
              </div>

              <div className="order-items-list" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                {cart.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>Cart is empty</div>
                ) : (
                  cart.map(item => (
                    <div key={item.name} className="order-item-row" style={{ padding: '6px 0' }}>
                      <span className="order-item-name" style={{ fontWeight: 600 }}>{item.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px' }} onClick={() => changeQty(item.name, -1)}>−</button>
                        <input
                          type="number"
                          className="qty-input-inline"
                          value={item.qty}
                          onChange={e => handleQtyChange(item.name, e.target.value)}
                          onBlur={e => handleQtyBlur(item.name, e.target.value)}
                          style={{
                            width: '40px',
                            textAlign: 'center',
                            fontWeight: 700,
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            padding: '2px 0',
                          }}
                        />
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px' }} onClick={() => changeQty(item.name, 1)}>+</button>
                        <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }} onClick={() => removeFromCart(item.name)}>✕</button>
                      </div>
                      <span className="order-item-price">Rs {(item.price * (Number(item.qty) || 0)).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 4, padding: 10, background: 'var(--bg-glass)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>🏷️ Discount</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn ${cartDiscountType === 'pkr' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '2px 10px', fontSize: '0.75rem' }}
                    onClick={() => setCartDiscountType('pkr')}
                  >Rs</button>
                  <button
                    type="button"
                    className={`btn ${cartDiscountType === 'pct' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '2px 10px', fontSize: '0.75rem' }}
                    onClick={() => setCartDiscountType('pct')}
                  >%</button>
                  <input
                    type="number"
                    className="input"
                    placeholder={cartDiscountType === 'pkr' ? 'Discount (Rs)' : 'Discount (%)'}
                    value={cartDiscountInput}
                    onChange={e => setCartDiscountInput(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '2px 6px' }}
                  />
                </div>
              </div>

              <div className="order-total-row"><span>Subtotal</span><span>Rs {subtotal.toLocaleString()}</span></div>
              <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {tax.toLocaleString()}</span></div>
              {cartDiscountAmount > 0 && (
                <div className="order-total-row">
                  <span>Discount</span>
                  <span style={{ color: 'var(--danger-light)' }}>- Rs {cartDiscountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="order-total-row grand"><span>Total</span><span>Rs {total.toLocaleString()}</span></div>
              
              <button
                id="retailCheckoutBtn"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => {
                  const tempOrder = {
                    customerName: form.customerName || 'Walk-in',
                    phone: form.phone,
                    pickupTime: form.pickupTime,
                    kitchenNote: form.note,
                    items: cart.map(i => ({ name: i.name, qty: Number(i.qty) || 1, price: i.price, status: 'pending', recipe: i.recipe || [] })),
                    subtotal,
                    tax,
                    discountAmount: cartDiscountAmount,
                    discountType: cartDiscountType,
                    discountValue: cartDiscountInput,
                    totalAmount: total,
                  };
                  setSelectedOrderForBill(tempOrder);
                  setDiscountType(cartDiscountType);
                  setDiscountInput(cartDiscountInput);
                  setShowFinalBill(true);
                }}
                disabled={cart.length === 0 || saving}
              >
                {saving ? '⏳...' : '💳 Checkout / Pay'}
              </button>
            </div>

          </div>

          {/* Recent Sales Journal */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12 }}>📜 Recent Transactions</h3>
            {completedOrders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No sales processed yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      {['Receipt #', 'Customer / Cashier', 'Date / Time', 'Amount', 'Payment', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completedOrders.map(o => (
                      <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{o.id?.slice(-5).toUpperCase()}</td>
                        <td style={{ padding: '10px 12px' }}>{o.customerName}</td>
                        <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {o.orderPlacedAt?.toDate ? o.orderPlacedAt.toDate().toLocaleString() : new Date(o.orderPlacedAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--accent)' }}>Rs {o.totalAmount?.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>💵 {o.paymentMethod || 'Cash'}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => printReceipt(o)}>🖨️ Reprint</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleCancelOrder(o.id)}>✕ Cancel Sale</button>
                          </div>
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

      {showFinalBill && selectedOrderForBill && (() => {
        const val = parseFloat(discountInput) || 0;
        const billSub = selectedOrderForBill.subtotal || 0;
        const billTax = selectedOrderForBill.tax || 0;
        const currentDiscount = discountInput !== ''
          ? (discountType === 'pct' ? Math.round((billSub + billTax) * (val / 100)) : val)
          : (selectedOrderForBill.discountAmount || 0);
        const effectiveTotal = Math.max(0, billSub + billTax - currentDiscount);

        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowFinalBill(false)}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3>💰 Finalize Sale</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowFinalBill(false)}>✕</button>
              </div>

              <div style={{ padding: 20 }}>
                <div style={{ background: 'var(--bg-glass)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cashier:</span>
                    <span style={{ fontWeight: 600 }}>{selectedOrderForBill.customerName}</span>
                  </div>
                  <div className="divider" style={{ margin: '8px 0' }} />
                  <div className="order-total-row"><span>Subtotal</span><span>Rs {billSub.toLocaleString()}</span></div>
                  <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {billTax.toLocaleString()}</span></div>
                  {currentDiscount > 0 && (
                    <div className="order-total-row">
                      <span>Discount</span>
                      <span style={{ color: 'var(--danger-light)' }}>- Rs {currentDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="order-total-row grand" style={{ marginBottom: 0 }}>
                    <span>Total Payable</span><span>Rs {effectiveTotal.toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <button
                    className={`btn ${discountType === 'pkr' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setDiscountType('pkr')}
                    style={{ flex: 1, padding: '8px' }}
                  >Rs</button>
                  <button
                    className={`btn ${discountType === 'pct' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setDiscountType('pct')}
                    style={{ flex: 1, padding: '8px' }}
                  >%</button>
                </div>
                <div className="input-group">
                  <label className="input-label">
                    {discountType === 'pkr' ? 'Discount Amount (Rs)' : 'Discount Percentage (%)'}
                  </label>
                  <input
                    className="input"
                    type="number"
                    placeholder={discountType === 'pkr' ? 'e.g. 200' : 'e.g. 10'}
                    value={discountInput}
                    onChange={e => setDiscountInput(e.target.value)}
                    style={{ fontSize: '1rem', fontWeight: 600 }}
                  />
                </div>

                <div className="input-group" style={{ marginTop: 12 }}>
                  <label className="input-label">💳 Payment Method</label>
                  <select
                    className="input"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    style={{ fontSize: '1rem', fontWeight: 600 }}
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="Card">💳 Card</option>
                    <option value="Online">🌐 Online</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">💵 Cash Received (Optional)</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="Enter amount"
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    autoFocus
                    style={{ fontSize: '1.2rem', fontWeight: 700 }}
                  />
                </div>

                {cashReceived && !isNaN(parseFloat(cashReceived)) && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20,
                    background: (parseFloat(cashReceived) - effectiveTotal) >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${(parseFloat(cashReceived) - effectiveTotal) >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {(parseFloat(cashReceived) - effectiveTotal) >= 0 ? '💚 Change to Return' : '⚠️ Amount Short'}
                    </span>
                    <span style={{
                      fontWeight: 800, fontSize: '1.3rem',
                      color: (parseFloat(cashReceived) - effectiveTotal) >= 0 ? 'var(--success-light)' : 'var(--danger-light)'
                    }}>
                      Rs {Math.abs(parseFloat(cashReceived) - effectiveTotal).toLocaleString()}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setShowFinalBill(false)}>Cancel</button>
                  <button
                    className="btn btn-success"
                    onClick={handleCheckout}
                    disabled={saving}
                    style={{ minWidth: 160, justifyContent: 'center' }}
                  >
                    {saving ? '⏳ Processing...' : '🏁 Confirm Payment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showPinModal && (
        <PinModal
          title="🔐 Enter PIN to cancel order"
          onSuccess={() => {
            if (window.__pendingSave) {
              window.__pendingSave();
              window.__pendingSave = null;
            }
            setShowPinModal(false);
          }}
          onCancel={() => {
            window.__pendingSave = null;
            setShowPinModal(false);
          }}
          onClose={() => {
            window.__pendingSave = null;
            setShowPinModal(false);
          }}
        />
      )}
    </div>
  );
}
