# Job Board Crawler - Implementation Guide

This document provides technical details for the Wonderwall Job Board Crawler system.

## Overview

The crawler system discovers, classifies, and scores potential partner organizations for the Wonderwall job board. It uses AI-powered classification to identify values-aligned businesses, churches, and nonprofits.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Convex Backend                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  crawler.ts           - Core CRUD operations, queries           │
│  crawlerClassifier.ts - AI classification (OpenAI/Cloudflare)   │
│  crawlerExport.ts     - CSV export, CRM integration             │
│  crawlerSeeds.ts      - Test data and source configuration      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Database Tables

### `crawledOrganizations`
Main table storing discovered organizations with:
- Basic info (name, website, location)
- Classification scores (values, hiring, quality, contact)
- Persona tags (CHURCH, TRADES, LEGAL, etc.)
- Contact information
- Workflow status and CRM sync state

### `crawlerRuns`
Audit log of crawler executions for monitoring.

### `crawlerSources`
Configuration for data sources (PublicSquare, church directories, etc.)

### `crawlerQueue`
URL queue for batch processing.

## Setup

### 1. Environment Variables

Add to your Convex environment:

```bash
# Option 1: OpenAI (Recommended)
OPENAI_API_KEY=sk-...

# Option 2: Cloudflare Workers AI (Free tier)
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
```

### 2. Initialize Data Sources

Run the seed mutation to set up data sources:

```typescript
// In Convex dashboard or via API
await ctx.runMutation(api.crawlerSeeds.seedDataSources, {});
```

### 3. Add Test Data (Optional)

```typescript
await ctx.runMutation(api.crawlerSeeds.seedTestOrganizations, {});
```

## Usage

### Classify a Single URL

```typescript
import { api } from "./convex/_generated/api";

// Classify and save an organization
const result = await convex.action(api.crawlerClassifier.classifyUrl, {
  url: "https://example-church.org",
  source: "manual",
});

if (result.success) {
  console.log("Created organization:", result.organizationId);
} else {
  console.error("Failed:", result.error);
}
```

### Batch Classification

```typescript
const urls = [
  { url: "https://church1.org", source: "church_finder" },
  { url: "https://business2.com", source: "publicsquare" },
];

const result = await convex.action(api.crawlerClassifier.classifyBatch, {
  urls,
  delayMs: 2000, // Rate limiting
});

console.log(`Processed ${result.total}, ${result.successful} successful`);
```

### Query Organizations

```typescript
// Get hot leads
const hotLeads = await convex.query(api.crawler.listOrganizations, {
  segment: "hot",
  limit: 50,
});

// Get by persona
const churches = await convex.query(api.crawler.listOrganizations, {
  personaTag: "CHURCH",
  minScore: 60,
});

// Get stats
const stats = await convex.query(api.crawler.getStats, {});
console.log(`Total: ${stats.total}, Hot leads: ${stats.hotLeads}`);
```

### Export to CSV

```typescript
const { csv, count, filename } = await convex.query(api.crawlerExport.exportToCSV, {
  segment: "hot",
  includeExported: false,
});

// Download or send to CRM
downloadFile(csv, filename);
```

### Manual Entry

```typescript
await convex.mutation(api.crawler.manualAddOrganization, {
  name: "Example Church",
  website: "https://example.church",
  email: "info@example.church",
  city: "Dallas",
  state: "TX",
  personaTags: ["CHURCH"],
});
```

## Scoring System

Organizations are scored on four dimensions (0-100 total):

| Category | Max Points | Criteria |
|----------|-----------|----------|
| Values Alignment | 40 | Faith statements, scripture, networks |
| Hiring Potential | 30 | Careers page, active postings, growth |
| Quality | 20 | Website quality, reputation, age |
| Contact | 10 | Email, phone, decision-maker info |

### Segment Assignment

| Segment | Score Range | Description |
|---------|-------------|-------------|
| Hot | 80-100 | Immediate outreach priority |
| Warm | 60-79 | Email campaign candidates |
| Nurture | 40-59 | Newsletter, long-term nurture |
| Research | 20-39 | Needs more information |
| Low | 0-19 | Archive/deprioritize |

## Persona Tags

- `CHURCH` - Religious congregation
- `MINISTRY` - Para-church organization
- `EDUCATION` - School or educational org
- `HEALTHCARE` - Medical or health services
- `LEGAL` - Law firm or legal services
- `FINANCIAL` - Financial services
- `TRADES` - Construction, HVAC, plumbing, etc.
- `RETAIL` - Retail business
- `FOOD_SERVICE` - Restaurant, catering
- `MANUFACTURING` - Manufacturing/production
- `PROFESSIONAL` - Professional services
- `NONPROFIT` - 501(c)(3) organizations
- `SOCIAL_SERVICES` - Crisis centers, shelters, etc.
- `MEDIA` - Christian media organizations
- `OUTDOOR_LIFESTYLE` - Hunting, fishing, outdoor recreation
- `PREPAREDNESS` - Survivalist, self-reliance businesses

## Deep Research Prompts

The strategy document includes ready-to-use prompts for AI research tools like Grok:

- Church discovery by region
- PublicSquare business mining
- Professional services discovery
- Trade business identification
- Crisis pregnancy centers
- Christian education institutions

See `/docs/research/job-board-crawler-strategy.md` for full prompts.

## CRM Integration

### Export Format

The CSV export is compatible with:
- Upsight CRM
- HubSpot
- Salesforce
- Any CRM that accepts CSV import

### Tracking Exports

```typescript
// Mark organizations as exported
await convex.mutation(api.crawlerExport.recordExportBatch, {
  organizationIds: ["id1", "id2", "id3"],
  destination: "upsight",
  batchId: "batch-2024-01-15",
});
```

## Rate Limiting & Compliance

- Default delay: 2 seconds between requests
- Respect robots.txt on all sites
- Include identifying User-Agent
- Store only publicly available information
- Provide opt-out mechanism

## Future Enhancements

1. **Scheduled Crawling** - Use Convex scheduler for automated runs
2. **Webhook Push** - Real-time CRM sync via webhooks
3. **LinkedIn Integration** - Sales Navigator API for enhanced data
4. **Email Automation** - Outreach sequence integration
5. **Deduplication** - Embeddings-based similar org detection

## Troubleshooting

### Classification Fails
- Check AI provider API keys are set
- Verify URL is accessible (not blocked, no auth required)
- Check rate limits haven't been exceeded

### Low Scores
- Website may lack faith signals (normal for some businesses)
- Content may be mostly navigation/minimal text
- Try re-classifying with different model

### Export Issues
- Verify organizations exist in database
- Check segment/status filters aren't too restrictive
- Confirm user has admin access (if protected)
