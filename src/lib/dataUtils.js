// src/lib/dataUtils.js
import {
  fetchLatestItemData,
  fetchItemHistory,
} from "./fetchUtils";

const regions = {
  national: { name: "National Average", color: "#1e40af" },
  northeast: { name: "Northeast", color: "#0891b2" },
  midwest: { name: "Midwest", color: "#15803d" },
  south: { name: "South", color: "#b45309" },
  west: { name: "West", color: "#7c3aed" },
};

export { regions };

const DEFAULT_PRICE_DATA = {
  current: 0,
  priceChange: null,
  percentChange: null,
};

/**
 * @param {string} itemKey
 * @returns {Promise<import('./types').ItemData>}
 */
export async function processItemData(itemKey) {
  try {
    // ===============================
    // STEP 1: FETCH CURRENT PRICES
    // ===============================
    // For each region, fetch the latest price data.
    // If no data is returned, fall back to the default.
    const currentPricesPromises = Object.keys(regions).map(async (region) => {
      try {
        const data = await fetchLatestItemData(region, itemKey);

        // If data isn't returned, warn and use defaults.
        if (!data) {
          console.warn(`No current price data for ${region}/${itemKey}`);
          return { region, ...DEFAULT_PRICE_DATA, latestDate: null };
        }

        // Build the current price object.
        // We also extract the latest date from the returned data.
        return {
          region,
          current: data.value ? parseFloat(data.value) : 0,
          priceChange: data.calculations?.net_changes?.["1"]
            ? parseFloat(data.calculations.net_changes["1"])
            : null,
          percentChange: data.calculations?.pct_changes?.["1"]
            ? parseFloat(data.calculations.pct_changes["1"])
            : null,
          latestDate:
            data.periodName && data.year
              ? `${data.periodName} ${data.year}`
              : null,
        };
      } catch (error) {
        console.error(
          `Error fetching current price for ${region}/${itemKey}:`,
          error,
        );
        return { region, ...DEFAULT_PRICE_DATA, latestDate: null };
      }
    });
    const currentPricesResults = await Promise.all(currentPricesPromises);

    // ===============================
    // STEP 2: FETCH HISTORICAL DATA
    // ===============================
    // For each region, fetch the historical data.
    const historicalDataPromises = Object.keys(regions).map(async (region) => {
      try {
        const data = await fetchItemHistory(region, itemKey);
        if (!data || !Array.isArray(data)) {
          console.warn(`No historical data for ${region}/${itemKey}`);
          return { region, data: [] };
        }
        return { region, data };
      } catch (error) {
        console.error(
          `Error fetching history for ${region}/${itemKey}:`,
          error,
        );
        return { region, data: [] };
      }
    });
    const historicalDataResults = await Promise.all(historicalDataPromises);

    // ===============================
    // STEP 3: PROCESS CURRENT PRICES
    // ===============================
    // Build a dictionary keyed by region for the current prices,
    // including the latestDate information.
    const prices = {};
    currentPricesResults.forEach((priceInfo) => {
      prices[priceInfo.region] = {
        current: priceInfo.current,
        priceChange: priceInfo.priceChange,
        percentChange: priceInfo.percentChange,
        latestDate: priceInfo.latestDate,
      };
    });

    // ===============================
    // STEP 4: PROCESS HISTORICAL DATA
    // ===============================
    // Create a unified history array from all regional histories.
    let history = [];
    historicalDataResults.forEach(({ region, data }) => {
      if (!data) return;

      data.forEach((entry) => {
        // Validate that the entry has the needed properties.
        if (!entry?.year || !entry?.period || !entry?.value) return;

        // Create a simple month string.
        // Assuming the period is in the format "M12" (for December), remove the "M".
        const month = `${entry.year}-${entry.period.substring(1)}`;

        // Check if an entry for this month already exists.
        const existingIndex = history.findIndex((e) => e.date === month);

        if (existingIndex >= 0) {
          // Add this region's value to the existing history entry.
          history[existingIndex][region] = parseFloat(entry.value) || 0;
        } else {
          // Otherwise, create a new history entry.
          history.push({
            date: month,
            [region]: parseFloat(entry.value) || 0,
          });
        }
      });
    });

    // ===============================
    // STEP 5: SORT & LIMIT HISTORY
    // ===============================
    // Sort history by date and take the most recent 24 months.
    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    history = history.slice(-24);

    // ===============================
    // STEP 6: FILL MISSING DATA
    // ===============================
    // Ensure that for every history entry every region has a value.
    history = history.map((entry) => {
      const completeEntry = { ...entry };
      Object.keys(regions).forEach((region) => {
        if (!(region in completeEntry)) {
          completeEntry[region] = 0;
        }
      });
      return completeEntry;
    });

    // Return the processed data.
    return {
      currentPrices: prices,
      history: history.length > 0 ? history : [],
    };
  } catch (error) {
    console.error("Error processing item data:", error);
    // Return a safe default structure in case of error.
    const defaultPrices = Object.keys(regions).reduce((acc, region) => {
      acc[region] = { ...DEFAULT_PRICE_DATA, latestDate: null };
      return acc;
    }, {});

    return {
      currentPrices: defaultPrices,
      history: [],
    };
  }
}
