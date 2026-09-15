import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../hooks/useFirestore';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import './Owner.css';

export default function Vendors() {
  const { restaurant } = useAuth();
  const { items: inventoryItems, updateItem } = useInventory();

  // Active Tab
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'purchases' | 'ledger' | 'payments' | 'analytics'

  // Vendors state
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);

  // Purchases state
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseDateFilter, setPurchaseDateFilter] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Ledger state
  const [selectedLedgerVendor, setSelectedLedgerVendor] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [allLedgerEntries, setAllLedgerEntries] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerDateFilter, setLedgerDateFilter] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Payments state
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsDateFilter, setPaymentsDateFilter] = useState({
    from: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Modal / Form States
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorPayload, setVendorPayload] = useState({
    name: '',
    companyName: '',
    phone: '',
    whatsapp: '',
    cnicNtn: '',
    email: '',
    address: '',
    suppliedCategories: '',
    openingBalance: 0,
    paymentTerms: 'COD', // 'COD' | 'Net 15' | 'Net 30' | 'Net 60'
    status: 'active', // 'active' | 'inactive' | 'blocked'
    notes: ''
  });

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchasePayload, setPurchasePayload] = useState({
    vendorId: '',
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    items: [{ inventoryId: '', name: '', quantity: 1, unit: '', price: 0, subtotal: 0 }],
    tax: 0,
    discount: 0,
    transportCharges: 0,
    paidAmount: 0,
    paymentMethod: 'cash',
    dueDate: '',
    notes: '',
    attachmentUrl: ''
  });

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentPayload, setPaymentPayload] = useState({
    vendorId: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash', // 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'cheque'
    referenceNumber: '',
    notes: ''
  });

  const [savingVendor, setSavingVendor] = useState(false);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  // Search and Pagination
  const [vendorSearch, setVendorSearch] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');

  // ─── FIRESTORE LOADERS ────────────────────────────────────────────────────────

  // Fetch Vendors
  const fetchVendors = async () => {
    if (!restaurant?.id) return;
    try {
      setVendorsLoading(true);
      const q = query(collection(db, 'restaurants', restaurant.id, 'vendors'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVendors(list);
    } catch (err) {
      console.error("Error fetching vendors: ", err);
    } finally {
      setVendorsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [restaurant?.id]);

  // Fetch Purchases
  const fetchPurchases = async () => {
    if (!restaurant?.id) return;
    try {
      setPurchasesLoading(true);
      const q = query(
        collection(db, 'restaurants', restaurant.id, 'vendorPurchases'),
        where('date', '>=', purchaseDateFilter.from),
        where('date', '<=', purchaseDateFilter.to),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPurchases(list);
    } catch (err) {
      console.warn("Index might be missing, falling back to client-side filtering for purchases: ", err);
      try {
        const qFallback = collection(db, 'restaurants', restaurant.id, 'vendorPurchases');
        const snap = await getDocs(qFallback);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.date >= purchaseDateFilter.from && p.date <= purchaseDateFilter.to)
          .sort((a, b) => b.date.localeCompare(a.date));
        setPurchases(list);
      } catch (fallbackErr) {
        console.error("Fallback purchases fetching failed: ", fallbackErr);
      }
    } finally {
      setPurchasesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'purchases' || activeTab === 'analytics') {
      fetchPurchases();
    }
  }, [activeTab, purchaseDateFilter.from, purchaseDateFilter.to, restaurant?.id]);

  // Fetch Payments
  const fetchPayments = async () => {
    if (!restaurant?.id) return;
    try {
      setPaymentsLoading(true);
      const q = query(
        collection(db, 'restaurants', restaurant.id, 'vendorPayments'),
        where('date', '>=', paymentsDateFilter.from),
        where('date', '<=', paymentsDateFilter.to),
        orderBy('date', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayments(list);
    } catch (err) {
      console.warn("Index might be missing, falling back to client-side filtering for payments: ", err);
      try {
        const qFallback = collection(db, 'restaurants', restaurant.id, 'vendorPayments');
        const snap = await getDocs(qFallback);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.date >= paymentsDateFilter.from && p.date <= paymentsDateFilter.to)
          .sort((a, b) => b.date.localeCompare(a.date));
        setPayments(list);
      } catch (fallbackErr) {
        console.error("Fallback payments fetching failed: ", fallbackErr);
      }
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'payments') {
      fetchPayments();
    }
  }, [activeTab, paymentsDateFilter.from, paymentsDateFilter.to, restaurant?.id]);

  // Fetch Ledger for selected vendor
  const fetchLedger = async (vendorId) => {
    if (!restaurant?.id || !vendorId) return;
    try {
      setLedgerLoading(true);
      // Fetch ALL ledger entries for this vendor to calculate dynamic running balances correctly
      const q = query(
        collection(db, 'restaurants', restaurant.id, 'vendorLedger'),
        where('vendorId', '==', vendorId)
      );
      const snap = await getDocs(q);
      const rawList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Sort chronologically:
      // - First, opening_balance entry (if any)
      // - Second, by date split ascending
      // - Third, by createdAt serverTimestamp ascending
      const sortedList = [...rawList].sort((a, b) => {
        if (a.type === 'opening_balance' && b.type !== 'opening_balance') return -1;
        if (b.type === 'opening_balance' && a.type !== 'opening_balance') return 1;
        
        const dateComp = (a.date || '').localeCompare(b.date || '');
        if (dateComp !== 0) return dateComp;

        // Fallback to createdAt or id
        const timeA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });

      // Compute dynamic running balances
      let currentBal = 0;
      const processed = sortedList.map(entry => {
        const credit = parseFloat(entry.credit || 0);
        const debit = parseFloat(entry.debit || 0);
        
        if (entry.type === 'opening_balance') {
          currentBal = credit;
        } else {
          currentBal = currentBal + credit - debit;
        }

        return {
          ...entry,
          runningBalance: currentBal
        };
      });

      setAllLedgerEntries(processed);

      // Now filter by date range for the current displayed ledgerEntries state
      const filtered = processed.filter(e => e.date >= ledgerDateFilter.from && e.date <= ledgerDateFilter.to);
      setLedgerEntries(filtered);

    } catch (err) {
      console.error("Error fetching and processing ledger: ", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ledger' && selectedLedgerVendor) {
      fetchLedger(selectedLedgerVendor);
    }
  }, [activeTab, selectedLedgerVendor, ledgerDateFilter.from, ledgerDateFilter.to, restaurant?.id]);

  // ─── CRUD ACTIONS ────────────────────────────────────────────────────────────

  // Add / Edit Vendor
  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!restaurant?.id || savingVendor) return;

    setSavingVendor(true);
    try {
      const payload = {
        ...vendorPayload,
        openingBalance: parseFloat(vendorPayload.openingBalance || 0),
        currentBalance: editingVendor
          ? parseFloat(editingVendor.currentBalance || 0)
          : parseFloat(vendorPayload.openingBalance || 0),
        updatedAt: serverTimestamp()
      };

      if (editingVendor) {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'vendors', editingVendor.id), payload);
        alert('Vendor updated successfully!');
      } else {
        payload.currentBalance = payload.openingBalance;
        payload.createdAt = serverTimestamp();
        
        const newVendorRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'vendors'), payload);
        
        // Add Opening Balance to Ledger if greater than 0
        if (payload.openingBalance > 0) {
          await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorLedger'), {
            vendorId: newVendorRef.id,
            vendorName: payload.name,
            date: new Date().toISOString().split('T')[0],
            type: 'opening_balance',
            description: 'Opening Balance',
            referenceId: 'OPEN-BAL',
            credit: payload.openingBalance,
            debit: 0,
            runningBalance: payload.openingBalance,
            createdAt: serverTimestamp()
          });
        }
        alert('Vendor added successfully!');
      }

      setShowVendorForm(false);
      setEditingVendor(null);
      setVendorPayload({
        name: '',
        companyName: '',
        phone: '',
        whatsapp: '',
        cnicNtn: '',
        email: '',
        address: '',
        suppliedCategories: '',
        openingBalance: 0,
        paymentTerms: 'COD',
        status: 'active',
        notes: ''
      });
      fetchVendors();
    } catch (err) {
      console.error(err);
      alert('Failed to save vendor.');
    } finally {
      setSavingVendor(false);
    }
  };

  const handleEditVendor = (v) => {
    setEditingVendor(v);
    setVendorPayload({ ...v });
    setShowVendorForm(true);
  };

  const handleDeleteVendor = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vendor? This will not delete history but removes the vendor directory.')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'vendors', id));
      alert('Vendor deleted successfully!');
      fetchVendors();
    } catch (err) {
      console.error(err);
      alert('Failed to delete vendor.');
    }
  };

  // Dynamic Add / Remove Items in Purchase Order Form
  const handlePurchaseItemChange = (index, field, value) => {
    const updated = [...purchasePayload.items];
    updated[index][field] = value;

    if (field === 'inventoryId') {
      const invItem = inventoryItems.find(i => i.id === value);
      if (invItem) {
        updated[index].name = invItem.name;
        updated[index].unit = invItem.unit || 'unit';
        updated[index].price = parseFloat(invItem.costPerUnit || 0);
      }
    }

    if (field === 'price' || field === 'quantity') {
      const qty = parseFloat(updated[index].quantity || 0);
      const prc = parseFloat(updated[index].price || 0);
      updated[index].subtotal = qty * prc;
    }

    setPurchasePayload(prev => ({ ...prev, items: updated }));
  };

  const addPurchaseItem = () => {
    setPurchasePayload(prev => ({
      ...prev,
      items: [...prev.items, { inventoryId: '', name: '', quantity: 1, unit: '', price: 0, subtotal: 0 }]
    }));
  };

  const removePurchaseItem = (index) => {
    if (purchasePayload.items.length <= 1) return;
    const updated = purchasePayload.items.filter((_, i) => i !== index);
    setPurchasePayload(prev => ({ ...prev, items: updated }));
  };

  // Calculations for active purchase order
  const calculatedPurchaseSummary = useMemo(() => {
    const subtotal = purchasePayload.items.reduce((acc, cur) => acc + (parseFloat(cur.subtotal) || 0), 0);
    const tax = parseFloat(purchasePayload.tax || 0);
    const discount = parseFloat(purchasePayload.discount || 0);
    const transport = parseFloat(purchasePayload.transportCharges || 0);
    const finalAmount = subtotal + tax + transport - discount;
    const dueAmount = finalAmount - parseFloat(purchasePayload.paidAmount || 0);

    return { subtotal, finalAmount, dueAmount };
  }, [purchasePayload.items, purchasePayload.tax, purchasePayload.discount, purchasePayload.transportCharges, purchasePayload.paidAmount]);

  // Submit Purchase Order
  const handleSavePurchase = async (e) => {
    e.preventDefault();
    if (!restaurant?.id || savingPurchase) return;
    if (!purchasePayload.vendorId) {
      alert('Please select a vendor.');
      return;
    }

    setSavingPurchase(true);
    try {
      const selectedVendor = vendors.find(v => v.id === purchasePayload.vendorId);
      const finalAmount = calculatedPurchaseSummary.finalAmount;
      const paidAmount = parseFloat(purchasePayload.paidAmount || 0);
      const balanceDue = calculatedPurchaseSummary.dueAmount;

      const purchaseDoc = {
        vendorId: purchasePayload.vendorId,
        vendorName: selectedVendor.name,
        invoiceNumber: purchasePayload.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
        date: purchasePayload.date,
        items: purchasePayload.items.map(i => ({
          inventoryId: i.inventoryId,
          name: i.name,
          quantity: parseFloat(i.quantity || 0),
          price: parseFloat(i.price || 0),
          subtotal: parseFloat(i.subtotal || 0),
          unit: i.unit || ''
        })),
        subtotal: calculatedPurchaseSummary.subtotal,
        tax: parseFloat(purchasePayload.tax || 0),
        discount: parseFloat(purchasePayload.discount || 0),
        transportCharges: parseFloat(purchasePayload.transportCharges || 0),
        totalAmount: finalAmount,
        paidAmount: paidAmount,
        balanceDue: balanceDue,
        status: balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        dueDate: purchasePayload.dueDate || '',
        notes: purchasePayload.notes || '',
        attachmentUrl: purchasePayload.attachmentUrl || '',
        createdAt: serverTimestamp()
      };

      // 1. Save Purchase document
      const newPurchaseRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorPurchases'), purchaseDoc);

      // 2. Add Purchase to Vendor Ledger
      const currentVendorBalance = parseFloat(selectedVendor.currentBalance || 0);
      const postPurchaseBalance = currentVendorBalance + finalAmount;

      await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorLedger'), {
        vendorId: purchasePayload.vendorId,
        vendorName: selectedVendor.name,
        date: purchasePayload.date,
        type: 'purchase',
        description: `Purchase Invoice: ${purchaseDoc.invoiceNumber}`,
        referenceId: newPurchaseRef.id,
        credit: finalAmount, // credit increases liability
        debit: 0,
        runningBalance: postPurchaseBalance,
        createdAt: serverTimestamp()
      });

      // 3. Update Inventory quantities and unit cost
      for (const item of purchasePayload.items) {
        if (item.inventoryId) {
          const currentInvItem = inventoryItems.find(i => i.id === item.inventoryId);
          if (currentInvItem) {
            const currentQty = parseFloat(currentInvItem.quantity || 0);
            const addedQty = parseFloat(item.quantity || 0);
            const newQty = currentQty + addedQty;
            
            // Auto update latest unit cost as well
            await updateItem(item.inventoryId, {
              quantity: newQty,
              costPerUnit: parseFloat(item.price || 0)
            });
          }
        }
      }

      // 4. Save Payment document if paidAmount > 0
      let finalVendorBalance = postPurchaseBalance;
      if (paidAmount > 0) {
        const paymentDoc = {
          vendorId: purchasePayload.vendorId,
          vendorName: selectedVendor.name,
          date: purchasePayload.date,
          amount: paidAmount,
          paymentMethod: purchasePayload.paymentMethod,
          referenceNumber: `INV-PAY-${purchaseDoc.invoiceNumber}`,
          notes: `Payment for Invoice ${purchaseDoc.invoiceNumber}`,
          createdAt: serverTimestamp()
        };

        const newPaymentRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorPayments'), paymentDoc);

        finalVendorBalance = postPurchaseBalance - paidAmount;

        // Add Payment entry to ledger
        await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorLedger'), {
          vendorId: purchasePayload.vendorId,
          vendorName: selectedVendor.name,
          date: purchasePayload.date,
          type: 'payment',
          description: `Payment for Invoice: ${purchaseDoc.invoiceNumber}`,
          referenceId: newPaymentRef.id,
          credit: 0,
          debit: paidAmount, // debit decreases liability
          runningBalance: finalVendorBalance,
          createdAt: serverTimestamp()
        });
      }

      // 5. Update Vendor outstanding payable balance
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'vendors', purchasePayload.vendorId), {
        currentBalance: finalVendorBalance,
        updatedAt: serverTimestamp()
      });

      alert('Purchase successfully created, inventory adjusted, and ledger recorded!');
      setShowPurchaseForm(false);
      setPurchasePayload({
        vendorId: '',
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        items: [{ inventoryId: '', name: '', quantity: 1, unit: '', price: 0, subtotal: 0 }],
        tax: 0,
        discount: 0,
        transportCharges: 0,
        paidAmount: 0,
        paymentMethod: 'cash',
        dueDate: '',
        notes: '',
        attachmentUrl: ''
      });
      fetchVendors();
      fetchPurchases();
    } catch (err) {
      console.error(err);
      alert('Failed to record purchase.');
    } finally {
      setSavingPurchase(false);
    }
  };

  // Make Manual Payment
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!restaurant?.id || savingPayment) return;
    if (!paymentPayload.vendorId) {
      alert('Please select a vendor.');
      return;
    }
    const payAmt = parseFloat(paymentPayload.amount || 0);
    if (payAmt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setSavingPayment(true);
    try {
      const selectedVendor = vendors.find(v => v.id === paymentPayload.vendorId);
      const currentVendorBalance = parseFloat(selectedVendor.currentBalance || 0);
      const postPaymentBalance = currentVendorBalance - payAmt;

      const paymentDoc = {
        vendorId: paymentPayload.vendorId,
        vendorName: selectedVendor.name,
        date: paymentPayload.date,
        amount: payAmt,
        paymentMethod: paymentPayload.paymentMethod,
        referenceNumber: paymentPayload.referenceNumber || `PAY-${Date.now().toString().slice(-6)}`,
        notes: paymentPayload.notes || '',
        createdAt: serverTimestamp()
      };

      // 1. Save payment record
      const newPaymentRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorPayments'), paymentDoc);

      // 2. Add to Ledger
      await addDoc(collection(db, 'restaurants', restaurant.id, 'vendorLedger'), {
        vendorId: paymentPayload.vendorId,
        vendorName: selectedVendor.name,
        date: paymentPayload.date,
        type: 'payment',
        description: paymentPayload.notes || `Manual Payment`,
        referenceId: newPaymentRef.id,
        credit: 0,
        debit: payAmt, // debit decreases liability
        runningBalance: postPaymentBalance,
        createdAt: serverTimestamp()
      });

      // 3. Update Vendor Balance
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'vendors', paymentPayload.vendorId), {
        currentBalance: postPaymentBalance,
        updatedAt: serverTimestamp()
      });

      alert('Payment recorded and ledger updated!');
      setShowPaymentForm(false);
      setPaymentPayload({
        vendorId: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        referenceNumber: '',
        notes: ''
      });
      fetchVendors();
      fetchPayments();
    } catch (err) {
      console.error(err);
      alert('Failed to record payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  // ─── FILTERED VIEWS ──────────────────────────────────────────────────────────

  const filteredVendors = useMemo(() => {
    return vendors.filter(v =>
      v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.companyName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.phone.includes(vendorSearch) ||
      (v.suppliedCategories && v.suppliedCategories.toLowerCase().includes(vendorSearch.toLowerCase()))
    );
  }, [vendors, vendorSearch]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p =>
      p.vendorName.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(purchaseSearch.toLowerCase())
    );
  }, [purchases, purchaseSearch]);

  // ─── EXPORTING REPORTS ───────────────────────────────────────────────────────

  const exportLedgerToCSV = () => {
    if (ledgerEntries.length === 0) return;
    const vendor = vendors.find(v => v.id === selectedLedgerVendor);
    const headers = ['Date', 'Type', 'Description', 'Charges (+)', 'Payments (-)', 'Running Balance'];
    const rows = ledgerEntries.map(e => [
      e.date,
      e.type.toUpperCase(),
      e.description,
      e.credit || 0,
      e.debit || 0,
      e.runningBalance || 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ledger_${vendor?.name || 'Vendor'}_${ledgerDateFilter.from}_to_${ledgerDateFilter.to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintLedger = () => {
    if (!restaurant?.id || !selectedLedgerVendor || ledgerEntries.length === 0) return;
    
    const selectedVendor = vendors.find(v => v.id === selectedLedgerVendor);
    if (!selectedVendor) return;

    // Calculate dynamic ledger summary values using chronologically sorted master list
    const firstFilteredEntry = ledgerEntries[0];
    const firstIndex = firstFilteredEntry 
      ? allLedgerEntries.findIndex(e => e.id === firstFilteredEntry.id) 
      : -1;

    let startingBalance = 0;
    if (firstIndex > 0) {
      startingBalance = allLedgerEntries[firstIndex - 1].runningBalance;
    } else if (firstIndex === 0) {
      startingBalance = 0;
    } else {
      const entriesBefore = allLedgerEntries.filter(e => e.date < ledgerDateFilter.from);
      startingBalance = entriesBefore.length > 0 
        ? entriesBefore[entriesBefore.length - 1].runningBalance 
        : parseFloat(selectedVendor.openingBalance || 0);
    }

    const totalCharges = ledgerEntries.reduce((acc, curr) => acc + (parseFloat(curr.credit || 0)), 0);
    const totalPayments = ledgerEntries.reduce((acc, curr) => acc + (parseFloat(curr.debit || 0)), 0);
    const latestBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].runningBalance : startingBalance;

    const dateStr = new Date().toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const itemsHtml = ledgerEntries.map(e => {
      const typeShort = e.type === 'purchase' ? 'CHG' : e.type === 'payment' ? 'PAY' : 'OPB';
      const amount = e.type === 'purchase' ? e.credit : e.type === 'payment' ? e.debit : e.credit || e.debit || 0;
      
      let formattedDate = e.date;
      try {
        const d = new Date(e.date);
        formattedDate = d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
      } catch (err) {}

      return `
        <tr>
          <td style="text-align:left; vertical-align:top; font-size:11px;">
            <div>${formattedDate}</div>
            <span style="font-size: 8px; color: #555; background: #eee; padding: 1px 3px; border-radius: 2px;">${typeShort}</span>
          </td>
          <td style="text-align:left; vertical-align:top; padding: 0 4px;">
            <div style="word-break: break-all; max-width: 120px;">${e.description || '—'}</div>
            <div style="font-size: 9px; color: #666;">Ref: ${e.referenceId || '—'}</div>
          </td>
          <td style="text-align:right; vertical-align:top; font-size:11px; white-space:nowrap;">
            <div>${amount > 0 ? amount.toLocaleString() : '—'}</div>
            <div style="font-size:9px; font-weight:bold; color:#111;">Bal: ${e.runningBalance?.toLocaleString()}</div>
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <html>
        <head>
          <title>Vendor Ledger - ${selectedVendor.name}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              font-weight: 600; 
              padding: 8px; 
              max-width: 300px; 
              margin: 0 auto; 
              color: #000; 
              background: #fff; 
            }
            .text-center { text-align: center; }
            .bold { font-weight: 900; }
            .logo-wrap { text-align: center; margin-bottom: 5px; }
            .logo-wrap img { max-width: 100px; max-height: 60px; object-fit: contain; }
            .header-title { font-size: 14px; font-weight: 900; margin: 5px 0; }
            .restaurant-name { font-size: 15px; font-weight: 900; margin-bottom: 8px; }
            .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-weight: 600; }
            .line-dashed { border-top: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin: 5px 0; }
            th { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; font-size: 11px; font-weight: 900; text-transform: uppercase; }
            td { font-size: 11px; font-weight: 700; padding: 4px 0; border-bottom: 1px dotted #ccc; }
            .footer { margin-top: 15px; font-size: 10px; font-weight: 600; text-align: center; line-height: 1.4; }
            @media print {
              body { margin: 0; padding: 5px; }
            }
          </style>
        </head>
        <body>
          <div class="logo-wrap">
            ${restaurant?.logo ? `<img src="${restaurant.logo}" alt="Logo" />` : '<h2>🏪</h2>'}
          </div>
          <div class="text-center bold header-title">SUPPLIER LEDGER SLIP</div>
          <div class="text-center bold restaurant-name">${restaurant?.name || 'AR Restaurant'}</div>
          
          <div class="meta-row"><span>Date:</span><span>${dateStr}</span></div>
          <div class="meta-row"><span>Vendor:</span><span>${selectedVendor.name}</span></div>
          ${selectedVendor.companyName ? `<div class="meta-row"><span>Company:</span><span>${selectedVendor.companyName}</span></div>` : ''}
          ${selectedVendor.phone ? `<div class="meta-row"><span>Phone:</span><span>${selectedVendor.phone}</span></div>` : ''}
          <div class="meta-row" style="font-size: 10px;"><span>Period:</span><span>${ledgerDateFilter.from} to ${ledgerDateFilter.to}</span></div>
          
          <div class="line-dashed"></div>
          <div class="meta-row">
            <span>STARTING BALANCE:</span>
            <span>Rs ${startingBalance.toLocaleString()}</span>
          </div>
          <div class="meta-row">
            <span>CHARGES/PURCHASES (+):</span>
            <span>Rs ${totalCharges.toLocaleString()}</span>
          </div>
          <div class="meta-row">
            <span>PAYMENTS/CLEARED (-):</span>
            <span>Rs ${totalPayments.toLocaleString()}</span>
          </div>
          <div class="line-dashed"></div>
          <div class="meta-row bold" style="font-size: 13px">
            <span>OUTSTANDING DUE:</span>
            <span>Rs ${latestBalance.toLocaleString()}</span>
          </div>
          <div class="line-dashed"></div>

          <table>
            <thead>
              <tr>
                <th style="text-align:left; width:22%">Date</th>
                <th style="text-align:left; width:43%">Desc</th>
                <th style="text-align:right; width:35%">Amt/Bal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          
          <div class="line-dashed"></div>
          <div class="footer">
            <div>AR POS Thermal Receipt System</div>
            <div>Generated on: ${new Date().toLocaleString()}</div>
            <div class="text-center" style="margin-top:8px; font-weight:bold">AR POS | 0322-4776071</div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=320,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 400);
    }
  };

  // ─── ANALYTICS COMPILATIONS ──────────────────────────────────────────────────

  const analyticsData = useMemo(() => {
    const totalPayable = vendors.reduce((acc, v) => acc + (parseFloat(v.currentBalance) || 0), 0);
    const totalProcurement = purchases.reduce((acc, p) => acc + (parseFloat(p.totalAmount) || 0), 0);

    // Vendor wise spending
    const vendorSpending = {};
    purchases.forEach(p => {
      vendorSpending[p.vendorName] = (vendorSpending[p.vendorName] || 0) + p.totalAmount;
    });

    const sortedSpending = Object.entries(vendorSpending)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Highest Supplier
    const highestSupplier = sortedSpending[0] || { name: 'None', value: 0 };

    return {
      totalPayable,
      totalProcurement,
      sortedSpending,
      highestSupplier
    };
  }, [vendors, purchases]);

  return (
    <div className="vendors-module-container">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🤝</span> Vendor Management
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage suppliers, purchase invoices, ledgers, payments, and procurement analytics
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20, gap: 16 }}>
        {[
          { id: 'list', label: '👥 Vendor Directory' },
          { id: 'purchases', label: '📥 Purchase Invoices' },
          { id: 'ledger', label: '📖 Vendor Ledger' },
          { id: 'payments', label: '💳 Payment Records' },
          { id: 'analytics', label: '📈 Procurement Analytics' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === t.id ? '3px solid var(--accent)' : '3px solid transparent',
              fontWeight: activeTab === t.id ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'all 0.2s ease'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB 1: VENDOR DIRECTORY ────────────────────────────────────────── */}
      {activeTab === 'list' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12 }}>
            <div className="menu-search-wrap" style={{ flex: 1, maxWidth: 360, marginBottom: 0 }}>
              <span className="menu-search-icon">🔍</span>
              <input
                className="input menu-search-input"
                placeholder="Search vendors by name, company, phone…"
                value={vendorSearch}
                onChange={e => setVendorSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={() => { setEditingVendor(null); setShowVendorForm(true); }}>
              ➕ Add New Vendor
            </button>
          </div>

          {/* Vendors Directory Card */}
          <div className="card" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {vendorsLoading ? (
              <div className="spinner" style={{ margin: '40px auto' }} />
            ) : filteredVendors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                No vendors found. Click "Add New Vendor" to get started.
              </div>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Vendor Name</th>
                    <th>Company</th>
                    <th>Phone / WhatsApp</th>
                    <th>CNIC/NTN</th>
                    <th>Supplied Categories</th>
                    <th>Terms</th>
                    <th>Outstanding Payable</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map(v => (
                    <tr key={v.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{v.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.email}</div>
                      </td>
                      <td>{v.companyName || '—'}</td>
                      <td>
                        <div>📞 {v.phone}</div>
                        {v.whatsapp && <div style={{ fontSize: '0.8rem', color: '#25D366' }}>💬 {v.whatsapp}</div>}
                      </td>
                      <td>{v.cnicNtn || '—'}</td>
                      <td>
                        <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                          {v.suppliedCategories || 'General'}
                        </span>
                      </td>
                      <td>{v.paymentTerms}</td>
                      <td style={{ fontWeight: 700, color: (v.currentBalance || 0) > 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
                        Rs {(v.currentBalance || 0).toLocaleString()}
                      </td>
                      <td>
                        <span className={`inv-status-badge ${v.status === 'active' ? 'inv-qty-ok' : 'inv-qty-low'}`} style={{
                          color: v.status === 'active' ? 'var(--success-light)' : 'var(--danger-light)',
                          background: v.status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)'
                        }}>
                          {v.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditVendor(v)} title="Edit Vendor">✏️</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedLedgerVendor(v.id); setActiveTab('ledger'); }} title="View Ledger">📖</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteVendor(v.id)} title="Delete Vendor">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: PURCHASE INVOICES ───────────────────────────────────────── */}
      {activeTab === 'purchases' && (
        <div>
          {/* Filters Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="menu-search-wrap" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                <span className="menu-search-icon">🔍</span>
                <input
                  className="input menu-search-input"
                  placeholder="Search invoices, vendors…"
                  value={purchaseSearch}
                  onChange={e => setPurchaseSearch(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={purchaseDateFilter.from}
                  onChange={e => setPurchaseDateFilter(prev => ({ ...prev, from: e.target.value }))}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={purchaseDateFilter.to}
                  onChange={e => setPurchaseDateFilter(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowPurchaseForm(true)}>
              📥 Record New Purchase
            </button>
          </div>

          {/* Invoices List Card */}
          <div className="card" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {purchasesLoading ? (
              <div className="spinner" style={{ margin: '40px auto' }} />
            ) : filteredPurchases.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                No purchase invoices found in the selected date range.
              </div>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Invoice No.</th>
                    <th>Vendor Name</th>
                    <th>Date</th>
                    <th>Purchased Items</th>
                    <th>Total Value</th>
                    <th>Paid Amount</th>
                    <th>Remaining Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.invoiceNumber}</td>
                      <td>{p.vendorName}</td>
                      <td>{p.date}</td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>
                          {p.items?.map(i => `${i.name} (${i.quantity} ${i.unit})`).join(', ')}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>Rs {p.totalAmount?.toLocaleString()}</td>
                      <td style={{ color: 'var(--success-light)' }}>Rs {p.paidAmount?.toLocaleString()}</td>
                      <td style={{ color: p.balanceDue > 0 ? 'var(--danger-light)' : 'inherit' }}>Rs {p.balanceDue?.toLocaleString()}</td>
                      <td>
                        <span className={`inv-status-badge ${p.status === 'paid' ? 'inv-qty-ok' : p.status === 'partial' ? 'inv-qty-low' : 'inv-qty-low'}`} style={{
                          color: p.status === 'paid' ? 'var(--success-light)' : p.status === 'partial' ? 'var(--warning)' : 'var(--danger-light)',
                          background: p.status === 'paid' ? 'var(--success-bg)' : p.status === 'partial' ? 'var(--warning-bg)' : 'var(--danger-bg)'
                        }}>
                          {p.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: VENDOR LEDGER ───────────────────────────────────────────── */}
      {activeTab === 'ledger' && (
        <div>
          {/* Selection Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select
                className="input"
                style={{ width: 220 }}
                value={selectedLedgerVendor}
                onChange={e => setSelectedLedgerVendor(e.target.value)}
              >
                <option value="">-- Select Vendor --</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.companyName})</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={ledgerDateFilter.from}
                  onChange={e => setLedgerDateFilter(prev => ({ ...prev, from: e.target.value }))}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={ledgerDateFilter.to}
                  onChange={e => setLedgerDateFilter(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
            {selectedLedgerVendor && ledgerEntries.length > 0 && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={exportLedgerToCSV}>
                  📥 Export to CSV
                </button>
                <button className="btn btn-secondary" onClick={handlePrintLedger}>
                  🖨️ Print Slip
                </button>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          {!selectedLedgerVendor ? (
            <div className="card empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div className="empty-state-icon" style={{ fontSize: '3rem', marginBottom: 12 }}>📖</div>
              <h3>No Vendor Selected</h3>
              <p style={{ color: 'var(--text-muted)' }}>Please select a supplier from the dropdown above to view their transactional ledger history.</p>
            </div>
          ) : (
            <div>
              {/* Ledger Summary Cards */}
              {selectedLedgerVendor && ledgerEntries.length > 0 && (() => {
                const selectedVendor = vendors.find(v => v.id === selectedLedgerVendor);
                const firstFilteredEntry = ledgerEntries[0];
                const firstIndex = firstFilteredEntry 
                  ? allLedgerEntries.findIndex(e => e.id === firstFilteredEntry.id) 
                  : -1;

                let startingBalance = 0;
                if (firstIndex > 0) {
                  startingBalance = allLedgerEntries[firstIndex - 1].runningBalance;
                } else if (firstIndex === 0) {
                  startingBalance = 0;
                } else {
                  const entriesBefore = allLedgerEntries.filter(e => e.date < ledgerDateFilter.from);
                  startingBalance = entriesBefore.length > 0 
                    ? entriesBefore[entriesBefore.length - 1].runningBalance 
                    : parseFloat(selectedVendor?.openingBalance || 0);
                }

                const totalCharges = ledgerEntries.reduce((acc, curr) => acc + (parseFloat(curr.credit || 0)), 0);
                const totalPayments = ledgerEntries.reduce((acc, curr) => acc + (parseFloat(curr.debit || 0)), 0);
                const latestBalance = ledgerEntries.length > 0 
                  ? ledgerEntries[ledgerEntries.length - 1].runningBalance 
                  : startingBalance;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Starting Balance</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rs {startingBalance.toLocaleString()}</span>
                    </div>
                    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Purchases (+)</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--danger-light)' }}>+ Rs {totalCharges.toLocaleString()}</span>
                    </div>
                    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Payments (-)</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success-light)' }}>- Rs {totalPayments.toLocaleString()}</span>
                    </div>
                    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '4px solid var(--primary)' }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Outstanding Due</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)' }}>Rs {latestBalance.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="card" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {ledgerLoading ? (
                <div className="spinner" style={{ margin: '40px auto' }} />
              ) : ledgerEntries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  No transaction history recorded in ledger for selected date range.
                </div>
              ) : (
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Transaction Date</th>
                      <th>Reference ID</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Charges / Purchase (+)</th>
                      <th style={{ textAlign: 'right' }}>Payments / Cleared (-)</th>
                      <th style={{ textAlign: 'right' }}>Running Balance Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map(e => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{e.referenceId}</td>
                        <td>
                          <span className={`inv-status-badge`} style={{
                            fontSize: '0.75rem',
                            color: e.type === 'purchase' ? 'var(--danger-light)' : 'var(--success-light)',
                            background: e.type === 'purchase' ? 'var(--danger-bg)' : 'var(--success-bg)'
                          }}>
                            {e.type.toUpperCase()}
                          </span>
                        </td>
                        <td>{e.description}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger-light)' }}>
                          {e.credit > 0 ? `Rs ${e.credit.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--success-light)' }}>
                          {e.debit > 0 ? `Rs ${e.debit.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          Rs {e.runningBalance?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: PAYMENT RECORDS ─────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={paymentsDateFilter.from}
                  onChange={e => setPaymentsDateFilter(prev => ({ ...prev, from: e.target.value }))}
                />
                <span style={{ color: 'var(--text-muted)' }}>to</span>
                <input
                  type="date"
                  className="input"
                  style={{ width: 130 }}
                  value={paymentsDateFilter.to}
                  onChange={e => setPaymentsDateFilter(prev => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowPaymentForm(true)}>
              💳 Record Manual Payment
            </button>
          </div>

          {/* Payments Table Card */}
          <div className="card" style={{ padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {paymentsLoading ? (
              <div className="spinner" style={{ margin: '40px auto' }} />
            ) : payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                No payment transactions recorded in this date range.
              </div>
            ) : (
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Payment ID</th>
                    <th>Vendor Name</th>
                    <th>Date</th>
                    <th>Paid Amount</th>
                    <th>Payment Method</th>
                    <th>Reference / Receipt No.</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.referenceNumber}</td>
                      <td>{p.vendorName}</td>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success-light)' }}>Rs {p.amount?.toLocaleString()}</td>
                      <td style={{ textTransform: 'capitalize' }}>{p.paymentMethod}</td>
                      <td>{p.referenceNumber || '—'}</td>
                      <td>{p.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 5: PROCUREMENT ANALYTICS ───────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div>
          {/* Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
            <div className="inv-stat-card">
              <div className="inv-stat-icon">⚖️</div>
              <div>
                <div className="inv-stat-value" style={{ color: 'var(--danger-light)' }}>
                  Rs {analyticsData.totalPayable.toLocaleString()}
                </div>
                <div className="inv-stat-label">Total Dues Payable</div>
              </div>
            </div>
            <div className="inv-stat-card">
              <div className="inv-stat-icon">📥</div>
              <div>
                <div className="inv-stat-value">
                  Rs {analyticsData.totalProcurement.toLocaleString()}
                </div>
                <div className="inv-stat-label">Procurement Spending</div>
              </div>
            </div>
            <div className="inv-stat-card">
              <div className="inv-stat-icon">👑</div>
              <div>
                <div className="inv-stat-value" style={{ fontSize: '1.1rem' }}>
                  {analyticsData.highestSupplier.name}
                </div>
                <div className="inv-stat-label">Highest Supplier</div>
              </div>
            </div>
            <div className="inv-stat-card">
              <div className="inv-stat-icon">👥</div>
              <div>
                <div className="inv-stat-value">
                  {vendors.length}
                </div>
                <div className="inv-stat-label">Registered Suppliers</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
            {/* Spending Breakdown */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Supplier Spending Breakdown</h3>
              {analyticsData.sortedSpending.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No purchase data to compile.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {analyticsData.sortedSpending.map(s => {
                    const percentage = analyticsData.totalProcurement > 0 ? (s.value / analyticsData.totalProcurement) * 100 : 0;
                    return (
                      <div key={s.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.9rem' }}>
                          <span>{s.name}</span>
                          <span style={{ fontWeight: 700 }}>Rs {s.value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outstanding Payable Dues */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Payable Dues by Vendor</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {vendors
                  .filter(v => (v.currentBalance || 0) > 0)
                  .sort((a, b) => b.currentBalance - a.currentBalance)
                  .map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.companyName}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--danger-light)' }}>
                        Rs {v.currentBalance?.toLocaleString()}
                      </div>
                    </div>
                  ))}
                {vendors.filter(v => (v.currentBalance || 0) > 0).length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No outstanding dues payable! Excellent.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 1: ADD / EDIT VENDOR FORM ────────────────────────────────── */}
      {showVendorForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <h3>{editingVendor ? '✏️ Edit Vendor' : '➕ Add New Vendor'}</h3>
            <form onSubmit={handleSaveVendor} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
              <div>
                <label className="input-label">Vendor Name *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. Hammad Ali"
                  value={vendorPayload.name}
                  onChange={e => setVendorPayload(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Company Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Metro Distributors"
                  value={vendorPayload.companyName}
                  onChange={e => setVendorPayload(prev => ({ ...prev, companyName: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Phone Number *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. 03001234567"
                  value={vendorPayload.phone}
                  onChange={e => setVendorPayload(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">WhatsApp Number</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 03001234567"
                  value={vendorPayload.whatsapp}
                  onChange={e => setVendorPayload(prev => ({ ...prev, whatsapp: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">CNIC / NTN</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 35201-XXXXXXX-X"
                  value={vendorPayload.cnicNtn}
                  onChange={e => setVendorPayload(prev => ({ ...prev, cnicNtn: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Email Address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="e.g. supplier@example.com"
                  value={vendorPayload.email}
                  onChange={e => setVendorPayload(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Supplied Categories</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Poultry, Vegetables, Dairy"
                  value={vendorPayload.suppliedCategories}
                  onChange={e => setVendorPayload(prev => ({ ...prev, suppliedCategories: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Payment Terms</label>
                <select
                  className="input"
                  value={vendorPayload.paymentTerms}
                  onChange={e => setVendorPayload(prev => ({ ...prev, paymentTerms: e.target.value }))}
                >
                  <option value="COD">COD (Cash on Delivery)</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                </select>
              </div>
              {!editingVendor && (
                <div>
                  <label className="input-label">Opening Payable Balance (Rs)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="e.g. 5000"
                    value={vendorPayload.openingBalance}
                    onChange={e => setVendorPayload(prev => ({ ...prev, openingBalance: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <label className="input-label">Supplier Status</label>
                <select
                  className="input"
                  value={vendorPayload.status}
                  onChange={e => setVendorPayload(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Address</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Full supplier address"
                  value={vendorPayload.address}
                  onChange={e => setVendorPayload(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Notes</label>
                <textarea
                  className="input"
                  placeholder="Add any extra notes..."
                  value={vendorPayload.notes}
                  onChange={e => setVendorPayload(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ minHeight: 60 }}
                />
              </div>
              <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowVendorForm(false)} disabled={savingVendor}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingVendor}>
                  {savingVendor ? 'Saving...' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: RECORD NEW PURCHASE FORM ──────────────────────────────── */}
      {showPurchaseForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 800 }}>
            <h3>📥 Record New Purchase</h3>
            <form onSubmit={handleSavePurchase} style={{ marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="input-label">Select Vendor *</label>
                  <select
                    className="input"
                    required
                    value={purchasePayload.vendorId}
                    onChange={e => setPurchasePayload(prev => ({ ...prev, vendorId: e.target.value }))}
                  >
                    <option value="">-- Select Vendor --</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.companyName})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Invoice Number</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Auto Generated if blank"
                    value={purchasePayload.invoiceNumber}
                    onChange={e => setPurchasePayload(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="input-label">Invoice Date *</label>
                  <input
                    type="date"
                    className="input"
                    required
                    value={purchasePayload.date}
                    onChange={e => setPurchasePayload(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Items Table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Items / Ingredients List</h4>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addPurchaseItem}>+ Add Item</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 6, textAlign: 'left', fontSize: '0.85rem' }}>Select Ingredient</th>
                      <th style={{ padding: 6, textAlign: 'right', fontSize: '0.85rem', width: 100 }}>Qty</th>
                      <th style={{ padding: 6, textAlign: 'left', fontSize: '0.85rem', width: 90 }}>Unit</th>
                      <th style={{ padding: 6, textAlign: 'right', fontSize: '0.85rem', width: 110 }}>Purchase Price</th>
                      <th style={{ padding: 6, textAlign: 'right', fontSize: '0.85rem', width: 120 }}>Subtotal</th>
                      <th style={{ padding: 6, textAlign: 'center', fontSize: '0.85rem', width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchasePayload.items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '6px 4px' }}>
                          <select
                            className="input"
                            required
                            value={item.inventoryId}
                            onChange={e => handlePurchaseItemChange(idx, 'inventoryId', e.target.value)}
                          >
                            <option value="">-- Choose Ingredient --</option>
                            {inventoryItems.map(inv => (
                              <option key={inv.id} value={inv.id}>{inv.name} (Current: {inv.quantity} {inv.unit})</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            className="input"
                            style={{ textAlign: 'right' }}
                            required
                            min="0.01"
                            step="any"
                            value={item.quantity}
                            onChange={e => handlePurchaseItemChange(idx, 'quantity', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="text"
                            className="input"
                            readOnly
                            placeholder="Unit"
                            value={item.unit}
                          />
                        </td>
                        <td style={{ padding: '6px 4px' }}>
                          <input
                            type="number"
                            className="input"
                            style={{ textAlign: 'right' }}
                            required
                            min="0"
                            step="any"
                            value={item.price}
                            onChange={e => handlePurchaseItemChange(idx, 'price', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>
                          Rs {(item.subtotal || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removePurchaseItem(idx)}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary and Additional Costs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="input-label">Notes</label>
                    <textarea
                      className="input"
                      placeholder="Add purchase notes..."
                      value={purchasePayload.notes}
                      onChange={e => setPurchasePayload(prev => ({ ...prev, notes: e.target.value }))}
                      style={{ minHeight: 60 }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="input-label">Attachment URL (Receipt/Bill)</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Image or doc link"
                        value={purchasePayload.attachmentUrl}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, attachmentUrl: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="input-label">Payment Due Date</label>
                      <input
                        type="date"
                        className="input"
                        value={purchasePayload.dueDate}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span>Items Subtotal</span>
                    <span>Rs {calculatedPurchaseSummary.subtotal.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tax (+)</label>
                      <input
                        type="number"
                        className="input"
                        value={purchasePayload.tax}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, tax: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Discount (-)</label>
                      <input
                        type="number"
                        className="input"
                        value={purchasePayload.discount}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, discount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Transport (+)</label>
                      <input
                        type="number"
                        className="input"
                        value={purchasePayload.transportCharges}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, transportCharges: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }}>
                    <span>Final Amount</span>
                    <span style={{ color: 'var(--accent)' }}>Rs {calculatedPurchaseSummary.finalAmount.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Amount Paid Now</label>
                      <input
                        type="number"
                        className="input"
                        value={purchasePayload.paidAmount}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, paidAmount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pay Method</label>
                      <select
                        className="input"
                        value={purchasePayload.paymentMethod}
                        onChange={e => setPurchasePayload(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      >
                        <option value="cash">Cash</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="jazzcash">JazzCash</option>
                        <option value="easypaisa">EasyPaisa</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>Remaining Balance Due:</span>
                    <span style={{ fontWeight: 700, color: calculatedPurchaseSummary.dueAmount > 0 ? 'var(--danger-light)' : 'var(--success-light)' }}>
                      Rs {calculatedPurchaseSummary.dueAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPurchaseForm(false)} disabled={savingPurchase}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingPurchase}>
                  {savingPurchase ? 'Recording...' : 'Record Purchase & Adjust Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: RECORD PAYMENT FORM ──────────────────────────────────── */}
      {showPaymentForm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <h3>💳 Record Supplier Payment</h3>
            <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              <div>
                <label className="input-label">Select Vendor *</label>
                <select
                  className="input"
                  required
                  value={paymentPayload.vendorId}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, vendorId: e.target.value }))}
                >
                  <option value="">-- Choose Vendor --</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} (Due: Rs {v.currentBalance?.toLocaleString()})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Payment Date *</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={paymentPayload.date}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Amount Paid (Rs) *</label>
                <input
                  type="number"
                  className="input"
                  required
                  placeholder="e.g. 15000"
                  value={paymentPayload.amount}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Payment Method *</label>
                <select
                  className="input"
                  required
                  value={paymentPayload.paymentMethod}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, paymentMethod: e.target.value }))}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">EasyPaisa</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="input-label">Reference / Transaction / Cheque No.</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Reference details"
                  value={paymentPayload.referenceNumber}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, referenceNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="input-label">Notes</label>
                <textarea
                  className="input"
                  placeholder="Any extra comments/description"
                  value={paymentPayload.notes}
                  onChange={e => setPaymentPayload(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ minHeight: 60 }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentForm(false)} disabled={savingPayment}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingPayment}>
                  {savingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
