// CLI: npm run ingest -- [--from YYYY-MM-DD] [--refresh N]
import 'dotenv/config';
import mongoose from 'mongoose';
import { connect } from '../db.js';
import { sync } from './sync.js';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
await connect();
await sync({ from: arg('--from', '2023-10-24'), refresh: +arg('--refresh', 3) });
await mongoose.disconnect();
