import React, { useState, useMemo } from 'react';
import { useStaff, useRanks, useAttendance, useMonthAttendance, usePayroll, useSalaryAdvances, useSalaryAdjustments, useExpenses } from '../../hooks/useFirestore';
import { calculatePayroll } from '../../utils/payrollCalculator';
import './Owner.css';

const EMPTY_STAFF = { staffName: '', phone: '', cnic: '', rankId: '', monthlySalary: '', joiningDate: '', allowedHolidaysPerMonth: '', notes: '', status: 'active', advanceSalary: '' };
const EMPTY_RANK = { name: '', defaultSalary: '', defaultHolidays: '', dailyDeduction: '', shiftHours: '', overtimeMultiplier: '', graceLateMinutes: '' };

export default function Staff() {
  const { staff, loading: staffLoading, addStaff, updateStaff, deleteStaff } = useStaff();
  const { ranks, loading: ranksLoading, addRank, updateRank, deleteRank } = useRanks();

  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'ranks' | 'attendance' | 'payroll'
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showRankForm, setShowRankForm] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingRankId, setEditingRankId] = useState(null);
  const [staffForm, setStaffForm] = useState(EMPTY_STAFF);
  const [rankForm, setRankForm] = useState(EMPTY_RANK);
  const [saving, setSaving] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const { attendance, markAttendance, loading: attendanceLoading } = useAttendance(activeTab === 'attendance' ? attendanceDate : null);
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7));
  const { attendance: monthAttendance, loading: monthAttendanceLoading } = useMonthAttendance(activeTab === 'payroll' ? payrollMonth : null);
  const { payroll: payrollStatuses, clearPayroll } = usePayroll(activeTab === 'payroll' ? payrollMonth : null);
  const attendanceMonth = attendanceDate.substring(0, 7);
  const { payroll: attendancePayrollStatuses } = usePayroll(activeTab === 'attendance' ? attendanceMonth : null);
  const { advances: allAdvances, addAdvance } = useSalaryAdvances();
  const { adjustments: allAdjustments, addAdjustment } = useSalaryAdjustments();
  const { addExpense } = useExpenses();
  const [viewingProfileStaffId, setViewingProfileStaffId] = useState(null);
  const [profileTab, setProfileTab] = useState('advances');
  const [confirmPayrollData, setConfirmPayrollData] = useState(null);
  const [confirmDeleteStaffData, setConfirmDeleteStaffData] = useState(null);
  
  const staffWithRankNames = useMemo(() => {
    return staff.map(s => {
      const rank = ranks.find(r => r.id === s.rankId);
      return { ...s, rankName: rank ? rank.name : 'Unranked', shiftHours: rank?.shiftHours, overtimeMultiplier: rank?.overtimeMultiplier, dailyDeduction: rank?.dailyDeduction };
    });
  }, [staff, ranks]);

  const { payrollData, totalExpense, payrollDue, attendancePct, highestPaid } = useMemo(() => {
    if (activeTab !== 'payroll' || monthAttendanceLoading) return { payrollData: [], totalExpense: 0, payrollDue: 0, attendancePct: 0, highestPaid: null };
    return calculatePayroll(staffWithRankNames, monthAttendance, payrollStatuses, allAdvances, allAdjustments, payrollMonth);
  }, [activeTab, staffWithRankNames, monthAttendance, payrollStatuses, allAdvances, allAdjustments, payrollMonth, monthAttendanceLoading]);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', type: 'advance', note: '', date: new Date().toISOString().split('T')[0] });
  const [adjustmentForm, setAdjustmentForm] = useState({ amount: '', type: 'bonus', note: '', date: new Date().toISOString().split('T')[0] });
  // ── Derived Data ──────────────────────────────────────────────────────────

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAddStaff = () => { setEditingStaffId(null); setStaffForm(EMPTY_STAFF); setShowStaffForm(true); };
  const openEditStaff = (s) => { setEditingStaffId(s.id); setStaffForm(s); setShowStaffForm(true); };
  const openAddRank = () => { setEditingRankId(null); setRankForm(EMPTY_RANK); setShowRankForm(true); };
  const openEditRank = (r) => { setEditingRankId(r.id); setRankForm(r); setShowRankForm(true); };

  const handleSaveStaff = async () => {
    if (!staffForm.staffName || !staffForm.rankId) return;
    setSaving(true);
    try {
      const data = {
        ...staffForm,
        monthlySalary: parseFloat(staffForm.monthlySalary) || 0,
        allowedHolidaysPerMonth: parseInt(staffForm.allowedHolidaysPerMonth) || 0,
        advanceSalary: parseFloat(staffForm.advanceSalary) || 0,
        joiningDate: staffForm.joiningDate || new Date().toISOString().split('T')[0],
      };
      if (editingStaffId) await updateStaff(editingStaffId, data);
      else await addStaff(data);
      setShowStaffForm(false);
    } finally { setSaving(false); }
  };

  const handleSaveRank = async () => {
    if (!rankForm.name) return;
    setSaving(true);
    try {
      const data = {
        ...rankForm,
        defaultSalary: parseFloat(rankForm.defaultSalary) || 0,
        defaultHolidays: parseInt(rankForm.defaultHolidays) || 0,
        dailyDeduction: parseFloat(rankForm.dailyDeduction) || 0,
        shiftHours: parseFloat(rankForm.shiftHours) || 0,
        overtimeMultiplier: parseFloat(rankForm.overtimeMultiplier) || 0,
        graceLateMinutes: parseInt(rankForm.graceLateMinutes) || 0,
      };
      if (editingRankId) await updateRank(editingRankId, data);
      else await addRank(data);
      setShowRankForm(false);
    } finally { setSaving(false); }
  };

  const handleDeleteStaff = async (id) => {
    if (window.confirm('Delete this staff member?')) await deleteStaff(id);
  };

  const handleDeleteRank = async (id) => {
    if (window.confirm('Delete this rank?')) await deleteRank(id);
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">👥 Staff Management</h1>
            <p className="page-subtitle">Manage employees, attendance, and payroll</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn ${activeTab === 'staff' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('staff')}>Staff List</button>
            <button className={`btn ${activeTab === 'ranks' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('ranks')}>Ranks</button>
            <button className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('attendance')}>Attendance</button>
            <button className={`btn ${activeTab === 'payroll' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setActiveTab('payroll')}>Payroll</button>
          </div>
        </div>
      </div>

      <div className="content-area">
        {activeTab === 'staff' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Employees</h3>
              <button className="btn btn-primary btn-sm" onClick={openAddStaff}>+ Add Staff</button>
            </div>
            {staffLoading ? <div className="spinner" /> : (
              <div className="table-responsive">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Rank</th>
                      <th>Phone</th>
                      <th>CNIC</th>
                      <th>Salary</th>
                      <th>Holidays</th>
                      <th>Joining</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffWithRankNames.map(s => (
                      <tr key={s.id}>
                        <td>{s.staffName}</td>
                        <td>{s.rankName}</td>
                        <td>{s.phone || '—'}</td>
                        <td>{s.cnic || '—'}</td>
                        <td>Rs {s.monthlySalary.toLocaleString()}</td>
                        <td>{s.allowedHolidaysPerMonth || 0}</td>
                        <td>{s.joiningDate || '—'}</td>
                        <td><span className={`status-badge ${s.status}`}>{s.status}</span></td>
                        <td>{s.notes || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setViewingProfileStaffId(s.id)}>👤 Profile</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditStaff(s)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteStaffData({ id: s.id, name: s.staffName })}>🗑</button>
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

        {activeTab === 'ranks' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Job Ranks</h3>
              <button className="btn btn-primary btn-sm" onClick={openAddRank}>+ Add Rank</button>
            </div>
            {ranksLoading ? <div className="spinner" /> : (
              <div className="table-responsive">
                <table className="inv-table">
                  <thead>
                    <tr>
                      <th>Rank Name</th>
                      <th>Default Salary</th>
                      <th>Default Holidays</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map(r => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>Rs {(r.defaultSalary || 0).toLocaleString()}</td>
                        <td>{r.defaultHolidays || 0} days</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => openEditRank(r)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRank(r.id)}>🗑</button>
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

        {activeTab === 'attendance' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h3>Daily Attendance</h3>
              <input type="date" className="input" style={{ maxWidth: 200 }} value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} />
            </div>
            <div className="table-responsive">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Staff Name</th>
                    <th>Rank</th>
                    <th>Status</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Late (m)</th>
                    <th>Overtime (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {staffWithRankNames.filter(s => s.status === 'active').map(s => {
                    const staffAtt = attendance[s.id] || {};
                    const currentStatus = staffAtt.status || 'unmarked';
                    const isLocked = attendancePayrollStatuses[s.id]?.status === 'cleared';
                    
                    return (
                      <tr key={s.id}>
                        <td>
                          {s.staffName}
                          {isLocked && <span className="status-badge active" style={{ marginLeft: 6, fontSize: '0.7rem' }}>Locked</span>}
                        </td>
                        <td>{s.rankName}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className={`btn btn-sm ${currentStatus === 'present' ? 'btn-success' : 'btn-secondary'}`} onClick={() => markAttendance(s.id, { status: 'present' })} disabled={isLocked}>Present</button>
                            <button className={`btn btn-sm ${currentStatus === 'absent' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => markAttendance(s.id, { status: 'absent' })} disabled={isLocked}>Absent</button>
                            <button className={`btn btn-sm ${currentStatus === 'half-day' ? 'btn-warning' : 'btn-secondary'}`} onClick={() => markAttendance(s.id, { status: 'half-day' })} disabled={isLocked}>Half Day</button>
                            <button className={`btn btn-sm ${currentStatus === 'leave' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => markAttendance(s.id, { status: 'leave', leaveType: staffAtt.leaveType || 'casual' })} disabled={isLocked}>Leave</button>
                            <button className={`btn btn-sm ${currentStatus === 'holiday' ? 'btn-info' : 'btn-secondary'}`} onClick={() => markAttendance(s.id, { status: 'holiday' })} disabled={isLocked}>Holiday</button>
                          </div>
                          {currentStatus === 'leave' && (
                            <div style={{ marginTop: 4 }}>
                              <select className="input input-sm" value={staffAtt.leaveType || 'casual'} onChange={e => markAttendance(s.id, { leaveType: e.target.value })} disabled={isLocked}>
                                <option value="paid">Paid</option>
                                <option value="unpaid">Unpaid</option>
                                <option value="sick">Sick</option>
                                <option value="casual">Casual</option>
                              </select>
                            </div>
                          )}
                        </td>
                        <td>
                          <input type="time" className="input input-sm" style={{ maxWidth: 100 }} value={staffAtt.checkIn || ''} onChange={e => markAttendance(s.id, { checkIn: e.target.value })} disabled={isLocked} />
                        </td>
                        <td>
                          <input type="time" className="input input-sm" style={{ maxWidth: 100 }} value={staffAtt.checkOut || ''} onChange={e => markAttendance(s.id, { checkOut: e.target.value })} disabled={isLocked} />
                        </td>
                        <td>
                          <input type="number" className="input input-sm" style={{ maxWidth: 70 }} value={staffAtt.lateMinutes || ''} onChange={e => markAttendance(s.id, { lateMinutes: parseInt(e.target.value) || 0 })} disabled={isLocked} />
                        </td>
                        <td>
                          <input type="number" className="input input-sm" style={{ maxWidth: 70 }} value={staffAtt.overtimeHours || ''} onChange={e => markAttendance(s.id, { overtimeHours: parseFloat(e.target.value) || 0 })} disabled={isLocked} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h3>Payroll - {payrollMonth}</h3>
              <input type="month" className="input" style={{ maxWidth: 200 }} value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} />
            </div>
            {monthAttendanceLoading ? <div className="spinner" /> : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15, marginBottom: 20 }}>
                    <div className="card" style={{ padding: 15, textAlign: 'center' }}>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total Staff Expense</h4>
                      <h2 style={{ color: 'var(--primary-color)' }}>Rs {Math.round(totalExpense).toLocaleString()}</h2>
                    </div>
                    <div className="card" style={{ padding: 15, textAlign: 'center' }}>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Attendance Rate</h4>
                      <h2 style={{ color: 'var(--success-color)' }}>{Math.round(attendancePct)}%</h2>
                    </div>
                    <div className="card" style={{ padding: 15, textAlign: 'center' }}>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Payroll Due</h4>
                      <h2 style={{ color: 'var(--warning-color)' }}>Rs {Math.round(payrollDue).toLocaleString()}</h2>
                    </div>
                    <div className="card" style={{ padding: 15, textAlign: 'center' }}>
                      <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Highest Paid</h4>
                      <h4 style={{ margin: '5px 0' }}>{highestPaid?.s?.staffName || '—'}</h4>
                      <small style={{ color: 'var(--text-muted)' }}>Rs {Math.round(highestPaid?.netPayable || 0).toLocaleString()}</small>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th>Staff Name</th>
                          <th>Rank</th>
                          <th>Monthly Salary</th>
                          <th>Present</th>
                          <th>Half Day</th>
                          <th>Absent</th>
                          <th>Leave</th>
                          <th>Holiday</th>
                          <th>Payable</th>
                          <th>Advance</th>
                          <th>Net Payable</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.map(({ s, present, absent, leave, holiday, halfDay, monthlySalary, payableSalary, netPayable, pendingAdvance, dailyDeductionAmount, unpaidDays, overtimePay, totalBonuses, totalIncentives, totalPenalties, storedPayroll }) => (
                          <tr key={s.id}>
                            <td>{s.staffName}</td>
                            <td>{s.rankName}</td>
                            <td>Rs {s.monthlySalary.toLocaleString()}</td>
                            <td>{present}</td>
                            <td>{halfDay}</td>
                            <td>{absent}</td>
                            <td>{leave}</td>
                            <td>{holiday}</td>
                            <td>Rs {Math.round(payableSalary).toLocaleString()}</td>
                            <td>Rs {Math.round(pendingAdvance || 0).toLocaleString()}</td>
                            <td>Rs {Math.round(netPayable).toLocaleString()}</td>
                            <td>
                              <span className={`status-badge ${storedPayroll ? 'active' : 'pending'}`}>
                                {storedPayroll ? 'Cleared' : 'Pending'}
                              </span>
                            </td>
                            <td>
                              {!storedPayroll && (
                                <button className="btn btn-success btn-sm" onClick={() => {
                                  setConfirmPayrollData({
                                    staffId: s.id,
                                    name: s.staffName,
                                    amount: netPayable,
                                    data: { 
                                      monthlySalary, 
                                      payableSalary, 
                                      netPayable, 
                                      pendingAdvance, 
                                      dailyDeductionAmount, 
                                      unpaidDays,
                                      present,
                                      absent,
                                      leave,
                                      holiday,
                                      halfDay,
                                      overtimePay: overtimePay || 0,
                                      totalBonuses: totalBonuses || 0,
                                      totalIncentives: totalIncentives || 0,
                                      totalPenalties: totalPenalties || 0
                                    }
                                  });
                                }}>Clear & Lock</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
          </div>
        )}
      </div>

      {/* Staff Form Modal */}
      {showStaffForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStaffForm(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>{editingStaffId ? '✏️ Edit Staff' : '👥 Add Staff'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowStaffForm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Staff Name *</label>
                <input className="input" value={staffForm.staffName} onChange={e => setStaffForm(f => ({ ...f, staffName: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Phone</label>
                <input className="input" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">CNIC</label>
                <input className="input" value={staffForm.cnic} onChange={e => setStaffForm(f => ({ ...f, cnic: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Rank *</label>
                <select className="input" value={staffForm.rankId} onChange={e => {
                  const r = ranks.find(rank => rank.id === e.target.value);
                  setStaffForm(f => ({
                    ...f,
                    rankId: e.target.value,
                    monthlySalary: r ? String(r.defaultSalary) : f.monthlySalary,
                    allowedHolidaysPerMonth: r ? String(r.defaultHolidays) : f.allowedHolidaysPerMonth
                  }));
                }}>
                  <option value="">Select Rank</option>
                  {ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Monthly Salary</label>
                <input className="input" type="number" value={staffForm.monthlySalary} onChange={e => setStaffForm(f => ({ ...f, monthlySalary: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Joining Date</label>
                <input className="input" type="date" value={staffForm.joiningDate} onChange={e => setStaffForm(f => ({ ...f, joiningDate: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Allowed Holidays</label>
                <input className="input" type="number" value={staffForm.allowedHolidaysPerMonth} onChange={e => setStaffForm(f => ({ ...f, allowedHolidaysPerMonth: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Advance Salary Taken</label>
                <input className="input" type="number" value={staffForm.advanceSalary} onChange={e => setStaffForm(f => ({ ...f, advanceSalary: e.target.value }))} />
              </div>
              <div className="input-group" style={{ gridColumn: 'span 2' }}>
                <label className="input-label">Notes</label>
                <textarea className="input" value={staffForm.notes} onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Status</label>
                <select className="input" value={staffForm.status} onChange={e => setStaffForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="terminated">Terminated</option>
                  <option value="on_leave">On Leave</option>
                  <option value="resigned">Resigned</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowStaffForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveStaff} disabled={saving || !staffForm.staffName || !staffForm.rankId}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rank Form Modal */}
      {showRankForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowRankForm(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>{editingRankId ? '✏️ Edit Rank' : '🏆 Add Rank'}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRankForm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="input-group">
                <label className="input-label">Rank Name *</label>
                <input className="input" value={rankForm.name} onChange={e => setRankForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Default Monthly Salary</label>
                <input className="input" type="number" value={rankForm.defaultSalary} onChange={e => setRankForm(f => ({ ...f, defaultSalary: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Default Holidays/Month</label>
                <input className="input" type="number" value={rankForm.defaultHolidays} onChange={e => setRankForm(f => ({ ...f, defaultHolidays: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Deduction Per Day (Leave/Absent)</label>
                <input className="input" type="number" value={rankForm.dailyDeduction} onChange={e => setRankForm(f => ({ ...f, dailyDeduction: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Shift Hours</label>
                <input className="input" type="number" value={rankForm.shiftHours} onChange={e => setRankForm(f => ({ ...f, shiftHours: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Overtime Multiplier</label>
                <input className="input" type="number" step="0.1" value={rankForm.overtimeMultiplier} onChange={e => setRankForm(f => ({ ...f, overtimeMultiplier: e.target.value }))} />
              </div>
              <div className="input-group">
                <label className="input-label">Grace Late Minutes</label>
                <input className="input" type="number" value={rankForm.graceLateMinutes} onChange={e => setRankForm(f => ({ ...f, graceLateMinutes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowRankForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveRank} disabled={saving || !rankForm.name}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Staff Profile Modal */}
      {viewingProfileStaffId && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewingProfileStaffId(null)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>👤 Staff Profile & History</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setViewingProfileStaffId(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
                <button className={`btn btn-sm ${profileTab === 'advances' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setProfileTab('advances')}>Advances</button>
                <button className={`btn btn-sm ${profileTab === 'adjustments' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setProfileTab('adjustments')}>Adjustments</button>
              </div>

              {profileTab === 'advances' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                    <div className="input-group">
                      <label className="input-label">Amount</label>
                      <input className="input" type="number" value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Type</label>
                      <select className="input" value={advanceForm.type} onChange={e => setAdvanceForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="advance">Advance</option>
                        <option value="repayment">Repayment</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Date</label>
                      <input className="input" type="date" value={advanceForm.date} onChange={e => setAdvanceForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="input-group" style={{ gridColumn: 'span 3' }}>
                      <label className="input-label">Note</label>
                      <input className="input" value={advanceForm.note} onChange={e => setAdvanceForm(f => ({ ...f, note: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={async () => {
                        if (!advanceForm.amount) return;
                        await addAdvance({ ...advanceForm, staffId: viewingProfileStaffId, amount: parseFloat(advanceForm.amount) });
                        setAdvanceForm({ amount: '', type: 'advance', note: '', date: new Date().toISOString().split('T')[0] });
                      }}>Add Record</button>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAdvances.filter(a => a.staffId === viewingProfileStaffId).map(a => (
                          <tr key={a.id}>
                            <td>{a.date}</td>
                            <td><span className={`status-badge ${a.type}`}>{a.type}</span></td>
                            <td>Rs {a.amount.toLocaleString()}</td>
                            <td>{a.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {profileTab === 'adjustments' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                    <div className="input-group">
                      <label className="input-label">Amount</label>
                      <input className="input" type="number" value={adjustmentForm.amount} onChange={e => setAdjustmentForm(f => ({ ...f, amount: e.target.value }))} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Type</label>
                      <select className="input" value={adjustmentForm.type} onChange={e => setAdjustmentForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="bonus">Bonus</option>
                        <option value="incentive">Incentive</option>
                        <option value="penalty">Penalty</option>
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Date</label>
                      <input className="input" type="date" value={adjustmentForm.date} onChange={e => setAdjustmentForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="input-group" style={{ gridColumn: 'span 3' }}>
                      <label className="input-label">Note</label>
                      <input className="input" value={adjustmentForm.note} onChange={e => setAdjustmentForm(f => ({ ...f, note: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={async () => {
                        if (!adjustmentForm.amount) return;
                        await addAdjustment({ ...adjustmentForm, staffId: viewingProfileStaffId, amount: parseFloat(adjustmentForm.amount) });
                        setAdjustmentForm({ amount: '', type: 'bonus', note: '', date: new Date().toISOString().split('T')[0] });
                      }}>Add Record</button>
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="inv-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Amount</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAdjustments.filter(a => a.staffId === viewingProfileStaffId).map(a => (
                          <tr key={a.id}>
                            <td>{a.date}</td>
                            <td><span className={`status-badge ${a.type}`}>{a.type}</span></td>
                            <td>Rs {a.amount.toLocaleString()}</td>
                            <td>{a.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Payroll Modal */}
      {confirmPayrollData && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmPayrollData(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>⚠️ Confirm Payroll Lock</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmPayrollData(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to clear and lock payroll for <strong>{confirmPayrollData.name}</strong>?</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-color)', margin: '15px 0', textAlign: 'center' }}>
                Rs {Math.round(confirmPayrollData.amount).toLocaleString()}
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>This will generate a permanent expense entry and lock the attendance records for this month.</p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmPayrollData(null)}>Cancel</button>
              <button className="btn btn-success" onClick={async () => {
                const { staffId, data, amount } = confirmPayrollData;
                await clearPayroll(staffId, data);
                
                // Add to expenses
                await addExpense({
                  type: 'salary',
                  staffId,
                  payrollMonth,
                  amount,
                  date: new Date().toISOString().split('T')[0],
                  note: `Salary for ${confirmPayrollData.name} (${payrollMonth})`
                });
                
                setConfirmPayrollData(null);
              }}>Confirm & Lock</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteStaffData && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDeleteStaffData(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>⚠️ Confirm Deletion</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteStaffData(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{confirmDeleteStaffData.name}</strong>?</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 10 }}>This action cannot be undone and will remove them from all future payroll and attendance sheets.</p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmDeleteStaffData(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                await deleteStaff(confirmDeleteStaffData.id);
                setConfirmDeleteStaffData(null);
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
