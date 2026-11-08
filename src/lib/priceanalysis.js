import { fetchItemHistory, fetchLatestItemData } from "./fetchUtils";
import { cacheAnalysis, getCachedAnalysis } from "./llmcache";

function generatePrompt(nameOfGood, itemData, historyData, regions) {
  // Extract the month and year from the itemData for consistent titling
  let latestMonth = "Current";
  let latestYear = "";

  if (itemData && itemData.periodName && itemData.year) {
    latestMonth = itemData.periodName;
    latestYear = itemData.year;
  }

  const prompt = `You are a data analyst specializing in price analysis.


Your task is to analyze price data for ${nameOfGood} in the United States of America
and provide insights. Here's the data you'll be working with:

    Here's the latest data from the BLS.
  <latest_price_data>
  {{ ${JSON.stringify(itemData)} }}
  </latest_price_data>

  This is the historical data from the BLS.
  <historical_data_points>
  {{ ${JSON.stringify(historyData)} }}
  </historical_data_points>


Use specific data points and cite current relevant external events affecting prices.
Note any significant correlations between price changes and external factors like policy changes, weather events, or natural phenomenon.



IMPORTANT: Format your response using proper Markdown syntax with the following guidelines:
1. Use # for main heading (title) and ALWAYS start your analysis with "# ${nameOfGood} Price Analysis -  ${latestMonth} ${latestYear}" exactly
2. Use ## for section headings (e.g., "Trends", "Recent Events", "Key Factors")
3. Use bullet points with * for lists
4. Use **bold** for important facts and figures
5. Use tables for comparative data when appropriate
6. Include a "Summary" section at the top with key findings
7. Use blockquotes (>) for highlighting important insights

Your final analysis should be well-structured, including proper headings, paragraphs, and formatting.
`;
  return prompt;
}

async function fetchAnalysisWithPerplexity(prompt) {
  const perplexityKey = import.meta.env.PUBLIC_PERPLEXITY_API_KEY;
  const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${perplexityKey}`,
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "Provide only the final answer. It is important that you do not include any explanation on the steps below.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      frequency_penalty: 1,
      temperature: 0.2,
      search_recency_filter: "month",
      max_tokens: 1000,
    }),
  });
  const perplexityAnalysis = await perplexityResponse.json();

  const citations = perplexityAnalysis.citations;
  const markdown = perplexityAnalysis.choices[0].message.content;
  return { markdown, citations };
}

async function fetchAnalysisWithAnthropic(prompt) {
  try {
    const anthropicKey = import.meta.env.PUBLIC_ANTHROPIC_API_KEY;

    // Validate API key
    if (!anthropicKey) {
      console.error("Anthropic API key is missing");
      throw new Error(
        "Anthropic API key is not configured. Please set PUBLIC_ANTHROPIC_API_KEY in your environment.",
      );
    }

    // Import Anthropic client
    const { Anthropic } = await import("@anthropic-ai/sdk");

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicKey,
    });

    // Set timeout for API call (3 minutes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      // Call Anthropic API with web search enabled
      const response = await anthropic.messages.create(
        {
          model: "claude-opus-5",
          max_tokens: 4000,
          system:
            "Provide only the final answer. It is important that you do not include any explanation on the steps below.",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              blocked_domains: ["apple.com", "appleinsider.com"], // when looking up apple prices, it seems to pick up apple.com and appleinsider.com a lot..
              max_uses: 1,
            },
          ],
        },
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      // Validate response structure
      if (!response || !response.content || !Array.isArray(response.content)) {
        console.error("Invalid response structure from Anthropic API");
        throw new Error("Invalid response structure from Anthropic API");
      }

      // Extract all text content from the response and process citations
      let markdownParts = [];
      let allCitations = [];

      // Process each content block
      for (const block of response.content) {
        // Skip non-text blocks
        if (block.type !== "text") continue;

        // Add the text to our markdown collection
        markdownParts.push(block.text || "");

        // Process citations if they exist
        if (block.citations && Array.isArray(block.citations) && block.citations.length > 0) {
          // Collect citations
          allCitations = [...allCitations, ...block.citations];
        }
      }

      // Combine all markdown parts into a single string
      let markdown = markdownParts.join("");

      // Remove Claude's acknowledgment text that appears before the first heading
      // This is a common pattern where Claude says things like "I'll analyze..." or "Let me search..."
      const firstHeadingMatch = markdown.match(/(#\s+[\w\s\-\.,:;]+)/m);
      if (firstHeadingMatch) {
        const indexOfFirstHeading = markdown.indexOf(firstHeadingMatch[0]);
        const textBeforeHeading = markdown.substring(0, indexOfFirstHeading);

        // Only remove text before heading if it looks like acknowledgment text
        const acknowledgmentPhrases = [
          "I'll analyze",
          "Let me search",
          "I will analyze",
          "analyzing",
          "let me look up",
          "I'll provide",
          "searching for",
          "researching",
          "I'll check",
          "let me gather",
          "I can provide",
          "let me find",
          "I'll examine",
          "looking into",
          "searching current",
          "let me use",
          "let's explore",
          "let me review",
          "I need to",
          "I'm going to",
          "I will search",
          "let me look for",
          "I'll research",
          "based on the data",
          "here's my analysis",
          "now I'll",
          "first,",
        ];

        // Also look for patterns like empty lines followed by "Let me search..."
        // which indicate an acknowledgment after Claude has already started responding
        const hasNewLineAcknowledgment = /\n\n(Let me|I'll|Now I|To find)/i.test(textBeforeHeading);

        const hasAcknowledgment =
          acknowledgmentPhrases.some((phrase) =>
            textBeforeHeading.toLowerCase().includes(phrase.toLowerCase()),
          ) || hasNewLineAcknowledgment;

        if (hasAcknowledgment) {
          // Debug log to show what content is being filtered out
          console.log(
            "Filtering acknowledgment text (first 100 chars):",
            textBeforeHeading.substring(0, 100).replace(/\n/g, "\\n") +
              (textBeforeHeading.length > 100 ? "..." : ""),
          );

          markdown = markdown.substring(indexOfFirstHeading);
        }
      }

      // Validate markdown content
      if (!markdown || markdown.trim() === "") {
        console.warn("Empty markdown response from Anthropic API");
      }

      // Transform citations into the format expected by the application
      const processedCitations = allCitations.map((citation, index) => {
        // Validate citation structure
        if (!citation) return { id: index + 1, url: "", title: "Unknown source", text: "" };

        return {
          id: index + 1,
          url: citation.url || "",
          title: citation.title || "Reference source",
          text: citation.text || "",
        };
      });

      // Log analytics about the response for monitoring
      console.log(
        `Anthropic response processed - Markdown length: ${markdown.length}, Citations: ${processedCitations.length}`,
      );

      // Log the first 100 chars of the processed markdown for debugging
      console.log(
        "First 100 chars of processed markdown:",
        markdown.substring(0, 100).replace(/\n/g, "\\n") + (markdown.length > 100 ? "..." : ""),
      );

      // Return in the same format as Perplexity
      return { markdown, citations: processedCitations };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    console.error("Error in fetchAnalysisWithAnthropic:", error);
    // Return a fallback response
    return {
      markdown: `# Price Analysis\n\nUnable to generate price analysis. ${error.message || "An unexpected error occurred."}`,
      citations: [],
    };
  }
}

