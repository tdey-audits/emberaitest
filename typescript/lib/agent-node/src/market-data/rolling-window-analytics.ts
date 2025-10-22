import { NormalizedMarketState, WindowConfig, WindowAnalytics } from './schemas.js';

export interface TimeSeriesDataPoint {
  timestamp: number;
  state: NormalizedMarketState;
}

export class RollingWindowAnalytics {
  private dataStore: Map<string, TimeSeriesDataPoint[]> = new Map();

  /**
   * Adds a market state to the time series
   */
  addDataPoint(state: NormalizedMarketState): void {
    const key = state.symbol;
    if (!this.dataStore.has(key)) {
      this.dataStore.set(key, []);
    }

    const dataPoints = this.dataStore.get(key)!;
    dataPoints.push({
      timestamp: state.timestamp,
      state,
    });

    dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Computes analytics over a rolling time window
   */
  computeWindow(
    symbol: string,
    windowConfig: WindowConfig,
    endTime?: number,
  ): WindowAnalytics | null {
    const dataPoints = this.dataStore.get(symbol);
    if (!dataPoints || dataPoints.length === 0) {
      return null;
    }

    const end = endTime ?? Date.now() / 1000;
    const start = end - windowConfig.size;

    const windowData = dataPoints.filter((dp) => dp.timestamp >= start && dp.timestamp <= end);

    if (windowData.length === 0) {
      return null;
    }

    const priceData = this.computePriceAnalytics(windowData);
    const oiData = this.computeOpenInterestAnalytics(windowData);
    const fundingData = this.computeFundingAnalytics(windowData);
    const volatilityData = this.computeVolatilityAnalytics(windowData);

    return {
      symbol,
      window: windowConfig,
      startTime: start,
      endTime: end,
      dataPoints: windowData.length,
      price: priceData,
      openInterest: oiData,
      funding: fundingData,
      volatility: volatilityData,
    };
  }

  /**
   * Computes analytics for multiple windows
   */
  computeMultipleWindows(
    symbol: string,
    windowConfigs: WindowConfig[],
    endTime?: number,
  ): Record<string, WindowAnalytics> {
    const results: Record<string, WindowAnalytics> = {};

    for (const config of windowConfigs) {
      const analytics = this.computeWindow(symbol, config, endTime);
      if (analytics) {
        results[config.label] = analytics;
      }
    }

    return results;
  }

  /**
   * Computes price analytics (OHLC + VWAP)
   */
  private computePriceAnalytics(windowData: TimeSeriesDataPoint[]): {
    open: string;
    high: string;
    low: string;
    close: string;
    vwap: string;
  } {
    const prices = windowData.map((dp) => parseFloat(dp.state.price.mark));

    const firstDataPoint = windowData[0];
    const lastDataPoint = windowData[windowData.length - 1];

    if (!firstDataPoint || !lastDataPoint) {
      throw new Error('Invalid window data');
    }

    const open = firstDataPoint.state.price.mark;
    const close = lastDataPoint.state.price.mark;
    const high = Math.max(...prices).toString();
    const low = Math.min(...prices).toString();

    let totalVolumePrice = 0;
    let totalVolume = 0;

    for (const dp of windowData) {
      const price = parseFloat(dp.state.price.mark);
      const volume = parseFloat(dp.state.openInterest.total);
      totalVolumePrice += price * volume;
      totalVolume += volume;
    }

    const vwap = totalVolume > 0 ? (totalVolumePrice / totalVolume).toString() : close;

    return { open, high, low, close, vwap };
  }

  /**
   * Computes open interest analytics
   */
  private computeOpenInterestAnalytics(windowData: TimeSeriesDataPoint[]): {
    avg: string;
    max: string;
    min: string;
    change: number;
  } {
    const oiValues = windowData.map((dp) => parseFloat(dp.state.openInterest.total));

    const sum = oiValues.reduce((acc, val) => acc + val, 0);
    const avg = (sum / oiValues.length).toString();
    const max = Math.max(...oiValues).toString();
    const min = Math.min(...oiValues).toString();

    const startOI = oiValues[0];
    const endOI = oiValues[oiValues.length - 1];

    if (startOI === undefined || endOI === undefined) {
      throw new Error('Invalid OI values');
    }

    const change = startOI > 0 ? ((endOI - startOI) / startOI) * 100 : 0;

    return { avg, max, min, change };
  }

  /**
   * Computes funding rate analytics
   */
  private computeFundingAnalytics(windowData: TimeSeriesDataPoint[]): {
    avg: number;
    max: number;
    min: number;
    cumulative: number;
  } {
    const fundingRates = windowData.map((dp) => parseFloat(dp.state.funding.rate));

    const sum = fundingRates.reduce((acc, val) => acc + val, 0);
    const avg = sum / fundingRates.length;
    const max = Math.max(...fundingRates);
    const min = Math.min(...fundingRates);
    const cumulative = sum;

    return { avg, max, min, cumulative };
  }

  /**
   * Computes volatility analytics
   */
  private computeVolatilityAnalytics(windowData: TimeSeriesDataPoint[]): {
    realized: number;
    high: number;
    low: number;
  } {
    const prices = windowData.map((dp) => parseFloat(dp.state.price.mark));

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const prevPrice = prices[i - 1];
      const currPrice = prices[i];

      if (prevPrice === undefined || currPrice === undefined || prevPrice === 0) {
        continue;
      }

      const returnVal = Math.log(currPrice / prevPrice);
      returns.push(returnVal);
    }

    if (returns.length === 0) {
      return { realized: 0, high: 0, low: 0 };
    }

    const mean = returns.reduce((acc, r) => acc + r, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    const periodsPerYear = (365 * 24 * 60 * 60) / this.getAveragePeriod(windowData);
    const realized = stdDev * Math.sqrt(periodsPerYear);

    const volatilityValues = windowData.map((dp) => dp.state.volatility.realized24h);
    const high = Math.max(...volatilityValues);
    const low = Math.min(...volatilityValues);

    return { realized, high, low };
  }

  /**
   * Calculates average time period between data points
   */
  private getAveragePeriod(windowData: TimeSeriesDataPoint[]): number {
    if (windowData.length < 2) {
      return 3600;
    }

    const periods: number[] = [];
    for (let i = 1; i < windowData.length; i++) {
      const curr = windowData[i];
      const prev = windowData[i - 1];

      if (curr && prev) {
        periods.push(curr.timestamp - prev.timestamp);
      }
    }

    if (periods.length === 0) {
      return 3600;
    }

    return periods.reduce((acc, p) => acc + p, 0) / periods.length;
  }

  /**
   * Clears old data points beyond retention period
   */
  pruneOldData(retentionPeriod: number): void {
    const cutoffTime = Date.now() / 1000 - retentionPeriod;

    for (const [symbol, dataPoints] of this.dataStore.entries()) {
      const filtered = dataPoints.filter((dp) => dp.timestamp >= cutoffTime);
      if (filtered.length === 0) {
        this.dataStore.delete(symbol);
      } else {
        this.dataStore.set(symbol, filtered);
      }
    }
  }

  /**
   * Gets all available symbols
   */
  getAvailableSymbols(): string[] {
    return Array.from(this.dataStore.keys());
  }

  /**
   * Gets data point count for a symbol
   */
  getDataPointCount(symbol: string): number {
    return this.dataStore.get(symbol)?.length ?? 0;
  }

  /**
   * Clears all data
   */
  clear(): void {
    this.dataStore.clear();
  }
}
