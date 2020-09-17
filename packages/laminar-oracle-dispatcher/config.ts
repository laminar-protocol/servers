import dotenv from 'dotenv';

dotenv.config();

const config = () => {
  // parse api_keys
  const cryptoCompareApiKey = process.env.CRYPTO_COMPARE_API_KEY;
  if (!cryptoCompareApiKey) {
    throw new Error('Missing CRYPTO_COMPARE_API_KEY');
  }

  // parse symbols
  const SYMBOLS = process.env.SYMBOLS;
  if (!SYMBOLS) {
    throw new Error('Missing SYMBOLS');
  }
  const symbols = SYMBOLS.split(',');

  // parse exchanges
  const exchanges = symbols
    .map((symbol) => {
      const [base, quote] = symbol.split('/');
      const EXCHANGES = process.env[`EXCHANGES_${base}_${quote}`];
      if (!EXCHANGES) {
        throw new Error(`Missing EXCHANGES_${base}_${quote}`);
      }
      const exchanges = EXCHANGES.split(',');
      return { [symbol]: exchanges };
    })
    .reduce((acc, x) => {
      const key = Object.keys(x)[0];
      return { ...acc, [key]: x[key] };
    });

  const config = {
    wsUrl: process.env.WS_URL as string,
    seed: process.env.SEED as string,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY as string,
    slackWebhook: process.env.SLACK_WEBHOOK,
    interval: Number(process.env.INTERVAL || 1000 * 60 * 5), // default to 5 mins
    env: process.env.NODE_ENV || 'development',
    logFilter: process.env.LOG_FILTER,
    logLevel: process.env.LOG_LEVEL,
    port: process.env.PORT || 3000,
    oracleName: process.env.ORACLE_NAME as string,
    cryptoCompareApiKey,
    symbols,
    exchanges
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

export default config();
