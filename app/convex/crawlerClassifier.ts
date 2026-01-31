import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";

// ============================================
// Classification Types
// ============================================

export interface ClassificationResult {
  values_alignment: {
    faith_signals: string[];
    conservative_signals: string[];
    alignment_score: number; // 0-40
  };
  hiring_potential: {
    has_careers_page: boolean;
    recent_postings: boolean;
    growth_indicators: string[];
    hiring_score: number; // 0-30
  };
  organization_info: {
    name: string;
    type: "CHURCH" | "MINISTRY" | "BUSINESS" | "NONPROFIT" | "UNKNOWN";
    industry: string;
    location: string;
    employees_estimate: string;
    quality_score: number; // 0-20
  };
  contact_info: {
    email: string | null;
    phone: string | null;
    contact_form_url: string | null;
    owner_name: string | null;
    contact_score: number; // 0-10
  };
  persona_tags: string[];
  total_score: number;
  summary: string;
}

// ============================================
// Classification Prompt
// ============================================

const CLASSIFICATION_PROMPT = `You are analyzing a business/organization website to determine if it aligns with Christian/conservative values and would be a good partner for a faith-based job board called Wonderwall.

We're looking for organizations that would want to post jobs targeting faith-driven professionals: churches, ministries, faith-aligned businesses, conservative professional services, trade businesses with family values, etc.

Website content to analyze:
---
{CONTENT}
---

Analyze the content and respond with ONLY valid JSON (no markdown, no explanation):

{
  "values_alignment": {
    "faith_signals": ["list of faith-related phrases or indicators found, e.g., 'Christ-centered mission', 'biblical principles', scripture references"],
    "conservative_signals": ["list of conservative/traditional values indicators, e.g., 'family-owned since 1985', 'closed Sundays', 'veteran-owned'"],
    "alignment_score": <0-40 integer based on strength of signals>
  },
  "hiring_potential": {
    "has_careers_page": <boolean - true if careers/jobs/employment page found>,
    "recent_postings": <boolean - true if active job listings mentioned>,
    "growth_indicators": ["list of growth signals, e.g., 'now hiring', 'expanding', 'new location'"],
    "hiring_score": <0-30 integer>
  },
  "organization_info": {
    "name": "<organization name>",
    "type": "<CHURCH|MINISTRY|BUSINESS|NONPROFIT|UNKNOWN>",
    "industry": "<industry/sector>",
    "location": "<city, state if found, or 'Unknown'>",
    "employees_estimate": "<1-5|5-20|20-50|50-100|100+|Unknown>",
    "quality_score": <0-20 integer based on website professionalism>
  },
  "contact_info": {
    "email": "<email if found, or null>",
    "phone": "<phone if found, or null>",
    "contact_form_url": "<contact page URL if found, or null>",
    "owner_name": "<owner/pastor/leader name if found, or null>",
    "contact_score": <0-10 integer based on contact info availability>
  },
  "persona_tags": ["<applicable tags from: CHURCH, MINISTRY, EDUCATION, HEALTHCARE, LEGAL, FINANCIAL, TRADES, RETAIL, FOOD_SERVICE, MANUFACTURING, PROFESSIONAL, NONPROFIT, SOCIAL_SERVICES, MEDIA, OUTDOOR_LIFESTYLE, PREPAREDNESS>"],
  "total_score": <sum of all scores, 0-100>,
  "summary": "<2-3 sentence description of the organization and why it would/wouldn't be a good partner>"
}

Scoring Guidelines:
- Values alignment (0-40): 15 pts for explicit faith statement, 10 for scripture/biblical refs, 10 for faith business network membership, 5 for "closed Sundays" or similar, 5 for charitable giving to faith causes
- Hiring potential (0-30): 10 for careers page, 10 for active postings, 5 for multiple locations, 5 for growth indicators
- Quality (0-20): 5 for professional website, 5 for active social media, 5 for positive reputation indicators, 5 for established (10+ years)
- Contact (0-10): 4 for direct email, 2 for phone, 2 for contact form, 2 for owner/decision-maker name

If the content appears to be an error page, login page, or unrelated content, return minimal scores and note this in the summary.`;

// ============================================
// Fetch and Extract Content
// ============================================

