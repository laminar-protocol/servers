import { options } from '@acala-network/api';
import { builder, onInterval, createEvent, onEvent } from '@open-web3/dispatcher';
import { ApiManager } from '@open-web3/api';
import { toBaseUnit, defaultLogger, HeartbeatGroup, Heartbeat } from '@open-web3/util';
import { configureLogger } from '@open-web3/app-util';
import { u8aToHex } from '@polkadot/util';
import { Keyring } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
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

  const readData = () => {
    priceFetcher
      .fetchPrices()
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
    const members = await api.api.query.oracle.members();
    const index = (members as any).findIndex((x: any) => x.eq(oracleAccount.address));
    if (index === -1) {
      logger.info('Not valid oracle operator', {
        members: members.toHuman(),
        account: oracleAccount.address
      });
    }
    const values = data.map(({ currency, price }) => [currency, toBaseUnit(price).toFixed()]);
    const block = (await api.api.rpc.chain.getHeader()).number.toNumber();
    const nonce = await api.api.query.oracle.nonces(oracleAccount.address);
    const payload = api.api.registry.createType('(u32, BlockNumber, Vec<(CurrencyId, Price)>)' as any, [
      nonce,
      block,
      values
    ]);
    const sig = sessionKey.sign(payload.toU8a());
    logger.debug('oracle.feedValues', {
      account: oracleAccount.address,
      index,
      nonce: nonce.toString(),
      block: block.toString(),
      payload: payload.toHex(),
      sig: u8aToHex(sig)
    });
    const tx = api.api.tx.oracle.feedValues(values as any, index, block, sig);

    await tx.send();

    feedDataHeartbeat.markAlive();

    logger.info('feedData done', { txHash: tx.hash });
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
