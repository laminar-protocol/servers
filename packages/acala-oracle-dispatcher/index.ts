import { options } from '@acala-network/api';
import { builder, onInterval, createEvent, onEvent } from '@open-web3/dispatcher';
import { ApiManager } from '@open-web3/api';
import { toBaseUnit, defaultLogger, HeartbeatGroup, Heartbeat } from '@open-web3/util';
import { configureLogger } from '@open-web3/app-util';
import createServer from './api';
import PriceFetcher from './PriceFetcher';
import defaultConfig from './config';

import tradeDex from './dex';

const logger = defaultLogger.createLogger('app');

const readEnvConfig = (overrideConfig: object) => ({
  ...defaultConfig,
  ...overrideConfig
});

const run = async (overrideConfig: Partial<ReturnType<typeof readEnvConfig>> = {}) => {
  const config = readEnvConfig(overrideConfig);

  const heartbeats = new HeartbeatGroup({ deadPeriod: config.interval });

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

  logger.log('API details', {
    defaultAccount: api.defaultAccount?.address,
    endpoint: config.wsUrl
  });

  const priceFetcher = new PriceFetcher();

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
    .addHandler(onEvent(onPrice, (data) => feedData(data)))
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
