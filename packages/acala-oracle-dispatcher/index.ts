import { options } from '@acala-network/api';
import { builder, onInterval, createEvent, onEvent } from '@orml/dispatcher';
import { ApiManager } from '@orml/api';
import { toBaseUnit, defaultLogger, HeartbeatGroup, Heartbeat } from '@orml/util';
import { configureLogger } from '@orml/app-util';
import createServer from './api';
import PriceFetcher from './PriceFetcher';
import defaultConfig from './config';

import tradeDex from './dex';

const logger = defaultLogger.createLogger('app');

const readEnvConfig = (overrideConfig: object) => {
  const config = {
    ...defaultConfig,
    ...overrideConfig
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

const run = async (overrideConfig: Partial<ReturnType<typeof readEnvConfig>> = {}) => {
  const config = readEnvConfig(overrideConfig);

  const heartbeats = new HeartbeatGroup({ livePeriod: config.interval + 1000, deadPeriod: config.interval });

  configureLogger({
    slackWebhook: config.slackWebhook,
    production: config.env === 'production',
    filter: config.logFilter,
    level: config.logLevel,
    heartbeatGroup: heartbeats
  });

  logger.info('Starting...');

  const api = await ApiManager.create({
    ...options({}),
    wsEndpoint: config.wsUrl,
    account: config.seed
  });

  let priceFetcher = new PriceFetcher();

  const onPrice = createEvent<Array<{ currency: string; price: string }>>('onPrice');

  const readDataHeartbeat = new Heartbeat(config.interval * 4, 0);
  heartbeats.addHeartbeat('readData', readDataHeartbeat);

  const readData = () => {
    priceFetcher
      .fetchPrices()
      .then((prices) => [...prices, { currency: 'DOT', price: '300' }])
      .then((prices) => {
        onPrice.emit(prices);

        readDataHeartbeat.markAlive();

        logger.log('readData', prices);
      })
      .catch((error) => {
        logger.info('getPrices error', error);
      });
  };

  const feedDataHeartbeat = new Heartbeat(config.interval * 4, 0);
  heartbeats.addHeartbeat('feedData', feedDataHeartbeat);

  const feedData = async (data: Array<{ currency: string; price: string }>) => {
    const tx = api.api.tx.oracle.feedValues(data.map(({ currency, price }) => [currency, toBaseUnit(price).toFixed()]));
    const result = api.signAndSend(tx);
    await result.send;
    const res = await api.signAndSend(tx).inBlock;

    feedDataHeartbeat.markAlive();

    logger.info('feedData done', { blockHash: res.blockHash, txHash: res.txHash });
  };

  const tradeDexHeartbeat = new HeartbeatGroup({ livePeriod: config.interval * 4 });
  heartbeats.addHeartbeat('tradeDex', () => tradeDexHeartbeat.summary());

  builder()
    .addHandler(onInterval({ interval: config.interval, immediately: true }, readData))
    .addHandler(onEvent(onPrice, feedData))
    .addHandler(onEvent(onPrice, (data) => tradeDex(api, data, tradeDexHeartbeat)))
    .build();

  // API server

  createServer({ port: config.port, heartbeats });

  logger.info('Ready');
};

export default run;

// if called directly
if (require.main === module) {
  run();
}
