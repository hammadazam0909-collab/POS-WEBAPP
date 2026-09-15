import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export function useOrders(type = null, options = {}) {
  const { restaurant } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const { dateFrom, dateTo, limitCount } = options;

  useEffect(() => {
    if (!restaurant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsub;
    let cancelled = false;

    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { collection, onSnapshot, query, orderBy, where, limit } = await import('firebase/firestore');
        if (cancelled) return;

        const ref = collection(db, 'restaurants', restaurant.id, 'orders');
        
        const constraints = [];
        if (type) {
          constraints.push(where('type', '==', type));
        }
        if (options.activeOnly) {
          // Fetch only orders that are NOT billed or cancelled
          constraints.push(where('status', 'in', ['pending', 'preparing', 'ready', 'served', 'delivered', 'collected']));
        }
        if (dateFrom) {
          const start = new Date(dateFrom);
          start.setHours(0, 0, 0, 0);
          constraints.push(where('orderPlacedAt', '>=', start));
        }
        if (dateTo) {
          const end = new Date(dateTo);
          // Add 2 days to account for business hours crossing midnight into the next day
          end.setDate(end.getDate() + 2);
          end.setHours(0, 0, 0, 0);
          constraints.push(where('orderPlacedAt', '<', end));
        }
        
        constraints.push(orderBy('orderPlacedAt', 'desc'));
        
        if (limitCount) {
          constraints.push(limit(limitCount));
        }

        const q = query(ref, ...constraints);

        unsub = onSnapshot(
          q,
          snap => {
            setOrders(snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
            setHasPendingWrites(snap.metadata.hasPendingWrites);
            setLoading(false);
          },
          async err => {
            // Firestore index missing or orderPlacedAt absent on some docs —
            // fall back to unordered query and sort client-side
            console.warn('Orders ordered query failed, falling back:', err.code, err.message);
            try {
              const { collection: col2, onSnapshot: snap2, query: q2, where: wh2 } = await import('firebase/firestore');
              const ref2 = col2(db, 'restaurants', restaurant.id, 'orders');
              const fallbackQ = type ? q2(ref2, wh2('type', '==', type)) : q2(ref2);
              if (unsub) { unsub(); }
              unsub = snap2(
                fallbackQ,
                s => {
                  const docs = s.docs.map(d => ({ id: d.id, ...d.data() }));
                  // Sort client-side: docs with orderPlacedAt first, then by id
                  docs.sort((a, b) => {
                    const ta = a.orderPlacedAt?.toDate?.()?.getTime() ?? a.orderPlacedAt ?? 0;
                    const tb = b.orderPlacedAt?.toDate?.()?.getTime() ?? b.orderPlacedAt ?? 0;
                    return tb - ta;
                  });
                  setOrders(docs);
                  setLoading(false);
                },
                fallbackErr => {
                  console.error('Orders fallback listener error:', fallbackErr);
                  setLoading(false);
                }
              );
            } catch (fallbackSetupErr) {
              console.error('Orders fallback setup error:', fallbackSetupErr);
              setLoading(false);
            }
          }
        );
      } catch (err) {
        console.error('Orders setup error:', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; unsub?.(); };
  }, [restaurant, type, dateFrom, dateTo, limitCount]);

  async function addOrder(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'orders');
    return addDoc(ref, {
      status: 'pending',
      ...data,
      orderPlacedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      maxTime: data.type === 'delivery' ? 2700 : 1800,
    });
  }

  async function updateOrder(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    return updateDoc(doc(db, 'restaurants', restaurant.id, 'orders', id), {
      ...data, updatedAt: serverTimestamp(),
    });
  }

  return { orders, loading, addOrder, updateOrder, hasPendingWrites };
}

export function useFloors() {
  const { restaurant } = useAuth();
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) { setLoading(false); return; }
    let unsub;
    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
        const ref = collection(db, 'restaurants', restaurant.id, 'floors');
        const q = query(ref, orderBy('createdAt', 'asc'));
        unsub = onSnapshot(q, snap => {
          setFloors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
      } catch (e) { console.error(e); setLoading(false); }
    })();
    return () => unsub?.();
  }, [restaurant]);

  async function addFloor(name) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    return addDoc(collection(db, 'restaurants', restaurant.id, 'floors'), {
      name,
      createdAt: serverTimestamp()
    });
  }

  async function deleteFloor(id) {
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    return deleteDoc(doc(db, 'restaurants', restaurant.id, 'floors', id));
  }

  return { floors, loading, addFloor, deleteFloor };
}

