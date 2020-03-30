import dotenv from 'dotenv';
import { options } from '@acala-network/api';
import { builder, onInterval, createEvent, onEvent } from '@orml/dispatcher';
import { ApiManager } from '@orml/api';
import { toBaseUnit, defaultLogger } from '@orml/util';
import { AlphaVantage } from '@orml/fetcher';
import { configureLogger } from '@orml/app-util';

import tradeDex from './dex';

const logger = defaultLogger.createLogger('app');

const readEnvConfig = () => {
  dotenv.config();
  const config = {
    wsUrl: process.env.WS_URL as string,
    seed: process.env.SEED as string,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY as string,
    slackWebhook: process.env.SLACK_WEBHOOK,
    interval: Number(process.env.INTERVAL || 1000 * 60 * 5), // default to 5 mins
    env: process.env.NODE_ENV || 'development',
    logFilter: process.env.LOG_FILTER,
    logLevel: process.env.LOG_LEVEL
  };

  if (!config.wsUrl) {
    throw new Error('Missing WS_URL');
  }
  if (!config.seed) {
    throw new Error('Missing SEED');
  }
  if (!config.alphaVantageApiKey) {
    throw new Error('Missing ALPHA_VANTAGE_API_KEY');
  }
  return config;
};

const CURRENCIES = {
  BTC: 'XBTC'
};

const SYMBOLS: [keyof typeof CURRENCIES, string][] = [['BTC', 'USD']];

const run = async () => {
  const config = readEnvConfig();
  configureLogger({
    slackWebhook: config.slackWebhook,
    production: config.env === 'production',
    filter: config.logFilter,
    level: config.logLevel
  });

  logger.info('Starting...');

  const api = await ApiManager.create({
    ...options({}),
    wsEndpoint: config.wsUrl,
    account: config.seed
  });

  const alphaVantage = new AlphaVantage(config.alphaVantageApiKey);

  const onPrice = createEvent<Array<{ currency: string; price: string }>>('onPrice');

  const readData = async () => {
    const result = await alphaVantage.getAll(SYMBOLS);
    const prices = result.map((x, idx) => ({ currency: CURRENCIES[SYMBOLS[idx][0]], price: x }));
    prices.push({ currency: 'DOT', price: '300' });
    onPrice.emit(prices);

    logger.log('readData', prices);
  };

  const feedData = async (data: Array<{ currency: string; price: string }>) => {
    const tx = api.api.tx.oracle.feedValues(data.map(({ currency, price }) => [currency, toBaseUnit(price).toFixed()]));
    const result = api.signAndSend(tx);
    await result.send;
    const res = await api.signAndSend(tx).inBlock;

    logger.log('feedData done', { blockHash: res.blockHash, txHash: res.txHash });
  };

  builder()
    .addHandler(onInterval({ interval: config.interval, immediately: true }, readData))
    .addHandler(onEvent(onPrice, feedData))
    .addHandler(onEvent(onPrice, (data) => tradeDex(api, data)))
    .build();

  logger.info('Ready');
};

run().catch((err) => {
  console.error(err);
});
