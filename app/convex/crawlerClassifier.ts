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
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
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
  leadership: Array<{
    name: string;
    title?: string;
    bio_snippet?: string;
  }>;
}

// ============================================
// Classification Prompt
// ============================================

const CLASSIFICATION_PROMPT = `You are analyzing a business/organization website to determine if it aligns with Christian/conservative values and would be a good partner for a faith-based job board called Wonderwall.

We're looking for organizations that would want to post jobs targeting faith-driven professionals: churches, ministries, faith-aligned businesses, conservative professional services, trade businesses with family values, etc.

The content below includes the HOMEPAGE plus any CONTACT, ABOUT, TEAM, or LEADERSHIP pages that were found. Look carefully in ALL sections for addresses and people.

Website content to analyze:
---
{CONTENT}
---

CRITICAL EXTRACTION REQUIREMENTS:

1. PHYSICAL ADDRESS: Look carefully in the CONTACT page section, footer content, and ABOUT page for:
   - Street addresses (e.g., "123 Main Street", "456 Oak Ave Suite 200")
   - City, State, ZIP combinations
   - Look for patterns like: address followed by city, state zip
   - Extract the FULL street address, not just city/state

2. LEADERSHIP/NOTABLE PEOPLE: Look in ABOUT, TEAM, LEADERSHIP, and STAFF page sections for:
   - Founders, CEOs, Presidents, Executive Directors
   - Pastors, Elders, Board Members (for churches)
   - Department heads, VPs, Key personnel
   - Extract their name, title, and any bio snippet available

Analyze the content and respond with ONLY valid JSON (no markdown, no explanation):

{
  "values_alignment": {
    "faith_signals": ["list of faith-related phrases found"],
    "conservative_signals": ["list of conservative/traditional values indicators"],
    "alignment_score": <0-40 integer>
  },
  "hiring_potential": {
    "has_careers_page": <boolean>,
    "recent_postings": <boolean>,
    "growth_indicators": ["list of growth signals"],
    "hiring_score": <0-30 integer>
  },
  "organization_info": {
    "name": "<organization name>",
    "type": "<CHURCH|MINISTRY|BUSINESS|NONPROFIT|UNKNOWN>",
    "industry": "<industry/sector>",
    "street_address": "<FULL street address like '123 Main Street' or '456 Oak Ave Suite 200' - REQUIRED if found anywhere on site>",
    "city": "<city>",
    "state": "<state abbreviation or full name>",
    "zip_code": "<zip/postal code>",
    "employees_estimate": "<1-5|5-20|20-50|50-100|100+|Unknown>",
    "quality_score": <0-20 integer>
  },
  "contact_info": {
    "email": "<email if found>",
    "phone": "<phone if found>",
    "contact_form_url": "<contact page URL if found>",
    "owner_name": "<owner/pastor/leader name if found>",
    "contact_score": <0-10 integer>
  },
  "persona_tags": ["<applicable tags from: CHURCH, MINISTRY, EDUCATION, HEALTHCARE, LEGAL, FINANCIAL, TRADES, RETAIL, FOOD_SERVICE, MANUFACTURING, PROFESSIONAL, NONPROFIT, SOCIAL_SERVICES, MEDIA, OUTDOOR_LIFESTYLE, PREPAREDNESS>"],
  "total_score": <sum of all scores, 0-100>,
  "summary": "<2-3 sentence description>",
  "leadership": [
    {
      "name": "<person's full name>",
      "title": "<their title/role>",
      "bio_snippet": "<brief description if available, max 100 chars>"
    }
  ]
}

Scoring Guidelines:
- Values alignment (0-40): 15 pts for explicit faith statement, 10 for scripture/biblical refs, 10 for faith business network membership, 5 for "closed Sundays", 5 for charitable giving
- Hiring potential (0-30): 10 for careers page, 10 for active postings, 5 for multiple locations, 5 for growth indicators
- Quality (0-20): 5 for professional website, 5 for active social media, 5 for positive reputation, 5 for established (10+ years)
- Contact (0-10): 4 for direct email, 2 for phone, 2 for contact form, 2 for owner/decision-maker name

If the content appears to be an error page, login page, or unrelated content, return minimal scores and note this in the summary.`;

