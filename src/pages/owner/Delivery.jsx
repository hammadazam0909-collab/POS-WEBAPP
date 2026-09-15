import React, { useState } from 'react';
import { useOrders, useMenu, deductInventoryForItems } from '../../hooks/useFirestore';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTimer } from '../../hooks/useTimer';
import PinModal from '../../components/PinModal';
import './Owner.css';

const DELIVERY_MAX = 2700; // 45 min

const PIPELINE = ['pending', 'preparing', 'out-for-delivery', 'delivered'];

function DeliveryTimer({ orderPlacedAt }) {
  const { urgency, remainingDisplay, elapsedDisplay } = useTimer(orderPlacedAt, DELIVERY_MAX);
  const colors = { safe: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', overdue: 'var(--danger-light)' };
  const bgs = { safe: 'var(--success-bg)', warning: 'var(--warning-bg)', danger: 'var(--danger-bg)', overdue: 'var(--danger-bg)' };
  return (
    <div className="delivery-timer-badge" style={{ color: colors[urgency], background: bgs[urgency] }}>
      <span>⏱</span>
      {urgency === 'overdue' ? `LATE +${elapsedDisplay}` : `${remainingDisplay} left`}
    </div>
  );
}

export default function Delivery() {
  const { orders, addOrder, updateOrder } = useOrders('delivery');
  const { categories } = useMenu();
  const { restaurant } = useAuth();
  const { settings } = useSettings();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: '', phone: '', address: '', note: '', rider: '' });
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [showFinalBill, setShowFinalBill] = useState(false);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [editingOrder, setEditingOrder] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [discountType, setDiscountType] = useState('pkr'); // 'pkr' | 'pct'
  const [discountInput, setDiscountInput] = useState('');
  const [formDiscountType, setFormDiscountType] = useState('pkr');
  const [formDiscountInput, setFormDiscountInput] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedOrderForDiscount, setSelectedOrderForDiscount] = useState(null);
  const [quickDiscountType, setQuickDiscountType] = useState('pkr');
  const [quickDiscountInput, setQuickDiscountInput] = useState('');

  const activeDeliveries = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const displayOrders = activeDeliveries;

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
  const formDiscVal = parseFloat(formDiscountInput) || 0;
  const formDiscountAmount = formDiscountType === 'pct'
    ? Math.round((subtotal + tax) * (formDiscVal / 100))
    : formDiscVal;
  const total = Math.max(0, subtotal + tax - formDiscountAmount);

  async function handleAddItems(order) {
    setEditingOrder(order);
    setCart([]); // Start with empty cart for new items!
    setForm({
      customerName: order.customerName || '',
      phone: order.phone || '',
      address: order.deliveryAddress || '',
      note: order.kitchenNote || '',
      rider: order.rider || ''
    });
    setFormDiscountType(order.discountType || 'pkr');
    setFormDiscountInput(order.discountValue !== undefined && order.discountValue !== '' ? String(order.discountValue) : (order.discountAmount ? String(order.discountAmount) : ''));
    setIsEditMode(false);
    setShowForm(true);
  }

  async function handleEditItems(order) {
    setEditingOrder(order);
    setCart(order.items || []); // Load existing items!
    setForm({
      customerName: order.customerName || '',
      phone: order.phone || '',
      address: order.deliveryAddress || '',
      note: order.kitchenNote || '',
      rider: order.rider || ''
    });
    setFormDiscountType(order.discountType || 'pkr');
    setFormDiscountInput(order.discountValue !== undefined && order.discountValue !== '' ? String(order.discountValue) : (order.discountAmount ? String(order.discountAmount) : ''));
    setIsEditMode(true);
    setShowForm(true);
  }

  async function placeDelivery() {
    if (!form.customerName || cart.length === 0) return;
    setSaving(true);
    try {
      const newItems = cart.map(i => ({ name: i.name, qty: Number(i.qty) || 1, price: i.price, status: 'pending', recipe: i.recipe || [] }));

      if (editingOrder) {
        if (isEditMode) {
          // Overwrite items (for removal)
          const newSub = cart.reduce((s, i) => s + i.price * (Number(i.qty) || 0), 0);
          const newTax = Math.round(newSub * ((settings.taxRate || 0) / 100));
          const discVal = parseFloat(formDiscountInput) || 0;
          const discAmt = formDiscountType === 'pct' ? Math.round((newSub + newTax) * (discVal / 100)) : discVal;
          const newTotal = Math.max(0, newSub + newTax - discAmt);

          await updateOrder(editingOrder.id, {
            items: cart.map(i => ({ ...i, qty: Number(i.qty) || 1 })), // Overwrite with current cart!
            customerName: form.customerName,
            phone: form.phone,
            deliveryAddress: form.address,
            kitchenNote: form.note,
            rider: form.rider,
            subtotal: newSub,
            tax: newTax,
            discountAmount: discAmt,
            discountType: formDiscountType,
            discountValue: formDiscountInput,
            totalAmount: newTotal,
          });

          alert('Order updated successfully!');
        } else {
          // Append new items (Add flow)
          const existingItems = editingOrder.items || [];
          const merged = [...existingItems, ...newItems];

          const newSub = merged.reduce((s, i) => s + i.price * i.qty, 0);
          const newTax = Math.round(newSub * ((settings.taxRate || 0) / 100));
          const discVal = parseFloat(formDiscountInput) || 0;
          const discAmt = formDiscountType === 'pct' ? Math.round((newSub + newTax) * (discVal / 100)) : discVal;
          const newTotal = Math.max(0, newSub + newTax - discAmt);

          await updateOrder(editingOrder.id, {
            items: merged,
            customerName: form.customerName,
            phone: form.phone,
            deliveryAddress: form.address,
            kitchenNote: form.note,
            rider: form.rider,
            subtotal: newSub,
            tax: newTax,
            discountAmount: discAmt,
            discountType: formDiscountType,
            discountValue: formDiscountInput,
            totalAmount: newTotal,
          });

          // Only print NEW items for the kitchen!
          printKitchenReceipt(newItems, 'Delivery', form.customerName, form.note);
          alert('Order updated successfully!');
        }
      } else {
        await addOrder({
          type: 'delivery',
          customerName: form.customerName,
          phone: form.phone,
          deliveryAddress: form.address,
          kitchenNote: form.note,
          rider: form.rider,
          items: newItems,
          subtotal,
          tax,
          discountAmount: formDiscountAmount,
          discountType: formDiscountType,
          discountValue: formDiscountInput,
          totalAmount: total,
          status: 'pending',
        });

        // Print all items for new order
        printKitchenReceipt(newItems, 'Delivery', form.customerName, form.note);
      }

      // Reset
      setShowForm(false);
      setCart([]);
      setForm({ customerName: '', phone: '', address: '', note: '', rider: '' });
      setFormDiscountType('pkr');
      setFormDiscountInput('');
      setEditingOrder(null);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleOpenDiscountModal(order) {
    setSelectedOrderForDiscount(order);
    setQuickDiscountType(order.discountType || 'pkr');
    setQuickDiscountInput(order.discountValue !== undefined && order.discountValue !== '' ? String(order.discountValue) : (order.discountAmount ? String(order.discountAmount) : ''));
    setShowDiscountModal(true);
  }

  async function handleSaveQuickDiscount() {
    if (!selectedOrderForDiscount) return;
    setSaving(true);
    try {
      const val = parseFloat(quickDiscountInput) || 0;
      const orderSub = selectedOrderForDiscount.subtotal || 0;
      const orderTax = selectedOrderForDiscount.tax || 0;
      const discAmt = quickDiscountType === 'pct' ? Math.round((orderSub + orderTax) * (val / 100)) : val;
      const newTotal = Math.max(0, orderSub + orderTax - discAmt);

      await updateOrder(selectedOrderForDiscount.id, {
        discountAmount: discAmt,
        discountType: quickDiscountType,
        discountValue: quickDiscountInput,
        totalAmount: newTotal,
      });

      setShowDiscountModal(false);
      setSelectedOrderForDiscount(null);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  function nextStatus(current) {
    const idx = PIPELINE.indexOf(current);
    return PIPELINE[idx + 1] || current;
  }

  async function handleDeliverOrder() {
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

      await updateOrder(selectedOrderForBill.id, {
        status: 'delivered',
        paymentMethod: paymentMethod,
        discountAmount: discountAmount,
        discountType: discountType,
        discountValue: discountInput,
        cashReceived: cashRecVal,
        changeGiven: changeAmt,
        totalAmount: newTotal
      });
      if (selectedOrderForBill.items?.length > 0) {
        await deductInventoryForItems(restaurant?.id, selectedOrderForBill.items);
        await updateOrder(selectedOrderForBill.id, { inventorySynced: true });
      }
      // Print receipt automatically with discount!
      printReceipt({ ...selectedOrderForBill, discountAmount, totalAmount: newTotal, cashReceived: cashRecVal, changeGiven: changeAmt, paymentMethod });
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
  function printKitchenReceipt(items, type, name, kitchenNote) {
    const rows = items.map(i =>
      `<tr><td style="padding:5px 0; font-size:13px">${i.name}</td><td style="padding:5px 0;text-align:right;font-weight:bold;font-size:14px">×${i.qty}</td></tr>`
    ).join('');

    const MIN_ROWS = 6;
    const fillerCount = Math.max(0, MIN_ROWS - items.length);
    const fillerRows = Array.from({ length: fillerCount })
      .map(() => `<tr><td style="padding:5px 0">&nbsp;</td><td></td></tr>`).join('');

    const totalItems = items.reduce((s, i) => s + i.qty, 0);
    const html = `<html><head><title>Kitchen Order</title>
      <style>
        @page { margin: 4mm; }
        body{font-family: 'Courier New', Courier, monospace; font-size:13px; padding:10px; max-width:300px; margin:0 auto; color:#000}
        .text-center{text-align:center}
        .bold{font-weight:bold}
        .header-title{font-size:16px; font-weight:bold; margin:6px 0; letter-spacing:1px}
        .table-no{font-size:18px; font-weight:900; margin:6px 0; letter-spacing:1px}
        .line-dashed{border-top:1px dashed #000; margin:7px 0}
        .line-solid{border-top:2px solid #000; margin:7px 0}
        table{width:100%; border-collapse:collapse}
        th{border-top:2px solid #000; border-bottom:1px dashed #000; padding:6px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.5px}
        td{font-size:13px; font-weight:bold; vertical-align:middle}
        .summary-row{display:flex; justify-content:space-between; padding:4px 0; font-size:11px; color:#333}
        .stamp{font-size:10px; color:#555; text-align:center; margin-top:8px; letter-spacing:0.5px}
        @media print {
          body { margin: 0; padding: 8px; }
          .no-print { display: none; }
        }
      </style></head>
      <body>
        <div class="text-center bold header-title">*** KITCHEN ORDER ***</div>
        <div class="text-center bold table-no">${type.toUpperCase()}: ${name}</div>
        <div class="line-solid"></div>
        <table>
          <thead><tr><th style="text-align:left">ITEM</th><th style="text-align:right">QTY</th></tr></thead>
          <tbody>${rows}${fillerRows}</tbody>
        </table>
        <div class="line-dashed"></div>
        <div class="summary-row"><span>Total Items:</span><span>${totalItems}</span></div>
        <div class="summary-row"><span>Time:</span><span>${new Date().toLocaleTimeString()}</span></div>
        <div class="line-solid"></div>
        ${kitchenNote ? `<div style="margin:6px 0; font-size:12px"><strong>⚠ NOTE:</strong> ${kitchenNote}</div><div class="line-dashed"></div>` : ''}
        <div class="stamp">— NEW ORDER —</div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=320,height=600');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  }

  // ── Receipt printer ──────────────────────────────────────────────────────────
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
    const cashRec = o.cashReceived || 0;
    const changeRet = o.changeGiven !== undefined ? o.changeGiven : (cashRec > (o.totalAmount || 0) ? cashRec - (o.totalAmount || 0) : 0);

    const html = `<html><head><title>Delivery Bill</title>
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
        <div class="text-center bold restaurant-name">${restaurant?.name || 'Restaurant Name'}</div>
        
        <div class="meta-row"><span>Mop: ${o.paymentMethod || 'Cash'}</span></div>
        <div class="meta-row"><span>Receipt #: ${o.id?.slice(-5) || 'NEW'}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
        <div class="meta-row"><span>Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString()}</span></div>
        <div class="meta-row"><span>Mode: DELIVERY</span></div>
        
        <div class="text-center bold" style="margin:10px 0">Order Number: ${o.id?.slice(-6).toUpperCase() || 'NEW'}</div>
        
        <div class="meta-row"><span>Cust: ${o.customerName || '—'}</span>${o.phone ? `<span>Phone: ${o.phone}</span>` : ''}</div>
        <div style="font-size:11px; margin-bottom:10px">📍 ${o.deliveryAddress}</div>
        
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
          <div>Thank you for your visit.</div>
          <div>For Feedback: ${restaurant?.phone || ''}</div>
          <div class="text-center" style="margin-top:10px; font-weight:bold">AR POS | 0322-4776071</div>
        </div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=320,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 400); }
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">🚗 Delivery Orders</h1>
            <p className="page-subtitle">Track and manage home deliveries (45 min max)</p>
          </div>
          <button id="newDeliveryBtn" className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Delivery</button>
        </div>
      </div>

      <div className="content-area">
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>🚚 Active Deliveries</h2>
        </div>

        {displayOrders.length === 0 ? (
          <div className="empty-state card"><div className="empty-state-icon">🚗</div><h3>No delivery orders</h3><p>Create a new delivery order to get started</p></div>
        ) : (
          <div className="queue-list">
            {displayOrders.map(order => {
              const urgency = getUrgency(order.orderPlacedAt, DELIVERY_MAX);
              return (
                <div key={order.id} id={`delivery-${order.id}`} className={`queue-card ${urgency === 'danger' || urgency === 'overdue' ? 'timer-danger-border' : ''}`}>
                  <div className="queue-card-header">
                    <div>
                      <h4>{order.customerName}</h4>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
                        📞 {order.phone || '—'} &nbsp;|&nbsp; 📍 {order.deliveryAddress || '—'}
                      </div>
                      {order.rider && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, marginTop: 4 }}>
                          🚴 Rider: {order.rider}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.1rem' }}>Rs {order.totalAmount?.toLocaleString()}</div>
                      {!['delivered', 'cancelled'].includes(order.status) && <DeliveryTimer orderPlacedAt={order.orderPlacedAt} />}
                    </div>
                  </div>

                  {order.discountAmount > 0 && (
                    <div style={{ color: 'var(--danger-light)', fontSize: '0.85rem', fontWeight: 600, marginTop: 4 }}>
                      🏷️ Discount: - Rs {order.discountAmount.toLocaleString()}
                    </div>
                  )}

                  <div className="order-items-list" style={{ marginBottom: 12 }}>
                    {order.items?.map((item, i) => (
                      <div key={i} className="order-item-row">
                        <span className="order-item-name">{item.name}</span>
                        <span className="order-item-qty">×{item.qty}</span>
                        <span className="order-item-price">Rs {(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pipeline">
                    {PIPELINE.map((step, i) => {
                      const stepIdx = PIPELINE.indexOf(order.status);
                      const isDone = i < stepIdx;
                      const isActive = i === stepIdx;
                      return (
                        <React.Fragment key={step}>
                          <div className={`pipeline-step ${isDone ? 'done' : isActive ? 'active' : ''}`}>
                            {isDone ? '✓' : ''} {step.replace(/-/g, ' ')}
                          </div>
                          {i < PIPELINE.length - 1 && <span className="pipeline-arrow">→</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {!['delivered', 'cancelled'].includes(order.status) && (
                    <div className="scrollable-buttons">
                      <button id={`advanceDelivery-${order.id}`} className="btn btn-success btn-sm" onClick={() => {
                        const next = nextStatus(order.status);
                        if (next === 'delivered') {
                          setSelectedOrderForBill(order);
                          setDiscountType(order.discountType || 'pkr');
                          setDiscountInput(order.discountValue !== undefined && order.discountValue !== '' ? String(order.discountValue) : (order.discountAmount ? String(order.discountAmount) : ''));
                          setShowFinalBill(true);
                        } else {
                          updateOrder(order.id, { status: next });
                        }
                      }}>
                        {nextStatus(order.status) === 'delivered' ? '🏁 Mark Delivered' : `➡️ Move to ${nextStatus(order.status)}`}
                      </button>
                      <button id={`cancelDelivery-${order.id}`} className="btn btn-danger btn-sm" onClick={() => handleCancelOrder(order.id)}>✕ Cancel</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => printReceipt(order)}>🖨️ Print</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleOpenDiscountModal(order)}>🏷️ Discount</button>
                      <button className="btn btn-primary btn-sm" onClick={() => handleAddItems(order)}>➕ Add</button>
                      <button className="btn btn-warning btn-sm" onClick={() => handleEditItems(order)}>✏️ Edit</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Final Bill Modal (for Delivery Protection) ── */}
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
                <h3>💰 Finalize Delivery</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowFinalBill(false)}>✕</button>
              </div>

              <div style={{ padding: 20 }}>
                <div style={{ background: 'var(--bg-glass)', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                    <span style={{ fontWeight: 600 }}>{selectedOrderForBill.customerName}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>{selectedOrderForBill.deliveryAddress}</div>
                  {selectedOrderForBill.rider && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 700 }}>🚴 Rider: {selectedOrderForBill.rider}</div>
                  )}
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

                {/* Discount Section */}
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

                {/* Payment Method Selector */}
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

                {/* Change display */}
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
                    onClick={handleDeliverOrder}
                    disabled={saving}
                    style={{ minWidth: 160, justifyContent: 'center' }}
                  >
                    {saving ? '⏳ Finalizing...' : '🏁 Confirm Delivered'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal modal-xl delivery-modal-grid" style={{ padding: 0 }}>
            <div style={{ padding: 24, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3>{editingOrder ? '✏️ Edit Order' : '🍽️ Select Items'}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setEditingOrder(null); setCart([]); setForm({ customerName: '', phone: '', address: '', note: '', rider: '' }); setFormDiscountType('pkr'); setFormDiscountInput(''); }}>✕</button>
              </div>
              {!isEditMode ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="🔍 Search items..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="menu-categories">
                    <button className={`cat-btn ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>All</button>
                    {categories.map(c => (
                      <button key={c.id} className={`cat-btn ${activeCategory === c.id ? 'active' : ''}`} onClick={() => setActiveCategory(c.id)}>{c.name}</button>
                    ))}
                  </div>
                  <div className="menu-items-grid">
                    {displayItems.filter(i => i.available !== false).map((item, idx) => (
                      <button key={idx} className="menu-item-btn" onClick={() => addToCart(item)}>
                        <div className="menu-item-name">{item.name}</div>
                        <div className="menu-item-price">Rs {item.price?.toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <h3>✏️ Edit Mode</h3>
                  <p style={{ marginTop: 8 }}>You can remove items or change quantities of existing items in the cart on the right.</p>
                </div>
              )}
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4>🚗 Delivery Details</h4>
              <div className="input-group">
                <label className="input-label">Customer Name *</label>
                <input className="input" placeholder="Full name" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} autoFocus />
              </div>
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input className="input" placeholder="03xx-xxxxxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Address</label>
                <textarea className="input" placeholder="Delivery address..." value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">🚴 Assigned Rider</label>
                <input className="input" placeholder="Enter rider name" value={form.rider} onChange={e => setForm(f => ({ ...f, rider: e.target.value }))} />
              </div>
              <div className="order-items-list">
                {cart.map(item => (
                  <div key={item.name} className="order-item-row">
                    <span className="order-item-name">{item.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => changeQty(item.name, -1)}>−</button>
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
                      <button className="btn btn-secondary btn-sm" onClick={() => changeQty(item.name, 1)}>+</button>
                      <button className="btn btn-danger btn-sm" style={{ padding: '2px 6px' }} onClick={() => removeFromCart(item.name)}>✕</button>
                    </div>
                    <span className="order-item-price">Rs {(item.price * (Number(item.qty) || 0)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <textarea className="input" placeholder="Kitchen note..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              
              <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-glass)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>🏷️ Discount</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn ${formDiscountType === 'pkr' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    onClick={() => setFormDiscountType('pkr')}
                  >Rs</button>
                  <button
                    type="button"
                    className={`btn ${formDiscountType === 'pct' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                    onClick={() => setFormDiscountType('pct')}
                  >%</button>
                  <input
                    type="number"
                    className="input"
                    placeholder={formDiscountType === 'pkr' ? 'Discount (Rs)' : 'Discount (%)'}
                    value={formDiscountInput}
                    onChange={e => setFormDiscountInput(e.target.value)}
                    style={{ fontSize: '0.9rem', padding: '4px 8px' }}
                  />
                </div>
              </div>

              <div className="order-total-row"><span>Subtotal</span><span>Rs {subtotal.toLocaleString()}</span></div>
              <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {tax.toLocaleString()}</span></div>
              {formDiscountAmount > 0 && (
                <div className="order-total-row">
                  <span>Discount</span>
                  <span style={{ color: 'var(--danger-light)' }}>- Rs {formDiscountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="order-total-row grand"><span>Total</span><span>Rs {total.toLocaleString()}</span></div>
              <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-card)', padding: '10px 0', borderTop: '1px solid var(--border)', marginTop: 12 }}>
                <button id="placeDeliveryBtn" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={placeDelivery} disabled={!form.customerName || cart.length === 0 || saving}>
                  {saving ? '⏳...' : isEditMode ? '💾 Apply Changes' : '🚗 Place Delivery Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDiscountModal && selectedOrderForDiscount && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDiscountModal(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🏷️ Apply Discount</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDiscountModal(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <button
                  className={`btn ${quickDiscountType === 'pkr' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setQuickDiscountType('pkr')}
                  style={{ flex: 1, padding: '8px' }}
                >Rs</button>
                <button
                  className={`btn ${quickDiscountType === 'pct' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setQuickDiscountType('pct')}
                  style={{ flex: 1, padding: '8px' }}
                >%</button>
              </div>
              <div className="input-group">
                <label className="input-label">
                  {quickDiscountType === 'pkr' ? 'Discount Amount (Rs)' : 'Discount Percentage (%)'}
                </label>
                <input
                  className="input"
                  type="number"
                  placeholder={quickDiscountType === 'pkr' ? 'e.g. 200' : 'e.g. 10'}
                  value={quickDiscountInput}
                  onChange={e => setQuickDiscountInput(e.target.value)}
                  style={{ fontSize: '1rem', fontWeight: 600 }}
                  autoFocus
                />
              </div>
              {quickDiscountInput && !isNaN(parseFloat(quickDiscountInput)) && (
                <div style={{ background: 'var(--bg-glass)', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid var(--border)' }}>
                  <div className="order-total-row">
                    <span>Discount</span>
                    <span style={{ color: 'var(--danger-light)' }}>
                      - Rs {quickDiscountType === 'pct'
                        ? Math.round(((selectedOrderForDiscount.subtotal || 0) + (selectedOrderForDiscount.tax || 0)) * (parseFloat(quickDiscountInput) / 100)).toLocaleString()
                        : parseFloat(quickDiscountInput).toLocaleString()}
                    </span>
                  </div>
                  <div className="order-total-row grand" style={{ marginBottom: 0 }}>
                    <span>New Total</span>
                    <span>Rs {Math.max(0, ((selectedOrderForDiscount.subtotal || 0) + (selectedOrderForDiscount.tax || 0)) - (quickDiscountType === 'pct'
                      ? Math.round(((selectedOrderForDiscount.subtotal || 0) + (selectedOrderForDiscount.tax || 0)) * (parseFloat(quickDiscountInput) / 100))
                      : parseFloat(quickDiscountInput))).toLocaleString()}</span>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setShowDiscountModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveQuickDiscount} disabled={saving}>
                  {saving ? '⏳...' : '💾 Apply Discount'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

function getUrgency(orderPlacedAt, max) {
  if (!orderPlacedAt) return 'safe';
  const startMs = orderPlacedAt?.toDate ? orderPlacedAt.toDate().getTime() : new Date(orderPlacedAt).getTime();
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  if (elapsed > max) return 'overdue';
  if (elapsed / max >= 0.85) return 'danger';
  if (elapsed / max >= 0.5) return 'warning';
  return 'safe';
}
