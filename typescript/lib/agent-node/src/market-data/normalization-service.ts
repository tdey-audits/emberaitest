import { OraclePrice, GMXMarketData, NormalizedMarketState, DerivedMetrics } from './schemas.js';

export interface DataSource {
  oraclePrice?: OraclePrice;
  gmxMarketData: GMXMarketData;
}

export class NormalizationService {
  /**
   * Normalizes and merges data from multiple sources into a unified market state
   */
  normalize(dataSource: DataSource): NormalizedMarketState {
    const { oraclePrice, gmxMarketData } = dataSource;

    const derivedMetrics = this.calculateDerivedMetrics(oraclePrice, gmxMarketData);

    const longOI = parseFloat(gmxMarketData.longOpenInterest);
    const shortOI = parseFloat(gmxMarketData.shortOpenInterest);
    const totalOI = longOI + shortOI;
    const oiImbalance = totalOI > 0 ? (longOI - shortOI) / totalOI : 0;

    const longLiquidity = parseFloat(gmxMarketData.liquidityLong);
    const shortLiquidity = parseFloat(gmxMarketData.liquidityShort);
    const totalLiquidity = longLiquidity + shortLiquidity;
    const utilizationRatio = totalLiquidity > 0 ? totalOI / totalLiquidity : 0;

    const fundingRate = parseFloat(gmxMarketData.fundingRate);
    const fundingRateAnnualized = this.annualizeFundingRate(fundingRate);

    return {
      symbol: gmxMarketData.symbol,
      timestamp: gmxMarketData.timestamp,
      price: {
        oracle: oraclePrice?.price ?? gmxMarketData.indexPrice,
        index: gmxMarketData.indexPrice,
        mark: gmxMarketData.markPrice,
        confidence: oraclePrice?.confidence,
      },
      openInterest: {
        long: gmxMarketData.longOpenInterest,
        short: gmxMarketData.shortOpenInterest,
        total: totalOI.toString(),
        imbalance: oiImbalance,
      },
      funding: {
        rate: gmxMarketData.fundingRate,
        rateAnnualized: fundingRateAnnualized,
      },
      liquidity: {
        long: gmxMarketData.liquidityLong,
        short: gmxMarketData.liquidityShort,
        utilizationRatio,
      },
      volatility: {
        realized24h: derivedMetrics.volatility24h,
      },
      derived: {
        volumeWeightedPrice: derivedMetrics.volumeWeightedPrice,
        priceImpact: derivedMetrics.priceImpact,
      },
    };
  }

  /**
   * Calculates derived metrics from raw market data
   */
  private calculateDerivedMetrics(
    oraclePrice: OraclePrice | undefined,
    gmxMarketData: GMXMarketData,
  ): DerivedMetrics {
    const price = parseFloat(oraclePrice?.price ?? gmxMarketData.indexPrice);
    const longOI = parseFloat(gmxMarketData.longOpenInterest);
    const shortOI = parseFloat(gmxMarketData.shortOpenInterest);
    const totalOI = longOI + shortOI;

    const volatility24h = this.estimateVolatility(price, gmxMarketData);

    const volumeWeightedPrice = this.calculateVWAP(gmxMarketData, longOI, shortOI);

    const oiImbalance = totalOI > 0 ? (longOI - shortOI) / totalOI : 0;

    const fundingRate = parseFloat(gmxMarketData.fundingRate);
    const fundingRateAnnualized = this.annualizeFundingRate(fundingRate);

    const longLiquidity = parseFloat(gmxMarketData.liquidityLong);
    const shortLiquidity = parseFloat(gmxMarketData.liquidityShort);
    const totalLiquidity = longLiquidity + shortLiquidity;
    const liquidityRatio = totalLiquidity > 0 ? totalOI / totalLiquidity : 0;

    const priceImpact = this.estimatePriceImpact(totalLiquidity, totalOI, price);

    return {
      symbol: gmxMarketData.symbol,
      volatility24h,
      volumeWeightedPrice,
      openInterestImbalance: oiImbalance,
      fundingRateAnnualized,
      liquidityRatio,
      priceImpact,
      timestamp: gmxMarketData.timestamp,
    };
  }

  /**
   * Estimates 24-hour realized volatility (annualized)
   * This is a simplified estimation based on price range
   */
  private estimateVolatility(_currentPrice: number, gmxMarketData: GMXMarketData): number {
    const indexPrice = parseFloat(gmxMarketData.indexPrice);
    const markPrice = parseFloat(gmxMarketData.markPrice);

    const priceRange = Math.abs(indexPrice - markPrice);
    const avgPrice = (indexPrice + markPrice) / 2;

    const dailyReturn = avgPrice > 0 ? priceRange / avgPrice : 0;

    const annualizedVolatility = dailyReturn * Math.sqrt(365);

    return annualizedVolatility;
  }

  /**
   * Calculates volume-weighted average price
   */
  private calculateVWAP(gmxMarketData: GMXMarketData, longOI: number, shortOI: number): string {
    const indexPrice = parseFloat(gmxMarketData.indexPrice);
    const markPrice = parseFloat(gmxMarketData.markPrice);

    const totalVolume = longOI + shortOI;
    if (totalVolume === 0) {
      return indexPrice.toString();
    }

    const vwap = (indexPrice * longOI + markPrice * shortOI) / totalVolume;

    return vwap.toString();
  }

  /**
   * Annualizes hourly funding rate
   */
  private annualizeFundingRate(hourlyRate: number): number {
    const hoursPerYear = 365 * 24;
    return hourlyRate * hoursPerYear;
  }

  /**
   * Estimates price impact for a standard trade size
   */
  private estimatePriceImpact(totalLiquidity: number, totalOI: number, price: number): number {
    if (totalLiquidity === 0 || price === 0) {
      return 0;
    }

    const standardTradeSize = 10000;

    const availableLiquidity = totalLiquidity - totalOI;
    if (availableLiquidity <= 0) {
      return 1.0;
    }

    const impactRatio = standardTradeSize / availableLiquidity;

    const priceImpact = Math.min(impactRatio * 0.1, 1.0);

    return priceImpact;
  }

  /**
   * Batch normalizes multiple market data sources
   */
  batchNormalize(dataSources: DataSource[]): NormalizedMarketState[] {
    return dataSources.map((source) => this.normalize(source));
  }
}
