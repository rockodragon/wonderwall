import { v } from "convex/values";
import { action } from "./_generated/server";

// Simplified JSON Schema - flatter structure for better model compliance
const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    org_type: { type: "string" },
    industry: { type: "string" },
    street_address: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    zip_code: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    faith_signals: { type: "array", items: { type: "string" } },
    has_careers_page: { type: "boolean" },
    total_score: { type: "integer" },
    summary: { type: "string" },
  },
  required: ["name", "org_type", "total_score", "summary"],
};

const CLASSIFICATION_PROMPT = `Analyze this website for a faith-based job board. Extract key details.

Website content:
---
{CONTENT}
---

Return JSON with: name, org_type (CHURCH/MINISTRY/BUSINESS/NONPROFIT/UNKNOWN), industry, street_address, city, state, zip_code, email, phone, faith_signals (array of faith-related phrases found), has_careers_page (boolean), total_score (0-100 based on faith alignment + hiring potential), summary (2 sentences).`;

// Test URLs
const TEST_URLS = [
  "https://www.hobby-lobby.com",
  "https://www.saddleback.com",
  "https://samaritanministries.org",
];

async function fetchContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; WonderwallBot/1.0; +https://wonderwall.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  // Basic HTML to text extraction
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    " ",
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ").trim();

  // Truncate for API
  return text.length > 6000 ? text.substring(0, 6000) + "..." : text;
}

interface ModelResult {
  model: string;
  success: boolean;
  parseSuccess: boolean;
  responseTime: number;
  result?: unknown;
  error?: string;
  rawResponse?: string;
}

async function testModel(
  modelId: string,
  content: string,
  accountId: string,
  apiToken: string,
): Promise<ModelResult> {
  const startTime = Date.now();
  const prompt = CLASSIFICATION_PROMPT.replace("{CONTENT}", content);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are a business analyst extracting structured data from websites.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 2048,
          response_format: {
            type: "json_schema",
            json_schema: CLASSIFICATION_SCHEMA,
          },
        }),
      },
    );

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        model: modelId,
        success: false,
        parseSuccess: false,
        responseTime,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();
    const resultData = data.result?.response;

    // Try to parse JSON - API may return string or already-parsed object
    let parsed;
    let parseSuccess = false;
    let rawResponse = "";
    try {
      if (typeof resultData === "object" && resultData !== null) {
        // Already parsed by the API
        parsed = resultData;
        parseSuccess = true;
        rawResponse = JSON.stringify(resultData).substring(0, 500);
      } else if (typeof resultData === "string") {
        rawResponse = resultData.substring(0, 500);
        // Handle potential markdown wrapping
        let jsonStr = resultData;
        const jsonMatch = resultData.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
        parsed = JSON.parse(jsonStr.trim());
        parseSuccess = true;
      } else {
        rawResponse = String(resultData);
      }
    } catch {
      parsed = null;
    }

    return {
      model: modelId,
      success: true,
      parseSuccess,
      responseTime,
      result: parsed,
      rawResponse,
    };
  } catch (error) {
    return {
      model: modelId,
      success: false,
      parseSuccess: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Models to test - focus on ones that work with structured output
const MODELS = [
  "@cf/meta/llama-3.1-8b-instruct", // 8B - current model
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // 70B - larger capacity
];

export const compareModels = action({
  args: {
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!cfAccountId || !cfApiToken) {
      return { error: "Missing Cloudflare credentials" };
    }

    const testUrl = args.url || TEST_URLS[0];
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing URL: ${testUrl}`);
    console.log(`${"=".repeat(60)}\n`);

    // Fetch content
    let content: string;
    try {
      content = await fetchContent(testUrl);
      console.log(`Fetched ${content.length} chars of content\n`);
    } catch (error) {
      return {
        error: `Failed to fetch ${testUrl}: ${error}`,
      };
    }

    // Test each model
    const results: ModelResult[] = [];

    for (const model of MODELS) {
      console.log(`Testing ${model}...`);
      const result = await testModel(model, content, cfAccountId, cfApiToken);
      results.push(result);

      console.log(`  Response time: ${result.responseTime}ms`);
      console.log(`  Success: ${result.success}`);
      console.log(`  Parse success: ${result.parseSuccess}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      if (result.result) {
        const r = result.result as {
          organization_info?: { name?: string };
          total_score?: number;
        };
        console.log(`  Org name: ${r.organization_info?.name}`);
        console.log(`  Total score: ${r.total_score}`);
      }
      console.log("");
    }

    return {
      url: testUrl,
      contentLength: content.length,
      results: results.map((r) => ({
        model: r.model,
        success: r.success,
        parseSuccess: r.parseSuccess,
        responseTime: r.responseTime,
        error: r.error,
        orgName: (r.result as { name?: string } | undefined)?.name,
        totalScore: (r.result as { total_score?: number } | undefined)
          ?.total_score,
        address: r.result
          ? {
              street: (r.result as { street_address?: string })?.street_address,
              city: (r.result as { city?: string })?.city,
              state: (r.result as { state?: string })?.state,
              zip: (r.result as { zip_code?: string })?.zip_code,
            }
          : null,
        faithSignals: (r.result as { faith_signals?: string[] })?.faith_signals,
        summary: (r.result as { summary?: string })?.summary,
        rawResponse: r.rawResponse,
      })),
    };
  },
});

// Test all sample URLs
export const compareModelsAllUrls = action({
  args: {},
  handler: async (ctx) => {
    const allResults = [];

    for (const url of TEST_URLS) {
      const result = await ctx.runAction(
        // @ts-expect-error - self reference
        "crawlerModelTest:compareModels",
        { url },
      );
      allResults.push(result);

      // Delay between URLs
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return allResults;
  },
});
