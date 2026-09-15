import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTables, useOrders, useMenu, useFloors, deductInventoryForItems, useUdharAccounts, shiftOrderToUdhar, recordUdharPayment, applyUdharDiscount, deleteUdharAccount, useUdharLogs } from '../../hooks/useFirestore';
import { useAuth } from '../../context/AuthContext';
import { useTimer } from '../../hooks/useTimer';
import { useSettings } from '../../context/SettingsContext';
import PinModal from '../../components/PinModal';
import './Owner.css';

const TABLE_MAX = 1800;

function TableTimer({ orderPlacedAt }) {
  const { urgency, remainingDisplay, elapsedDisplay } = useTimer(orderPlacedAt, TABLE_MAX);
  return (
    <div className={`table-timer timer-${urgency}`}>
      <span>⏱</span>
      {urgency === 'overdue'
        ? <span>OVERDUE +{elapsedDisplay}</span>
        : <span>{remainingDisplay} left</span>}


    </div>
  );
}

function getUrgency(orderPlacedAt) {
  if (!orderPlacedAt) return 'safe';
  const ms = orderPlacedAt?.toDate ? orderPlacedAt.toDate().getTime() : new Date(orderPlacedAt).getTime();
  const elapsed = Math.floor((Date.now() - ms) / 1000);
  if (elapsed > TABLE_MAX) return 'overdue';
  if (elapsed / TABLE_MAX >= 0.85) return 'danger';
  if (elapsed / TABLE_MAX >= 0.5) return 'warning';
  return 'safe';
}

