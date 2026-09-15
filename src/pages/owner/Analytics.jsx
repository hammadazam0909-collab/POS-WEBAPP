import React, { useMemo, useState, useEffect } from 'react';
import { useOrders, useMenu, useInventory, useExpenses, useDailyClosings } from '../../hooks/useFirestore';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import './Owner.css';

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

  // Case 1: Close time crosses midnight (e.g. 11:00 AM to 4:00 AM)
  if (closeMins < openMins) {
    // If current time is after close time AND before open time, it belongs to the current calendar day (Restaurant is CLOSED)
    if (currentMins >= closeMins && currentMins < openMins) {
      // Do nothing! It belongs to the current calendar day.
      // Since no orders are placed in this gap, it will show 0!
    }
    // If current time is before close time (e.g. 2:00 AM), it belongs to the previous business day!
    else if (currentMins < closeMins) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
  }
  // Case 2: Standard hours (e.g. 9:00 AM to 11:00 PM)
  else {
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

// Helper to map cost
function createCostMap(inventoryItems) {
  const costMap = {};
  if (inventoryItems) {
    inventoryItems.forEach(i => {
      costMap[i.name] = i.costPerUnit || 0;
    });
  }
  return costMap;
}

// Helper to calculate cost from recipe
function calculateRecipeCost(recipe, costMap) {
  let cost = 0;
  recipe.forEach(ing => {
    const unitCost = costMap[ing.inventoryId] || costMap[ing.inventoryName] || 0;
    cost += (Number(ing.quantity) || 0) * unitCost;
  });
  return cost;
}

// Helper to process orders
// Helper to process orders
function processOrders(orders, costMap, itemMap, openTime, closeTime, selectedDateStr) {
  const validOrders = orders.filter(o => ['billed', 'collected', 'delivered'].includes(o.status));

  let totalGrossSales = 0;
  let totalNetSales = 0;
  let totalTax = 0;
  let totalDiscount = 0;
  let totalCost = 0;

  const typeStats = {
    'dine-in': { count: 0, revenue: 0 },
    'takeaway': { count: 0, revenue: 0 },
    'delivery': { count: 0, revenue: 0 }
  };

  const itemSales = {};
  const categoryStats = {};
  const dailyData = {};
  const monthlyData = {};
  const hourlyData = Array(24).fill(0).map((_, i) => ({ hour: i, Revenue: 0 }));

  // Use selectedDateStr if provided, otherwise default to today
  const todayDateObj = selectedDateStr ? new Date(selectedDateStr) : getBusinessDate(new Date(), openTime, closeTime);
  const todayStr = selectedDateStr || formatLocalDate(todayDateObj);

  const prevDateObj = new Date(todayDateObj);
  prevDateObj.setDate(prevDateObj.getDate() - 1);
  const prevStr = formatLocalDate(prevDateObj);

  let todaySale = 0;
  let prevSale = 0;
  let todayCost = 0;

  validOrders.forEach(o => {
    const orderTotal = (o.totalAmount || 0) - (o.refundedAmount || 0);
    const orderSub = o.subtotal || 0;
    const orderTax = o.tax || 0;
    const orderDisc = o.discountAmount || 0;

    totalGrossSales += orderSub;
    totalNetSales += orderTotal;
    totalTax += orderTax;
    totalDiscount += orderDisc;
    const dateToCheck = o.orderPlacedAt || o.billedAt;
    if (dateToCheck) {
      const d = dateToCheck.toDate ? dateToCheck.toDate() : new Date(dateToCheck);
      const businessDate = getBusinessDate(d, openTime, closeTime);
      const dayKey = formatLocalDate(businessDate);

      if (dayKey === todayStr) {
        todaySale += orderTotal;

        if (typeStats[o.type]) {
          typeStats[o.type].count += 1;
          typeStats[o.type].revenue += orderTotal;
        }

        // Calculate cost and stats only for the selected day
        let orderCost = 0;
        (o.items || []).forEach(item => {
          const itemCost = calculateRecipeCost(item.recipe || [], costMap);
          orderCost += itemCost * item.qty;

          if (!itemSales[item.name]) {
            itemSales[item.name] = { qty: 0, revenue: 0, cost: 0 };
          }
          itemSales[item.name].qty += item.qty;
          itemSales[item.name].revenue += (item.price * item.qty);
          itemSales[item.name].cost += itemCost * item.qty;

          // Category Stats
          const info = itemMap[item.name];
          const catName = info ? info.catName : 'Other';
          if (!categoryStats[catName]) {
            categoryStats[catName] = { qty: 0, revenue: 0, cost: 0 };
          }
          categoryStats[catName].qty += item.qty;
          categoryStats[catName].revenue += (item.price * item.qty);
          categoryStats[catName].cost += itemCost * item.qty;
        });

        todayCost += orderCost;
        totalCost += orderCost; // Update total cost too

        const hour = d.getHours();
        hourlyData[hour].Revenue += orderTotal;
      } else if (dayKey === prevStr) {
        prevSale += orderTotal;
      }

      dailyData[dayKey] = (dailyData[dayKey] || 0) + orderTotal;

      const monthKey = `${businessDate.getFullYear()}-${String(businessDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + orderTotal;
    }
  });

  return {
    validOrders,
    totalGrossSales,
    totalNetSales,
    totalTax,
    totalDiscount,
    totalCost,
    typeStats,
    itemSales,
    categoryStats,
    dailyData,
    monthlyData,
    hourlyData,
    todaySale,
    todayCost,
    prevSale,
    todayBusinessDate: todayDateObj,
    prevBusinessDate: prevDateObj
  };
}

const EXPENSE_CATEGORIES = [
  { id: 'rent', name: 'Rent' },
  { id: 'salaries', name: 'Salaries' },
  { id: 'utilities', name: 'Utilities' },
  { id: 'packaging', name: 'Packaging' },
  { id: 'fuel', name: 'Fuel' },
  { id: 'marketing', name: 'Marketing' },
  { id: 'internet', name: 'Internet' },
  { id: 'maintenance', name: 'Maintenance' },
  { id: 'tax', name: 'Tax' },
  { id: 'misc', name: 'Miscellaneous' }
];

// Helper to build analytics
function buildAnalytics(orders, costMap, categories, expenses, vendorPayments, openTime, closeTime, selectedDateStr) {

  const itemMap = {};
  if (categories) {
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        itemMap[item.name] = { catName: cat.name };
      });
    });
  }

  const data = processOrders(orders, costMap, itemMap, openTime, closeTime, selectedDateStr);

  const topItems = Object.entries(data.itemSales).map(([name, stats]) => ({
    name,
    ...stats,
    profit: stats.revenue - stats.cost,
    foodCostPct: stats.revenue > 0 ? (stats.cost / stats.revenue) * 100 : 0
  })).sort((a, b) => b.qty - a.qty).slice(0, 10);

  const mostProfitable = [...topItems].sort((a, b) => b.profit - a.profit).slice(0, 10);

  const todayLabel = data.todayBusinessDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const prevLabel = data.prevBusinessDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const todayKey = formatLocalDate(data.todayBusinessDate);
  const prevKey = formatLocalDate(data.prevBusinessDate);

  const dailySales = Object.keys(data.dailyData).sort().map(k => {
    const d = new Date(k);
    const dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let name = dayStr;
    if (k === todayKey) name = "Today";
    else if (k === prevKey) name = "Previous Day";
    return { name, Revenue: data.dailyData[k] };
  }).slice(-14);

  const monthlySales = Object.keys(data.monthlyData).sort().map(k => {
    const [year, month] = k.split('-');
    const d = new Date(year, month - 1);
    const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return { name: monthStr, Revenue: data.monthlyData[k] };
  });

  const profit = data.totalNetSales - data.totalCost;
  const growth = data.prevSale > 0 ? ((data.todaySale - data.prevSale) / data.prevSale) * 100 : 0;

  const categoryBreakdown = Object.entries(data.categoryStats).map(([name, stats]) => ({
    name,
    qty: stats.qty,
    revenue: stats.revenue,
    profit: stats.revenue - stats.cost,
    percentage: data.todaySale > 0 ? (stats.revenue / data.todaySale) * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue);

  let peakHour = 0;
  let peakHourRevenue = 0;
  data.hourlyData.forEach(h => {
    if (h.Revenue > peakHourRevenue) {
      peakHourRevenue = h.Revenue;
      peakHour = h.hour;
    }
  });

  const peakHourStr = peakHourRevenue > 0 ? `${peakHour % 12 || 12} ${peakHour >= 12 ? 'PM' : 'AM'}` : '—';
  const totalExpenses = (expenses || []).filter(e => e.expenseDate === todayKey).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const todayVendorCleared = (vendorPayments || [])
    .filter(p => p.date === todayKey)
    .reduce((sum, p) => sum + (parseFloat(p.debit || 0)), 0);

  // Use TODAY's metrics for the top cards!
  const netSales = data.todaySale; // Net sales for today
  const grossSales = netSales; // Assuming gross = net for today (or we can calculate todayGross too!)
  const grossProfit = netSales - data.todayCost;
  const netOperatingProfit = grossProfit - totalExpenses - todayVendorCleared;
  const expenseRatio = netSales > 0 ? (totalExpenses / netSales) * 100 : 0;
  const foodCostPct = netSales > 0 ? (data.todayCost / netSales) * 100 : 0;
  const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  const todayOrdersCount = data.validOrders.filter(o => {
    const dateToCheck = o.orderPlacedAt || o.billedAt;
    return dateToCheck && formatLocalDate(getBusinessDate(dateToCheck, openTime, closeTime)) === todayKey;
  }).length;
  const averageOrderValue = todayOrdersCount > 0 ? netSales / todayOrdersCount : 0;

  return {
    totalExpenses,
    todayVendorCleared,
    grossProfit,
    netOperatingProfit,
    expenseRatio,
    peakHour: peakHourStr,
    peakHourRevenue,
    totalOrders: todayOrdersCount,
    grossSales,
    netSales,
    totalTax: data.totalTax,
    totalDiscount: data.totalDiscount,
    totalCost: data.todayCost,
    profit: grossProfit,
    foodCostPct,
    profitMargin,
    averageOrderValue,
    typeStats: data.typeStats,
    topItems,
    mostProfitable,
    dailySales,
    monthlySales,
    hourlyData: data.hourlyData,
    todaySale: data.todaySale,
    prevSale: data.prevSale,
    growth,
    categoryBreakdown
  };
}
export default function Analytics() {
  const { restaurant } = useAuth();
  const { categories, loading: menuLoading } = useMenu();
  const { items: inventoryItems, loading: invLoading } = useInventory();
  const { expenses, loading: expensesLoading, addExpense, updateExpense, deleteExpense } = useExpenses();
  const { settings } = useSettings();
  const [view, setView] = useState('sales'); // 'sales' | 'inventory'
  const [chartView, setChartView] = useState('daily'); // 'daily' | 'monthly' | 'hourly'
  const currentBizDate = useMemo(() => {
    return formatLocalDate(getBusinessDate(new Date(), settings?.openTime, settings?.closeTime));
  }, [settings?.openTime, settings?.closeTime]);

  const [dateFilter, setDateFilter] = useState(currentBizDate);
  
  // We must fetch ALL orders without a database-level date filter. 
  // If we filter by 'orderPlacedAt' in Firestore, it drops any orders that are missing that field
  // (e.g. older orders that only have 'billedAt'). processOrders will handle filtering client-side.
  const { orders, loading: ordersLoading } = useOrders(null, {});

  // Sync dateFilter with current business date when settings load or time changes
  useEffect(() => {
    if (settings) {
      setDateFilter(currentBizDate);
    }
  }, [settings, currentBizDate]);

  // Real-time Vendor Payments State & Fetching
  const [vendorPayments, setVendorPayments] = useState([]);
  const [vendorPaymentsLoading, setVendorPaymentsLoading] = useState(false);

  useEffect(() => {
    if (!restaurant?.id) return;
    let unsub = () => {};
    const initVendorPayments = async () => {
      try {
        setVendorPaymentsLoading(true);
        const { db } = await import('../../firebase/config');
        const { collection, onSnapshot, query, where } = await import('firebase/firestore');

        const q = query(
          collection(db, 'restaurants', restaurant.id, 'vendorLedger'),
          where('type', '==', 'payment')
        );
        unsub = onSnapshot(q, (snap) => {
          const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setVendorPayments(list);
          setVendorPaymentsLoading(false);
        }, (err) => {
          console.error("Error loading vendor ledger payments: ", err);
          setVendorPaymentsLoading(false);
        });
      } catch (err) {
        console.error("Firebase dynamic import failed in Analytics: ", err);
        setVendorPaymentsLoading(false);
      }
    };
    initVendorPayments();
    return () => unsub();
  }, [restaurant?.id]);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', categoryId: '', categoryName: '', paymentMethod: 'Cash', expenseDate: currentBizDate, note: '', salaryType: 'Monthly' });
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseChartView, setExpenseChartView] = useState('day'); // 'day' | 'month'

  const { closings, addClosing } = useDailyClosings();
  const [showCloseDayModal, setShowCloseDayModal] = useState(false);
  const [actualCash, setActualCash] = useState('');

  // Update date filter when settings load and business date changes
  useEffect(() => {
    setDateFilter(currentBizDate);
    setExpenseForm(f => ({ ...f, expenseDate: currentBizDate }));
  }, [currentBizDate]);

  const expenseTemplates = useMemo(() => {
    if (!expenses) return [];
    const dates = [...new Set(expenses.map(e => e.expenseDate))].sort().reverse();
    const prevDate = dates.find(d => d < dateFilter);
    if (!prevDate) return [];

    const prevExpenses = expenses.filter(e => e.expenseDate === prevDate);
    const currentTitles = new Set(expenses.filter(e => e.expenseDate === dateFilter).map(e => e.title));

    return prevExpenses.filter(e => !currentTitles.has(e.title));
  }, [expenses, dateFilter]);

  const expenseChartData = useMemo(() => {
    if (!expenses) return [];
    const dayExpenses = expenses.filter(e => e.expenseDate === dateFilter);
    const catMap = {};
    dayExpenses.forEach(e => {
      const cat = e.categoryName || 'Uncategorized';
      catMap[cat] = (catMap[cat] || 0) + Number(e.amount);
    });
    return Object.entries(catMap).map(([name, amount]) => ({ name, amount }));
  }, [expenses, dateFilter]);

  const expenseMonthlyData = useMemo(() => {
    if (!expenses) return [];
    const currentMonth = dateFilter.substring(0, 7);
    const monthExpenses = expenses.filter(e => e.expenseDate.startsWith(currentMonth));
    const dayMap = {};
    monthExpenses.forEach(e => {
      const day = e.expenseDate.substring(8, 10);
      dayMap[day] = (dayMap[day] || 0) + Number(e.amount);
    });
    return Object.entries(dayMap)
      .map(([day, amount]) => ({ day: `Day ${day}`, amount }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [expenses, dateFilter]);

  const closeDayData = useMemo(() => {
    if (!orders || !expenses || !settings?.openTime) return { expectedCash: 0, totalCashSales: 0, totalCashExpenses: 0, totalNetSales: 0, totalCardSales: 0, totalOnlineSales: 0, orderCount: 0 };

    const dayOrdersAll = orders.filter(o => {
      const dateToCheck = o.orderPlacedAt || o.billedAt;
      if (!dateToCheck) return false;
      const d = dateToCheck?.toDate ? dateToCheck.toDate() : new Date(dateToCheck || 0);

      const ot = settings?.openTime || '00:00';
      const ct = settings?.closeTime || '23:59';
      const [openH, openM] = ot.split(':').map(Number);
      const [closeH, closeM] = ct.split(':').map(Number);

      const start = new Date(dateFilter);
      start.setHours(closeH, closeM, 0, 0);

      const end = new Date(dateFilter);
      if (closeH < openH || (closeH === openH && closeM < openM)) {
        end.setDate(end.getDate() + 1);
      }
      end.setHours(closeH, closeM, 0, 0);

      return d >= start && d <= end && ['billed', 'collected', 'delivered'].includes(o.status);
    });

    const totalNetSales = dayOrdersAll.reduce((sum, o) => sum + ((o.totalAmount || 0) - (o.refundedAmount || 0)), 0);

    const dayOrdersCash = dayOrdersAll.filter(o => {
      return !o.paymentMethod || o.paymentMethod?.toLowerCase() === 'cash' || o.paymentMethod === 'Cash';
    });

    const totalCashSales = dayOrdersCash.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const dayOrdersCard = dayOrdersAll.filter(o => o.paymentMethod === 'Card');
    const totalCardSales = dayOrdersCard.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const dayOrdersOnline = dayOrdersAll.filter(o => o.paymentMethod === 'Online');
    const totalOnlineSales = dayOrdersOnline.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const dayExpenses = expenses.filter(e => e.expenseDate === dateFilter && e.paymentMethod?.toLowerCase() === 'cash');
    const totalCashExpenses = dayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const expectedCash = totalCashSales - totalCashExpenses;

    return { expectedCash, totalCashSales, totalCashExpenses, totalNetSales, totalCardSales, totalOnlineSales, orderCount: dayOrdersAll.length };
  }, [orders, expenses, dateFilter, settings]);

  const loading = ordersLoading || menuLoading || invLoading || expensesLoading;

  const costMap = useMemo(() => {
    const map = {};
    if (inventoryItems) {
      inventoryItems.forEach(i => {
        if (i.id) map[i.id] = i.costPerUnit || 0;
        map[i.name] = i.costPerUnit || 0;
      });
    }
    return map;
  }, [inventoryItems]);

  // ── Sales Analytics Data ────────────────────────────────────────
  const analyticsData = useMemo(() => {
    if (!orders || orders.length === 0) return null;
    const openTime = settings?.openTime || '00:00';
    const closeTime = settings?.closeTime || '23:59';
    return buildAnalytics(orders, costMap, categories, expenses, vendorPayments, openTime, closeTime, dateFilter);
  }, [orders, costMap, categories, expenses, vendorPayments, settings?.openTime, settings?.closeTime, dateFilter]);

  // ── Inventory Consumption Data ──────────────────────────────────
  const inventoryReport = useMemo(() => {
    if (!orders || !categories) return null;
    const itemMap = {};
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        itemMap[item.name] = { catName: cat.name, recipe: item.recipe || [] };
      });
    });

    const targetDateStr = new Date(dateFilter).toDateString();
    const openTime = settings?.openTime || '00:00';
    const closeTime = settings?.closeTime || '23:59';

    const targetOrders = orders.filter(o => {
      if (!['billed', 'collected', 'delivered'].includes(o.status)) return false;
      const dateToCheck = o.orderPlacedAt || o.billedAt;
      const d = dateToCheck?.toDate ? dateToCheck.toDate() : new Date(dateToCheck);
      const businessDate = getBusinessDate(d, openTime, closeTime);
      return businessDate.toDateString() === targetDateStr;
    });

    const agg = {};
    targetOrders.forEach(order => {
      (order.items || []).forEach(oItem => {
        const recipe = oItem.recipe || [];
        if (!recipe.length) return;

        const info = itemMap[oItem.name];
        const catName = info ? info.catName : 'Other';

        if (!agg[catName]) agg[catName] = {};
        recipe.forEach(ing => {
          if (!agg[catName][ing.inventoryName]) agg[catName][ing.inventoryName] = { qty: 0, unit: ing.unit, cost: 0 };
          const qtyUsed = (Number(ing.quantity) || 0) * (Number(oItem.qty) || 0);
          agg[catName][ing.inventoryName].qty += qtyUsed;
          agg[catName][ing.inventoryName].cost += qtyUsed * (costMap[ing.inventoryId] || costMap[ing.inventoryName] || 0);
        });
      });
    });
    return agg;
  }, [orders, categories, dateFilter, costMap, settings?.openTime, settings?.closeTime]);

  const handleDownloadDailyReport = () => {
    const dayOrders = orders.filter(o => {
      const dateToCheck = o.orderPlacedAt || o.billedAt;
      if (!dateToCheck) return false;
      const d = dateToCheck?.toDate ? dateToCheck.toDate() : new Date(dateToCheck || 0);

      const ot = settings?.openTime || '00:00';
      const ct = settings?.closeTime || '23:59';
      const [openH, openM] = ot.split(':').map(Number);
      const [closeH, closeM] = ct.split(':').map(Number);

      const start = new Date(dateFilter);
      start.setHours(closeH, closeM, 0, 0);

      const end = new Date(dateFilter);
      if (closeH < openH || (closeH === openH && closeM < openM)) {
        end.setDate(end.getDate() + 1);
      }
      end.setHours(closeH, closeM, 0, 0);

      return d >= start && d <= end && ['billed', 'collected', 'delivered'].includes(o.status);
    });

    const dayExpenses = expenses.filter(e => e.expenseDate === dateFilter);
    const dayVendorCleared = vendorPayments
      .filter(p => p.date === dateFilter)
      .reduce((sum, p) => sum + (parseFloat(p.debit || 0)), 0);

    const totalRevenue = dayOrders.reduce((sum, o) => sum + ((o.totalAmount || 0) - (o.refundedAmount || 0)), 0);
    const totalExp = dayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = totalRevenue - totalExp - dayVendorCleared;

    const reportHtml = `
      <html>
        <head>
          <title>Daily Report - ${dateFilter}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
            h1 { text-align: center; color: #111; margin-bottom: 5px; }
            h3 { text-align: center; color: #666; margin-top: 0; }
            .summary-box { display: flex; justify-content: space-between; background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .summary-item { text-align: center; flex: 1; }
            .summary-label { font-size: 0.8rem; color: #666; text-transform: uppercase; }
            .summary-value { font-size: 1.2rem; font-weight: 700; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
            th { background: #eee; font-size: 0.9rem; }
            td { font-size: 0.85rem; }
            .bold { font-weight: 700; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 10px;">
            <img src="/logo.png" alt="Logo" style="width: 80px; height: auto;" />
          </div>
          <h1>POSparrow</h1>
          <h3>Daily Business Report</h3>
          <p style="text-align: center; font-size: 0.9rem; color: #666;">Date: ${new Date(dateFilter).toLocaleDateString()} | Generated at: ${new Date().toLocaleString()}</p>

          <div class="summary-box">
            <div class="summary-item">
              <div class="summary-label">Total Revenue</div>
              <div class="summary-value">Rs ${totalRevenue.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Expenses</div>
              <div class="summary-value">Rs ${totalExp.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Vendor Paid</div>
              <div class="summary-value">Rs ${dayVendorCleared.toLocaleString()}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Net Operating Profit</div>
              <div class="summary-value">Rs ${netProfit.toLocaleString()}</div>
            </div>
          </div>

          <h4>📦 Orders (${dayOrders.length})</h4>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Type</th>
                <th>Customer/Table</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${dayOrders.map(o => `
                <tr>
                  <td>${o.id.slice(-6).toUpperCase()}</td>
                  <td>${o.type.toUpperCase()}</td>
                  <td>${o.tableNumber ? 'Table ' + o.tableNumber : (o.customerName || 'Walk-in')}</td>
                  <td>Rs ${(o.totalAmount || 0).toLocaleString()}</td>
                  <td>${o.status.toUpperCase()}</td>
                </tr>
              `).join('')}
              ${dayOrders.length === 0 ? '<tr><td colspan="5" style="text-align:center">No orders found</td></tr>' : ''}
            </tbody>
          </table>

          <h4>💸 Expenses (${dayExpenses.length})</h4>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Method</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${dayExpenses.map(e => `
                <tr>
                  <td>${e.title || 'Untitled'}</td>
                  <td>${e.category?.toUpperCase() || 'N/A'}</td>
                  <td>${e.paymentMethod?.toUpperCase() || 'CASH'}</td>
                  <td>Rs ${(Number(e.amount) || 0).toLocaleString()}</td>
                </tr>
              `).join('')}
              ${dayExpenses.length === 0 ? '<tr><td colspan="4" style="text-align:center">No expenses recorded</td></tr>' : ''}
            </tbody>
          </table>

          <div class="no-print" style="text-align: center; margin-top: 40px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #ff9f43; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">🖨️ Print / Save as PDF</button>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  const handleDownloadInventoryReport = () => {
    if (!inventoryReport || Object.keys(inventoryReport).length === 0) {
      alert('No data to download.');
      return;
    }

    let rowsHtml = '';
    let totalCost = 0;

    Object.entries(inventoryReport).forEach(([cat, items]) => {
      Object.entries(items).forEach(([item, stats]) => {
        rowsHtml += `
          <tr>
            <td>${cat}</td>
            <td>${item}</td>
            <td>${stats.qty.toFixed(2)}</td>
            <td>${stats.unit}</td>
            <td>Rs ${Math.round(stats.cost).toLocaleString()}</td>
          </tr>
        `;
        totalCost += stats.cost;
      });
    });

    const reportHtml = `
      <html>
        <head>
          <title>Inventory Usage Report - ${dateFilter}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; color: #333; }
            h1 { text-align: center; color: #111; margin-bottom: 5px; }
            h3 { text-align: center; color: #666; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
            th { background: #eee; font-size: 0.9rem; }
            td { font-size: 0.85rem; }
            .bold { font-weight: 700; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 10px;">
            <img src="/logo.png" alt="Logo" style="width: 80px; height: auto;" />
          </div>
          <h1>POSparrow</h1>
          <h3>Inventory Usage Report</h3>
          <p style="text-align: center; font-size: 0.9rem; color: #666;">Date: ${new Date(dateFilter).toLocaleDateString()} | Generated at: ${new Date().toLocaleString()}</p>

          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Item</th>
                <th>Qty Used</th>
                <th>Unit</th>
                <th>Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr class="bold">
                <td colspan="4" style="text-align: right;">Total Estimated Cost:</td>
                <td>Rs ${Math.round(totalCost).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div class="no-print" style="text-align: center; margin-top: 40px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #ff9f43; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">🖨️ Print / Save as PDF</button>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(reportHtml);
    printWindow.document.close();
  };

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">📈 Analytics</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <button className={`btn ${view === 'sales' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('sales')}>💰 Sales Overview</button>
            <button className={`btn ${view === 'inventory' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('inventory')}>📦 Inventory Usage</button>
            <button className={`btn ${view === 'expenses' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('expenses')}>💸 Expenses</button>
            <button className={`btn ${view === 'closings' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setView('closings')}>🔒 Daily Closings</button>
            <button className="btn btn-danger btn-sm" onClick={() => setShowCloseDayModal(true)}>🔒 Close Day</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Business Date:</label>
          <input type="date" className="input" style={{ width: 'auto', padding: '8px 12px' }} value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
      </div>

      <div className="content-area">
        {view === 'sales' ? (
          <>
            {/* Advanced KPI Cards */}
            <div className="stats-grid">
              <div className="stat-card" style={{ cursor: 'pointer' }} onClick={handleDownloadDailyReport}>
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><span>📆</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Today's Sale</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>Rs {(analyticsData?.todaySale || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: analyticsData?.growth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {/* {analyticsData?.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData?.growth || 0).toFixed(1)}% vs Prev Day */}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>🖨️ Click to print day report</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}><span>🍕</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Food Cost %</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{(analyticsData?.foodCostPct || 0).toFixed(1)}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target: &lt; 35%</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><span>📊</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Profit Margin</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{(analyticsData?.profitMargin || 0).toFixed(1)}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Profit: Rs {(analyticsData?.profit || 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--info-bg)' }}><span>📈</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Avg. Order Value</div>
                  <div className="stat-value" style={{ color: 'var(--info)' }}>Rs {Math.round(analyticsData?.averageOrderValue || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Orders: {analyticsData?.totalOrders}</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--accent-bg)' }}><span>🔥</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Peak Hour</div>
                  <div className="stat-value" style={{ color: 'var(--accent)' }}>{analyticsData?.peakHour}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rev: Rs {analyticsData?.peakHourRevenue?.toLocaleString()}</div>
                </div>
              </div>
              <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setView('expenses')}>
                <div className="stat-icon" style={{ background: 'var(--danger-bg)' }}><span>💸</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Total Expenses</div>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>Rs {(analyticsData?.totalExpenses || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click to manage</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(235, 94, 40, 0.15)', color: '#eb5e28' }}><span>🚛</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Vendor Paid today</div>
                  <div className="stat-value" style={{ color: '#eb5e28' }}>Rs {(analyticsData?.todayVendorCleared || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cleared supplier payments</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><span>📈</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Gross Profit</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>Rs {(analyticsData?.grossProfit || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sales - Food Cost</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><span>💎</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Net Operating Profit</div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>Rs {(analyticsData?.netOperatingProfit || 0).toLocaleString()}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>After expenses & vendor paid</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}><span>📊</span></div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="stat-label">Expense Ratio</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{(analyticsData?.expenseRatio || 0).toFixed(1)}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Of Net Sales</div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="card" style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3>Sales Trend</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn ${chartView === 'hourly' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setChartView('hourly')}>Hourly</button>
                  <button className={`btn ${chartView === 'daily' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setChartView('daily')}>Daily</button>
                  <button className={`btn ${chartView === 'monthly' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setChartView('monthly')}>Monthly</button>
                </div>
              </div>
              <div style={{ height: 300, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                  {chartView === 'hourly' ? (
                    <AreaChart data={analyticsData?.hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} />
                      <YAxis tickFormatter={(v) => `Rs ${v}`} />
                      <Tooltip formatter={(v) => `Rs ${v}`} />
                      <Area type="monotone" dataKey="Revenue" stroke="var(--accent)" fill="rgba(245,158,11,0.1)" strokeWidth={3} />
                    </AreaChart>
                  ) : chartView === 'daily' ? (
                    <LineChart data={analyticsData?.dailySales}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `Rs ${v}`} />
                      <Tooltip formatter={(v) => `Rs ${v}`} />
                      <Line type="monotone" dataKey="Revenue" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  ) : (
                    <BarChart data={analyticsData?.monthlySales}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `Rs ${v}`} />
                      <Tooltip formatter={(v) => `Rs ${v}`} />
                      <Bar dataKey="Revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Grid */}
            <div className="analytics-bottom-grid" style={{ marginTop: 24 }}>
              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Sales by Category</h3>
                {analyticsData?.categoryBreakdown.map((cat, idx) => (
                  <div key={idx} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 500 }}>
                      <span>{cat.name}</span>
                      <span>Rs {cat.revenue.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      <span>{cat.qty} sold</span>
                      <span>{cat.percentage.toFixed(1)}% of total</span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginTop: 4 }}>
                      <div style={{ width: `${cat.percentage}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Top Selling Items</h3>
                {analyticsData?.topItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--border)', marginBottom: 10 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{idx + 1}. {item.name}</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        FC: {item.foodCostPct.toFixed(0)}% | Profit: Rs {Math.round(item.profit).toLocaleString()}
                      </div>
                    </div>
                    <span style={{ fontWeight: 600 }}>{item.qty} sold</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <h3 style={{ marginBottom: 16 }}>Sales by Type</h3>
                {['dine-in', 'takeaway', 'delivery'].map(type => {
                  const stats = analyticsData?.typeStats[type];
                  const percentage = (stats?.revenue / (analyticsData?.todaySale || 1)) * 100;
                  return (
                    <div key={type} style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 500 }}>
                        <span style={{ textTransform: 'capitalize' }}>{type}</span>
                        <span>Rs {stats?.revenue.toLocaleString()}</span>
                      </div>
                      <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, marginTop: 4 }}>
                        <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--primary)', borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : view === 'inventory' ? (
          /* ── Inventory Usage View ── */
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Inventory Consumption Report</h3>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadInventoryReport} style={{ display: 'flex', alignItems: 'center' }}>
                <img src="/logo.png" alt="" style={{ width: 16, height: 16, marginRight: 6 }} />
                Download Report
              </button>
            </div>

            {!inventoryReport || Object.keys(inventoryReport).length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 0' }}>
                <div className="empty-state-icon">📊</div>
                <h3>No consumption on this date</h3>
                <p>No finalized orders with recipes found for {new Date(dateFilter).toLocaleDateString()}.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {Object.entries(inventoryReport).map(([catName, ingredients]) => (
                  <div key={catName}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                      <span style={{ fontSize: '1.2rem' }}>📁</span>
                      <h4 style={{ margin: 0 }}>{catName} Usage</h4>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                      {Object.entries(ingredients).map(([ingName, data]) => (
                        <div key={ingName} className="stat-card" style={{ padding: 12, background: 'var(--bg-glass)', margin: 0 }}>
                          <div>
                            <div className="stat-label" style={{ fontSize: '0.7rem' }}>{ingName}</div>
                            <div className="stat-value" style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>
                              {data.qty.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>{data.unit}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              Cost: Rs {Math.round(data.cost).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : view === 'closings' ? (
          /* ── Daily Closings View ── */
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Daily Closings History</h3>
            </div>
            <div className="table-responsive">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Expected Cash</th>
                    <th>Actual Cash</th>
                    <th>Card Sales</th>
                    <th>Online Sales</th>
                    <th>Difference</th>
                    <th>Closed At</th>
                  </tr>
                </thead>
                <tbody>
                  {(closings || []).map(c => (
                    <tr key={c.id}>
                      <td>{new Date(c.businessDate).toLocaleDateString()}</td>
                      <td>Rs {c.expectedCash.toLocaleString()}</td>
                      <td>Rs {c.actualCash.toLocaleString()}</td>
                      <td>Rs {(c.totalCardSales || 0).toLocaleString()}</td>
                      <td>Rs {(c.totalOnlineSales || 0).toLocaleString()}</td>
                      <td style={{ color: c.difference >= 0 ? '#00e676' : '#ff1744' }}>
                        Rs {c.difference.toLocaleString()} {c.difference < 0 ? '(Short)' : c.difference > 0 ? '(Excess)' : ''}
                      </td>
                      <td>{new Date(c.closedAt?.toDate ? c.closedAt.toDate() : c.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                  ))}
                  {(!closings || closings.length === 0) && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No closing records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Expenses View ── */
          <>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3>Expenses Management</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    setExpenseForm({ title: '', amount: '', categoryId: '', categoryName: '', paymentMethod: 'Cash', expenseDate: currentBizDate, note: '', salaryType: 'Monthly' });
                    setEditingExpense(null);
                    setShowExpenseModal(true);
                  }}>+ Add Expense</button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expenses || [])
                      .filter(exp => exp.expenseDate === dateFilter)
                      .map(exp => (
                        <tr key={exp.id}>
                          <td>{new Date(exp.expenseDate).toLocaleDateString()}</td>
                          <td>{exp.title}</td>
                          <td>{exp.categoryName}{exp.salaryType ? ` (${exp.salaryType})` : ''}</td>
                          <td>Rs {Number(exp.amount).toLocaleString()}</td>
                          <td>{exp.paymentMethod}</td>
                          <td>
                            <button className="btn btn-sm btn-secondary" style={{ marginRight: 8 }} onClick={() => {
                              setEditingExpense(exp);
                              setExpenseForm({ ...exp });
                              setShowExpenseModal(true);
                            }}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={async () => {
                              if (window.confirm('Are you sure you want to delete this expense?')) {
                                await deleteExpense(exp.id);
                              }
                            }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    {expenseTemplates.map(tmpl => (
                      <tr key={`tmpl-${tmpl.id}`} style={{ opacity: 0.6 }}>
                        <td>{new Date(dateFilter).toLocaleDateString()}</td>
                        <td>{tmpl.title} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Template)</span></td>
                        <td>{tmpl.categoryName}{tmpl.salaryType ? ` (${tmpl.salaryType})` : ''}</td>
                        <td style={{ color: 'var(--text-muted)' }}>Rs 0</td>
                        <td>{tmpl.paymentMethod}</td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => {
                            setEditingExpense(null);
                            setExpenseForm({
                              title: tmpl.title,
                              amount: '',
                              categoryId: tmpl.categoryId,
                              categoryName: tmpl.categoryName,
                              paymentMethod: tmpl.paymentMethod,
                              expenseDate: dateFilter,
                              note: tmpl.note || '',
                              salaryType: tmpl.salaryType || 'Monthly'
                            });
                            setShowExpenseModal(true);
                          }}>Set Amount</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expense Chart Card */}
            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>Expense Breakdown</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn ${expenseChartView === 'day' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setExpenseChartView('day')}>Day View</button>
                  <button className={`btn ${expenseChartView === 'month' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setExpenseChartView('month')}>Month View</button>
                </div>
              </div>

              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                  <BarChart data={expenseChartView === 'day' ? expenseChartData : expenseMonthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey={expenseChartView === 'day' ? 'name' : 'day'} stroke="var(--text-muted)" />
                    <YAxis stroke="var(--text-muted)" />
                    <Tooltip contentStyle={{ background: 'var(--bg-glass)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="amount" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* Expense Modal */}
        {showExpenseModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <h3>{editingExpense ? 'Edit Expense' : 'Add Expense'}</h3>
                <button className="close-btn" onClick={() => { setShowExpenseModal(false); setEditingExpense(null); setExpenseForm({ title: '', amount: '', categoryId: '', categoryName: '', paymentMethod: 'Cash', expenseDate: formatLocalDate(new Date()), note: '' }); }}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Title</label>
                  <input type="text" className="input" value={expenseForm.title} onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Amount</label>
                  <input type="number" className="input" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select className="input" value={expenseForm.categoryId} onChange={e => {
                    const cat = EXPENSE_CATEGORIES.find(c => c.id === e.target.value);
                    setExpenseForm({ ...expenseForm, categoryId: e.target.value, categoryName: cat ? cat.name : '' });
                  }}>
                    <option value="">Select Category</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                {expenseForm.categoryId === 'salaries' && (
                  <div className="form-group">
                    <label>Salary Type</label>
                    <select className="input" value={expenseForm.salaryType || 'Monthly'} onChange={e => setExpenseForm({ ...expenseForm, salaryType: e.target.value })}>
                      <option value="Monthly">Monthly</option>
                      <option value="Daily Wages">Daily Wages</option>
                      <option value="Advance">Advance</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>Payment Method</label>
                  <select className="input" value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="input" value={expenseForm.expenseDate} onChange={e => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Note</label>
                  <textarea className="input" value={expenseForm.note} onChange={e => setExpenseForm({ ...expenseForm, note: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setShowExpenseModal(false); setEditingExpense(null); setExpenseForm({ title: '', amount: '', categoryId: '', categoryName: '', paymentMethod: 'Cash', expenseDate: formatLocalDate(new Date()), note: '' }); }}>Cancel</button>
                <button className="btn btn-primary" onClick={async () => {
                  if (!expenseForm.title || !expenseForm.amount || !expenseForm.categoryId) {
                    alert('Please fill all required fields');
                    return;
                  }
                  const data = {
                    ...expenseForm,
                    amount: Number(expenseForm.amount),
                    updatedAt: new Date()
                  };
                  if (editingExpense) {
                    await updateExpense(editingExpense.id, data);
                  } else {
                    await addExpense({ ...data, createdAt: new Date() });
                  }
                  setShowExpenseModal(false);
                  setEditingExpense(null);
                  setExpenseForm({ title: '', amount: '', categoryId: '', categoryName: '', paymentMethod: 'Cash', expenseDate: formatLocalDate(new Date()), note: '' });
                }}>{editingExpense ? 'Update' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Close Day Modal */}
        {showCloseDayModal && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <h3>Close Day - {new Date(dateFilter).toLocaleDateString()}</h3>
                <button className="close-btn" onClick={() => setShowCloseDayModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: 15 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Closing Date</label>
                  <input type="date" className="input" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: '100%', padding: '8px 12px' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>

                  {/* Cash Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.05) 100%)',
                    borderRadius: 12, padding: 16, border: '1px solid rgba(16, 185, 129, 0.2)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💵 Expected Cash</div>
                      <div style={{ color: '#10b981', fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>Rs {closeDayData.expectedCash.toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6 }}>
                      Sales: Rs {closeDayData.totalCashSales.toLocaleString()}<br />Exp: Rs {closeDayData.totalCashExpenses.toLocaleString()}
                    </div>
                  </div>

                  {/* Card Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.05) 100%)',
                    borderRadius: 12, padding: 16, border: '1px solid rgba(59, 130, 246, 0.2)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>💳 Expected Card</div>
                    <div style={{ color: '#3b82f6', fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>Rs {(closeDayData.totalCardSales || 0).toLocaleString()}</div>
                  </div>

                  {/* Online Card */}
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(124, 58, 237, 0.05) 100%)',
                    borderRadius: 12, padding: 16, border: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center'
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🌐 Expected Online</div>
                    <div style={{ color: '#8b5cf6', fontSize: '1.25rem', fontWeight: 800, marginTop: 4 }}>Rs {(closeDayData.totalOnlineSales || 0).toLocaleString()}</div>
                  </div>

                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 15, textAlign: 'center' }}>
                  Total Net Sales: Rs {closeDayData.totalNetSales.toLocaleString()} | Orders found: {closeDayData.orderCount || 0}
                </div>

                <div className="form-group">
                  <label>Actual Cash in Drawer</label>
                  <input type="number" className="input" value={actualCash} onChange={e => setActualCash(e.target.value)} placeholder="Count and enter cash amount" />
                </div>

                {actualCash && (
                  <div style={{ marginTop: 15, padding: 12, borderRadius: 8, background: Number(actualCash) - closeDayData.expectedCash >= 0 ? 'rgba(0,200,0,0.1)' : 'rgba(200,0,0,0.1)', color: Number(actualCash) - closeDayData.expectedCash >= 0 ? '#00e676' : '#ff1744' }}>
                    <strong>Difference:</strong> Rs {(Number(actualCash) - closeDayData.expectedCash).toLocaleString()}
                    {Number(actualCash) - closeDayData.expectedCash < 0 ? ' (Shortage)' : ' (Excess)'}
                  </div>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setShowCloseDayModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={async () => {
                  if (!actualCash) { alert('Please enter actual cash amount!'); return; }

                  const data = {
                    businessDate: dateFilter,
                    expectedCash: closeDayData.expectedCash,
                    actualCash: Number(actualCash),
                    difference: Number(actualCash) - closeDayData.expectedCash,
                    totalCashSales: closeDayData.totalCashSales,
                    totalCashExpenses: closeDayData.totalCashExpenses,
                    totalCardSales: closeDayData.totalCardSales || 0,
                    totalOnlineSales: closeDayData.totalOnlineSales || 0,
                  };

                  await addClosing(data);
                  alert('Day officially closed! Record saved.');
                  setShowCloseDayModal(false);
                  setActualCash('');
                }}>Officially Close Day</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
