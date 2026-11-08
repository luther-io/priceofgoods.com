import React from "react";
import { TrendingUp, TrendingDown, Bot } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { regions } from "../../lib/dataUtils";
import CustomTooltip from "./CustomTooltip";
import PriceHistoryChart from "./PriceHistoryChart";
import { analysisModelName } from "../../lib/analysisModel";

const ItemDetailPage = ({ item, currentPrices, historyData, aiAnalysis, analysisProvider, analysisModel }) => {
  const formatPrice = (price) => {
    return typeof price === "number" ? `$${price.toFixed(2)}` : "N/A";
  };

  const formatChange = (change) => {
    if (typeof change !== "number") return "";
    return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
  };

  const getChangeIcon = (change) => {
    if (typeof change !== "number") return null;
    return change > 0 ? (
      <TrendingUp className="text-red-500 w-6 h-6" />
    ) : (
      <TrendingDown className="text-green-500 w-6 h-6" />
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header Section */}
      <h2 className="text-4xl font-bold mb-2">The Price of {item.name}</h2>
      <p className="text-gray-600 mb-8">
        As of {currentPrices?.national?.latestDate}
      </p>

      {/* Price Display */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-5xl font-bold">
          {formatPrice(currentPrices?.national?.current)}
        </span>
        <span className="text-gray-600">per {item.unit}</span>
      </div>

      {/* Price Change */}
      <div className="flex items-center gap-2 mb-4">
        {getChangeIcon(currentPrices?.national?.percentChange)}
        <span
          className={`text-lg ${
            currentPrices?.national?.percentChange > 0
              ? "text-red-500"
              : "text-green-500"
          }`}
        >
          {formatChange(currentPrices?.national?.percentChange)}
        </span>
      </div>
      
      {/* Regional Price Summary */}
      <div className="flex flex-wrap items-center gap-4 mb-8 text-sm font-medium">
        {Object.entries(regions).filter(([key]) => key !== 'national').map(([region, { name, color }]) => (
          currentPrices?.[region]?.current ? (
            <div key={region} className="flex items-center gap-1 bg-gray-50 py-1 px-3 rounded-full border border-gray-200">
              <span className="mr-1 font-semibold">{name}:</span>
              <span className="text-gray-900">{formatPrice(currentPrices[region].current)}</span>
              {currentPrices[region].percentChange && (
                <span 
                  className={`ml-1 ${
                    currentPrices[region].percentChange > 0
                      ? "text-red-500"
                      : "text-green-500"
                  }`}
                >
                  {formatChange(currentPrices[region].percentChange)}
                </span>
              )}
            </div>
          ) : null
        ))}
      </div>

      {/* AI Market Analysis Section */}
      <div className="mb-8 bg-white rounded-lg shadow-lg p-6 border-t-4 border-blue-600">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl bg-blue-100 p-2 rounded-full flex items-center justify-center">
            <Bot size={24} className="text-blue-600" />
          </span>
          <h2 className="text-2xl font-semibold text-blue-900">
            Market Analysis
          </h2>
        </div>
        <div className="prose prose-lg max-w-none">
          {aiAnalysis ? (
            <article className="markdown-body">
              <div
                dangerouslySetInnerHTML={{ __html: aiAnalysis }}
                className="prose-h1:text-2xl prose-h1:font-bold prose-h1:text-blue-900 prose-h1:mb-4
                           prose-h2:text-xl prose-h2:font-semibold prose-h2:text-blue-800 prose-h2:mt-6 prose-h2:mb-3
                           prose-h3:text-lg prose-h3:font-medium prose-h3:text-blue-700 prose-h3:mt-5 prose-h3:mb-2
                           prose-p:text-gray-700 prose-p:my-3 prose-p:leading-relaxed
                           prose-a:text-blue-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                           prose-strong:text-blue-700 prose-strong:font-semibold
                           prose-ul:my-4 prose-ul:pl-6 prose-li:text-gray-700 prose-li:my-1 prose-li:marker:text-blue-500
                           prose-ol:my-4 prose-ol:pl-6
                           prose-blockquote:border-l-4 prose-blockquote:border-blue-300 prose-blockquote:bg-blue-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:rounded-r prose-blockquote:italic prose-blockquote:text-gray-700
                           prose-code:bg-gray-100 prose-code:p-1 prose-code:rounded prose-code:text-blue-800 prose-code:text-sm
                           prose-pre:bg-gray-800 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-md prose-pre:overflow-auto prose-pre:my-4
                           prose-table:border-collapse prose-table:w-full prose-table:my-4
                           prose-th:bg-blue-50 prose-th:p-2 prose-th:text-left prose-th:font-medium prose-th:border prose-th:border-gray-300
                           prose-td:border prose-td:p-2 prose-td:border-gray-200"
              />
            </article>
          ) : (
            <p className="text-gray-500 italic">
              Analysis not available for this item.
            </p>
          )}
        </div>
        {analysisProvider && analysisProvider !== "None" && (
          <div className="mt-8 pt-4 border-t border-gray-100 bg-gray-50 rounded-b-lg -mx-6 -mb-6 px-6 py-3 flex flex-wrap items-center justify-end gap-y-1">
            <span className="text-xs text-gray-400">Analysis powered by</span>
            {analysisProvider === "Claude" ? (
              <span className="ml-3 font-semibold text-purple-600 flex items-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1.5">
                  <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="#8B5CF6"/>
                  <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8Z" fill="#8B5CF6"/>
                </svg>
                Claude
              </span>
            ) : analysisProvider === "Perplexity" ? (
              <span className="ml-3 font-semibold text-teal-600 flex items-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1.5">
                  <path d="M21 7L12 2L3 7V17L12 22L21 17V7Z" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 11C13.1046 11 14 10.1046 14 9C14 7.89543 13.1046 7 12 7C10.8954 7 10 7.89543 10 9C10 10.1046 10.8954 11 12 11Z" fill="#0D9488"/>
                  <path d="M12 22V16" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Perplexity
              </span>
            ) : (
              <span className="ml-3 font-semibold text-blue-600 flex items-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1.5">
                  <path d="M9.5 3C4.8 3 1 6.8 1 11.5C1 16.2 4.8 20 9.5 20H14.5C19.2 20 23 16.2 23 11.5C23 6.8 19.2 3 14.5 3H9.5Z" stroke="#2563EB" strokeWidth="2"/>
                  <circle cx="9.5" cy="11.5" r="2.5" fill="#2563EB"/>
                  <circle cx="14.5" cy="11.5" r="2.5" fill="#2563EB"/>
                </svg>
                {analysisProvider}
              </span>
            )}
            {(analysisProvider === "Claude" || analysisModel) && (
              <span className="ml-2 text-xs text-gray-500" title={analysisModel}>
                · {analysisModelName(analysisModel)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price History Chart */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Price History</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={historyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(date) => {
                  const d = new Date(date + "-01");
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    year: "2-digit",
                  });
                }}
              />
              <YAxis
                tickFormatter={(value) => `$${value.toFixed(2)}`}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={<CustomTooltip />}
              />
              {Object.entries(regions).map(([key, { name, color }]) => {
                // Check if we have data for this region
                const hasData = historyData.some(entry => entry[key] > 0);
                if (hasData) {
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={name}
                      stroke={color}
                      dot={false}
                      strokeWidth={key === "national" ? 2 : 1.5}
                    />
                  );
                }
                return null;
              })}
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailPage;
