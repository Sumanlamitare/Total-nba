// Date helpers shared by the API functions (dates are YYYY-MM-DD strings)
export const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// The Monday–Sunday week containing a date
export const weekDates = date => {
  const dow = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - dow));
};