async function fetchAndExtractContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WonderwallBot/1.0; +https://wonderwall.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract text content (basic HTML stripping)
    const textContent = extractTextFromHtml(html);

    // Limit content length for AI processing
    const maxLength = 8000;
    if (textContent.length > maxLength) {
      return textContent.substring(0, maxLength) + "\n[Content truncated...]";
    }

    return textContent;
  } catch (error) {
    throw new Error(
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function extractTextFromHtml(html: string): string {
  // Remove script and style elements
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ============================================
// AI Classification (Multiple Provider Support)
// ============================================

// Cloudflare Workers AI classification
async function classifyWithCloudflareAI(
  content: string,
  accountId: string,
  apiToken: string
): Promise<ClassificationResult> {
  const prompt = CLASSIFICATION_PROMPT.replace("{CONTENT}", content);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
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
              "You are a business analyst. Respond only with valid JSON, no markdown or explanation.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare AI error: ${response.status}`);
  }

  const data = await response.json();
  const resultText = data.result?.response || "";

  // Parse JSON from response
  return parseClassificationJson(resultText);
}

// OpenAI classification (fallback or preferred)
async function classifyWithOpenAI(
  content: string,
  apiKey: string
): Promise<ClassificationResult> {
  const prompt = CLASSIFICATION_PROMPT.replace("{CONTENT}", content);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a business analyst. Respond only with valid JSON, no markdown or explanation.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const resultText = data.choices?.[0]?.message?.content || "";

  return parseClassificationJson(resultText);
}

function parseClassificationJson(text: string): ClassificationResult {
  // Try to extract JSON from response (handle markdown code blocks)
  let jsonStr = text;

  // Remove markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Validate and sanitize the result
    return {
      values_alignment: {
        faith_signals: parsed.values_alignment?.faith_signals || [],
        conservative_signals: parsed.values_alignment?.conservative_signals || [],
        alignment_score: Math.min(40, Math.max(0, parsed.values_alignment?.alignment_score || 0)),
      },
      hiring_potential: {
        has_careers_page: Boolean(parsed.hiring_potential?.has_careers_page),
        recent_postings: Boolean(parsed.hiring_potential?.recent_postings),
        growth_indicators: parsed.hiring_potential?.growth_indicators || [],
        hiring_score: Math.min(30, Math.max(0, parsed.hiring_potential?.hiring_score || 0)),
      },
      organization_info: {
        name: parsed.organization_info?.name || "Unknown",
        type: parsed.organization_info?.type || "UNKNOWN",
        industry: parsed.organization_info?.industry || "Unknown",
        location: parsed.organization_info?.location || "Unknown",
        employees_estimate: parsed.organization_info?.employees_estimate || "Unknown",
        quality_score: Math.min(20, Math.max(0, parsed.organization_info?.quality_score || 0)),
      },
      contact_info: {
        email: parsed.contact_info?.email || null,
        phone: parsed.contact_info?.phone || null,
        contact_form_url: parsed.contact_info?.contact_form_url || null,
        owner_name: parsed.contact_info?.owner_name || null,
        contact_score: Math.min(10, Math.max(0, parsed.contact_info?.contact_score || 0)),
      },
      persona_tags: parsed.persona_tags || [],
      total_score: Math.min(100, Math.max(0, parsed.total_score || 0)),
      summary: parsed.summary || "Unable to analyze content.",
    };
  } catch (e) {
    console.error("Failed to parse classification JSON:", text);
    throw new Error("Failed to parse AI classification result");
  }
}

// ============================================
// Main Classification Action
// ============================================

export const classifyUrl = action({
  args: {
    url: v.string(),
    source: v.string(),
    useOpenAI: v.optional(v.boolean()), // Default to OpenAI (better quality)
  },
  handler: async (ctx, args): Promise<{ success: boolean; organizationId?: string; error?: string }> => {
    try {
      // Fetch and extract content
      const content = await fetchAndExtractContent(args.url);

      if (content.length < 100) {
        return { success: false, error: "Insufficient content to analyze" };
      }

      // Classify using AI
      let classification: ClassificationResult;

      const openaiKey = process.env.OPENAI_API_KEY;
      const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const cfApiToken = process.env.CLOUDFLARE_API_TOKEN;

      if (args.useOpenAI !== false && openaiKey) {
        classification = await classifyWithOpenAI(content, openaiKey);
      } else if (cfAccountId && cfApiToken) {
        classification = await classifyWithCloudflareAI(content, cfAccountId, cfApiToken);
      } else {
        return {
          success: false,
          error: "No AI provider configured. Set OPENAI_API_KEY or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN",
        };
      }

      // Parse location
      const locationParts = classification.organization_info.location.split(",").map((s) => s.trim());
      const city = locationParts[0] !== "Unknown" ? locationParts[0] : undefined;
      const state = locationParts[1] || undefined;

      // Save to database
      const result = await ctx.runMutation(api.crawler.upsertOrganization, {
        sourceUrl: args.url,
        source: args.source,
        name: classification.organization_info.name,
        website: args.url,
        industry: classification.organization_info.industry,
        description: classification.summary,
        city,
        state,
        employeeEstimate: classification.organization_info.employees_estimate,
        orgType: classification.organization_info.type.toLowerCase(),
        personaTags: classification.persona_tags,
        valuesScore: classification.values_alignment.alignment_score,
        hiringScore: classification.hiring_potential.hiring_score,
        qualityScore: classification.organization_info.quality_score,
        contactScore: classification.contact_info.contact_score,
        faithSignals: classification.values_alignment.faith_signals,
        conservativeSignals: classification.values_alignment.conservative_signals,
        email: classification.contact_info.email || undefined,
        phone: classification.contact_info.phone || undefined,
        contactFormUrl: classification.contact_info.contact_form_url || undefined,
        ownerName: classification.contact_info.owner_name || undefined,
        rawHtml: content.substring(0, 50000), // Store truncated raw content
        rawClassification: JSON.stringify(classification),
      });

      return { success: true, organizationId: result.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Batch classification action
export const classifyBatch = action({
  args: {
    urls: v.array(
      v.object({
        url: v.string(),
        source: v.string(),
      })
    ),
    delayMs: v.optional(v.number()), // Delay between requests (rate limiting)
  },
  handler: async (ctx, args) => {
    const results: Array<{ url: string; success: boolean; error?: string }> = [];
    const delay = args.delayMs ?? 2000; // Default 2 second delay

    for (const item of args.urls) {
      try {
        const result = await ctx.runAction(api.crawlerClassifier.classifyUrl, {
          url: item.url,
          source: item.source,
        });

        results.push({
          url: item.url,
          success: result.success,
          error: result.error,
        });

        // Rate limiting delay
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        results.push({
          url: item.url,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      total: args.urls.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});

// Re-classify existing organization
export const reclassifyOrganization = action({
  args: {
    organizationId: v.id("crawledOrganizations"),
  },
  handler: async (ctx, args) => {
    const org = await ctx.runQuery(api.crawler.getOrganization, { id: args.organizationId });

    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    const url = org.website || org.sourceUrl;
    return ctx.runAction(api.crawlerClassifier.classifyUrl, {
      url,
      source: org.source,
    });
  },
});
