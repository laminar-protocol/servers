import { CombinedFetcher, CCXTFetcher, CryptoCompareFetcher, FetcherInterface } from '@orml/fetcher';

const CURRENCIES: { [key: string]: string } = {
  BTC: 'XBTC',
  ETH: 'ETH'
};

export default class PriceFetcher {
  private readonly fetchers: { [key: string]: FetcherInterface };
  private readonly symbols: string[];

  constructor() {
    const apiKeyCryptoCompare = process.env['API_KEY_CryptoCompare'] as string;
    if (!apiKeyCryptoCompare) {
      throw new Error(`Missing API_KEY_CryptoCompare`);
    }

    const SYMBOLS = process.env['SYMBOLS'] as string;
    if (!SYMBOLS) {
      throw new Error(`Missing SYMBOLS`);
    }
    this.symbols = SYMBOLS.split(',');

    this.fetchers = this.symbols
      .map((symbol) => {
        const [base, quote] = symbol.split('/');
        const EXCHANGES = process.env[`EXCHANGES_${base}_${quote}`] as string;
        if (!EXCHANGES) {
          throw new Error(`Missing EXCHANGES_${base}_${quote}`);
        }
        const exchanges = EXCHANGES.split(',');

        const fetchers = exchanges
          .map((exchange) => [new CCXTFetcher(exchange), new CryptoCompareFetcher(exchange, apiKeyCryptoCompare)])
          .reduce((acc, x) => acc.concat(x));

        return { [symbol]: new CombinedFetcher(fetchers) };
      })
      .reduce((acc, x) => {
        const key = Object.keys(x)[0];
        return { ...acc, [key]: x[key] };
      });
  }

  fetchPrices(): Promise<{ currency: any; price: string }[]> {
    const SYMBOLS = process.env['SYMBOLS'] as string;
    const symbols = SYMBOLS.split(',');
    return Promise.all(
      this.symbols.map((s) =>
        this.fetchers[s].getPrice(s).then((price) => {
          const [base] = s.split('/');
          return { currency: CURRENCIES[base] || base, price };
        })
      )
    );
  }
}
