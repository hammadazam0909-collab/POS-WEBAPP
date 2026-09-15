import React, { useState, useMemo, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
import { useOrders } from '../../hooks/useFirestore';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import './Owner.css';

async function generateReceiptPdfBlob(o, restaurant, settings) {
  const items = o.items || [];
  const rowsArr = [];
  items.forEach(i => {
    rowsArr.push(`<tr>
      <td style="padding:4px 0; text-align:left; border-bottom:1px dashed #eee;">${i.name}</td>
      <td style="padding:4px 0; text-align:right; border-bottom:1px dashed #eee;">${i.price}</td>
      <td style="padding:4px 0; text-align:center; border-bottom:1px dashed #eee;">${Number(i.qty).toFixed(2)}</td>
      <td style="padding:4px 0; text-align:right; border-bottom:1px dashed #eee;">${(i.price * i.qty).toLocaleString()}</td>
    </tr>`);
    
    if (i.voidedQty > 0) {
      rowsArr.push(`<tr>
        <td style="padding:4px 0; text-align:left; font-style:italic; color:#dc2626; border-bottom:1px dashed #eee;">[void] ${i.name}</td>
        <td style="padding:4px 0; text-align:right; font-style:italic; border-bottom:1px dashed #eee;">${i.price}</td>
        <td style="padding:4px 0; text-align:center; font-style:italic; border-bottom:1px dashed #eee;">-${Number(i.voidedQty).toFixed(2)}</td>
        <td style="padding:4px 0; text-align:right; font-style:italic; border-bottom:1px dashed #eee;">-${(i.price * i.voidedQty).toLocaleString()}</td>
      </tr>`);
    }
  });
  const rows = rowsArr.join('');
  const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);

  const placedAt = o.orderPlacedAt?.toDate
    ? o.orderPlacedAt.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : (o.billedAt ? new Date(o.billedAt).toLocaleString() : '—');

  const isCancelled = o.status === 'cancelled';
  const orderId = o.id ? o.id.slice(-6).toUpperCase() : 'NEW';

  const container = document.createElement('div');
  container.style.width = '280px';
  container.style.padding = '12px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.fontFamily = "'Courier New', Courier, monospace";
  container.style.fontSize = '12px';
  container.style.lineHeight = '1.4';

  container.innerHTML = `
    ${restaurant?.logo ? `<div style="text-align:center; margin-bottom:6px"><img src="${restaurant.logo}" style="max-width:100px; max-height:60px; object-fit:contain" /></div>` : ''}
    <div style="text-align:center; font-weight:bold; font-size:14px; margin-bottom:2px">${isCancelled ? 'VOID INVOICE' : 'Sales Invoice'}</div>
    <div style="text-align:center; font-weight:bold; font-size:15px; margin-bottom:8px">${restaurant?.name || 'Restaurant Name'}</div>

    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px"><span>Mop: ${o.paymentMethod || 'Cash'}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px"><span>Receipt #: ${o.id ? o.id.slice(-5) : 'NEW'}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px"><span>Date: ${placedAt}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px"><span>Mode: ${o.type ? o.type.toUpperCase() : 'SALE'}</span></div>

    <div style="text-align:center; font-weight:bold; margin:8px 0; font-size:13px">Order Number: ${orderId}</div>

    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:11px; margin-bottom:8px">
      <span>${o.type === 'dine-in' ? `Hall: Main | Table: ${o.tableNumber}` : `Cust: ${o.customerName || 'Walk-in'}`}</span>
      ${o.phone || o.customerPhone ? `<span>Phone: ${o.phone || o.customerPhone}</span>` : ''}
    </div>

    <table style="width:100%; border-collapse:collapse; font-size:11px">
      <thead>
        <tr style="border-top:1px dashed #000; border-bottom:1px dashed #000">
          <th style="text-align:left; padding:4px 0">Item</th>
          <th style="text-align:right; padding:4px 0">Price</th>
          <th style="text-align:center; padding:4px 0">Qty</th>
          <th style="text-align:right; padding:4px 0">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="border-top:1px dashed #000; margin:8px 0"></div>
    <div style="display:flex; justify-content:space-between; font-size:11px"><span>Total Items:</span><span>${totalQty.toFixed(2)}</span></div>
    <div style="display:flex; justify-content:space-between; font-size:11px"><span>Subtotal:</span><span>Rs ${(o.subtotal || 0).toLocaleString()}</span></div>
    <div style="display:flex; justify-content:space-between; font-size:11px"><span>Tax:</span><span>Rs ${(o.tax || 0).toLocaleString()}</span></div>

    ${o.discountAmount ? `
    <div style="display:flex; justify-content:space-between; font-size:11px; color:#dc2626"><span>Discount:</span><span>- Rs ${(o.discountAmount || 0).toLocaleString()}</span></div>
    ` : ''}
    
    <div style="border-top:1px dashed #000; margin:8px 0"></div>
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px"><span>Net Payable:</span><span>Rs ${(o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount : ((o.subtotal || 0) + (o.tax || 0) - (o.discountAmount || 0))).toLocaleString()}</span></div>

    ${!isCancelled && (o.cashReceived || o.paidAmount) ? `
    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px"><span>Cash Received:</span><span>Rs ${(o.cashReceived || o.paidAmount).toLocaleString()}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:12px"><span>Return Amount:</span><span>Rs ${(o.changeGiven !== undefined ? o.changeGiven : Math.max(0, (o.cashReceived || o.paidAmount) - (o.totalAmount || 0))).toLocaleString()}</span></div>
    ` : ''}

    <div style="margin-top:12px; font-size:10px; text-align:center; border-top:1px solid #ddd; padding-top:6px">
      <div>Thank you for your visit!</div>
      ${restaurant?.phone ? `<div>For Feedback: ${restaurant.phone}</div>` : ''}
      <div style="margin-top:4px; font-weight:bold">POS Digital Receipt</div>
    </div>
  `;

  document.body.appendChild(container);

  const opt = {
    margin:       [4, 4, 4, 4],
    filename:     `Invoice_${orderId}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: [80, 180], orientation: 'portrait' }
  };

  try {
    const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
    document.body.removeChild(container);
    return pdfBlob;
  } catch (err) {
    if (container.parentNode) document.body.removeChild(container);
    throw err;
  }
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
// Get business date based on opening/closing hours
function getBusinessDate(date, openTime = '00:00', closeTime = '23:59') {
  const d = date?.toDate ? date.toDate() : new Date(date);
  const ot = typeof openTime === 'string' ? openTime : '00:00';
  const ct = typeof closeTime === 'string' ? closeTime : '23:59';
  const [openH, openM] = ot.split(':').map(Number);
  const [closeH, closeM] = ct.split(':').map(Number);
  
  const openMins = openH * 60 + openM;
  const closeMins = closeH * 60 + closeM;
  const currentMins = d.getHours() * 60 + d.getMinutes();
  
  const businessDate = new Date(d);
  
  if (closeMins < openMins) {
    if (currentMins >= closeMins && currentMins < openMins) {
      // CLOSED gap
    } else if (currentMins < closeMins) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  } else {
    if (currentMins < openMins) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  }
  return businessDate;
}

function formatLocalDate(date) {
  const d = date?.toDate ? date.toDate() : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function OrderHistory() {
  const { restaurant } = useAuth();
  const { settings } = useSettings();
  const [filter, setFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // We must fetch ALL orders without a database-level date filter. 
  // If we filter by 'orderPlacedAt' in Firestore, it drops any orders that are missing that field.
  // The local filtered array handles the business date filtering perfectly.
  const { orders, updateOrder } = useOrders(null, {});
  const [searchTerm, setSearchTerm] = useState('');

  // Auto-fill dates based on current business day
  useEffect(() => {
    if (settings && !dateFrom) {
      const bizDate = getBusinessDate(new Date(), settings.openTime, settings.closeTime);
      const dateStr = formatLocalDate(bizDate);
      setDateFrom(dateStr);
      setDateTo(dateStr);
    }
  }, [settings, dateFrom]);
  const [showItemSummary, setShowItemSummary] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [voidForm, setVoidForm] = useState({}); // { [itemIndex]: { qty: 0, reason: '' } }
  
  const [whatsAppOrder, setWhatsAppOrder] = useState(null);
  const [whatsAppPhoneInput, setWhatsAppPhoneInput] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const openWhatsAppModal = (o) => {
    if (!o) return;
    setWhatsAppOrder(o);
    setWhatsAppPhoneInput(o.phone || o.customerPhone || '');
  };

  async function shareWhatsAppPdf(o, rawPhone) {
    if (!o) return;
    setGeneratingPdf(true);
    let cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('03') && cleanPhone.length === 11) {
      cleanPhone = '92' + cleanPhone.slice(1);
    }

    const orderId = o.id ? o.id.slice(-6).toUpperCase() : 'NEW';
    const netPayable = (o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount : ((o.subtotal || 0) + (o.tax || 0) - (o.discountAmount || 0))).toLocaleString();
    const msg = `🧾 *${restaurant?.name || 'SALES INVOICE'}*\nSales Invoice #${orderId} has been generated as PDF.\n📄 *Attached file:* Invoice_${orderId}.pdf\nNet Payable: Rs ${netPayable}\nThank you for visiting! 🙏`;
    const encodedMsg = encodeURIComponent(msg);
    const whatsappUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
      : `https://api.whatsapp.com/send?text=${encodedMsg}`;

    // Synchronously pre-open tab to preserve browser user activation context!
    const waWindow = window.open('about:blank', '_blank');

    try {
      const pdfBlob = await generateReceiptPdfBlob(o, restaurant, settings);
      const pdfFile = new File([pdfBlob], `Invoice_${orderId}.pdf`, { type: 'application/pdf' });

      // Native share if supported (Mobile devices)
      let sharedNatively = false;
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: `Sales Invoice #${orderId}`,
            text: `Sales Invoice #${orderId} from ${restaurant?.name || 'Restaurant'}`
          });
          sharedNatively = true;
        } catch (shareErr) {
          console.warn('Native share failed or gesture expired, falling back to download + WhatsApp web:', shareErr);
        }
      }

      if (sharedNatively) {
        if (waWindow) waWindow.close();
        setWhatsAppOrder(null);
        return;
      }

      // Download PDF file
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `Invoice_${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Redirect pre-opened window to WhatsApp
      if (waWindow) {
        waWindow.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }
      setWhatsAppOrder(null);
    } catch (err) {
      if (waWindow) waWindow.close();
      console.error(err);
      alert('Error generating PDF: ' + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function downloadPdfOnly(o) {
    if (!o) return;
    setGeneratingPdf(true);
    const orderId = o.id ? o.id.slice(-6).toUpperCase() : 'NEW';
    try {
      const pdfBlob = await generateReceiptPdfBlob(o, restaurant, settings);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `Invoice_${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Error downloading PDF: ' + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  }

  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pin, setPin] = useState('');

  const fixMissingTimestamps = async () => {
    const { db } = await import('../../firebase/config');
    const { collection, getDocs, updateDoc, doc, Timestamp } = await import('firebase/firestore');
    
    if (!restaurant?.id) {
      alert('Restaurant ID not found.');
      return;
    }

    try {
      const ref = collection(db, 'restaurants', restaurant.id, 'orders');
      const snapshot = await getDocs(ref);
      let fixedCount = 0;
      
      for (const docSnap of snapshot.docs) {
        const id = docSnap.id;
        const data = docSnap.data();
        
        // Dynamically detect if timestamps are missing or are strings
        const needsFix = 
          !data.orderPlacedAt || 
          typeof data.orderPlacedAt === 'string' || 
          !data.billedAt || 
          typeof data.billedAt === 'string';
        
        if (needsFix) {
          const updates = {};
          
          // Helper to convert to Timestamp
          const getValidTimestamp = (val) => {
            if (!val) return Timestamp.fromDate(new Date());
            if (typeof val === 'string') return Timestamp.fromDate(new Date(val));
            if (val.toDate) return val; // Already a timestamp
            return Timestamp.fromDate(new Date());
          };

          updates.orderPlacedAt = getValidTimestamp(data.orderPlacedAt || data.billedAt);
          updates.billedAt = getValidTimestamp(data.billedAt || data.orderPlacedAt);
          
          await updateDoc(doc(db, 'restaurants', restaurant.id, 'orders', id), updates);
          fixedCount++;
        }
      }
      
      alert(`Fixed ${fixedCount} orders. Please refresh the page.`);
    } catch (err) {
      console.error('Failed to fix orders:', err);
      alert('Error fixing orders.');
    }
  };

  const handlePinSubmit = () => {
    if (pin === restaurant?.ownerPin) {
      setShowPinPrompt(false);
      setPin('');
      fixMissingTimestamps();
    } else {
      alert('Incorrect PIN');
    }
  };

  // ── Receipt printer ──────────────────────────────────────────────────────────
  function printReceipt(o) {
    const items = o.items || [];
    const rowsArr = [];
    items.forEach(i => {
      rowsArr.push(`<tr>
        <td style="padding:2px 4px; text-transform:lowercase; text-align:left">${i.name}</td>
        <td style="padding:2px 4px; text-align:right">${i.price}</td>
        <td style="padding:2px 4px; text-align:center">${Number(i.qty).toFixed(2)}</td>
        <td style="padding:2px 4px; text-align:right">${(i.price * i.qty)}</td>
      </tr>`);
      
      if (i.voidedQty > 0) {
        rowsArr.push(`<tr>
          <td style="padding:2px 4px; text-transform:lowercase; text-align:left; font-style:italic;">[void] ${i.name}</td>
          <td style="padding:2px 4px; text-align:right; font-style:italic;">${i.price}</td>
          <td style="padding:2px 4px; text-align:center; font-style:italic;">-${Number(i.voidedQty).toFixed(2)}</td>
          <td style="padding:2px 4px; text-align:right; font-style:italic;">-${(i.price * i.voidedQty)}</td>
        </tr>`);
      }
    });
    const rows = rowsArr.join('');
    const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);

    const placedAt = o.orderPlacedAt?.toDate
      ? o.orderPlacedAt.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : o.billedAt ? new Date(o.billedAt).toLocaleString() : '—';

    const isCancelled = o.status === 'cancelled';

    const html = `<html><head><title>${isCancelled ? 'Cancelled Order' : 'Final Bill'}</title>
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
        .cancelled-watermark { color: red; border: 2px solid red; padding: 5px; transform: rotate(-10deg); font-weight: bold; position: absolute; top: 100px; left: 50%; margin-left: -50px; font-size: 20px; opacity: 0.3; }
        @media print {
          body { margin: 0; padding: 5px; }
        }
      </style></head>
      <body>
        <div class="logo-wrap">
          ${restaurant?.logo ? `<img src="${restaurant.logo}" alt="Logo" />` : '<h2>LOGO</h2>'}
        </div>
        <div class="text-center bold header-title">${isCancelled ? 'VOID INVOICE' : 'Sales Invoice'}</div>
        <div class="text-center bold restaurant-name">${restaurant?.name || 'Restaurant Name'}</div>
        
        ${isCancelled ? '<div class="cancelled-watermark">CANCELLED</div>' : ''}

        <div class="meta-row"><span>Mop: ${o.paymentMethod || 'Cash'}</span></div>
        <div class="meta-row"><span>Receipt #: ${o.id.slice(-5)}</span><span>Register: ${settings?.registerName || 'Reg01'}</span></div>
        <div class="meta-row"><span>Date: ${placedAt}</span></div>
        <div class="meta-row"><span>Mode: ${o.type.toUpperCase()}</span></div>
        
        <div class="text-center bold" style="margin:10px 0">Order Number: ${o.id.slice(-6).toUpperCase()}</div>
        
        <div class="meta-row"><span>${o.type === 'dine-in' ? `Hall: Main | Table: ${o.tableNumber}` : `Cust: ${o.customerName || 'Walk-in'}`}</span>${o.phone ? `<span>Phone: ${o.phone}</span>` : ''}</div>
        
        <table>
          <thead>
            <tr>
              <th style="text-align:left; width:40%; padding:5px 4px">Item</th>
              <th style="text-align:right; width:20%; padding:5px 4px">Price</th>
              <th style="text-align:center; width:20%; padding:5px 4px">Qty</th>
              <th style="text-align:right; width:20%; padding:5px 4px">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
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
        <div class="meta-row bold" style="font-size:13px"><span>Net Payable:</span><span>${(o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount : ((o.subtotal || 0) + (o.tax || 0) - (o.discountAmount || 0))).toLocaleString()}</span></div>

        ${!isCancelled && (o.cashReceived || o.paidAmount) ? `
        <div class="meta-row"><span>Cash Received:</span><span>Rs ${(o.cashReceived || o.paidAmount).toLocaleString()}</span></div>
        <div class="meta-row bold" style="font-size:12px"><span>Return Amount:</span><span>Rs ${(o.changeGiven !== undefined ? o.changeGiven : Math.max(0, (o.cashReceived || o.paidAmount) - (o.totalAmount || 0))).toLocaleString()}</span></div>
        ` : ''}

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
  }

  function shareWhatsApp(o) {
    if (!o) return;
    let initialPhone = o.phone || o.customerPhone || '';
    const inputPhone = window.prompt("Enter customer WhatsApp number (or leave blank to select contact in WhatsApp):", initialPhone);
    if (inputPhone === null) return;

    let cleanPhone = inputPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('03') && cleanPhone.length === 11) {
      cleanPhone = '92' + cleanPhone.slice(1);
    }

    const items = o.items || [];
    const itemsLines = items.map(i => {
      let line = `• ${i.name} x${i.qty} — Rs ${(i.price * i.qty).toLocaleString()}`;
      if (i.voidedQty > 0) {
        line += `\n   [Voided x${i.voidedQty}: -Rs ${(i.price * i.voidedQty).toLocaleString()}]`;
      }
      return line;
    }).join('\n');

    const placedAt = o.orderPlacedAt?.toDate
      ? o.orderPlacedAt.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : (o.billedAt ? new Date(o.billedAt).toLocaleString() : '—');

    const orderId = o.id ? o.id.slice(-6).toUpperCase() : 'NEW';
    const typeLabel = o.type === 'dine-in' ? `Dine-In (Table ${o.tableNumber || '—'})` : (o.type === 'delivery' ? 'Delivery' : 'Takeaway');
    const custLabel = o.customerName || 'Customer';

    const isCancelled = o.status === 'cancelled';
    const totalWithoutDiscount = (o.subtotal || 0) + (o.tax || 0);
    const effectiveTotal = o.totalAmount !== undefined && o.totalAmount !== null
      ? o.totalAmount
      : (totalWithoutDiscount - (o.discountAmount || 0));

    let msg = `🧾 *${restaurant?.name || 'SALES INVOICE'}*\n`;
    if (isCancelled) msg += `⚠️ *VOID / CANCELLED INVOICE*\n`;
    msg += `--------------------------------\n`;
    msg += `*Order #:* ${orderId}\n`;
    msg += `*Type:* ${typeLabel}\n`;
    msg += `*Customer:* ${custLabel}\n`;
    if (cleanPhone) msg += `*Phone:* +${cleanPhone}\n`;
    msg += `*Date:* ${placedAt}\n`;
    msg += `--------------------------------\n`;
    msg += `*ITEMS:*\n${itemsLines}\n`;
    msg += `--------------------------------\n`;
    msg += `*Subtotal:* Rs ${(o.subtotal || 0).toLocaleString()}\n`;
    if (o.tax) msg += `*Tax:* Rs ${o.tax.toLocaleString()}\n`;
    if (o.discountAmount) msg += `*Discount:* -Rs ${o.discountAmount.toLocaleString()}\n`;
    msg += `*NET TOTAL:* *Rs ${effectiveTotal.toLocaleString()}*\n`;

    if (!isCancelled && (o.cashReceived || o.paidAmount)) {
      const cashRec = o.cashReceived || o.paidAmount;
      const changeGiven = o.changeGiven !== undefined ? o.changeGiven : Math.max(0, cashRec - effectiveTotal);
      msg += `*Cash Received:* Rs ${cashRec.toLocaleString()}\n`;
      msg += `*Return Amount:* Rs ${changeGiven.toLocaleString()}\n`;
    }

    msg += `--------------------------------\n`;
    msg += `Thank you for visiting! 🙏\n`;
    if (restaurant?.phone) msg += `For feedback: ${restaurant.phone}\n`;

    const encoded = encodeURIComponent(msg);
    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(url, '_blank');
  }

  const completed = orders.filter(o =>
    ['served', 'delivered', 'collected', 'cancelled', 'billed'].includes(o.status)
  );

  const filtered = completed.filter(o => {
    if (filter !== 'all' && o.type !== filter) return false;
    if (dateFrom || dateTo) {
      const dateToCheck = o.orderPlacedAt || o.billedAt;
      const d = dateToCheck?.toDate ? dateToCheck.toDate() : new Date(dateToCheck || 0);
      
      const ot = settings?.openTime || '00:00';
      const ct = settings?.closeTime || '23:59';
      const [openH, openM] = ot.split(':').map(Number);
      const [closeH, closeM] = ct.split(':').map(Number);
      
      if (dateFrom) {
        const start = new Date(dateFrom);
        start.setHours(closeH, closeM, 0, 0);
        if (d < start) return false;
      }
      
      if (dateTo) {
        const end = new Date(dateTo);
        // If close time is earlier than open time, it crosses midnight!
        if (closeH < openH || (closeH === openH && closeM < openM)) {
          end.setDate(end.getDate() + 1);
        }
        end.setHours(closeH, closeM, 0, 0);
        if (d > end) return false;
      }
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchName = o.customerName?.toLowerCase().includes(s);
      const tableStr = o.tableNumber ? `table ${o.tableNumber}` : '';
      const shortTableStr = o.tableNumber ? `t${o.tableNumber}` : '';
      // Use exact match to prevent "Table 1" from matching "Table 11", "Table 12", etc.
      const matchTable = (s === tableStr) || (s === shortTableStr) || (s === o.tableNumber?.toString());
      const matchId = o.id?.toLowerCase().includes(s);
      const matchStatus = o.status?.toLowerCase().includes(s);
      const matchItems = o.items?.some(item => item.name.toLowerCase().includes(s));

      if (!matchName && !matchTable && !matchId && !matchStatus && !matchItems) return false;
    }

    return true;
  }).sort((a, b) => {
    const dateA = a.orderPlacedAt?.toDate ? a.orderPlacedAt.toDate() : (a.billedAt ? new Date(a.billedAt) : new Date(0));
    const dateB = b.orderPlacedAt?.toDate ? b.orderPlacedAt.toDate() : (b.billedAt ? new Date(b.billedAt) : new Date(0));
    return dateB - dateA; // Newest first
  });

  const itemSummary = useMemo(() => {
    const summary = {};
    filtered.forEach(o => {
      if (o.status === 'cancelled') return;
      (o.items || []).forEach(item => {
        const name = item.name;
        const qty = Number(item.qty) || 0;
        summary[name] = (summary[name] || 0) + qty;
      });
    });
    return Object.entries(summary)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const displayedItems = useMemo(() => {
    return itemSummary.filter(item => 
      item.name.toLowerCase().includes(itemSearchTerm.toLowerCase())
    );
  }, [itemSummary, itemSearchTerm]);

  const { totalRevenue, totalMatchingQty, isItemSpecificSearch } = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    let rev = 0;
    let qtyCount = 0;
    let isItemSearch = false;

    if (s) {
      const matchingItemsExist = filtered.some(o => 
        o.items?.some(i => i.name.toLowerCase().includes(s))
      );
      const matchingHeaderExist = filtered.some(o => 
        o.customerName?.toLowerCase().includes(s) || 
        o.id?.toLowerCase().includes(s) || 
        o.status?.toLowerCase().includes(s) ||
        (o.tableNumber && `table ${o.tableNumber}`.toLowerCase().includes(s)) ||
        (o.tableNumber && `t${o.tableNumber}`.toLowerCase().includes(s))
      );

      if (matchingItemsExist && !matchingHeaderExist) {
        isItemSearch = true;
      }
    }

    filtered.filter(o => ['billed', 'collected', 'delivered'].includes(o.status)).forEach(o => {
      if (isItemSearch) {
        (o.items || []).forEach(item => {
          if (item.name.toLowerCase().includes(s)) {
            const netQty = Math.max(0, (Number(item.qty) || 0) - (Number(item.voidedQty) || 0));
            rev += (Number(item.price) || 0) * netQty;
            qtyCount += netQty;
          }
        });
      } else {
        rev += ((o.totalAmount || 0) - (o.refundedAmount || 0));
      }
    });

    return { totalRevenue: rev, totalMatchingQty: qtyCount, isItemSpecificSearch: isItemSearch };
  }, [filtered, searchTerm]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">📜 Order History</h1>
        <p className="page-subtitle">View past orders and reprint receipts</p>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPinPrompt(true)} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '6px 12px', borderRadius: 6 }}>🔧 Fix Missing Orders</button>
        </div>
      </div>

      <div className="content-area">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['all', 'All'], ['dine-in', 'Dine-in'], ['delivery', 'Delivery'], ['takeaway', 'Takeaway']].map(([key, label]) => (
                <button key={key} id={`histFilter-${key}`} className={`btn ${filter === key ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setFilter(key)}>{label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 150 }} />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 150 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                placeholder="🔍 Search by name, ID, items..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: 220 }}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => setShowItemSummary(true)}>📊 Item Summary</button>
            </div>
          </div>
        </div>

        {/* Revenue summary */}
        <div className="stat-card" style={{ marginBottom: 20 }}>
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)' }}>💰</div>
          <div>
            <div className="stat-label">
              {isItemSpecificSearch
                ? `Item Revenue for "${searchTerm}" (${totalMatchingQty} sold across ${filtered.filter(o => o.status !== 'cancelled').length} orders)`
                : `Total Revenue (${filtered.filter(o => o.status !== 'cancelled').length} orders)`
              }
            </div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>Rs {totalRevenue.toLocaleString()}</div>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ overflowX: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📜</div><h3>No records found</h3><p>Adjust your filters</p></div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Type', 'Customer/Table', 'Items', 'Amount', 'Status', 'Date & Time', 'Receipt'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const voidedItemsList = [];
                  if (o.voidLogs && o.voidLogs.length > 0) {
                    const voidMap = {};
                    o.voidLogs.forEach(vl => {
                      const name = vl.itemName || vl.name;
                      if (name) voidMap[name] = (voidMap[name] || 0) + (Number(vl.qty) || 1);
                    });
                    Object.entries(voidMap).forEach(([name, qty]) => {
                      voidedItemsList.push(`${name} ×${qty}`);
                    });
                  } else if (o.items && o.items.some(i => i.voidedQty > 0)) {
                    o.items.forEach(i => {
                      if (i.voidedQty > 0) voidedItemsList.push(`${i.name} ×${i.voidedQty}`);
                    });
                  }

                  let orderItemRev = 0;
                  let orderItemQty = 0;
                  if (isItemSpecificSearch && searchTerm.trim()) {
                    const s = searchTerm.trim().toLowerCase();
                    (o.items || []).forEach(item => {
                      if (item.name.toLowerCase().includes(s)) {
                        const netQty = Math.max(0, (Number(item.qty) || 0) - (Number(item.voidedQty) || 0));
                        orderItemRev += (Number(item.price) || 0) * netQty;
                        orderItemQty += netQty;
                      }
                    });
                  }

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${o.type === 'dine-in' ? 'badge-info' : o.type === 'delivery' ? 'badge-warning' : 'badge-success'}`}>
                          {o.type === 'dine-in' ? '🪑' : o.type === 'delivery' ? '🚗' : '🥡'} {o.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 500 }}>
                        {o.type === 'dine-in' ? `Table ${o.tableNumber || '—'}` : o.customerName || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        <div>{o.items?.length || 0} items</div>
                        {voidedItemsList.length > 0 && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: '#f87171',
                            fontWeight: 700,
                            marginTop: 4,
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            display: 'inline-block'
                          }}>
                            🚫 Void: {voidedItemsList.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: o.status === 'cancelled' ? 'var(--text-muted)' : 'var(--accent)' }}>
                        {o.status === 'cancelled' ? '—' : (
                          isItemSpecificSearch ? (
                            <div>
                              <div>Rs {orderItemRev.toLocaleString()} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>({orderItemQty}× item)</span></div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>Order Total: Rs {(o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount : ((o.subtotal || 0) + (o.tax || 0) - (o.discountAmount || 0))).toLocaleString()}</div>
                            </div>
                          ) : (
                            `Rs ${(o.totalAmount !== undefined && o.totalAmount !== null ? o.totalAmount : ((o.subtotal || 0) + (o.tax || 0) - (o.discountAmount || 0))).toLocaleString()}`
                          )
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <span className={`badge ${o.status === 'cancelled' ? 'badge-danger' :
                              o.status === 'billed' ? 'badge-warning' :
                                'badge-success'
                            }`}>
                            {o.status}
                          </span>
                          {voidedItemsList.length > 0 && (
                            <span style={{
                              fontSize: '0.72rem',
                              color: '#f87171',
                              fontWeight: 700,
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              marginTop: 2
                            }}>
                              🚫 Voided Items
                            </span>
                          )}
                          {o.inventorySynced && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              ✅ Stock Synced
                            </span>
                          )}
                          {o.cancellationReason && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 140 }}>
                              ↳ {o.cancellationReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {o.orderPlacedAt?.toDate ? o.orderPlacedAt.toDate().toLocaleString() : (o.billedAt ? new Date(o.billedAt).toLocaleString() : '—')}
                      </td>
                      {/* Action buttons */}
                      <td style={{ padding: '10px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => printReceipt(o)}
                          title="Reprint receipt"
                        >
                          🖨️ Print
                        </button>
                        <button
                          className="btn btn-success btn-sm"
                          style={{ whiteSpace: 'nowrap', background: '#25D366', color: '#fff', border: 'none', fontWeight: 600 }}
                          onClick={() => openWhatsAppModal(o)}
                          title="Send bill on WhatsApp directly"
                        >
                          💬 WhatsApp
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => { setSelectedOrder(o); setShowDetailModal(true); }}
                          title="View details & Return"
                        >
                          👁️ View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* Item Summary Modal */}
        {showItemSummary && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 500, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
              <div className="modal-header">
                <h3>📊 Item Sales Summary</h3>
                <button className="close-btn" onClick={() => setShowItemSummary(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 15 }}>
                  Showing total quantities sold for the filtered list (${filtered.length} orders).
                </p>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Search items..." 
                  value={itemSearchTerm} 
                  onChange={e => setItemSearchTerm(e.target.value)} 
                  style={{ marginBottom: 15, width: '100%', padding: '8px 12px' }}
                />
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-lighter)' }}>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Item Name</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Qty Sold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedItems.map(item => (
                        <tr key={item.name} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px' }}>{item.name}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>{item.qty}</td>
                        </tr>
                      ))}
                      {itemSummary.length === 0 && (
                        <tr>
                          <td colSpan="2" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No items found in filtered orders.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedOrder && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 650, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
              <div className="modal-header">
                <h3>Order Details - {selectedOrder.id.slice(-6).toUpperCase()}</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className="btn btn-success btn-sm"
                    style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 600 }}
                    onClick={() => openWhatsAppModal(selectedOrder)}
                  >
                    💬 WhatsApp Bill
                  </button>
                  {!selectedOrder.inventorySynced && (
                    <button className="btn btn-warning btn-sm" onClick={async () => {
                      if(!window.confirm('Are you SURE you want to deduct inventory for this order? Only do this if it was missed previously, otherwise you will double-deduct stock!')) return;
                      try {
                        const { deductInventoryForItems } = await import('../../hooks/useFirestore');
                        await deductInventoryForItems(restaurant?.id, selectedOrder.items);
                        // Use the updateOrder from the component's useOrders hook
                        await updateOrder(selectedOrder.id, { inventorySynced: true });
                        alert('Inventory deducted successfully!');
                        setSelectedOrder({...selectedOrder, inventorySynced: true});
                      } catch(err) {
                        alert('Error: ' + err.message);
                      }
                    }}>📉 Sync Inventory</button>
                  )}
                  <button className="close-btn" onClick={() => { setShowDetailModal(false); setSelectedOrder(null); setVoidForm({}); }}>&times;</button>
                </div>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Customer/Table</div>
                    <div style={{ fontWeight: 600 }}>{selectedOrder.type === 'dine-in' ? `Table ${selectedOrder.tableNumber}` : selectedOrder.customerName || 'Walk-in'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status</div>
                    <span className={`badge ${selectedOrder.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>{selectedOrder.status}</span>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Void Qty</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((item, idx) => {
                      const remainingQty = item.qty - (item.voidedQty || 0);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px' }}>
                            {item.name}
                            {item.voidedQty > 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--danger-light)' }}>
                                ↳ Voided: {item.voidedQty}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>Rs {item.price.toLocaleString()}</td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input
                              type="number"
                              className="input"
                              style={{ width: 60, padding: '4px', textAlign: 'center' }}
                              min="0"
                              max={remainingQty}
                              value={voidForm[idx]?.qty || ''}
                              onChange={e => setVoidForm({ ...voidForm, [idx]: { ...voidForm[idx], qty: Number(e.target.value) } })}
                              disabled={selectedOrder.status === 'cancelled' || remainingQty <= 0}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              className="input"
                              style={{ width: '100%', padding: '4px' }}
                              placeholder="Reason"
                              value={voidForm[idx]?.reason || ''}
                              onChange={e => setVoidForm({ ...voidForm, [idx]: { ...voidForm[idx], reason: e.target.value } })}
                              disabled={selectedOrder.status === 'cancelled' || remainingQty <= 0}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {selectedOrder.status !== 'cancelled' && (
                  <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        const itemsToVoid = [];
                        let hasError = false;

                        Object.entries(voidForm).forEach(([idx, data]) => {
                          const item = selectedOrder.items[idx];
                          const remainingQty = item.qty - (item.voidedQty || 0);
                          if (data.qty > 0) {
                            if (data.qty > remainingQty) {
                              alert(`Cannot void more than remaining quantity for ${item.name}`);
                              hasError = true;
                              return;
                            }
                            if (!data.reason) {
                              alert(`Please enter a reason for voiding ${item.name}`);
                              hasError = true;
                              return;
                            }
                            itemsToVoid.push({ ...item, qty: data.qty, reason: data.reason, originalIdx: idx });
                          }
                        });

                        if (hasError || itemsToVoid.length === 0) return;

                        if (!window.confirm('Are you sure you want to process this return/void?')) return;

                        try {
                          // 1. Update order in DB
                          const updatedItems = [...selectedOrder.items];
                          const voidLogs = selectedOrder.voidLogs || [];

                          itemsToVoid.forEach(vItem => {
                            const idx = vItem.originalIdx;
                            updatedItems[idx].voidedQty = (updatedItems[idx].voidedQty || 0) + vItem.qty;
                            voidLogs.push({
                              itemName: vItem.name,
                              qty: vItem.qty,
                              reason: vItem.reason,
                              voidedAt: new Date().toISOString(),
                              staff: 'Manager' // Fallback or use auth
                            });
                          });

                          const refundAmount = itemsToVoid.reduce((sum, item) => sum + (item.price * item.qty), 0);

                          await updateOrder(selectedOrder.id, {
                            items: updatedItems,
                            voidLogs: voidLogs,
                            refundedAmount: (selectedOrder.refundedAmount || 0) + refundAmount
                          });

                          // 2. Restore Inventory (pass negative quantities!)
                          const inventoryRestoreItems = itemsToVoid.map(item => ({
                            ...item,
                            qty: -item.qty // Negative to restore!
                          }));

                          const { deductInventoryForItems } = await import('../../hooks/useFirestore');
                          await deductInventoryForItems(restaurant?.id, inventoryRestoreItems);

                          alert('Return processed successfully! Inventory restored.');
                          setShowDetailModal(false);
                          setSelectedOrder(null);
                          setVoidForm({});
                        } catch (err) {
                          alert('Error processing return: ' + err.message);
                        }
                      }}
                    >
                      Process Return / Void
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PIN Prompt Modal */}
      {showPinPrompt && (
        <div className="modal-overlay" onClick={() => setShowPinPrompt(false)}>
          <div className="modal" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Enter Owner PIN</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowPinPrompt(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 15 }}>This action is restricted. Please enter the owner PIN to proceed.</p>
              <input 
                type="password" 
                value={pin} 
                onChange={e => setPin(e.target.value)} 
                maxLength={6} 
                className="input" 
                autoFocus 
                style={{ width: '100%', textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
                onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-secondary" onClick={() => setShowPinPrompt(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handlePinSubmit}>Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Modal */}
      {whatsAppOrder && (() => {
        const o = whatsAppOrder;
        let cleanPhone = whatsAppPhoneInput.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('03') && cleanPhone.length === 11) {
          cleanPhone = '92' + cleanPhone.slice(1);
        }

        const items = o.items || [];
        const itemsLines = items.map(i => {
          let line = `• ${i.name} x${i.qty} — Rs ${(i.price * i.qty).toLocaleString()}`;
          if (i.voidedQty > 0) {
            line += `\n   [Voided x${i.voidedQty}: -Rs ${(i.price * i.voidedQty).toLocaleString()}]`;
          }
          return line;
        }).join('\n');

        const placedAt = o.orderPlacedAt?.toDate
          ? o.orderPlacedAt.toDate().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : (o.billedAt ? new Date(o.billedAt).toLocaleString() : '—');

        const orderId = o.id ? o.id.slice(-6).toUpperCase() : 'NEW';
        const typeLabel = o.type === 'dine-in' ? `Dine-In (Table ${o.tableNumber || '—'})` : (o.type === 'delivery' ? 'Delivery' : 'Takeaway');
        const custLabel = o.customerName || 'Customer';

        const isCancelled = o.status === 'cancelled';
        const totalWithoutDiscount = (o.subtotal || 0) + (o.tax || 0);
        const effectiveTotal = o.totalAmount !== undefined && o.totalAmount !== null
          ? o.totalAmount
          : (totalWithoutDiscount - (o.discountAmount || 0));

        let msg = `🧾 *${restaurant?.name || 'SALES INVOICE'}*\n`;
        if (isCancelled) msg += `⚠️ *VOID / CANCELLED INVOICE*\n`;
        msg += `--------------------------------\n`;
        msg += `*Order #:* ${orderId}\n`;
        msg += `*Type:* ${typeLabel}\n`;
        msg += `*Customer:* ${custLabel}\n`;
        if (cleanPhone) msg += `*Phone:* +${cleanPhone}\n`;
        msg += `*Date:* ${placedAt}\n`;
        msg += `--------------------------------\n`;
        msg += `*ITEMS:*\n${itemsLines}\n`;
        msg += `--------------------------------\n`;
        msg += `*Subtotal:* Rs ${(o.subtotal || 0).toLocaleString()}\n`;
        if (o.tax) msg += `*Tax:* Rs ${o.tax.toLocaleString()}\n`;
        if (o.discountAmount) msg += `*Discount:* -Rs ${o.discountAmount.toLocaleString()}\n`;
        msg += `*NET TOTAL:* *Rs ${effectiveTotal.toLocaleString()}*\n`;

        if (!isCancelled && (o.cashReceived || o.paidAmount)) {
          const cashRec = o.cashReceived || o.paidAmount;
          const changeGiven = o.changeGiven !== undefined ? o.changeGiven : Math.max(0, cashRec - effectiveTotal);
          msg += `*Cash Received:* Rs ${cashRec.toLocaleString()}\n`;
          msg += `*Return Amount:* Rs ${changeGiven.toLocaleString()}\n`;
        }

        msg += `--------------------------------\n`;
        msg += `Thank you for visiting! 🙏\n`;
        if (restaurant?.phone) msg += `For feedback: ${restaurant.phone}\n`;

        const encoded = encodeURIComponent(msg);
        const whatsappUrl = cleanPhone
          ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
          : `https://api.whatsapp.com/send?text=${encoded}`;

        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setWhatsAppOrder(null)}>
            <div className="modal-content" style={{ maxWidth: 480, background: 'var(--bg-dark)', border: '1px solid var(--border)' }}>
              <div className="modal-header">
                <h3>💬 Send Bill on WhatsApp</h3>
                <button className="close-btn" onClick={() => setWhatsAppOrder(null)}>&times;</button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                    Customer WhatsApp Phone Number:
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.95rem' }}
                    placeholder="e.g. 03224776071 or 923224776071"
                    value={whatsAppPhoneInput}
                    onChange={e => setWhatsAppPhoneInput(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                    Message Preview:
                  </label>
                  <pre style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid var(--border)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 220,
                    overflowY: 'auto',
                    color: 'var(--text-primary)',
                    margin: 0
                  }}>
                    {msg}
                  </pre>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => setWhatsAppOrder(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => downloadPdfOnly(o)}
                    title="Download receipt as PDF file"
                  >
                    📄 Download PDF
                  </button>
                  <a
                    className="btn btn-success"
                    style={{
                      background: '#25D366',
                      color: '#fff',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      padding: '8px 16px',
                      borderRadius: 6
                    }}
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setWhatsAppOrder(null)}
                  >
                    🚀 Send Bill on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
