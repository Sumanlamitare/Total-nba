import { handler } from '../lib/http.js';
import { records, clubs } from '../lib/store.js';

// GET /api/records?stat=pts   top 25 single games since 1993-94 (rebuilt daily by the ingest job)
// GET /api/records?clubs=1    most 40-point games and triple-doubles
export default handler(async ({ stat, clubs: c }) => (c ? { ...(await clubs()), cache: 3600 } : { stat, rows: await records(stat), cache: 3600 }));
