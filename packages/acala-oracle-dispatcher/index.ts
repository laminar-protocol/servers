import dotenv from 'dotenv';
import { types } from '@acala-network/types';
import { builder } from '@orml/dispatcher';
import { ApiManager } from '@orml/api';

dotenv.config();

const run = async () => {
  const api = await ApiManager.create();
  builder().build();
};

run().catch((err) => {
  console.error(err);
});