export function useTables() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsub;
    let cancelled = false;
    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { collection, onSnapshot } = await import('firebase/firestore');
        if (cancelled) return;
        const ref = collection(db, 'restaurants', restaurant.id, 'tables');
        unsub = onSnapshot(ref,
          snap => {
            setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.number - b.number));
            setLoading(false);
          },
          err => {
            console.error('Tables listener error:', err);
            setLoading(false);
          }
        );
      } catch (err) {
        console.error('Tables setup error:', err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [restaurant]);

  async function updateTable(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    return updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', id), data);
  }

  async function addTable(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    return addDoc(collection(db, 'restaurants', restaurant.id, 'tables'), data);
  }

  async function deleteTable(id) {
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    return deleteDoc(doc(db, 'restaurants', restaurant.id, 'tables', id));
  }

  return { tables, loading, updateTable, addTable, deleteTable };
}

export function useMenu() {
  const { restaurant } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;

    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'menu');
      unsub = onSnapshot(ref, snap => {
        setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, [restaurant]);

  async function updateCategory(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    return updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', id), data);
  }

  async function addCategory(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    return addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), data);
  }

  async function updateCategoryItems(id, items) {
    return updateCategory(id, { items });
  }

  return { categories, loading, updateCategory, addCategory, updateCategoryItems };
}

// ─── Inventory ──────────────────────────────────────────────────────────────
export function useInventory() {
  const { restaurant } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) { setLoading(false); return; }
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'inventory');
      const q = query(ref, orderBy('name'));
      unsub = onSnapshot(q,
        snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
        async () => {
          // fallback without orderBy if index missing
          const { collection: c2, onSnapshot: s2 } = await import('firebase/firestore');
          unsub = s2(c2(db, 'restaurants', restaurant.id, 'inventory'),
            snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))); setLoading(false); }
          );
        }
      );
    })();
    return () => unsub?.();
  }, [restaurant]);

  async function addItem(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    return addDoc(collection(db, 'restaurants', restaurant.id, 'inventory'), {
      ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }

  async function updateItem(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    return updateDoc(doc(db, 'restaurants', restaurant.id, 'inventory', id), {
      ...data, updatedAt: serverTimestamp(),
    });
  }

  async function deleteItem(id) {
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    return deleteDoc(doc(db, 'restaurants', restaurant.id, 'inventory', id));
  }

  return { items, loading, addItem, updateItem, deleteItem };
}

export function useAudits() {
  const { restaurant } = useAuth();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) { setLoading(false); return; }
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'audits');
      const q = query(ref, orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q,
        snap => { setAudits(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
        async () => {
          const { collection: c2, onSnapshot: s2 } = await import('firebase/firestore');
          unsub = s2(collection(db, 'restaurants', restaurant.id, 'audits'),
            snap => { setAudits(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAt - a.createdAt)); setLoading(false); }
          );
        }
      );
    })();
    return () => unsub?.();
  }, [restaurant]);

  async function addAudit(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    return addDoc(collection(db, 'restaurants', restaurant.id, 'audits'), {
      ...data,
      createdAt: serverTimestamp()
    });
  }

  async function updateAudit(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    return updateDoc(doc(db, 'restaurants', restaurant.id, 'audits', id), data);
  }

  return { audits, loading, addAudit, updateAudit };
}

