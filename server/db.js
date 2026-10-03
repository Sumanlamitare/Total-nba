import mongoose from 'mongoose';

export async function connect() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/totalnba';
  await mongoose.connect(uri);
  return mongoose.connection;
}