// ============================================
// Fetch and Extract Content
// ============================================

// Common pages to check for contact info, addresses, and leadership
const ADDITIONAL_PAGES = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/team",
  "/leadership",
  "/our-team",
  "/staff",
  "/our-story",
  "/who-we-are",
];

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WonderwallBot/1.0; +https://wonderwall.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchAndExtractContent(url: string): Promise<string> {
  try {
    // Fetch homepage
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

    const homeHtml = await response.text();
    const sections: string[] = [];

    // Extract homepage content
    sections.push("=== HOMEPAGE ===");
    sections.push(extractTextFromHtml(homeHtml));

    // Get base URL for additional pages
    const baseUrl = new URL(url).origin;

    // Fetch additional pages in parallel for contact/address/leadership info
    const additionalFetches = ADDITIONAL_PAGES.map(async (path) => {
      const pageUrl = `${baseUrl}${path}`;
      const html = await fetchPage(pageUrl);
      if (html) {
        const text = extractTextFromHtml(html);
        // Only include if it has substantial content
        if (text.length > 200) {
          return { path, text };
        }
      }
      return null;
    });

    const additionalResults = await Promise.all(additionalFetches);

    // Add successful page content
    for (const result of additionalResults) {
      if (result) {
        sections.push(
          `\n=== ${result.path.toUpperCase().replace("/", "")} PAGE ===`,
        );
        sections.push(result.text);
      }
    }

    // Combine all content
    const fullContent = sections.join("\n\n");

    // Limit content length for AI processing
    const maxLength = 12000; // Increased limit to accommodate multiple pages
    if (fullContent.length > maxLength) {
      return fullContent.substring(0, maxLength) + "\n[Content truncated...]";
    }

    return fullContent;
  } catch (error) {
    throw new Error(
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function extractTextFromHtml(html: string): string {
  // Remove script and style elements
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    " ",
  );
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

// JSON Schema for structured response from Cloudflare AI
const CLASSIFICATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    org_type: {
      type: "string",
      enum: ["CHURCH", "MINISTRY", "BUSINESS", "NONPROFIT", "UNKNOWN"],
    },
    industry: { type: "string" },
    street_address: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    zip_code: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    contact_form_url: { type: "string" },
    owner_name: { type: "string" },
    faith_signals: { type: "array", items: { type: "string" } },
    conservative_signals: { type: "array", items: { type: "string" } },
    has_careers_page: { type: "boolean" },
    employees_estimate: { type: "string" },
    values_score: { type: "integer" },
    hiring_score: { type: "integer" },
    quality_score: { type: "integer" },
    contact_score: { type: "integer" },
    total_score: { type: "integer" },
    summary: { type: "string" },
    // Persona tags
    persona_tags: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "CHURCH",
          "MINISTRY",
          "EDUCATION",
          "HEALTHCARE",
          "LEGAL",
          "FINANCIAL",
          "TRADES",
          "RETAIL",
          "FOOD_SERVICE",
          "MANUFACTURING",
          "PROFESSIONAL",
          "NONPROFIT",
          "SOCIAL_SERVICES",
          "MEDIA",
          "OUTDOOR_LIFESTYLE",
          "PREPAREDNESS",
        ],
      },
    },
    // Leadership extraction
    leadership: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          bio_snippet: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["name", "org_type", "total_score", "summary", "persona_tags"],
};