export function useExpenses() {
  const { restaurant } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) { setLoading(false); return; }
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'expenses');
      const q = query(ref, orderBy('expenseDate', 'desc'));
      unsub = onSnapshot(q,
        snap => { setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
        async () => {
          const { collection: c2, onSnapshot: s2 } = await import('firebase/firestore');
          unsub = s2(collection(db, 'restaurants', restaurant.id, 'expenses'),
            snap => { setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))); setLoading(false); }
          );
        }
      );
    })();
    return () => unsub?.();
  }, [restaurant]);

  async function addExpense(data) {
    const { db } = await import('../firebase/config');
    const { collection, addDoc, serverTimestamp, doc, setDoc, increment } = await import('firebase/firestore');
    
    const docRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'expenses'), {
      ...data, createdAt: serverTimestamp(),
    });
    
    // Update monthly summary
    const month = data.date ? data.date.substring(0, 7) : new Date().toISOString().substring(0, 7);
    const summaryRef = doc(db, 'restaurants', restaurant.id, 'monthly_summaries', month);
    
    await setDoc(summaryRef, {
      totalExpenses: increment(data.amount || 0),
      payrollExpense: increment(data.type === 'salary' ? data.amount || 0 : 0)
    }, { merge: true });
    
    return docRef;
  }

  async function updateExpense(id, data) {
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'expenses', id);
    return updateDoc(ref, data);
  }

  async function deleteExpense(id) {
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'expenses', id);
    return deleteDoc(ref);
  }

  return { expenses, loading, addExpense, updateExpense, deleteExpense };
}

/**
 * deductInventoryForItems
 * Called after a successful order is placed.
 * @param {string} restaurantId
 * @param {Array}  orderedItems  - [{name, qty, recipe:[{inventoryId, quantity}]}, ...]
 *
 * For each ordered item that has a recipe, this function multiplies each
 * ingredient's required qty by the ordered qty, then deducts it from stock.
 * Uses a Firestore batch to keep the operation atomic.
 */
export async function deductInventoryForItems(restaurantId, orderedItems) {
  if (!restaurantId || !orderedItems?.length) return;

  // Collect deductions: inventoryId -> totalDeduction
  const deductions = {};
  for (const ordItem of orderedItems) {
    if (!ordItem.recipe?.length) continue;
    for (const ing of ordItem.recipe) {
      if (!ing.inventoryId) continue;
      deductions[ing.inventoryId] = (deductions[ing.inventoryId] || 0) + (ing.quantity * ordItem.qty);
    }
  }

  if (!Object.keys(deductions).length) return;

  const { db } = await import('../firebase/config');
  const { doc, writeBatch, getDoc, increment } = await import('firebase/firestore');

  const batch = writeBatch(db);
  for (const [invId, qty] of Object.entries(deductions)) {
    const ref = doc(db, 'restaurants', restaurantId, 'inventory', invId);
    // Use increment so concurrent updates don't conflict
    batch.update(ref, { quantity: increment(-qty), updatedAt: new Date() });
  }
  await batch.commit();
}

export function useDailyClosings() {
  const { restaurant } = useAuth();
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) { setLoading(false); return; }
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot, orderBy, query } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'dailyClosings');
      const q = query(ref, orderBy('closedAt', 'desc'));
      unsub = onSnapshot(q, s => {
        setClosings(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant]);

  const addClosing = async (closingData) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'dailyClosings');
    await addDoc(ref, { ...closingData, closedAt: new Date() });
  };

  return { closings, loading, addClosing };
}

export function useRanks() {
  const { restaurant } = useAuth();
  const [ranks, setRanks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, onSnapshot } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'ranks');
      unsub = onSnapshot(ref, s => {
        setRanks(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant]);

  const addRank = async (data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'ranks');
    await addDoc(ref, { ...data, createdAt: new Date() });
  };

  const updateRank = async (id, data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'ranks', id);
    await updateDoc(ref, { ...data, updatedAt: new Date() });
  };

  const deleteRank = async (id) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'ranks', id);
    await deleteDoc(ref);
  };

  return { ranks, loading, addRank, updateRank, deleteRank };
}

