import Indexer from '@open-web3/indexer';
import { options } from '@laminar/api';
import axios from 'axios';

const run = async (): Promise<void> => {
  const dbUrl = (process.env.DB_URI as string) || 'postgres://postgres:postgres@localhost:5433/postgres';
  const wsUrl = (process.env.WS_URL as string) || 'wss://testnet-node-1.laminar-chain.laminar.one/ws';
  const indexer = await Indexer.create({ dbUrl, wsUrl, types: options({}).types as any, sync: true });
  await indexer.start();
};

const importHaruraMetadata = () => {
  const url = (process.env.HASURA_URL as string) || 'http://localhost:8081/v1/query';
  return axios.post(url, { type: 'replace_metadata', args: require('./hasura_metadata.json') });
};

run()
  .then(() => {
    return importHaruraMetadata();
  })
  .catch((err) => {
    console.error(err.message);
  });
