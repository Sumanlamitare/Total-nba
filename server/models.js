import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One finished (or in-progress) game
export const Game = model('Game', new Schema({
  _id: String,                 // ESPN event id
  date: { type: String, index: true }, // YYYY-MM-DD (US date of tip-off)
  season: String,              // e.g. 2025-26
  type: Number,                // 2 regular season, 3 playoffs, 5 play-in
  home: String, away: String, hs: Number, as: Number, done: Boolean,
}));

// One player's box score line in one game
const lineSchema = new Schema({
  gameId: String, date: String, season: String, type: Number,
  playerId: String, name: String, team: String, opp: String,
  pts: Number, reb: Number, ast: Number, stl: Number, blk: Number, tpm: Number, min: Number,
});
lineSchema.index({ gameId: 1, playerId: 1 }, { unique: true });
lineSchema.index({ date: 1 });
lineSchema.index({ season: 1, type: 1 });
export const Line = model('Line', lineSchema);

// Which dates have been fetched, so old days aren't refetched
export const Day = model('Day', new Schema({
  _id: String, games: Number, partial: Boolean, fetchedAt: Date,
}));

// Your like/dislike and notes on a performance, keyed by a stable slug
export const Reaction = model('Reaction', new Schema({
  _id: String,
  vote: { type: Number, default: 0 },
  notes: [{ text: String, ts: Number }],
}));

export const Meta = model('Meta', new Schema({ _id: String, updated: Date, lockedAt: Date }));