// Cloudflare Workers AI classification (Llama 3.3 70B with structured output)
async function classifyWithCloudflareAI(
  content: string,
  accountId: string,
  apiToken: string,
): Promise<ClassificationResult> {
  const prompt = CLASSIFICATION_PROMPT.replace("{CONTENT}", content);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
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
              "You are a business analyst extracting structured data from websites for a faith-based job board.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 2048,
        response_format: {
          type: "json_schema",
          json_schema: CLASSIFICATION_JSON_SCHEMA,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cloudflare AI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const resultData = data.result?.response;

  // API returns pre-parsed JSON when using json_schema
  if (typeof resultData === "object" && resultData !== null) {
    return convertFlatToClassificationResult(resultData);
  }

  // Fallback: parse string response
  return parseClassificationJson(resultData || "");
}

// Convert flat schema response to nested ClassificationResult
function convertFlatToClassificationResult(
  flat: Record<string, unknown>,
): ClassificationResult {
  return {
    values_alignment: {
      faith_signals: (flat.faith_signals as string[]) || [],
      conservative_signals: (flat.conservative_signals as string[]) || [],
      alignment_score: Math.min(
        40,
        Math.max(0, (flat.values_score as number) || 0),
      ),
    },
    hiring_potential: {
      has_careers_page: Boolean(flat.has_careers_page),
      recent_postings: false,
      growth_indicators: [],
      hiring_score: Math.min(
        30,
        Math.max(0, (flat.hiring_score as number) || 0),
      ),
    },
    organization_info: {
      name: (flat.name as string) || "Unknown",
      type: ((flat.org_type as string) ||
        "UNKNOWN") as ClassificationResult["organization_info"]["type"],
      industry: (flat.industry as string) || "Unknown",
      street_address: (flat.street_address as string) || null,
      city: (flat.city as string) || null,
      state: (flat.state as string) || null,
      zip_code: (flat.zip_code as string) || null,
      employees_estimate: (flat.employees_estimate as string) || "Unknown",
      quality_score: Math.min(
        20,
        Math.max(0, (flat.quality_score as number) || 0),
      ),
    },
    contact_info: {
      email: (flat.email as string) || null,
      phone: (flat.phone as string) || null,
      contact_form_url: (flat.contact_form_url as string) || null,
      owner_name: (flat.owner_name as string) || null,
      contact_score: Math.min(
        10,
        Math.max(0, (flat.contact_score as number) || 0),
      ),
    },
    persona_tags: (flat.persona_tags as string[]) || [],
    total_score: Math.min(100, Math.max(0, (flat.total_score as number) || 0)),
    summary: (flat.summary as string) || "Unable to analyze content.",
    leadership:
      (flat.leadership as Array<{
        name: string;
        title?: string;
        bio_snippet?: string;
      }>) || [],
  };
}

// OpenAI classification (fallback or preferred)
async function classifyWithOpenAI(
  content: string,
  apiKey: string,
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
        conservative_signals:
          parsed.values_alignment?.conservative_signals || [],
        alignment_score: Math.min(
          40,
          Math.max(0, parsed.values_alignment?.alignment_score || 0),
        ),
      },
      hiring_potential: {
        has_careers_page: Boolean(parsed.hiring_potential?.has_careers_page),
        recent_postings: Boolean(parsed.hiring_potential?.recent_postings),
        growth_indicators: parsed.hiring_potential?.growth_indicators || [],
        hiring_score: Math.min(
          30,
          Math.max(0, parsed.hiring_potential?.hiring_score || 0),
        ),
      },
      organization_info: {
        name: parsed.organization_info?.name || "Unknown",
        type: parsed.organization_info?.type || "UNKNOWN",
        industry: parsed.organization_info?.industry || "Unknown",
        street_address: parsed.organization_info?.street_address || null,
        city: parsed.organization_info?.city || null,
        state: parsed.organization_info?.state || null,
        zip_code: parsed.organization_info?.zip_code || null,
        employees_estimate:
          parsed.organization_info?.employees_estimate || "Unknown",
        quality_score: Math.min(
          20,
          Math.max(0, parsed.organization_info?.quality_score || 0),
        ),
      },
      contact_info: {
        email: parsed.contact_info?.email || null,
        phone: parsed.contact_info?.phone || null,
        contact_form_url: parsed.contact_info?.contact_form_url || null,
        owner_name: parsed.contact_info?.owner_name || null,
        contact_score: Math.min(
          10,
          Math.max(0, parsed.contact_info?.contact_score || 0),
        ),
      },
      persona_tags: parsed.persona_tags || [],
      total_score: Math.min(100, Math.max(0, parsed.total_score || 0)),
      summary: parsed.summary || "Unable to analyze content.",
      leadership: parsed.leadership || [],
    };
  } catch (e) {
    console.error("Failed to parse classification JSON:", text);
    throw new Error("Failed to parse AI classification result");
  }
}