export function useStaff() {
  const { restaurant } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, onSnapshot, orderBy } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'staff');
      const q = query(ref, orderBy('joiningDate', 'desc'));
      unsub = onSnapshot(q, s => {
        setStaff(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant]);

  const addStaff = async (data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'staff');
    await addDoc(ref, { ...data, createdAt: new Date() });
  };

  const updateStaff = async (id, data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { doc, updateDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'staff', id);
    await updateDoc(ref, { ...data, updatedAt: new Date() });
  };

  const deleteStaff = async (id) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { doc, deleteDoc } = await import('firebase/firestore');
    const ref = doc(db, 'restaurants', restaurant.id, 'staff', id);
    await deleteDoc(ref);
  };

  return { staff, loading, addStaff, updateStaff, deleteStaff };
}

export function useAttendance(date) {
  const { restaurant } = useAuth();
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant || !date) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'attendance');
      const q = query(ref, where('date', '==', date));
      unsub = onSnapshot(q, s => {
        const data = {};
        s.docs.forEach(d => {
          const item = d.data();
          data[item.staffId] = item;
        });
        setAttendance(data);
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant, date]);

  const markAttendance = async (staffId, data) => {
    if (!restaurant || !date) return;
    const { db } = await import('../firebase/config');
    const { doc, setDoc } = await import('firebase/firestore');
    const id = `${staffId}_${date}`;
    const ref = doc(db, 'restaurants', restaurant.id, 'attendance', id);
    await setDoc(ref, { staffId, date, ...data, updatedAt: new Date() }, { merge: true });
  };

  return { attendance, loading, markAttendance };
}

export function useMonthAttendance(month) {
  const { restaurant } = useAuth();
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant || !month) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'attendance');
      const start = `${month}-01`;
      const end = `${month}-32`;
      const q = query(ref, where('date', '>=', start), where('date', '<=', end));
      unsub = onSnapshot(q, s => {
        const data = {};
        s.docs.forEach(d => {
          const item = d.data();
          if (!data[item.staffId]) data[item.staffId] = {};
          data[item.staffId][item.date] = item.status;
        });
        setAttendance(data);
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant, month]);

  return { attendance, loading };
}

export function usePayroll(month) {
  const { restaurant } = useAuth();
  const [payroll, setPayroll] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant || !month) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'payroll');
      const q = query(ref, where('month', '==', month));
      unsub = onSnapshot(q, s => {
        const data = {};
        s.docs.forEach(d => {
          const item = d.data();
          data[item.staffId] = item;
        });
        setPayroll(data);
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant, month]);

  const clearPayroll = async (staffId, data) => {
    if (!restaurant || !month) return;
    const { db } = await import('../firebase/config');
    const { doc, setDoc } = await import('firebase/firestore');
    const id = `${staffId}_${month}`;
    const ref = doc(db, 'restaurants', restaurant.id, 'payroll', id);
    await setDoc(ref, { staffId, month, status: 'cleared', ...data, generatedAt: new Date() }, { merge: true });
  };

  return { payroll, loading, clearPayroll };
}

export function useSalaryAdvances(staffId) {
  const { restaurant } = useAuth();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, where, onSnapshot, orderBy } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'salary_advances');
      let q = ref;
      if (staffId) {
        q = query(ref, where('staffId', '==', staffId), orderBy('date', 'desc'));
      } else {
        q = query(ref, orderBy('date', 'desc'));
      }
      unsub = onSnapshot(q, s => {
        setAdvances(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant, staffId]);

  const addAdvance = async (data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'salary_advances');
    await addDoc(ref, { ...data, createdAt: new Date() });
  };

  return { advances, loading, addAdvance };
}

