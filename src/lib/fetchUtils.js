// src/lib/fetchUtils.js

/**
 * Fetches the goods configuration data
 * @returns {Promise<import('./types').GoodsConfig>} The goods configuration
 */
export async function fetchGoodsConfig() {
  try {
    const response = await fetch("https://data.priceofgoods.com/goods.json");
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching goods configuration:", error);
    throw new Error(error.message);
  }
}

/**
 * Fetches the latest price data for a specific item in a region
 * @param {string} region - The region code (e.g., 'national', 'northeast')
 * @param {string} item - The item identifier (e.g., 'eggs', 'milk')
 * @returns {Promise<Object|null>} The latest price data or null if not found
 */
export async function fetchLatestItemData(region, item) {
  console.log("Item:", item, "Region:", region);

  try {
    const response = await fetch(
      `https://data.priceofgoods.com/${region}/${item}.json`,
    );

    const pricedata = await response.json();
    return pricedata.data[0] || null;
  } catch (error) {
    console.error(
      `Error fetching latest data for ${item} in ${region}:`,
      error,
    );
    return null;
  }
}

/**
 * Fetches the historical price data for a specific item in a region
 * @param {string} region - The region code (e.g., 'national', 'northeast')
 * @param {string} item - The item identifier (e.g., 'eggs', 'milk')
 * @returns {Promise<Array>} Array of historical price data
 */
export async function fetchItemHistory(region, item) {
  try {
    const response = await fetch(
      `https://data.priceofgoods.com/${region}/${item}.json`,
    );
    const pricedata = await response.json();
    return pricedata.data || [];
  } catch (error) {
    console.error(`Error fetching history for ${item} in ${region}:`, error);
    return [];
  }
}
