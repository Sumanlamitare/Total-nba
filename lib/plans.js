// Plan limits. Billing isn't connected yet, so every account is on Free (with beta-generous limits).
export const PLANS = {
  free: { name: 'Free', price: 0, checks: 20, channels: 3, minPeriod: 60, history: 100 },
  pro: { name: 'Pro', price: 12, checks: 200, channels: 20, minPeriod: 60, history: 100 },
  team: { name: 'Team', price: 39, checks: 1000, channels: 100, minPeriod: 60, history: 100 },
};
export const planOf = user => PLANS[user?.plan] || PLANS.free;