export default function Tables() {
  const { tables, loading: tablesLoading, addTable, updateTable, deleteTable } = useTables();
  const { orders: allOrders, loading: ordersLoading, addOrder, updateOrder } = useOrders();
  const orders = allOrders.filter(o => o.type === 'dine-in');
  const dataLoading = tablesLoading || ordersLoading;
  const { categories } = useMenu();
  const { restaurant } = useAuth();
  const { floors, addFloor, deleteFloor, loading: floorsLoading } = useFloors();
  const navigate = useNavigate();

  const { udharAccounts, loading: udharLoading } = useUdharAccounts();
  const { udharLogs, loading: logsLoading } = useUdharLogs();
  const [showUdharLogsModal, setShowUdharLogsModal] = useState(false);
  const [showShiftUdharModal, setShowShiftUdharModal] = useState(false);
  const [shiftCustName, setShiftCustName] = useState('');
  const [shiftCustPhone, setShiftCustPhone] = useState('');
  const [shiftNote, setShiftNote] = useState('');
  const [shiftingOrder, setShiftingOrder] = useState(null);

  const [selectedUdharAccount, setSelectedUdharAccount] = useState(null);
  const [showUdharHistoryModal, setShowUdharHistoryModal] = useState(false);
  const [showUdharPayModal, setShowUdharPayModal] = useState(false);
  const [udharPayAmt, setUdharPayAmt] = useState('');
  const [udharPayMethod, setUdharPayMethod] = useState('Cash');
  const [udharPayNote, setUdharPayNote] = useState('');
  const [udharSearch, setUdharSearch] = useState('');

  const [showUdharDiscountModal, setShowUdharDiscountModal] = useState(false);
  const [udharDiscType, setUdharDiscType] = useState('pkr');
  const [udharDiscInput, setUdharDiscInput] = useState('');
  const [udharDiscNote, setUdharDiscNote] = useState('');

  async function handleApplyUdharDiscount() {
    if (!selectedUdharAccount || !restaurant?.id) return;
    const val = parseFloat(udharDiscInput);
    if (isNaN(val) || val <= 0) return alert('Enter a valid discount amount');

    let calculatedDisc = val;
    if (udharDiscType === 'pct') {
      calculatedDisc = ((selectedUdharAccount.totalBalance || 0) * val) / 100;
    }
    calculatedDisc = Math.min(selectedUdharAccount.totalBalance || 0, Math.round(calculatedDisc));

    setSaving(true);
    try {
      await applyUdharDiscount(
        restaurant.id,
        selectedUdharAccount.id,
        selectedUdharAccount.totalBalance,
        calculatedDisc,
        udharDiscNote || `Discount applied (${val}${udharDiscType === 'pct' ? '%' : ' Rs'})`
      );
      setShowUdharDiscountModal(false);
      setUdharDiscInput('');
      setUdharDiscNote('');
      alert(`🏷️ Discount of Rs ${calculatedDisc.toLocaleString()} applied to ${selectedUdharAccount.customerName}'s account!`);
    } catch (err) {
      console.error(err);
      alert('Failed to apply discount: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteUdharAccountWithPin(acc) {
    if (!acc || !restaurant?.id) return;
    const action = async () => {
      try {
        await deleteUdharAccount(restaurant.id, acc, `Deleted by Owner PIN at ${new Date().toLocaleString()}`);
        if (selectedUdharAccount?.id === acc.id) {
          setShowUdharHistoryModal(false);
          setSelectedUdharAccount(null);
        }
        alert(`🗑️ Udhar account for ${acc.customerName} deleted and logged in audit history!`);
      } catch (err) {
        console.error(err);
        alert('Error deleting Udhar account: ' + err.message);
      }
    };

    window.__pendingSave = action;
    setShowPinModal(true);
  }

  const [activeFloorId, setActiveFloorId] = useState('all');
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [selectedFloorForTable, setSelectedFloorForTable] = useState('');

  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState('4');
  const [cart, setCart] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleShiftToUdhar() {
    if (!shiftingOrder || !restaurant?.id) return;
    if (!shiftCustName.trim() && !shiftCustPhone.trim()) {
      alert('Please enter Customer Name or Phone Number');
      return;
    }
    setSaving(true);
    try {
      await shiftOrderToUdhar(restaurant.id, shiftingOrder, shiftCustName, shiftCustPhone, shiftNote);
      setShowShiftUdharModal(false);
      setShiftingOrder(null);
      setShiftCustName('');
      setShiftCustPhone('');
      setShiftNote('');
      setSelectedTableId(null);
      alert(`✅ Order shifted to Udhar Account successfully! Physical table is now free.`);
    } catch (err) {
      console.error(err);
      alert('Failed to shift order to Udhar: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordUdharPayment() {
    if (!selectedUdharAccount || !restaurant?.id) return;
    const amt = parseFloat(udharPayAmt);
    if (isNaN(amt) || amt <= 0) return alert('Enter a valid payment amount');

    setSaving(true);
    try {
      await recordUdharPayment(
        restaurant.id,
        selectedUdharAccount.id,
        selectedUdharAccount.totalBalance,
        amt,
        udharPayMethod,
        udharPayNote
      );
      setShowUdharPayModal(false);
      setUdharPayAmt('');
      setUdharPayNote('');
      alert(`✅ Payment of Rs ${amt.toLocaleString()} recorded successfully!`);
    } catch (err) {
      console.error(err);
      alert('Failed to record payment: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // Discount modal state
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState('pkr'); // 'pkr' | 'pct'
  const [discountInput, setDiscountInput] = useState('');
  const [showSwapModal, setShowSwapModal] = useState(false);

  // Draft editing state — edits are local until "Apply" is clicked
  const { settings } = useSettings();
  const [draftItems, setDraftItems] = useState(null); // null = not editing
  const [showPinModal, setShowPinModal] = useState(false);

  // Price edit lock — locked by default, requires PIN to unlock
  const [priceEditUnlocked, setPriceEditUnlocked] = useState(false);
  // Reset price lock whenever user switches to a different table
  React.useEffect(() => {
    setPriceEditUnlocked(false);
    setDraftItems(null);
  }, [selectedTableId]);

  // Final Bill popup state
  const [showFinalBill, setShowFinalBill] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  // ─── Derive status from live orders — the ground truth ───────────────────
  // A table is "occupied" until the order is BILLED or CANCELLED.
  // 'served' does NOT free the table — only Final Bill does.
  const activeOrderByTable = useMemo(() => {
    const map = {};
    orders.forEach(o => {
      if (!['cancelled', 'billed'].includes(o.status)) {
        if (!map[o.tableId]) map[o.tableId] = o; // first = newest
      }
    });
    return map;
  }, [orders]);

  const selectedTable = tables.find(t => t.id === selectedTableId) || null;
  const activeOrder = selectedTableId ? activeOrderByTable[selectedTableId] : null;

  // ─── Cart helpers (for new-order modal) ─────────────────────────────────────
  function addToCart(item) {
    setCart(c => [...c, { ...item, qty: 1, cartId: Math.random().toString(36).substr(2, 9) }]);
  }
  function removeFromCart(cartId) { setCart(c => c.filter(i => i.cartId !== cartId)); }
  function changeQty(cartId, delta) {
    setCart(c => c.map(i => i.cartId === cartId ? { ...i, qty: Math.max(1, (Number(i.qty) || 0) + delta) } : i));
  }
  function handleQtyChange(cartId, value) {
    const val = parseInt(value, 10);
    if (!isNaN(val) && val >= 1) {
      setCart(c => c.map(i => i.cartId === cartId ? { ...i, qty: val } : i));
    } else if (value === '') {
      setCart(c => c.map(i => i.cartId === cartId ? { ...i, qty: '' } : i));
    }
  }
  function handleQtyBlur(cartId, qty) {
    const val = parseInt(qty, 10);
    if (isNaN(val) || val < 1) {
      setCart(c => c.map(i => i.cartId === cartId ? { ...i, qty: 1 } : i));
    }
  }
  function changeCartPrice(cartId, price) {
    const p = parseFloat(price);
    setCart(c => c.map(i => i.cartId === cartId ? { ...i, price: isNaN(p) || p < 0 ? i.price : p } : i));
  }

  const subtotal = cart.reduce((s, i) => s + i.price * (Number(i.qty) || 0), 0);
  const tax = Math.round(subtotal * ((settings.taxRate ?? 5) / 100));
  const total = subtotal + tax;

  // ─── Draft-based order editing ───────────────────────────────────────────
  // Returns current draft (or copy of saved items if no draft started yet)
  function getOrInitDraft() {
    return draftItems ?? (activeOrder?.items ? activeOrder.items.map(i => ({ ...i })) : []);
  }

  // Modify qty in local draft — no Firestore write yet
  function draftChangeQty(itemName, delta) {
    const base = getOrInitDraft();
    if (delta > 0) {
      // Add a new entry to keep kitchen separate
      const existing = base.find(i => i.name === itemName);
      setDraftItems([...base, {
        name: itemName,
        qty: 1,
        status: 'pending',
        isNew: true,
        price: existing?.price || 0,
        recipe: existing?.recipe || []
      }]);
    } else {
      // Decrement the last item with that name
      const lastIdx = [...base].reverse().findIndex(i => i.name === itemName);
      if (lastIdx >= 0) {
        const idx = base.length - 1 - lastIdx;
        const updated = [...base];
        const currentItemQty = Number(updated[idx].qty) || 0;
        updated[idx].qty = currentItemQty + delta;
        if (updated[idx].qty <= 0) {
          updated.splice(idx, 1);
        }
        setDraftItems(updated);
      }
    }
  }

  function draftSetQty(itemName, newQty) {
    const val = parseInt(newQty, 10);
    if (isNaN(val) || val < 1) {
      if (newQty === '') {
        const base = getOrInitDraft();
        const lastIdx = [...base].reverse().findIndex(i => i.name === itemName);
        if (lastIdx >= 0) {
          const idx = base.length - 1 - lastIdx;
          const updated = [...base];
          updated[idx].qty = '';
          setDraftItems(updated);
        }
      }
      return;
    }
    const base = getOrInitDraft();
    const currentQty = base.filter(i => i.name === itemName).reduce((s, i) => s + (Number(i.qty) || 0), 0);
    const diff = val - currentQty;
    if (diff === 0) return;

    if (diff > 0) {
      const existing = base.find(i => i.name === itemName);
      setDraftItems([...base, {
        name: itemName,
        qty: diff,
        status: 'pending',
        isNew: true,
        price: existing?.price || 0,
        recipe: existing?.recipe || []
      }]);
    } else {
      let toDeduct = Math.abs(diff);
      const updated = [...base];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].name === itemName) {
          const itemQty = Number(updated[i].qty) || 0;
          if (itemQty > toDeduct) {
            updated[i].qty = itemQty - toDeduct;
            toDeduct = 0;
            break;
          } else {
            toDeduct -= itemQty;
            updated.splice(i, 1);
          }
        }
      }
      setDraftItems(updated);
    }
  }

  function draftQtyBlur(itemName, qty) {
    const val = parseInt(qty, 10);
    if (isNaN(val) || val < 1) {
      const base = getOrInitDraft();
      const currentQty = base.filter(i => i.name === itemName).reduce((s, i) => s + (Number(i.qty) || 0), 0);
      if (currentQty < 1) {
        const existing = base.find(i => i.name === itemName);
        if (existing) {
          setDraftItems(base.map(i => i.name === itemName ? { ...i, qty: 1 } : i));
        } else {
          setDraftItems([...base, { name: itemName, qty: 1, status: 'pending', isNew: true }]);
        }
      } else {
        setDraftItems(base.map(i => i.name === itemName && i.qty === '' ? { ...i, qty: 1 } : i));
      }
    }
  }

  // Modify price in local draft — no Firestore write yet
  function draftChangePrice(itemName, rawValue) {
    const p = parseFloat(rawValue);
    const base = getOrInitDraft();
    setDraftItems(base.map(i =>
      i.name === itemName ? { ...i, price: isNaN(p) || p < 0 ? i.price : p } : i
    ));
  }

  // Check if draft differs from saved
  const draftIsDirty = draftItems !== null && JSON.stringify(draftItems) !== JSON.stringify(activeOrder?.items);

  // Discard draft
  function discardDraft() { setDraftItems(null); }

  // Apply draft — saves directly, no PIN (price field has its own PIN lock)
  async function applyDraft() {
    if (!activeOrder || !draftItems) return;
    const cleanDraftItems = draftItems.map(i => ({ ...i, qty: Number(i.qty) || 1 }));
    const newSub = cleanDraftItems.reduce((s, i) => s + i.price * i.qty, 0);
    const newTax = Math.round(newSub * ((settings.taxRate ?? 5) / 100));
    const discount = activeOrder.discountAmount || 0;
    const newTotal = Math.max(0, newSub + newTax - discount);

    const existingNames = activeOrder.items?.map(i => i.name) || [];
    let hasNewItems = false;
    const updatedItems = cleanDraftItems.map(i => {
      if (existingNames.length > 0 && !existingNames.includes(i.name)) {
        hasNewItems = true;
        return { ...i, isNew: true };
      }
      return i;
    });

    const updateData = { items: updatedItems, subtotal: newSub, tax: newTax, totalAmount: newTotal };

    const newItemsToPrint = updatedItems.filter(i => i.isNew);
    if (newItemsToPrint.length > 0) {
      updateData.orderPlacedAt = new Date().toISOString(); // Reset timer!
    }

    // If order was ready or served but we added items, set back to pending
    if (activeOrder.status === 'ready' || activeOrder.status === 'served') {
      updateData.status = 'pending';
    }

    await updateOrder(activeOrder.id, updateData);
    setDraftItems(null);
    setPriceEditUnlocked(false);
  }


  // ─── Actions ──────────────────────────────────────────────────────────────

  // Helper: print kitchen receipt for given items
  function printKitchenReceipt(items, tableNum, kitchenNote) {
    const rows = items.map(i =>
      `<tr><td style="padding:5px 0; font-size:13px">${i.name}</td><td style="padding:5px 0;text-align:right;font-weight:bold;font-size:14px">×${i.qty}</td></tr>`
    ).join('');

    // Pad with empty rows so a single-item slip isn't too tiny
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
        .table-no{font-size:22px; font-weight:900; margin:6px 0; letter-spacing:2px}
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
        <div class="text-center bold table-no">TABLE: ${tableNum}</div>
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

  async function placeOrder() {
    if (!selectedTable || cart.length === 0) return;
    setSaving(true);
    try {
      const newItems = cart.map(i => ({
        name: i.name, qty: Number(i.qty) || 1, price: i.price, status: 'pending', kitchenSent: true,
        recipe: i.recipe || [],   // ← carry recipe so inventory deduction works
      }));

      // Auto-print kitchen receipt for the new items
      printKitchenReceipt(newItems, selectedTable.number, note);

      if (activeOrder) {
        // ── Append to existing order ─────────────────────────────────
        const existingItems = activeOrder.items || [];
        const merged = existingItems.map(i => ({ ...i }));
        newItems.forEach(ni => {
          // Always add as a new entry to let kitchen see it as a separate request
          merged.push({ ...ni, isNew: true });
        });
        const newSub = merged.reduce((s, i) => s + i.price * i.qty, 0);
        const newTax = Math.round(newSub * ((settings.taxRate ?? 5) / 100));
        const newTotal = newSub + newTax - (activeOrder.discountAmount || 0);
        const updateData = {
          items: merged,
          subtotal: newSub,
          tax: newTax,
          totalAmount: newTotal,
          kitchenNote: note || activeOrder.kitchenNote || '',
          kitchenBillSent: true,
        };

        // If order was ready or served but we added items, set back to pending
        if (activeOrder.status === 'ready' || activeOrder.status === 'served') {
          updateData.status = 'pending';
        }

        await updateOrder(activeOrder.id, updateData);

        // Clean up orphaned orders
        const orphans = orders.filter(o =>
          o.tableId === selectedTable.id &&
          o.id !== activeOrder.id &&
          !['cancelled', 'billed'].includes(o.status)
        );
        for (const orphan of orphans) {
          await updateOrder(orphan.id, { status: 'billed' });
        }
      } else {
        // ── Brand-new order ──────────────────────────────────────────
        await addOrder({
          type: 'dine-in',
          tableId: selectedTable.id,
          tableNumber: selectedTable.number,
          items: newItems,
          subtotal, tax, totalAmount: total,
          kitchenNote: note,
          status: 'pending',
        });
        await updateTable(selectedTable.id, { status: 'occupied' });
      }

      setShowNewOrder(false);
      setCart([]);
      setNote('');
      setMenuSearch('');

    } finally { setSaving(false); }
  }

  async function sendKitchenBill() {
    if (!activeOrder) return;

    // Only print items not yet sent to kitchen
    const unsent = activeOrder.items.filter(i => !i.kitchenSent);
    if (unsent.length === 0) {
      alert('All items have already been sent to the kitchen.');
      return;
    }

    // Mark every item as kitchenSent
    const marked = activeOrder.items.map(i => ({ ...i, kitchenSent: true }));
    await updateOrder(activeOrder.id, { items: marked, kitchenBillSent: true });

    // Print only the new items
    const rows = unsent.map(i =>
      `<tr><td style="padding:5px 0; font-size:13px">${i.name}</td><td style="padding:5px 0;text-align:right;font-weight:bold;font-size:14px">×${i.qty}</td></tr>`
    ).join('');

    // Pad with empty rows so a single-item slip isn't too tiny
    const MIN_ROWS = 6;
    const fillerCount = Math.max(0, MIN_ROWS - unsent.length);
    const fillerRows = Array.from({ length: fillerCount })
      .map(() => `<tr><td style="padding:5px 0">&nbsp;</td><td></td></tr>`).join('');

    const totalItems = unsent.reduce((s, i) => s + i.qty, 0);
    const html = `<html><head><title>Kitchen Order</title>
      <style>
        @page { margin: 4mm; }
        body{font-family: 'Courier New', Courier, monospace; font-size:13px; padding:10px; max-width:300px; margin:0 auto; color:#000}
        .text-center{text-align:center}
        .bold{font-weight:bold}
        .header-title{font-size:16px; font-weight:bold; margin:6px 0; letter-spacing:1px}
        .table-no{font-size:22px; font-weight:900; margin:6px 0; letter-spacing:2px}
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
        <div class="text-center bold table-no">TABLE: ${activeOrder.tableNumber}</div>
        <div class="text-center" style="font-size:11px; margin-bottom:4px">Order #${activeOrder.id.slice(-6).toUpperCase()}</div>
        <div class="line-solid"></div>
        <table>
          <thead><tr><th style="text-align:left">ITEM</th><th style="text-align:right">QTY</th></tr></thead>
          <tbody>${rows}${fillerRows}</tbody>
        </table>
        <div class="line-dashed"></div>
        <div class="summary-row"><span>Total Items:</span><span>${totalItems}</span></div>
        <div class="summary-row"><span>Time:</span><span>${new Date().toLocaleTimeString()}</span></div>
        <div class="line-solid"></div>
        ${activeOrder.kitchenNote ? `<div style="margin:6px 0; font-size:12px"><strong>⚠ NOTE:</strong> ${activeOrder.kitchenNote}</div><div class="line-dashed"></div>` : ''}
        <div class="stamp">— KDS PRINT — NEW ITEMS ONLY —</div>
      </body></html>`;

    const w = window.open('', '_blank', 'width=320,height=600');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  }

  async function sendProvisionalBill() {
    if (!activeOrder) return;
    await updateOrder(activeOrder.id, { provisionalBillSent: true });

    // Print provisional receipt
    const items = activeOrder.items || [];
    const rows = items.map(i =>
      `<tr>
        <td style="padding:2px 2px; text-transform:lowercase; text-align:left">${i.name}</td>
        <td style="padding:2px 6px; text-align:right">${i.price}</td>
        <td style="padding:2px 6px; text-align:center">${Number(i.qty).toFixed(2)}</td>
        <td style="padding:2px 2px; text-align:right">${(i.price * i.qty)}</td>
      </tr>`
    ).join('');
    const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    const invoiceNote = settings.invoiceText ? `<div style="margin-top:8px; font-size:10px; text-align:left; color:#333; white-space:pre-wrap">${settings.invoiceText}</div>` : '';
    const html = `<html><head><title>Provisional Bill</title>
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
        <div class="text-center bold header-title">Provisional Invoice</div>
        <div class="text-center bold restaurant-name">${restaurant?.name || 'Restaurant Name'}</div>
        
        <div class="meta-row"><span>Mop: Cash</span></div>
        <div class="meta-row"><span>Receipt #: ${activeOrder.id.slice(-5)}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
        <div class="meta-row"><span>Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString()}</span></div>
        <div class="meta-row"><span>Mode: Dine-In</span></div>
        
        <div class="text-center bold" style="margin:10px 0">Order Number: ${activeOrder.id.slice(-6).toUpperCase()}</div>
        
        <div class="meta-row"><span>Hall: Main</span><span>Table: ${activeOrder.tableNumber}</span></div>
        ${(activeOrder.customerName || activeOrder.phone || activeOrder.customerPhone) ? `
        <div class="meta-row">${activeOrder.customerName ? `<span>Cust: ${activeOrder.customerName}</span>` : ''}${(activeOrder.phone || activeOrder.customerPhone) ? `<span>Phone: ${activeOrder.phone || activeOrder.customerPhone}</span>` : ''}</div>
        ` : ''}
        
        <table>
          <thead>
            <tr>
              <th style="text-align:left; width:45%; padding:5px 2px">Item</th>
              <th style="text-align:right; width:20%; padding:5px 6px">Price</th>
              <th style="text-align:center; width:15%; padding:5px 6px">Qty</th>
              <th style="text-align:right; width:20%; padding:5px 2px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        
        <div class="line-dashed"></div>
        <div class="meta-row"><span>Total Items:</span><span>${totalQty.toFixed(2)}</span></div>
        <div class="meta-row"><span>Subtotal:</span><span>${(activeOrder.subtotal || 0).toLocaleString()}</span></div>
        <div class="meta-row"><span>Tax:</span><span>${(activeOrder.tax || 0).toLocaleString()}</span></div>
        <div class="meta-row bold"><span>Total Without Discount:</span><span>${((activeOrder.subtotal || 0) + (activeOrder.tax || 0)).toLocaleString()}</span></div>
        ${activeOrder.discountAmount ? `
        <div class="meta-row" style="color:red"><span>Discount (${Math.round((activeOrder.discountAmount / ((activeOrder.subtotal || 0) + (activeOrder.tax || 0))) * 100)}%):</span><span>- Rs ${(activeOrder.discountAmount || 0).toLocaleString()}</span></div>
        ` : ''}
        <div class="line-dashed"></div>
        <div class="meta-row bold" style="font-size:13px">
          <span>Net Payable:</span>
          <span>${(activeOrder.totalAmount || 0).toLocaleString()}</span>
        </div>

        ${invoiceNote}

        <div class="footer">
          <div>Thank you for your visit.</div>
          <div>For Feedback: ${restaurant?.phone || ''}</div>
          <div class="text-center" style="margin-top:10px; font-weight:bold">AR POS | 0322-4776071</div>
        </div>
      </body></html>`;
    const w = window.open('', '_blank', 'width=320,height=600');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  }

  function openFinalBill() {
    if (!activeOrder) return;
    setCashReceived(String(activeOrder.totalAmount || ''));
    setShowFinalBill(true);
  }

  async function saveFinalBill() {
    if (!activeOrder || !selectedTable) return;
    const received = parseFloat(cashReceived);
    if (isNaN(received) || received < 0) return alert('Enter a valid amount');
    const changeAmt = Math.max(0, received - activeOrder.totalAmount);

    setSaving(true);
    try {
      // 1. Mark the order as billed
      await updateOrder(activeOrder.id, {
        status: 'billed',
        paidAmount: received,
        changeGiven: changeAmt,
        billedAt: new Date().toISOString(),
        paymentMethod: paymentMethod,
      });

      // Deduct inventory for the entire order now that it's finalized
      if (activeOrder.items?.length > 0) {
        deductInventoryForItems(restaurant?.id, activeOrder.items)
          .then(() => updateOrder(activeOrder.id, { inventorySynced: true }))
          .catch(err => console.warn('Inventory deduction failed at billing:', err));
      }

      // 2. Also bill any other lingering orders for this table
      const others = orders.filter(o =>
        o.tableId === selectedTable.id &&
        o.id !== activeOrder.id &&
        !['cancelled', 'billed'].includes(o.status)
      );
      for (const o of others) {
        await updateOrder(o.id, { status: 'billed', paymentMethod: paymentMethod, billedAt: new Date().toISOString() });
      }

      // 3. Free the table
      await updateTable(selectedTable.id, {
        status: 'available',
        currentOrderId: null,
      });

      // 4. Close modal & deselect table FIRST (before print)
      setShowFinalBill(false);
      setSelectedTableId(null);

      // 5. Print receipt (safe — won't break if popup blocked)
      try {
        const items = activeOrder.items || [];
        const rows = items.map(i =>
          `<tr>
            <td style="padding:2px 2px; text-transform:lowercase; text-align:left">${i.name}</td>
            <td style="padding:2px 6px; text-align:right">${i.price}</td>
            <td style="padding:2px 6px; text-align:center">${Number(i.qty).toFixed(2)}</td>
            <td style="padding:2px 2px; text-align:right">${(i.price * i.qty)}</td>
          </tr>`
        ).join('');
        const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
        const invoiceNote = settings.invoiceText ? `<div style="margin-top:8px; font-size:10px; text-align:left; color:#333; white-space:pre-wrap">${settings.invoiceText}</div>` : '';
        const html = `<html><head><title>Final Bill</title>
          <style>
            @page { margin: 0; }
            body{font-family: 'Courier New', Courier, monospace; font-size:12px; font-weight:600; padding:8px; max-width:300px; margin:0 auto; color:#000}
            .text-center{text-align:center}
            .bold{font-weight:900}
            .logo-wrap{text-align:center; margin-bottom:5px}
            .logo-wrap img{max-width:100px; max-height:60px; object-fit:contain}
            .header-title{font-size:14px; font-weight:900; margin:5px 0}
            .restaurant-name{font-size:15px; font-weight:900; margin-bottom:8px}
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
            
            <div class="meta-row"><span>Mop: ${paymentMethod || 'Cash'}</span></div>
            <div class="meta-row"><span>Receipt #: ${activeOrder.id.slice(-5)}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
            <div class="meta-row"><span>Date: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date().toLocaleTimeString()}</span></div>
            <div class="meta-row"><span>Mode: Dine-In</span></div>
            
            <div class="text-center bold" style="margin:10px 0">Order Number: ${activeOrder.id.slice(-6).toUpperCase()}</div>
            
            <div class="meta-row"><span>Hall: Main</span><span>Table: ${activeOrder.tableNumber}</span></div>
            ${(activeOrder.customerName || activeOrder.phone || activeOrder.customerPhone) ? `
            <div class="meta-row">${activeOrder.customerName ? `<span>Cust: ${activeOrder.customerName}</span>` : ''}${(activeOrder.phone || activeOrder.customerPhone) ? `<span>Phone: ${activeOrder.phone || activeOrder.customerPhone}</span>` : ''}</div>
            ` : ''}
            
            <table>
              <thead>
                <tr>
                  <th style="text-align:left; width:45%; padding:5px 2px">Item</th>
                  <th style="text-align:right; width:20%; padding:5px 6px">Price</th>
                  <th style="text-align:center; width:15%; padding:5px 6px">Qty</th>
                  <th style="text-align:right; width:20%; padding:5px 2px">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
            
            <div class="line-dashed"></div>
            <div class="meta-row"><span>Total Items:</span><span>${totalQty.toFixed(2)}</span></div>
            <div class="meta-row"><span>Subtotal:</span><span>${(activeOrder.subtotal || 0).toLocaleString()}</span></div>
            <div class="meta-row"><span>Tax:</span><span>${(activeOrder.tax || 0).toLocaleString()}</span></div>
            <div class="meta-row bold"><span>Total Without Discount:</span><span>${((activeOrder.subtotal || 0) + (activeOrder.tax || 0)).toLocaleString()}</span></div>
            
            ${activeOrder.discountAmount ? `
            <div class="meta-row" style="color:red"><span>Discount (${Math.round((activeOrder.discountAmount / ((activeOrder.subtotal || 0) + (activeOrder.tax || 0))) * 100)}%):</span><span>- Rs ${(activeOrder.discountAmount || 0).toLocaleString()}</span></div>
            ` : ''}
            
            <div class="line-dashed"></div>
            <div class="meta-row bold" style="font-size:13px"><span>Net Payable:</span><span>${(activeOrder.totalAmount || 0).toLocaleString()}</span></div>

            ${received > 0 ? `
            <div class="meta-row"><span>Cash Received:</span><span>Rs ${received.toLocaleString()}</span></div>
            <div class="meta-row bold" style="font-size:12px"><span>Return Amount:</span><span>Rs ${changeAmt.toLocaleString()}</span></div>
            ` : ''}

            ${invoiceNote}

            <div class="footer">
              <div>Thank you for your visit.</div>
              <div>For Feedback: ${restaurant?.phone || ''}</div>
              <div class="text-center" style="margin-top:10px; font-weight:bold">AR POS | 0322-4776071</div>
            </div>
          </body></html>`;
        const w = window.open('', '_blank', 'width=320,height=600');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); w.close(); }, 400);
        }
      } catch (printErr) {
        console.warn('Could not print receipt:', printErr);
      }
    } finally { setSaving(false); }
  }

  function applyOrderDiscount() {
    if (!activeOrder) return;
    const existing = activeOrder.discountAmount || 0;
    setDiscountInput(existing > 0 ? String(existing) : '');
    setDiscountType('pkr');
    setShowDiscountModal(true);
  }

  async function saveDiscount() {
    if (!activeOrder) return;
    const val = parseFloat(discountInput);
    if (isNaN(val) || val < 0) return;
    let discountAmount;
    if (discountType === 'pct') {
      discountAmount = Math.round((activeOrder.subtotal + activeOrder.tax) * (val / 100));
    } else {
      discountAmount = val;
    }
    const newTotal = Math.max(0, (activeOrder.subtotal + activeOrder.tax) - discountAmount);
    await updateOrder(activeOrder.id, { discountAmount, totalAmount: newTotal });
    setShowDiscountModal(false);
    setDiscountInput('');
  }

  async function handleSwapTable(targetTable) {
    if (!activeOrder || !selectedTable) return;
    if (activeOrderByTable[targetTable.id] && targetTable.id !== selectedTable.id) {
      return alert('Target table is already occupied');
    }

    setSaving(true);
    try {
      // 1. Update order with new table info
      await updateOrder(activeOrder.id, {
        tableId: targetTable.id,
        tableNumber: targetTable.number
      });

      // 2. Free old table
      await updateTable(selectedTable.id, {
        status: 'available',
        currentOrderId: null
      });

      // 3. Occupy new table
      await updateTable(targetTable.id, {
        status: 'occupied',
        currentOrderId: activeOrder.id
      });

      // 4. Update UI
      setSelectedTableId(targetTable.id);
      setShowSwapModal(false);
      alert(`Order moved from Table ${selectedTable.number} to Table ${targetTable.number}`);
    } catch (err) {
      alert("Swap failed: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTable() {
    if (!newTableNum) return;
    // If it's a valid number, save as number, otherwise save as string!
    const num = isNaN(Number(newTableNum)) ? newTableNum.trim() : Number(newTableNum);
    const targetFloorId = selectedFloorForTable || floors[0]?.id;
    if (!targetFloorId) {
      return alert('⚠️ Please add at least one floor first before adding tables!');
    }

    if (tables.some(t => t.number === num && t.floorId === targetFloorId)) {
      return alert(`⚠️ Table ${num} already exists on this floor! Please use a unique name or number.`);
    }

    await addTable({
      number: num,
      capacity: parseInt(newTableCap) || 4,
      status: 'available',
      floorId: targetFloorId
    });
    setShowAddTable(false); setNewTableNum(''); setNewTableCap('4');
  }

  async function handleAddFloor() {
    if (!newFloorName) return;
    await addFloor(newFloorName);
    setShowAddFloor(false);
    setNewFloorName('');
  }

  async function handleDeleteTable(id, num) {
    if (!window.confirm(`Are you sure you want to delete Table ${num}?`)) return;

    const action = async () => {
      try {
        await deleteTable(id);
        setSelectedTableId(null);
      } catch (e) { alert(e.message); }
    };

    window.__pendingSave = action;
    setShowPinModal(true);
  }

  async function handleDeleteFloor(e, id, name) {
    e.stopPropagation(); // Don't trigger setActiveFloorId
    if (!window.confirm(`Delete Floor "${name}"? Tables on this floor will not be deleted but will be unassigned.`)) return;

    const action = async () => {
      try {
        await deleteFloor(id);
        if (activeFloorId === id) setActiveFloorId('all');
      } catch (e) { alert(e.message); }
    };

    window.__pendingSave = action;
    setShowPinModal(true);
  }

  const categoryItems = activeCategory
    ? categories.find(c => c.id === activeCategory)?.items || []
    : categories.flatMap(c => c.items || []);

  const displayItems = categoryItems.filter(i =>
    i.available !== false &&
    (menuSearch.trim() === '' || i.name.toLowerCase().includes(menuSearch.trim().toLowerCase()))
  );

  const groupedTables = useMemo(() => {
    const sortFn = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });

    if (activeFloorId !== 'all') {
      const f = floors.find(fl => fl.id === activeFloorId);
      return [{ id: activeFloorId, name: f?.name || 'Selected Floor', tables: tables.filter(t => t.floorId === activeFloorId).sort(sortFn) }];
    }
    const groups = floors.map(f => ({
      id: f.id,
      name: f.name,
      tables: tables.filter(t => t.floorId === f.id).sort(sortFn)
    }));
    const unassigned = tables.filter(t => !t.floorId || !floors.some(f => f.id === t.floorId)).sort(sortFn);
    if (unassigned.length > 0) groups.push({ id: 'unassigned', name: 'Others / Unassigned', tables: unassigned });
    return groups.filter(g => g.tables.length > 0);
  }, [tables, floors, activeFloorId]);

  const change = parseFloat(cashReceived) - (activeOrder?.totalAmount || 0);

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">🪑 Tables</h1>
            <p className="page-subtitle">Click a table to manage its order</p>
          </div>
          <button id="addTableBtn" className="btn btn-primary" onClick={() => setShowAddTable(true)}>+ Add Table</button>
        </div>
      </div>

      {/* Main layout: tables grid + fixed right panel */}
      <div className="content-area">
        {/* ── Floor Selector ─────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              <button className={`btn ${activeFloorId === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveFloorId('all')}>All Floors</button>
              <button
                className={`btn ${activeFloorId === 'udhar' ? 'btn-warning' : 'btn-secondary'} btn-sm`}
                style={{
                  background: activeFloorId === 'udhar' ? 'var(--warning)' : undefined,
                  color: activeFloorId === 'udhar' ? '#000' : undefined,
                  fontWeight: 700
                }}
                onClick={() => setActiveFloorId('udhar')}
              >
                📝 Udhar Accounts ({udharAccounts.filter(a => (a.totalBalance || 0) > 0).length})
              </button>
              {floors.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', background: activeFloorId === f.id ? 'var(--accent)' : 'var(--bg-glass)', borderRadius: 8, paddingRight: 4 }}>
                  <button
                    className={`btn btn-sm`}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: activeFloorId === f.id ? '#000' : 'var(--text-primary)',
                      boxShadow: 'none'
                    }}
                    onClick={() => setActiveFloorId(f.id)}
                  >
                    {f.name}
                  </button>
                  <button
                    onClick={(e) => handleDeleteFloor(e, f.id, f.name)}
                    style={{
                      background: 'rgba(0,0,0,0.1)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      fontSize: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: activeFloorId === f.id ? '#000' : 'var(--text-muted)'
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddFloor(true)}>+ Add Floor</button>
          </div>
        </div>

        <div className="tables-layout">
          <div className="tables-grid-area">
            {ordersLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ width: 16, height: 16 }} /> Syncing orders…
              </div>
            )}
            {activeFloorId === 'udhar' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-glass)', border: '1px solid var(--border)', padding: 16, borderRadius: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>📝 Customer Udhar Accounts</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Total Active Accounts: {udharAccounts.filter(a => (a.totalBalance || 0) > 0).length}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowUdharLogsModal(true)}
                      style={{ fontWeight: 600 }}
                    >
                      📜 View Audit Log ({udharLogs.length})
                    </button>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Outstanding Dues</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--danger-light)' }}>
                        Rs {udharAccounts.reduce((sum, a) => sum + (a.totalBalance || 0), 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                <input
                  type="text"
                  className="input"
                  placeholder="🔍 Search Udhar accounts by customer name or phone..."
                  value={udharSearch}
                  onChange={e => setUdharSearch(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px' }}
                />

                {udharAccounts.filter(a => {
                  const q = udharSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (a.customerName || '').toLowerCase().includes(q) || (a.customerPhone || '').includes(q);
                }).length === 0 ? (
                  <div className="empty-state card">
                    <div className="empty-state-icon">📝</div>
                    <h3>No Udhar Accounts Found</h3>
                    <p>Shift orders from active tables to record customer credit (udhar).</p>
                  </div>
                ) : (
                  <div className="tables-grid">
                    {udharAccounts.filter(a => {
                      const q = udharSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (a.customerName || '').toLowerCase().includes(q) || (a.customerPhone || '').includes(q);
                    }).map(acc => {
                      const hasBalance = (acc.totalBalance || 0) > 0;
                      return (
                        <div
                          key={acc.id}
                          className={`table-card ${hasBalance ? 'occupied danger-border' : 'available'}`}
                          style={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 16 }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>
                                  👤 {acc.customerName || 'Customer'}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                                  📞 {acc.customerPhone || 'No Phone'}
                                </div>
                              </div>
                              <button
                                className="btn btn-danger btn-sm"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => handleDeleteUdharAccountWithPin(acc)}
                                title="Delete Udhar Account (Owner PIN Protected)"
                              >
                                🗑️ Delete
                              </button>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Udhar Balance:</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: hasBalance ? 'var(--danger-light)' : 'var(--success-light)' }}>
                                Rs {(acc.totalBalance || 0).toLocaleString()}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Total Bills: {acc.bills?.length || 0}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ flex: 1, fontSize: '0.8rem' }}
                              onClick={() => { setSelectedUdharAccount(acc); setShowUdharHistoryModal(true); }}
                            >
                              👁️ Bills
                            </button>
                            {hasBalance && (
                              <>
                                <button
                                  className="btn btn-warning btn-sm"
                                  style={{ flex: 1, fontSize: '0.8rem', background: 'var(--warning)', color: '#000', fontWeight: 700 }}
                                  onClick={() => {
                                    setSelectedUdharAccount(acc);
                                    setUdharDiscInput('');
                                    setUdharDiscNote('');
                                    setShowUdharDiscountModal(true);
                                  }}
                                >
                                  🏷️ Discount
                                </button>
                                <button
                                  className="btn btn-success btn-sm"
                                  style={{ flex: 1, fontSize: '0.8rem', background: 'var(--success)', color: '#fff' }}
                                  onClick={() => {
                                    setSelectedUdharAccount(acc);
                                    setUdharPayAmt(acc.totalBalance);
                                    setShowUdharPayModal(true);
                                  }}
                                >
                                  💵 Pay
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : groupedTables.length === 0 ? (
              <div className="empty-state card">
                <div className="empty-state-icon">🪑</div>
                <h3>No tables found</h3>
                <p>{activeFloorId === 'all' ? 'Add your first table to get started' : 'No tables assigned to this floor'}</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddTable(true)}>Add Table</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
                {groupedTables.map(group => (
                  <div key={group.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: '6px 16px', background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 100, fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        🏢 {group.name}
                      </div>
                      <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, var(--border), transparent)', opacity: 0.3 }}></div>
                    </div>

                    <div className="tables-grid">
                      {group.tables.map(table => {
                        const order = activeOrderByTable[table.id];
                        const isOccupied = !!order;
                        const isBillSent = order?.provisionalBillSent;
                        const isSelected = selectedTableId === table.id;
                        const urgency = order ? getUrgency(order.orderPlacedAt) : 'safe';

                        let statusClass = isOccupied ? (isBillSent ? 'bill-sent' : 'occupied') : 'available';
                        let statusLabel = isOccupied ? (isBillSent ? '📄 Bill Sent' : '🔴 Occupied') : '✅ Available';

                        return (
                          <div
                            key={table.id}
                            id={`table-${table.number}`}
                            className={`table-card ${statusClass} ${(urgency === 'danger' || urgency === 'overdue') ? 'danger-border' : ''}`}
                            style={{ outline: isSelected ? '2px solid var(--accent)' : 'none' }}
                            onClick={() => {
                              setSelectedTableId(table.id);
                              setShowNewOrder(false);
                              setCart([]);
                              setNote('');
                            }}
                          >
                            <div className="table-card-number">T{table.number}</div>
                            <div className="table-card-label">{statusLabel}</div>
                            {order && (
                              <>
                                <div className="table-card-amount">Rs {(order.totalAmount || 0).toLocaleString()}</div>
                                {order.status !== 'served' && <TableTimer orderPlacedAt={order.orderPlacedAt} />}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT: Fixed Order + Billing Panel ───────────── */}
          <div className="order-panel">
            {!selectedTable ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-state-icon">👈</div>
                <h3>Select a table</h3>
                <p>Click any table to view or start an order</p>
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div className="order-panel-header">
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0 }}>Table {selectedTable.number}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="badge badge-muted">Cap: {selectedTable.capacity} seats</span>
                      {activeOrder && (
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => setShowSwapModal(true)}>🔄 Swap Table</button>
                      )}
                      {!activeOrder && (
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--danger-light)', color: 'var(--danger-light)' }}
                          onClick={() => handleDeleteTable(selectedTable.id, selectedTable.number)}
                        >🗑 Delete Table</button>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTableId(null)}>✕</button>
                </div>

                {/* Panel body */}
                <div className="order-panel-items">
                  {activeOrder ? (
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <span className="badge badge-warning">⏱ Active Order</span>
                        {activeOrder.orderPlacedAt && activeOrder.status !== 'served' && <TableTimer orderPlacedAt={activeOrder.orderPlacedAt} />}
                        {activeOrder.kitchenBillSent && <span className="badge badge-success" style={{ marginTop: 6 }}>🍳 Sent to Kitchen</span>}
                        {activeOrder.provisionalBillSent && <span className="badge badge-muted" style={{ marginTop: 6 }}>📄 Provisional Bill Sent</span>}
                      </div>

                      {/* Draft banner */}
                      {draftIsDirty && (
                        <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 8, fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>
                          ✏️ Unsaved edits — click Apply to save
                        </div>
                      )}

                      <div className="order-items-list">
                        {(() => {
                          const base = draftItems ?? activeOrder.items ?? [];
                          const consolidated = [];
                          base.forEach(item => {
                            const exists = consolidated.find(i => i.name === item.name);
                            if (exists) {
                              exists.qty += item.qty;
                            } else {
                              consolidated.push({ ...item });
                            }
                          });
                          return consolidated;
                        })().map((item, i) => (
                          <div key={item.name} className="order-item-row" style={{ gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="order-item-name" style={{ fontSize: '0.82rem' }}>{item.name}</div>
                              {item.discount > 0 && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--danger-light)' }}>- Rs {item.discount} off</div>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <button className="btn btn-secondary btn-sm" style={{ padding: '2px 7px' }} onClick={() => draftChangeQty(item.name, -1)}>−</button>
                              <input
                                type="number"
                                className="qty-input-inline"
                                value={item.qty}
                                onChange={e => draftSetQty(item.name, e.target.value)}
                                onBlur={e => draftQtyBlur(item.name, e.target.value)}
                                style={{
                                  width: '40px',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  background: 'transparent',
                                  color: 'var(--text-primary)',
                                  padding: '2px 0',
                                  fontSize: '0.85rem',
                                }}
                              />
                              <button className="btn btn-secondary btn-sm" style={{ padding: '2px 7px' }} onClick={() => draftChangeQty(item.name, +1)}>+</button>
                              <button className="btn btn-danger btn-sm" style={{ padding: '2px 7px', marginLeft: 2 }} onClick={() => {
                                const base = getOrInitDraft();
                                setDraftItems(base.filter(i => i.name !== item.name));
                              }}>✕</button>
                            </div>

                            {/* Price — locked by default, unlocks via PIN */}
                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                              {priceEditUnlocked ? (
                                <>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rs</span>
                                  <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    value={item.price}
                                    onChange={e => draftChangePrice(item.name, e.target.value)}
                                    onClick={e => e.target.select()}
                                    style={{ width: 64, padding: '2px 5px', fontSize: '0.8rem', textAlign: 'right' }}
                                    title="Custom price — will save on Apply"
                                    autoFocus={false}
                                  />
                                  {item.qty > 1 && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×{item.qty}</span>
                                  )}
                                </>
                              ) : (
                                <button
                                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                                  title="Click to edit price (requires PIN)"
                                  onClick={() => {
                                    if (settings.pinEnabled) {
                                      window.__pendingSave = () => setPriceEditUnlocked(true);
                                      setShowPinModal(true);
                                    } else {
                                      setPriceEditUnlocked(true);
                                    }
                                  }}
                                >
                                  Rs {item.price.toLocaleString()} 🔒
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Apply / Discard buttons */}
                      {draftIsDirty && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={discardDraft}>↩ Discard</button>
                          <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={applyDraft}>✅ Apply</button>
                        </div>
                      )}

                      <div className="divider" style={{ margin: '12px 0' }} />
                      <div className="order-total-row"><span>Subtotal</span><span>Rs {activeOrder.subtotal?.toLocaleString()}</span></div>
                      <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {activeOrder.tax?.toLocaleString()}</span></div>
                      <div className="order-total-row">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          Discount
                          <button className="btn btn-secondary btn-sm" style={{ padding: '2px 6px', fontSize: '0.7rem' }} onClick={applyOrderDiscount}>Edit</button>
                        </span>
                        <span style={{ color: 'var(--danger-light)' }}>- Rs {(activeOrder.discountAmount || 0).toLocaleString()}</span>
                      </div>
                      <div className="order-total-row grand"><span>Total</span><span>Rs {activeOrder.totalAmount?.toLocaleString()}</span></div>

                      <button
                        id={`addItemsBtn-${selectedTable.number}`}
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                        onClick={() => setShowNewOrder(true)}
                      >+ Add More Items</button>
                    </>
                  ) : (
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <div className="empty-state-icon">🍽️</div>
                      <h3>Table is free</h3>
                      <p>Start a new order for this table</p>
                      <button
                        id={`newOrderBtn-${selectedTable.number}`}
                        className="btn btn-primary"
                        style={{ marginTop: 12 }}
                        onClick={() => setShowNewOrder(true)}
                      >🛒 New Order</button>
                    </div>
                  )}
                </div>

                {/* ── Billing Actions Footer ── */}
                {activeOrder && (
                  <div className="billing-actions">
                    <div className="billing-actions-title">💳 Billing</div>
                    <button
                      id={`kitchenBillBtn-${selectedTable.number}`}
                      className="btn-bill btn-bill-kitchen"
                      onClick={sendKitchenBill}
                    >
                      <span>🍳</span>
                      <div>
                        <div className="btn-bill-label">Kitchen Bill</div>
                        <div className="btn-bill-sub">
                          {activeOrder.kitchenBillSent ? 'Sent ✓ — click to resend' : 'Send order to kitchen'}
                        </div>
                      </div>
                    </button>
                    <button
                      id={`provBillBtn-${selectedTable.number}`}
                      className="btn-bill btn-bill-prov"
                      onClick={sendProvisionalBill}
                    >
                      <span>📄</span>
                      <div>
                        <div className="btn-bill-label">Provisional Bill</div>
                        <div className="btn-bill-sub">Print estimate for customer</div>
                      </div>
                    </button>
                    <button
                      id={`finalBillBtn-${selectedTable.number}`}
                      className="btn-bill btn-bill-final"
                      onClick={openFinalBill}
                    >
                      <span>💰</span>
                      <div>
                        <div className="btn-bill-label">Final Bill</div>
                        <div className="btn-bill-sub">Collect payment &amp; free table</div>
                      </div>
                    </button>
                    <button
                      className="btn-bill"
                      style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--warning)', color: 'var(--warning)' }}
                      onClick={() => {
                        setShiftingOrder(activeOrder);
                        setShiftCustName(activeOrder.customerName || '');
                        setShiftCustPhone(activeOrder.phone || activeOrder.customerPhone || '');
                        setShowShiftUdharModal(true);
                      }}
                    >
                      <span>📝</span>
                      <div>
                        <div className="btn-bill-label">Shift to Udhar</div>
                        <div className="btn-bill-sub">Transfer to Udhar &amp; free table</div>
                      </div>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showNewOrder && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewOrder(false)}>
          <div className="delivery-modal-grid modal modal-xl" style={{ padding: 0, maxHeight: '90vh' }}>

            {/* LEFT: Menu browser */}
            <div style={{ padding: 24, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3>🍽️ Menu — Table {selectedTable?.number}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewOrder(false)}>✕</button>
              </div>

              {/* 🔍 Search */}
              <div className="menu-search-wrap">
                <span className="menu-search-icon">🔍</span>
                <input
                  id="tableMenuSearch"
                  className="input menu-search-input"
                  type="text"
                  placeholder="Search menu items…"
                  value={menuSearch}
                  onChange={e => { setMenuSearch(e.target.value); setActiveCategory(null); }}
                />
                {menuSearch && (
                  <button className="menu-search-clear" onClick={() => setMenuSearch('')} aria-label="Clear">✕</button>
                )}
              </div>

              {/* Category filter — hidden while searching */}
              {!menuSearch && (
                <div className="menu-categories">
                  <button className={`cat-btn ${!activeCategory ? 'active' : ''}`} onClick={() => setActiveCategory(null)}>All</button>
                  {categories.map(c => (
                    <button key={c.id} className={`cat-btn ${activeCategory === c.id ? 'active' : ''}`} onClick={() => setActiveCategory(c.id)}>{c.name}</button>
                  ))}
                </div>
              )}

              {/* Menu grid */}
              {displayItems.length === 0
                ? <div className="empty-state"><div className="empty-state-icon">🔍</div><h3>No items found</h3><p>Try a different search or category</p></div>
                : (
                  <div className="menu-items-grid">
                    {displayItems.map((item, idx) => (
                      <button key={idx} className="menu-item-btn" onClick={() => addToCart(item)}>
                        <div className="menu-item-name">{item.name}</div>
                        <div className="menu-item-price">Rs {item.price?.toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            {/* RIGHT: Order summary — totals always follow cart */}
            <div style={{ display: 'flex', flexDirection: 'column', padding: 20, overflow: 'hidden' }}>
              <h4 style={{ marginBottom: 12, flexShrink: 0 }}>🛒 Order</h4>

              {/* Cart list — scrollable, capped height */}
              <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12, flexShrink: 0 }}>
                {cart.length === 0
                  ? <div className="empty-state" style={{ padding: '20px 0' }}><div className="empty-state-icon">🛒</div><p>Add items from menu</p></div>
                  : (
                    <div className="order-items-list">
                      {cart.map(item => (
                        <div key={item.cartId} className="order-item-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="order-item-name" style={{ fontSize: '0.85rem' }}>{item.name}</span>
                            <button className="btn btn-danger btn-sm" onClick={() => removeFromCart(item.cartId)}>✕</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => changeQty(item.cartId, -1)}>−</button>
                            <input
                              type="number"
                              className="qty-input-inline"
                              value={item.qty}
                              onChange={e => handleQtyChange(item.cartId, e.target.value)}
                              onBlur={e => handleQtyBlur(item.cartId, e.target.value)}
                              style={{
                                width: '40px',
                                textAlign: 'center',
                                fontWeight: 700,
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                padding: '2px 0',
                                fontSize: '0.85rem',
                              }}
                            />
                            <button className="btn btn-secondary btn-sm" onClick={() => changeQty(item.cartId, 1)}>+</button>
                            <span className="order-item-price" style={{ marginLeft: 'auto' }}>Rs {(item.price * (Number(item.qty) || 0)).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Totals + button always right below cart */}
              <div style={{ flexShrink: 0 }}>
                <textarea className="input" placeholder="Kitchen note..." value={note} onChange={e => setNote(e.target.value)} style={{ marginBottom: 12, minHeight: 60 }} />
                <div className="order-total-row"><span>Subtotal</span><span>Rs {subtotal.toLocaleString()}</span></div>
                <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {tax.toLocaleString()}</span></div>
                <div className="order-total-row grand"><span>Total</span><span>Rs {total.toLocaleString()}</span></div>
                <button id="placeOrderBtn" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={placeOrder} disabled={cart.length === 0 || saving}>
                  {saving ? '⏳ Placing...' : '✅ Place Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Discount Modal ───────────────────────────────────────────────────── */}
      {showDiscountModal && activeOrder && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDiscountModal(false)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🏷️ Apply Discount</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowDiscountModal(false)}>✕</button>
            </div>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                className={`btn ${discountType === 'pkr' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setDiscountType('pkr')}
              >Rs (Flat)</button>
              <button
                className={`btn ${discountType === 'pct' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setDiscountType('pct')}
              >% Percentage</button>
            </div>

            <div className="input-group">
              <label className="input-label">
                {discountType === 'pkr' ? 'Discount Amount (Rs)' : 'Discount Percentage (%)'}
              </label>
              <input
                className="input"
                type="number"
                min="0"
                max={discountType === 'pct' ? 100 : undefined}
                placeholder={discountType === 'pkr' ? 'e.g. 200' : 'e.g. 10'}
                value={discountInput}
                onChange={e => setDiscountInput(e.target.value)}
                autoFocus
              />
            </div>

            {/* Preview */}
            {discountInput && !isNaN(parseFloat(discountInput)) && (
              <div style={{ background: 'var(--bg-glass)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Subtotal + Tax</span>
                  <span>Rs {((activeOrder.subtotal || 0) + (activeOrder.tax || 0)).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger-light)' }}>
                  <span>Discount</span>
                  <span>- Rs {discountType === 'pct'
                    ? Math.round(((activeOrder.subtotal || 0) + (activeOrder.tax || 0)) * (parseFloat(discountInput) / 100)).toLocaleString()
                    : parseFloat(discountInput).toLocaleString()
                  }</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: 'var(--accent)', marginTop: 6 }}>
                  <span>New Total</span>
                  <span>Rs {Math.max(0, ((activeOrder.subtotal || 0) + (activeOrder.tax || 0)) - (
                    discountType === 'pct'
                      ? Math.round(((activeOrder.subtotal || 0) + (activeOrder.tax || 0)) * (parseFloat(discountInput) / 100))
                      : parseFloat(discountInput)
                  )).toLocaleString()}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowDiscountModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveDiscount}>Apply Discount</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Final Bill Modal ─────────────────────────────────────────────────── */}
      {showFinalBill && activeOrder && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && setShowFinalBill(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>💰 Final Bill — Table {selectedTable?.number}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowFinalBill(false)} disabled={saving}>✕</button>
            </div>

            {/* Bill summary */}
            <div style={{ background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: 20, border: '1px solid var(--border)' }}>
              <div className="order-total-row"><span>Subtotal</span><span>Rs {activeOrder.subtotal?.toLocaleString()}</span></div>
              <div className="order-total-row"><span>Tax ({settings?.taxRate ?? 5}%)</span><span>Rs {activeOrder.tax?.toLocaleString()}</span></div>
              {activeOrder.discountAmount > 0 && (
                <div className="order-total-row"><span>Discount</span><span style={{ color: 'var(--danger-light)' }}>- Rs {activeOrder.discountAmount.toLocaleString()}</span></div>
              )}
              <div className="order-total-row grand" style={{ marginBottom: 0 }}>
                <span>Bill Total</span><span>Rs {activeOrder.totalAmount?.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="input-group">
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

            {/* Cash received input */}
            <div className="input-group">
              <label className="input-label">💵 Cash Received (Rs)</label>
              <input
                id="cashReceivedInput"
                className="input"
                type="number"
                placeholder="Enter amount received"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                autoFocus
                style={{ fontSize: '1.2rem', fontWeight: 700 }}
              />
            </div>

            {/* Change display */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20,
              background: change >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${change >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {change >= 0 ? '💚 Change to Return' : '⚠️ Amount Short'}
              </span>
              <span style={{
                fontWeight: 800, fontSize: '1.3rem',
                color: change >= 0 ? 'var(--success-light)' : 'var(--danger-light)'
              }}>
                Rs {Math.abs(isNaN(change) ? 0 : change).toLocaleString()}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowFinalBill(false)} disabled={saving}>Cancel</button>
              <button
                id="saveFinalBillBtn"
                className="btn btn-success"
                onClick={saveFinalBill}
                disabled={saving || !cashReceived || isNaN(parseFloat(cashReceived))}
                style={{ minWidth: 160, justifyContent: 'center' }}
              >
                {saving ? '⏳ Saving...' : '✅ Save & Free Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Table Modal ─────────────────────────────────────────────────── */}
      {showAddTable && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddTable(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>➕ Add New Table</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddTable(false)}>✕</button>
            </div>
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Table Number or Name *</label>
                <input className="input" type="text" placeholder="e.g. 15 or VIP Booth" value={newTableNum} onChange={e => setNewTableNum(e.target.value)} autoFocus />
              </div>
              <div className="input-group">
                <label className="input-label">Capacity (seats)</label>
                <input className="input" type="number" placeholder="4" value={newTableCap} onChange={e => setNewTableCap(e.target.value)} />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Floor / Level</label>
              <select className="input" value={selectedFloorForTable} onChange={e => setSelectedFloorForTable(e.target.value)}>
                <option value="">-- Select Floor --</option>
                {floors.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {floors.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--danger-light)', marginTop: 4 }}>
                  ⚠️ No floors found. Add a floor first!
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddTable(false)}>Cancel</button>
              <button id="confirmAddTable" className="btn btn-primary" onClick={handleAddTable} disabled={!newTableNum || floors.length === 0}>Add Table</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Floor Modal */}
      {showAddFloor && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddFloor(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>🏢 Add New Floor</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddFloor(false)}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <div className="input-group">
                <label className="input-label">Floor Name</label>
                <input className="input" value={newFloorName} onChange={e => setNewFloorName(e.target.value)} placeholder="e.g. Ground Floor, Roof Top" autoFocus />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowAddFloor(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddFloor} disabled={!newFloorName}>Create Floor</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal — fires on Apply when PIN protection is on */}
      {showPinModal && (
        <PinModal
          title="🔐 Enter PIN to apply changes"
          onSuccess={async () => {
            setShowPinModal(false);
            if (window.__pendingSave) {
              await window.__pendingSave();
              window.__pendingSave = null;
            }
          }}
          onCancel={() => {
            setShowPinModal(false);
            window.__pendingSave = null;
          }}
        />
      )}
      {/* Swap Table Modal */}
      {showSwapModal && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={e => e.target === e.currentTarget && setShowSwapModal(false)}>
          <div className="modal" style={{ maxWidth: 520, borderRadius: 24, overflow: 'hidden', border: '1px solid var(--border-light)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, var(--bg-card), var(--bg-dark))', padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.8rem' }}>🔄</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Move Order</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>From Table {selectedTable.number} to a new location</div>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ borderRadius: '50%', width: 32, height: 32, padding: 0, justifyContent: 'center' }} onClick={() => setShowSwapModal(false)}>✕</button>
            </div>

            <div style={{ padding: '28px' }}>
              <p style={{ marginBottom: 20, fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Select an available table:</p>

              <div style={{
                maxHeight: 380,
                overflowY: 'auto',
                padding: '4px'
              }}>
                {floors.map(floor => {
                  const floorTables = tables.filter(t => t.floorId === floor.id && !activeOrderByTable[t.id]);
                  if (floorTables.length === 0) return null;

                  return (
                    <div key={floor.id} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        📍 {floor.name}
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                        gap: 12,
                      }}>
                        {floorTables.map(t => (
                          <button
                            key={t.id}
                            className="swap-table-card"
                            onClick={() => handleSwapTable(t)}
                            style={{ width: '100%' }}
                          >
                            <div className="swap-table-num">{t.number}</div>
                            <div className="swap-table-status">AVAILABLE</div>
                            <div className="swap-table-cap">🪑 {t.capacity}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {tables.filter(t => !activeOrderByTable[t.id]).length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-glass)', borderRadius: 16, border: '1px dashed var(--border)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⚠️</div>
                  <h4 style={{ margin: '0 0 4px 0' }}>No Free Tables</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>All tables are currently occupied.</p>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 28px', background: 'var(--bg-dark)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowSwapModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Order to Udhar Modal */}
      {showShiftUdharModal && shiftingOrder && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowShiftUdharModal(false)}>
          <div className="modal-content" style={{ maxWidth: 460, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
            <div className="modal-header">
              <h3>📝 Shift Order to Udhar Account</h3>
              <button className="close-btn" onClick={() => setShowShiftUdharModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', padding: 12, borderRadius: 8, fontSize: '0.85rem' }}>
                <div><strong>Order Number:</strong> #{shiftingOrder.id.slice(-6).toUpperCase()}</div>
                <div><strong>Table:</strong> Table {shiftingOrder.tableNumber || '—'}</div>
                <div><strong>Total Payable:</strong> Rs {(shiftingOrder.totalAmount || 0).toLocaleString()}</div>
                <div style={{ marginTop: 4, color: 'var(--warning-light)', fontSize: '0.78rem' }}>
                  ⚡ Shifting this order will transfer the bill to the customer's Udhar ledger and free Table {shiftingOrder.tableNumber} immediately.
                </div>
              </div>

              <div>
                <label className="input-label">👤 Customer Name *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter customer name (e.g. Ali Hassan)"
                  value={shiftCustName}
                  onChange={e => setShiftCustName(e.target.value)}
                  style={{ width: '100%' }}
                  list="existingUdharCustomers"
                />
                <datalist id="existingUdharCustomers">
                  {udharAccounts.map(a => (
                    <option key={a.id} value={a.customerName}>{a.customerPhone ? `${a.customerName} (${a.customerPhone})` : a.customerName}</option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="input-label">📞 Customer Phone Number</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter phone number (e.g. 03224776071)"
                  value={shiftCustPhone}
                  onChange={e => setShiftCustPhone(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label className="input-label">📝 Additional Notes (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Regular customer, promised to pay Friday"
                  value={shiftNote}
                  onChange={e => setShiftNote(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowShiftUdharModal(false)}>Cancel</button>
                <button
                  className="btn btn-warning"
                  style={{ fontWeight: 700, color: '#000' }}
                  onClick={handleShiftToUdhar}
                  disabled={saving}
                >
                  {saving ? '⏳ Shifting...' : '➡️ Confirm & Shift to Udhar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Udhar Bills History Modal */}
      {showUdharHistoryModal && selectedUdharAccount && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUdharHistoryModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
            <div className="modal-header">
              <h3>📜 Udhar Ledger — {selectedUdharAccount.customerName}</h3>
              <button className="close-btn" onClick={() => setShowUdharHistoryModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: 'var(--bg-lighter)', borderRadius: 8 }}>
                <div>
                  <div><strong>Phone:</strong> {selectedUdharAccount.customerPhone || 'N/A'}</div>
                  <div><strong>Account Created:</strong> {selectedUdharAccount.createdAt ? new Date(selectedUdharAccount.createdAt).toLocaleDateString() : '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Pending Balance</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--danger-light)' }}>
                    Rs {(selectedUdharAccount.totalBalance || 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <h4 style={{ margin: '8px 0 0' }}>📄 Shifted Bills History ({selectedUdharAccount.bills?.length || 0})</h4>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selectedUdharAccount.bills || []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No bills recorded yet.</div>
                ) : (
                  (selectedUdharAccount.bills || []).map((b, idx) => (
                    <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: 10, borderRadius: 8, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 4 }}>
                        <span>Bill #{b.orderCode || b.orderId?.slice(-6).toUpperCase()} ({b.note || 'Shifted bill'})</span>
                        <span style={{ color: 'var(--accent)' }}>Rs {(b.totalAmount || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        📅 {b.shiftedAt ? new Date(b.shiftedAt).toLocaleString() : '—'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Items: {b.items?.map(i => `${i.name} x${i.qty}`).join(', ')}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <h4 style={{ margin: '8px 0 0' }}>💵 Payment Receipts ({selectedUdharAccount.payments?.length || 0})</h4>
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selectedUdharAccount.payments || []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No payment receipts recorded yet.</div>
                ) : (
                  (selectedUdharAccount.payments || []).map((p, idx) => (
                    <div key={idx} style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: 10, borderRadius: 8, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--success-light)' }}>Paid via {p.paymentMethod}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📅 {new Date(p.date).toLocaleString()} — {p.note}</div>
                      </div>
                      <div style={{ fontWeight: 900, color: 'var(--success-light)', fontSize: '1.1rem' }}>
                        - Rs {(p.amountPaid || 0).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <h4 style={{ margin: '8px 0 0' }}>🏷️ Discounts Applied ({selectedUdharAccount.discounts?.length || 0})</h4>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selectedUdharAccount.discounts || []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No discounts applied yet.</div>
                ) : (
                  (selectedUdharAccount.discounts || []).map((d, idx) => (
                    <div key={idx} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: 10, borderRadius: 8, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--warning)' }}>Discount Waived</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📅 {new Date(d.date).toLocaleString()} — {d.note}</div>
                      </div>
                      <div style={{ fontWeight: 900, color: 'var(--warning)', fontSize: '1.1rem' }}>
                        - Rs {(d.discountAmount || 0).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-warning btn-sm"
                    style={{ fontWeight: 700, color: '#000' }}
                    onClick={() => {
                      setUdharDiscInput('');
                      setUdharDiscNote('');
                      setShowUdharDiscountModal(true);
                    }}
                  >
                    🏷️ Give Discount
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteUdharAccountWithPin(selectedUdharAccount)}
                  >
                    🗑️ Delete Account (PIN)
                  </button>
                </div>
                <button className="btn btn-secondary" onClick={() => setShowUdharHistoryModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Udhar Payment Clearance Modal */}
      {showUdharPayModal && selectedUdharAccount && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUdharPayModal(false)}>
          <div className="modal-content" style={{ maxWidth: 440, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
            <div className="modal-header">
              <h3>💵 Record Payment — {selectedUdharAccount.customerName}</h3>
              <button className="close-btn" onClick={() => setShowUdharPayModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Pending Udhar Balance</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--danger-light)' }}>
                  Rs {(selectedUdharAccount.totalBalance || 0).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="input-label">💵 Amount Paid (Rs) *</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Enter amount paid"
                  value={udharPayAmt}
                  onChange={e => setUdharPayAmt(e.target.value)}
                  style={{ width: '100%', fontSize: '1.2rem', fontWeight: 700 }}
                  autoFocus
                />
              </div>

              <div>
                <label className="input-label">💳 Payment Method</label>
                <select
                  className="input"
                  value={udharPayMethod}
                  onChange={e => setUdharPayMethod(e.target.value)}
                  style={{ width: '100%', fontWeight: 600 }}
                >
                  <option value="Cash">💵 Cash</option>
                  <option value="Card">💳 Card</option>
                  <option value="Online">🌐 Online / JazzCash / EasyPaisa</option>
                </select>
              </div>

              <div>
                <label className="input-label">📝 Payment Note (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Partial clearance / Full clearance"
                  value={udharPayNote}
                  onChange={e => setUdharPayNote(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowUdharPayModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={handleRecordUdharPayment} disabled={saving}>
                  {saving ? '⏳ Saving...' : '✅ Save Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Udhar Discount Modal */}
      {showUdharDiscountModal && selectedUdharAccount && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUdharDiscountModal(false)}>
          <div className="modal-content" style={{ maxWidth: 440, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
            <div className="modal-header">
              <h3>🏷️ Apply Discount — {selectedUdharAccount.customerName}</h3>
              <button className="close-btn" onClick={() => setShowUdharDiscountModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Pending Udhar Balance</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--danger-light)' }}>
                  Rs {(selectedUdharAccount.totalBalance || 0).toLocaleString()}
                </div>
              </div>

              <div>
                <label className="input-label">🏷️ Discount Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className={`btn ${udharDiscType === 'pkr' ? 'btn-warning' : 'btn-secondary'}`}
                    style={{ flex: 1, fontWeight: 700 }}
                    onClick={() => setUdharDiscType('pkr')}
                  >
                    Rs (PKR)
                  </button>
                  <button
                    className={`btn ${udharDiscType === 'pct' ? 'btn-warning' : 'btn-secondary'}`}
                    style={{ flex: 1, fontWeight: 700 }}
                    onClick={() => setUdharDiscType('pct')}
                  >
                    % (Percent)
                  </button>
                </div>
              </div>

              <div>
                <label className="input-label">Amount ({udharDiscType === 'pkr' ? 'Rs' : '%'}) *</label>
                <input
                  type="number"
                  className="input"
                  placeholder={`Enter discount in ${udharDiscType === 'pkr' ? 'Rs' : '%'}`}
                  value={udharDiscInput}
                  onChange={e => setUdharDiscInput(e.target.value)}
                  style={{ width: '100%', fontSize: '1.2rem', fontWeight: 700 }}
                  autoFocus
                />
              </div>

              <div>
                <label className="input-label">📝 Reason / Note (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Waived for customer settlement"
                  value={udharDiscNote}
                  onChange={e => setUdharDiscNote(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowUdharDiscountModal(false)}>Cancel</button>
                <button className="btn btn-warning" style={{ fontWeight: 700, color: '#000' }} onClick={handleApplyUdharDiscount} disabled={saving}>
                  {saving ? '⏳ Saving...' : '🏷️ Apply Discount'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Udhar Audit Logs Modal */}
      {showUdharLogsModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUdharLogsModal(false)}>
          <div className="modal-content" style={{ maxWidth: 640, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
            <div className="modal-header">
              <h3>📜 Udhar Audit Log &amp; Activity History</h3>
              <button className="close-btn" onClick={() => setShowUdharLogsModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Complete audit trail of all Udhar shifts, payments, discounts, and PIN-protected account deletions.
              </p>
              <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {udharLogs.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>No audit log entries recorded yet.</div>
                ) : (
                  udharLogs.map(log => {
                    let badgeColor = 'var(--accent)';
                    let badgeText = 'SHIFTED';
                    if (log.type === 'payment_recorded') {
                      badgeColor = 'var(--success-light)';
                      badgeText = 'PAYMENT';
                    } else if (log.type === 'discount_given') {
                      badgeColor = 'var(--warning)';
                      badgeText = 'DISCOUNT';
                    } else if (log.type === 'account_deleted') {
                      badgeColor = 'var(--danger-light)';
                      badgeText = 'DELETED (PIN)';
                    }
                    return (
                      <div key={log.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: 12, borderRadius: 8, fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 800, color: badgeColor, fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                            [{badgeText}]
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            📅 {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                          </span>
                        </div>
                        {log.type === 'account_deleted' ? (
                          <div>
                            <div><strong>Customer:</strong> {log.customerName} ({log.customerPhone || 'No phone'})</div>
                            <div><strong>Balance at Deletion:</strong> Rs {(log.totalBalanceAtDeletion || 0).toLocaleString()}</div>
                            <div style={{ fontStyle: 'italic', color: 'var(--danger-light)', marginTop: 2 }}>{log.reason}</div>
                          </div>
                        ) : log.type === 'discount_given' ? (
                          <div>
                            <div><strong>Discount Waived:</strong> Rs {(log.discountAmount || 0).toLocaleString()}</div>
                            {log.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Note: {log.note}</div>}
                          </div>
                        ) : log.type === 'payment_recorded' ? (
                          <div>
                            <div><strong>Payment Received:</strong> Rs {(log.amountPaid || 0).toLocaleString()} via {log.paymentMethod}</div>
                            {log.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Note: {log.note}</div>}
                          </div>
                        ) : (
                          <div>
                            <div><strong>Order Shifted:</strong> #{log.orderCode || log.orderId?.slice(-6).toUpperCase()} — Rs {(log.amount || 0).toLocaleString()}</div>
                            <div><strong>Customer:</strong> {log.customerName} ({log.customerPhone || 'No phone'})</div>
                            {log.note && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Note: {log.note}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowUdharLogsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
