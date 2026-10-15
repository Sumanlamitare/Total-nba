// Marks overdue checks as down and sends their alerts. Run on a schedule (GitHub Actions, every 5 minutes);
// pings and dashboard visits also sweep, so this is the safety net for quiet periods.
import { sweep } from '../lib/checks.js';
import { close } from '../lib/db.js';

const n = await sweep({}, 1000);
console.log(`${new Date().toISOString()} swept: ${n} check(s) went down`);
await close();
