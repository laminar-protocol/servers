import { AlphaVantage, FetcherInterface } from '@orml/fetcher';
import config from './config';

export default class AlphaVantageFetcher implements FetcherInterface {
  private readonly alphaVantage: AlphaVantage;

  constructor(apiKey: string) {
    this.alphaVantage = new AlphaVantage(apiKey);
  }

  getPrice(pair: string): Promise<string> {
    const [base, quote] = pair.split('/');
    return this.alphaVantage.getForexPrice(base, quote);
  }
}
