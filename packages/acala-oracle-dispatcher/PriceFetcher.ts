import { CombinedFetcher, CCXTFetcher, CryptoCompareFetcher, FetcherInterface } from '@open-web3/fetcher';
import config from './config';

const CURRENCIES: { [key: string]: string } = {
  BTC: 'XBTC',
  ETH: 'ETH'
};

const createFetcher = (exchange: string): FetcherInterface => {
  if (exchange === 'CryptoCompare') {
    return new CryptoCompareFetcher('CCCAGG', config.cryptoCompareApiKey);
  }

  if (exchange.startsWith('CCXT')) {
    const [, exchangeName] = exchange.split(':');
    return new CCXTFetcher(exchangeName);
  }

  throw Error('Unknown exchange');
};

export default class PriceFetcher {
  private readonly fetchers: { [key: string]: FetcherInterface };
  private readonly symbols: string[];

  constructor() {
    this.symbols = config.symbols;

    this.fetchers = this.symbols
      .map((symbol) => {
        const fetchers = config.exchanges[symbol].map((exchange) => createFetcher(exchange));
        return { [symbol]: new CombinedFetcher(fetchers, 1) };
      })
      .reduce((acc, x) => {
        const key = Object.keys(x)[0];
        return { ...acc, [key]: x[key] };
      });
  }

  fetchPrices(): Promise<{ currency: any; price: string }[]> {
    return Promise.all(
      this.symbols.map((symbol) =>
        this.fetchers[symbol].getPrice(symbol).then((price) => {
          const [base] = symbol.split('/');
          return { currency: CURRENCIES[base] || base, price };
        })
      )
    );
  }
}