async function fetchAnalysis(prompt, useAnthropic = true) {
  console.log(`Using ${useAnthropic ? "Anthropic" : "Perplexity"} API for analysis`);

  try {
    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      throw new Error("Invalid prompt: prompt must be a non-empty string");
    }

    if (useAnthropic) {
      return await fetchAnalysisWithAnthropic(prompt);
    } else {
      return await fetchAnalysisWithPerplexity(prompt);
    }
  } catch (error) {
    console.error(
      `Error in fetchAnalysis using ${useAnthropic ? "Anthropic" : "Perplexity"}:`,
      error,
    );
    // Return a fallback response that matches the expected format
    return {
      markdown: `# Price Analysis\n\nUnable to generate price analysis due to a service error. Please try again later.`,
      citations: [],
    };
  }
}

/**
 * Analyzes price data for an item using either Anthropic API with web search or Perplexity API
 * @param {import('./types').Good} item - The item to analyze
 * @param {boolean} useAnthropic - Whether to use Anthropic API (true) or Perplexity API (false)
 * @returns {Promise<import('./types').PriceAnalysis>} Analysis results
 */
export async function analyzeItemPrices(item, useAnthropic = true) {
  // Only use cache if enabled via environment variable.
  if (import.meta.env.PUBLIC_CACHE_AI_RESPONSE) {
    const cached = await getCachedAnalysis(item.dataKey);
    if (cached) {
      console.log(`Using cached analysis for ${item.name}`);
      // Ensure cached result has provider information
      return {
        ...cached,
        provider: cached.provider || (cached.source === "anthropic" ? "Claude" : "Perplexity"),
      };
    }
  }

  try {
    // Fetch all required data in parallel.
    const [nationalData, historyData, regionalData] = await Promise.all([
      fetchLatestItemData("national", item.dataKey),
      fetchItemHistory("national", item.dataKey),
      // Promise.all(
      //   ["northeast", "midwest", "south", "west"].map(async (region) => ({
      //     region,
      //     ...(await fetchLatestItemData(region, item.dataKey)),
      //   })),
      // ),
    ]);

    const prompt = generatePrompt(item.name, nationalData, historyData, regionalData);

    let analysis;
    let citations;
    try {
      const result = await fetchAnalysis(prompt, useAnthropic);
      // result contains { markdown, citations }
      analysis = result.markdown;
      citations = result.citations;
      // console.log(analysis);
      // console.log(citations);
      // Cache the analysis if in development.
      if (import.meta.env.DEV) {
        await cacheAnalysis(
          item.dataKey,
          analysis,
          citations,
          prompt,
          useAnthropic ? "anthropic" : "perplexity",
        );
      }
    } catch (error) {
      console.error(`Analysis failed for ${item.name}:`, error);
      throw error;
    }
    const timestamp = Date.now();
    // console.log("Returning analysis", analysis);
    // console.log("Returning citations", citations);
    // Return the analysis result with the same structure as cachedAnalysis.
    return {
      data: analysis,
      citations,
      timestamp,
      provider: useAnthropic ? "Claude" : "Perplexity",
    };
  } catch (error) {
    console.error(`Error analyzing prices for ${item.name}:`, error);
    // Return a default response instead of throwing, to prevent the page from failing to render
    return {
      data: `# ${item.name} Price Analysis\n\nPrice analysis data is currently unavailable. Please check back later.`,
      citations: [],
      timestamp: Date.now(),
      provider: "None",
    };
  }
}
