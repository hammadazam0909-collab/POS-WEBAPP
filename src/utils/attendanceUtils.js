export function calculateAttendanceStats(attendance) {
  const stats = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    holiday: 0
  };

  Object.values(attendance).forEach(att => {
    const status = typeof att === 'string' ? att : att.status;
    if (status === 'present') stats.present++;
    else if (status === 'absent') stats.absent++;
    else if (status === 'half-day') stats.halfDay++;
    else if (status === 'leave') stats.leave++;
    else if (status === 'holiday') stats.holiday++;
  });

  return stats;
}
