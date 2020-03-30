import BigNumber from 'big.js';
import { ApiManager } from '@orml/api';
import { defaultLogger } from '@orml/util';

const logger = defaultLogger.createLogger('dex');

const BASE_CURRENCY_ID = 'AUSD';

// if more than `ARBITRAGE_RATIO`, do swap; 3%
const ARBITRAGE_RATIO = 0.03;

// expect less target amount to cover exchange fee (0.3%) and other slippage (0.7%)
const SLIPPAGE_RATIO = 0.01;

const tradeOne = async (api: ApiManager, currency: string, price: number) => {
  const pool: any = await api.api.query.dex.liquidityPool(currency);
  const [listingAmount, baseAmount]: [number, number] = pool.map((x: any) => +x.toString()); // this is a lossy conversion but it is fine
  if (!listingAmount) {
    logger.debug('Skip, zero listing amount', { currency });
    return;
  }

  const dexPrice = baseAmount / listingAmount;

  const gapRatio = Math.abs((price - dexPrice) / price);
  if (gapRatio < ARBITRAGE_RATIO) {
    logger.debug('Skip, price close', { currency, price, dexPrice });
    return;
  }

  const constProduct = listingAmount * baseAmount;

  const newListingAmount = Math.sqrt(constProduct / price);
  const newBaseAmount = constProduct / newListingAmount;

  logger.debug('Swap starts', {
    currency,
    price,
    dexPrice,
    newBaseAmount,
    newListingAmount,
    baseAmount,
    listingAmount
  });

  let sendResult;

  if (dexPrice < price) {
    // buy
    const supplyAmount = newBaseAmount - baseAmount;
    const targetAmount = (listingAmount - newListingAmount) * (1 - SLIPPAGE_RATIO);
    sendResult = api.signAndSend(
      api.api.tx.dex.swapCurrency(
        [BASE_CURRENCY_ID, new BigNumber(supplyAmount).toFixed()],
        [currency, new BigNumber(targetAmount).toFixed()]
      )
    );
  } else {
    // sell
    const supplyAmount = newListingAmount - listingAmount;
    const targetAmount = (baseAmount - newBaseAmount) * (1 - SLIPPAGE_RATIO);
    sendResult = api.signAndSend(
      api.api.tx.dex.swapCurrency(
        [currency, new BigNumber(supplyAmount).toFixed()],
        [BASE_CURRENCY_ID, new BigNumber(targetAmount).toFixed()]
      )
    );
  }

  await sendResult.send;
  const events = await sendResult.inBlock;
  logger.log('Swap done', {
    currency,
    price,
    dexPrice,
    txHash: events.txHash,
    blockHash: events.blockHash
  });
};

const tradeDex = async (api: ApiManager, data: Array<{ currency: string; price: string }>) => {
  for (const { currency, price } of data) {
    await tradeOne(api, currency, +price);
  }
};

export default tradeDex;
