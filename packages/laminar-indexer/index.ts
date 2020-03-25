import Indexer from '@orml/indexer';
import dotenv from 'dotenv';
import { options } from '@laminar/api';

dotenv.config();

const run = async (): Promise<void> => {
  const dbUrl = process.env.DB_URI as string;
  const wsUrl = process.env.WS_URL || 'wss://testnet-node-1.laminar-chain.laminar.one/ws';
  const indexer = await Indexer.create({ dbUrl, wsUrl, types: options({}).types as any, sync: true });
  await indexer.start();
};

run().catch((err) => {
  console.error(err);
});
