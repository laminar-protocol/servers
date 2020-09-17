import { options } from '@laminar/api';
import { builder, onInterval, createEvent, onEvent } from '@open-web3/dispatcher';
import { ApiManager } from '@open-web3/api';
import { toBaseUnit, defaultLogger, HeartbeatGroup, Heartbeat, fromBaseUnit } from '@open-web3/util';
import { configureLogger } from '@open-web3/app-util';
import { u8aToHex } from '@polkadot/util';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import createServer from './api';
import defaultConfig from './config';
import PriceFetcher from './PriceFetcher';

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

  await cryptoWaitReady();

  const keyring = new Keyring({
    type: 'sr25519'
  });

  const oracleAccount = keyring.addFromUri(config.seed);
  const sessionKey = oracleAccount; // TODO: make it different

  const api = await ApiManager.create({
    ...options({}),
    wsEndpoint: config.wsUrl,
    keyring,
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

  let prevData: Array<{ currency: string; price: string }> = [];

  const readData = async () => {
    return priceFetcher
      .fetchPrices()
      .then((prices) => {
        onPrice.emit(prices);

        prevData = prices;

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
    const oracleQuery = api.api.query[config.oracleName];
    const oracleTx = api.api.tx[config.oracleName];

    const members = await oracleQuery.members();
    const index = (members as any).findIndex((x: any) => x.eq(oracleAccount.address));
    if (index === -1) {
      logger.info('Not valid oracle operator', {
        members: members.toHuman(),
        account: oracleAccount.address
      });
    }
    const values = data.map(({ currency, price }) => [currency, toBaseUnit(price).toFixed()]);

    logger.debug('oracle.feedValues', {
      account: oracleAccount.address,
      index
    });

    const tx = oracleTx.feedValues(values as any);
    const sendResult = api.signAndSend(tx);
    await sendResult.send;
    const events = await sendResult.inBlock;

    feedDataHeartbeat.markAlive();

    logger.info('feedData done', { txHash: events.txHash, blockHash: events.blockHash });
  };

  builder()
    .addHandler(onInterval({ interval: config.interval, immediately: true }, readData))
    .addHandler(onEvent(onPrice, (data) => feedData(data)))
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
