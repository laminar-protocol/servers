import dotenv from 'dotenv';
import { inspect } from 'util';
import { options } from '@acala-network/api';
import { builder, onInterval, createEvent, onEvent } from '@orml/dispatcher';
import ApiManager from '@orml/api/api-manager';
import { withAccuracy, defaultLogger } from '@orml/util';
import { AlphaVantage } from '@orml/fetcher';

defaultLogger.addMiddleware((payload, next) =>
  next({ ...payload, args: payload.args.map((x) => inspect(x, false, 5, true)) })
);

const logger = defaultLogger.createLogger('app');

const readEnvConfig = () => {
  dotenv.config();
  const config = {
    wsUrl: process.env.WS_URL as string,
    seed: process.env.SEED as string,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY as string,
    interval: Number(process.env.INTERVAL || 1000 * 60 * 5) // default to 5 mins
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

const run = async () => {
  logger.info('Starting...');

  const envConfig = readEnvConfig();

  const config = {
    currencies: {
      BTC: 'XBTC'
    }
  };

  const api = await ApiManager.create({
    ...options({}),
    wsEndpoint: envConfig.wsUrl,
    account: envConfig.seed
  });

  const alphaVantage = new AlphaVantage(envConfig.alphaVantageApiKey);

  const onPrice = createEvent<Array<{ currency: string; price: string }>>('onPrice');

  const readData = async () => {
    const prices = await Promise.all(
      Object.entries(config.currencies).map(async ([symbol, currency]) => {
        const price = await alphaVantage.getForexPrice(symbol, 'USD');
        return { currency, price };
      })
    );
    prices.push({ currency: 'DOT', price: '300' });
    onPrice.emit(prices);
  };

  const feedData = async (data: Array<{ currency: string; price: string }>) => {
    const tx = api.api.tx.oracle.feedValues(data.map(({ currency, price }) => [currency, withAccuracy(price)]));
    await api.signAndSend(tx).inBlock;
  };

  builder().addHandler(onInterval(envConfig.interval, readData)).addHandler(onEvent(onPrice, feedData)).build();

  logger.info('Ready');
};

run().catch((err) => {
  console.error(err);
});
