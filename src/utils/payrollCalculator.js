export function calculatePayroll(staffWithRankNames, monthAttendance, payrollStatuses, allAdvances, allAdjustments, payrollMonth) {
  const payrollData = staffWithRankNames.filter(s => s.status === 'active').map(s => {
    const staffAtt = monthAttendance[s.id] || {};
    const storedPayroll = payrollStatuses[s.id];
    
    let present = 0, absent = 0, leave = 0, holiday = 0, halfDay = 0;

    if (storedPayroll) {
      present = storedPayroll.present || 0;
      absent = storedPayroll.absent || 0;
      leave = storedPayroll.leave || 0;
      holiday = storedPayroll.holiday || 0;
      halfDay = storedPayroll.halfDay || 0;
    } else {
      Object.values(staffAtt).forEach(att => {
        const status = typeof att === 'string' ? att : att.status;
        const leaveType = typeof att === 'string' ? 'casual' : att.leaveType || 'casual';
        
        if (status === 'present') present++;
        else if (status === 'absent') absent++;
        else if (status === 'leave') {
          if (leaveType === 'unpaid') absent++;
          else leave++;
        }
        else if (status === 'holiday') holiday++;
        else if (status === 'half-day') halfDay++;
      });
    }

    let monthlySalary, payableSalary, netPayable, pendingAdvance, dailyDeductionAmount, unpaidDays, overtimePay, totalBonuses, totalIncentives, totalPenalties;

    if (storedPayroll) {
      monthlySalary = storedPayroll.monthlySalary;
      payableSalary = storedPayroll.payableSalary;
      netPayable = storedPayroll.netPayable;
      pendingAdvance = storedPayroll.pendingAdvance;
      dailyDeductionAmount = storedPayroll.dailyDeductionAmount;
      unpaidDays = storedPayroll.unpaidDays;
      overtimePay = storedPayroll.overtimePay || 0;
      totalBonuses = storedPayroll.totalBonuses || 0;
      totalIncentives = storedPayroll.totalIncentives || 0;
      totalPenalties = storedPayroll.totalPenalties || 0;
    } else {
      const year = parseInt(payrollMonth.split('-')[0]);
      const month = parseInt(payrollMonth.split('-')[1]);
      const daysInMonth = new Date(year, month, 0).getDate();
      
      monthlySalary = s.monthlySalary;
      const unpaidLeaves = Math.max(0, leave - (s.allowedHolidaysPerMonth || 0));
      unpaidDays = absent + (halfDay * 0.5) + unpaidLeaves;
      
      dailyDeductionAmount = s.dailyDeduction || (monthlySalary / daysInMonth);
      payableSalary = monthlySalary;
      
      // Overtime
      const totalOvertimeHours = Object.values(staffAtt).reduce((sum, att) => sum + (typeof att === 'object' ? att.overtimeHours || 0 : 0), 0);
      const hourlySalary = (monthlySalary / daysInMonth) / (s.shiftHours || 8);
      overtimePay = totalOvertimeHours * hourlySalary * (s.overtimeMultiplier || 1);
      
      // Adjustments
      const staffAdjustments = allAdjustments.filter(a => a.staffId === s.id);
      totalBonuses = staffAdjustments.filter(a => a.type === 'bonus').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      totalIncentives = staffAdjustments.filter(a => a.type === 'incentive').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      totalPenalties = staffAdjustments.filter(a => a.type === 'penalty').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      
      // Advances
      const staffAdvances = allAdvances.filter(a => a.staffId === s.id);
      const totalAdvances = staffAdvances.filter(a => a.type === 'advance').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      const totalRepayments = staffAdvances.filter(a => a.type === 'repayment' || a.type === 'deduction').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
      pendingAdvance = totalAdvances - totalRepayments;
      
      netPayable = payableSalary - (dailyDeductionAmount * unpaidDays) + overtimePay + totalBonuses + totalIncentives - totalPenalties - pendingAdvance;
    }

    return { s, present, absent, leave, holiday, halfDay, monthlySalary, payableSalary, netPayable, pendingAdvance, dailyDeductionAmount, unpaidDays, overtimePay, totalBonuses, totalIncentives, totalPenalties, storedPayroll };
  });

  const totalExpense = payrollData.reduce((sum, p) => sum + (p.monthlySalary || 0), 0);
  const payrollDue = payrollData.reduce((sum, p) => sum + p.netPayable, 0);
  const totalDays = payrollData.reduce((sum, p) => sum + p.present + p.absent + p.leave + p.holiday + p.halfDay, 0);
  const totalPresent = payrollData.reduce((sum, p) => sum + p.present + (p.halfDay * 0.5), 0);
  const attendancePct = totalDays ? (totalPresent / totalDays) * 100 : 0;
  
  const highestPaid = payrollData.reduce((max, p) => p.netPayable > (max?.netPayable || 0) ? p : max, null);

  return { payrollData, totalExpense, payrollDue, attendancePct, highestPaid };
}