export function useSalaryAdjustments(staffId) {
  const { restaurant } = useAuth();
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;
    let unsub;
    (async () => {
      const { db } = await import('../firebase/config');
      const { collection, query, where, onSnapshot, orderBy } = await import('firebase/firestore');
      const ref = collection(db, 'restaurants', restaurant.id, 'salary_adjustments');
      let q = ref;
      if (staffId) {
        q = query(ref, where('staffId', '==', staffId), orderBy('date', 'desc'));
      } else {
        q = query(ref, orderBy('date', 'desc'));
      }
      unsub = onSnapshot(q, s => {
        setAdjustments(s.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();
    return () => unsub && unsub();
  }, [restaurant, staffId]);

  const addAdjustment = async (data) => {
    if (!restaurant) return;
    const { db } = await import('../firebase/config');
    const { collection, addDoc } = await import('firebase/firestore');
    const ref = collection(db, 'restaurants', restaurant.id, 'salary_adjustments');
    await addDoc(ref, { ...data, createdAt: new Date() });
  };

  return { adjustments, loading, addAdjustment };
}

export function useUdharAccounts() {
  const { restaurant } = useAuth();
  const [udharAccounts, setUdharAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) {
      setLoading(false);
      return;
    }
    let unsub;
    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { collection, onSnapshot, query, orderBy } = await import('firebase/firestore');
        const ref = collection(db, 'restaurants', restaurant.id, 'udhar_accounts');
        const q = query(ref, orderBy('updatedAt', 'desc'));
        unsub = onSnapshot(q, snap => {
          setUdharAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
      } catch (err) {
        console.error("Error fetching Udhar accounts:", err);
        setLoading(false);
      }
    })();
    return () => unsub?.();
  }, [restaurant]);

  return { udharAccounts, loading };
}

export async function shiftOrderToUdhar(restaurantId, order, customerName, customerPhone, note = '') {
  if (!restaurantId || !order) return;
  const { db } = await import('../firebase/config');
  const { collection, getDocs, addDoc, updateDoc, doc, query, where, arrayUnion } = await import('firebase/firestore');

  const cPhone = (customerPhone || '').trim();
  const cName = (customerName || 'Walk-in Customer').trim();
  const orderIdShort = order.id ? order.id.slice(-6).toUpperCase() : 'NEW';

  const billEntry = {
    orderId: order.id,
    orderCode: orderIdShort,
    tableId: order.tableId || null,
    tableNumber: order.tableNumber || null,
    shiftedAt: new Date().toISOString(),
    totalAmount: order.totalAmount || 0,
    subtotal: order.subtotal || 0,
    tax: order.tax || 0,
    discountAmount: order.discountAmount || 0,
    items: (order.items || []).map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    note: note || `Shifted from Table ${order.tableNumber || '—'}`
  };

  const ref = collection(db, 'restaurants', restaurantId, 'udhar_accounts');
  
  let existingDoc = null;
  if (cPhone) {
    const qPhone = query(ref, where('customerPhone', '==', cPhone));
    const snapPhone = await getDocs(qPhone);
    if (!snapPhone.empty) {
      existingDoc = snapPhone.docs[0];
    }
  }
  if (!existingDoc && cName) {
    const qName = query(ref, where('customerName', '==', cName));
    const snapName = await getDocs(qName);
    if (!snapName.empty) {
      existingDoc = snapName.docs[0];
    }
  }

  if (existingDoc) {
    const accData = existingDoc.data();
    const newTotal = (accData.totalBalance || 0) + (order.totalAmount || 0);
    await updateDoc(doc(db, 'restaurants', restaurantId, 'udhar_accounts', existingDoc.id), {
      customerName: cName,
      customerPhone: cPhone || accData.customerPhone || '',
      totalBalance: newTotal,
      updatedAt: new Date().toISOString(),
      bills: arrayUnion(billEntry)
    });
  } else {
    await addDoc(ref, {
      customerName: cName,
      customerPhone: cPhone,
      totalBalance: order.totalAmount || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bills: [billEntry],
      payments: []
    });
  }

  await updateDoc(doc(db, 'restaurants', restaurantId, 'orders', order.id), {
    status: 'billed',
    paymentMethod: 'Udhar',
    isUdhar: true,
    customerName: cName,
    phone: cPhone,
    customerPhone: cPhone,
    billedAt: new Date().toISOString()
  });

  if (order.tableId) {
    await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', order.tableId), {
      status: 'available',
      currentOrderId: null
    });
  }

  // Log activity in history
  const refLog = collection(db, 'restaurants', restaurantId, 'udhar_logs');
  await addDoc(refLog, {
    type: 'order_shifted',
    orderId: order.id,
    orderCode: orderIdShort,
    customerName: cName,
    customerPhone: cPhone,
    amount: order.totalAmount || 0,
    note: note || `Shifted from Table ${order.tableNumber || '—'}`,
    timestamp: new Date().toISOString()
  });
}