// ============================================
// Leadership to Markdown
// ============================================

function leadershipToMarkdown(
  leadership: Array<{ name: string; title?: string; bio_snippet?: string }>,
): string | undefined {
  if (!leadership || leadership.length === 0) return undefined;

  const lines = ["## Leadership\n"];
  for (const person of leadership) {
    lines.push(`### ${person.name}`);
    if (person.title) lines.push(`**${person.title}**\n`);
    if (person.bio_snippet) lines.push(`${person.bio_snippet}\n`);
    lines.push("");
  }
  return lines.join("\n");
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
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; organizationId?: string; error?: string }> => {
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
        classification = await classifyWithCloudflareAI(
          content,
          cfAccountId,
          cfApiToken,
        );
      } else {
        return {
          success: false,
          error:
            "No AI provider configured. Set OPENAI_API_KEY or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN",
        };
      }

      // Save to database
      const result = await ctx.runMutation(api.crawler.upsertOrganization, {
        sourceUrl: args.url,
        source: args.source,
        name: classification.organization_info.name,
        website: args.url,
        industry: classification.organization_info.industry,
        description: classification.summary,
        streetAddress:
          classification.organization_info.street_address || undefined,
        city: classification.organization_info.city || undefined,
        state: classification.organization_info.state || undefined,
        zipCode: classification.organization_info.zip_code || undefined,
        employeeEstimate: classification.organization_info.employees_estimate,
        orgType: classification.organization_info.type.toLowerCase(),
        personaTags: classification.persona_tags,
        valuesScore: classification.values_alignment.alignment_score,
        hiringScore: classification.hiring_potential.hiring_score,
        qualityScore: classification.organization_info.quality_score,
        contactScore: classification.contact_info.contact_score,
        faithSignals: classification.values_alignment.faith_signals,
        conservativeSignals:
          classification.values_alignment.conservative_signals,
        email: classification.contact_info.email || undefined,
        phone: classification.contact_info.phone || undefined,
        contactFormUrl:
          classification.contact_info.contact_form_url || undefined,
        ownerName: classification.contact_info.owner_name || undefined,
        hasCareerPage: classification.hiring_potential.has_careers_page,
        leadershipMarkdown: leadershipToMarkdown(classification.leadership),
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
      }),
    ),
    delayMs: v.optional(v.number()), // Delay between requests (rate limiting)
  },
  handler: async (ctx, args) => {
    const results: Array<{ url: string; success: boolean; error?: string }> =
      [];
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
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; organizationId?: string; error?: string }> => {
    const org = await ctx.runQuery(api.crawler.getOrganization, {
      id: args.organizationId,
    });

    if (!org) {
      return { success: false, error: "Organization not found" };
    }

    const url = org.website || org.sourceUrl;
    const result = await ctx.runAction(api.crawlerClassifier.classifyUrl, {
      url,
      source: org.source,
    });
    return result;
  },
});

// Re-classify all existing organizations (batch)
export const reclassifyAll = action({
  args: {
    limit: v.optional(v.number()),
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ name: string; success: boolean; error?: string }>;
  }> => {
    const limit = args.limit ?? 50;
    const delay = args.delayMs ?? 3000; // 3 second delay between requests

    // Get all organizations
    const orgsResult = await ctx.runQuery(api.crawler.listOrganizations, {
      limit,
    });

    const results: Array<{ name: string; success: boolean; error?: string }> =
      [];

    for (const org of orgsResult.organizations) {
      console.log(`[Reclassify] Processing: ${org.name} (${org.website})`);

      try {
        const result = await ctx.runAction(
          api.crawlerClassifier.reclassifyOrganization,
          {
            organizationId: org._id,
          },
        );

        results.push({
          name: org.name,
          success: result.success,
          error: result.error,
        });

        if (result.success) {
          console.log(`[Reclassify] ✓ ${org.name}`);
        } else {
          console.log(`[Reclassify] ✗ ${org.name}: ${result.error}`);
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        results.push({
          name: org.name,
          success: false,
          error: errorMsg,
        });
        console.log(`[Reclassify] ✗ ${org.name}: ${errorMsg}`);
      }

      // Rate limiting delay
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});
