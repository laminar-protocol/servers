import { CombinedFetcher, CCXTFetcher, CryptoCompareFetcher, FetcherInterface } from '@orml/fetcher';
import config from './config';

const CURRENCIES: { [key: string]: string } = {
  BTC: 'XBTC',
  ETH: 'ETH'
};

export default class PriceFetcher {
  private readonly fetchers: { [key: string]: FetcherInterface };
  private readonly symbols: string[];

  constructor() {
    this.symbols = config.symbols;

    this.fetchers = this.symbols
      .map((symbol) => {
        const ccxtFetchers = config.exchanges[symbol].map((exchange) => new CCXTFetcher(exchange));
        const CCCAGG = new CryptoCompareFetcher('CCCAGG', config.cryptoCompareApiKey);
        return { [symbol]: new CombinedFetcher([...ccxtFetchers, CCCAGG]) };
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