export async function recordUdharPayment(restaurantId, accountId, currentBalance, paymentAmount, paymentMethod = 'Cash', note = '') {
  if (!restaurantId || !accountId) return;
  const { db } = await import('../firebase/config');
  const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');

  const amt = parseFloat(paymentAmount) || 0;
  if (amt <= 0) return;

  const newBalance = Math.max(0, (currentBalance || 0) - amt);
  const paymentEntry = {
    id: 'PMT-' + Date.now(),
    date: new Date().toISOString(),
    amountPaid: amt,
    paymentMethod: paymentMethod,
    note: note || 'Udhar clearance payment'
  };

  await updateDoc(doc(db, 'restaurants', restaurantId, 'udhar_accounts', accountId), {
    totalBalance: newBalance,
    updatedAt: new Date().toISOString(),
    payments: arrayUnion(paymentEntry)
  });

  // Log activity
  const refLog = collection(db, 'restaurants', restaurantId, 'udhar_logs');
  await addDoc(refLog, {
    type: 'payment_recorded',
    accountId,
    amountPaid: amt,
    paymentMethod,
    note,
    timestamp: new Date().toISOString()
  });
}

export async function applyUdharDiscount(restaurantId, accountId, currentBalance, discountAmount, note = '') {
  if (!restaurantId || !accountId) return;
  const { db } = await import('../firebase/config');
  const { doc, updateDoc, collection, addDoc, arrayUnion } = await import('firebase/firestore');

  const amt = parseFloat(discountAmount) || 0;
  if (amt <= 0) return;

  const newBalance = Math.max(0, (currentBalance || 0) - amt);
  const discountEntry = {
    id: 'DISC-' + Date.now(),
    date: new Date().toISOString(),
    discountAmount: amt,
    note: note || 'Udhar discount applied'
  };

  await updateDoc(doc(db, 'restaurants', restaurantId, 'udhar_accounts', accountId), {
    totalBalance: newBalance,
    updatedAt: new Date().toISOString(),
    discounts: arrayUnion(discountEntry)
  });

  // Log activity in history
  const refLog = collection(db, 'restaurants', restaurantId, 'udhar_logs');
  await addDoc(refLog, {
    type: 'discount_given',
    accountId,
    discountAmount: amt,
    note: note || 'Udhar discount applied',
    timestamp: new Date().toISOString()
  });
}

export async function deleteUdharAccount(restaurantId, account, reason = 'Deleted by owner PIN') {
  if (!restaurantId || !account?.id) return;
  const { db } = await import('../firebase/config');
  const { doc, deleteDoc, collection, addDoc } = await import('firebase/firestore');

  // Log deletion in audit history first
  const refLog = collection(db, 'restaurants', restaurantId, 'udhar_logs');
  await addDoc(refLog, {
    type: 'account_deleted',
    accountId: account.id,
    customerName: account.customerName || 'Customer',
    customerPhone: account.customerPhone || '',
    totalBalanceAtDeletion: account.totalBalance || 0,
    billsCount: account.bills?.length || 0,
    reason: reason,
    timestamp: new Date().toISOString()
  });

  // Delete document
  await deleteDoc(doc(db, 'restaurants', restaurantId, 'udhar_accounts', account.id));
}

export function useUdharLogs() {
  const { restaurant } = useAuth();
  const [udharLogs, setUdharLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) {
      setLoading(false);
      return;
    }
    let unsub;
    (async () => {
      try {
        const { db } = await import('../firebase/config');
        const { collection, onSnapshot, query, orderBy, limit } = await import('firebase/firestore');
        const ref = collection(db, 'restaurants', restaurant.id, 'udhar_logs');
        const q = query(ref, orderBy('timestamp', 'desc'), limit(100));
        unsub = onSnapshot(q, snap => {
          setUdharLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setLoading(false);
        });
      } catch (err) {
        console.error("Error fetching Udhar logs:", err);
        setLoading(false);
      }
    })();
    return () => unsub?.();
  }, [restaurant]);

  return { udharLogs, loading };
}
