import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { csvCell } from "./csv";

// Every function here is operator-only (dashboard or `npx convex run`):
// internal, never callable from a browser. The reads were public queries
// with no sign-in or admin check, so anyone could pull the crawler's
// prospect list with its emails and phone numbers (found 2026-10-26). No
// page calls them; the admin crawler page uses the admin-gated reads in
// crawler.ts.

// ============================================
// CSV Export
// ============================================

// Generate CSV from organizations
export const exportToCSV = internalQuery({
  args: {
    segment: v.optional(v.string()),
    status: v.optional(v.string()),
    minScore: v.optional(v.number()),
    personaTag: v.optional(v.string()),
    includeExported: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 1000;

    // Fetch based on the primary filter
    let orgs: Doc<"crawledOrganizations">[];
    if (args.segment) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_segment", (q) => q.eq("segment", args.segment!))
        .order("desc")
        .take(limit);
    } else if (args.status) {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    } else {
      orgs = await ctx.db
        .query("crawledOrganizations")
        .order("desc")
        .take(limit);
    }

    // Apply additional filters
    if (args.minScore !== undefined) {
      orgs = orgs.filter((o) => o.totalScore >= args.minScore!);
    }
    if (args.personaTag) {
      orgs = orgs.filter((o) => o.personaTags.includes(args.personaTag!));
    }
    if (!args.includeExported) {
      orgs = orgs.filter((o) => !o.exportedToCrm);
    }

    // CSV Headers (Upsight/HubSpot compatible)
    const headers = [
      "Name",
      "Website",
      "Industry",
      "City",
      "State",
      "Email",
      "Phone",
      "Contact Name",
      "Total Score",
      "Segment",
      "Status",
      "Persona Tags",
      "Values Score",
      "Hiring Score",
      "Quality Score",
      "Faith Signals",
      "Description",
      "Source",
      "Discovered Date",
    ];

    const rows = orgs.map((org) => [
      csvCell(org.name),
      csvCell(org.website),
      csvCell(org.industry),
      csvCell(org.city),
      csvCell(org.state),
      csvCell(org.email),
      csvCell(org.phone),
      csvCell(org.ownerName),
      String(org.totalScore),
      csvCell(org.segment),
      csvCell(org.status),
      csvCell(org.personaTags.join("; ")),
      String(org.valuesScore),
      String(org.hiringScore),
      String(org.qualityScore),
      csvCell(org.faithSignals.slice(0, 5).join("; ")), // Limit to first 5
      csvCell(org.description?.substring(0, 500)), // Truncate description
      csvCell(org.source),
      new Date(org.discoveredAt).toISOString().split("T")[0],
    ]);

    const csvContent =
      headers.join(",") + "\n" + rows.map((row) => row.join(",")).join("\n");

    return {
      csv: csvContent,
      count: orgs.length,
      filename: `wonderwall-leads-${new Date().toISOString().split("T")[0]}.csv`,
    };
  },
});

// Export for specific segments (convenience methods)
export const exportHotLeads = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_segment", (q) => q.eq("segment", "hot"))
      .filter((q) => q.eq(q.field("exportedToCrm"), false))
      .collect();

    return formatForCRM(orgs);
  },
});

export const exportWarmLeads = internalQuery({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_segment", (q) => q.eq("segment", "warm"))
      .filter((q) => q.eq(q.field("exportedToCrm"), false))
      .collect();

    return formatForCRM(orgs);
  },
});

// ============================================
// CRM Integration Formats
// ============================================

function formatForCRM(orgs: Doc<"crawledOrganizations">[]) {
  return orgs.map((org) => ({
    // Standard CRM fields
    company_name: org.name,
    website: org.website,
    industry: org.industry,
    city: org.city,
    state: org.state,
    country: org.country || "USA",

    // Contact
    email: org.email,
    phone: org.phone,
    contact_name: org.ownerName,

    // Scoring
    lead_score: org.totalScore,
    lead_grade: org.segment.toUpperCase(),
    lead_status: org.status,

    // Custom fields
    persona_tags: org.personaTags.join(","),
    faith_signals: org.faithSignals.join(","),
    values_score: org.valuesScore,
    hiring_score: org.hiringScore,
    description: org.description,

    // Source tracking
    lead_source: `Wonderwall Crawler - ${org.source}`,
    source_url: org.sourceUrl,
    discovered_at: new Date(org.discoveredAt).toISOString(),

    // Internal ID for sync
    wonderwall_id: org._id,
  }));
}

// ============================================
// Webhook/API Export
// ============================================

// Format for webhook push to CRM
export const getOrgsForWebhook = internalQuery({
  args: {
    segment: v.string(),
    limit: v.optional(v.number()),
    onlyNew: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let orgs = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_segment", (q) => q.eq("segment", args.segment))
      .order("desc")
      .take(args.limit ?? 100);

    if (args.onlyNew) {
      orgs = orgs.filter((o) => !o.exportedToCrm);
    }

    return formatForCRM(orgs);
  },
});

// ============================================
// Import Utilities (CSV Import)
// ============================================

// Operator-only (dashboard or `npx convex run`): internal, never callable
// from a browser (it had no sign-in or admin check; found 2026-10-10).
export const importFromCSV = internalMutation({
  args: {
    rows: v.array(
      v.object({
        name: v.string(),
        website: v.string(),
        industry: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        contactName: v.optional(v.string()),
        source: v.optional(v.string()),
        personaTags: v.optional(v.array(v.string())),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of args.rows) {
      try {
        // Check for existing
        const existing = await ctx.db
          .query("crawledOrganizations")
          .withIndex("by_website", (q) => q.eq("website", row.website))
          .first();

        if (existing) {
          skipped++;
          continue;
        }

        // Calculate basic contact score
        let contactScore = 0;
        if (row.email) contactScore += 4;
        if (row.phone) contactScore += 2;
        if (row.contactName) contactScore += 2;

        await ctx.db.insert("crawledOrganizations", {
          sourceUrl: row.website,
          source: row.source || "csv_import",
          name: row.name,
          website: row.website,
          industry: row.industry,
          city: row.city,
          state: row.state,
          email: row.email,
          phone: row.phone,
          ownerName: row.contactName,
          personaTags: row.personaTags || [],
          valuesScore: 0, // Needs classification
          hiringScore: 0,
          qualityScore: 0,
          contactScore,
          totalScore: contactScore,
          faithSignals: [],
          conservativeSignals: [],
          status: "new",
          segment: "research", // Imported records need classification
          exportedToCrm: false,
          notes: row.notes,
          discoveredAt: now,
          crawledAt: now,
          lastUpdated: now,
        });

        created++;
      } catch (error) {
        errors.push(
          `Failed to import ${row.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    return { created, skipped, errors };
  },
});

// ============================================
// Analytics & Reporting
// ============================================

export const getExportStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allOrgs = await ctx.db.query("crawledOrganizations").collect();

    const exported = allOrgs.filter((o) => o.exportedToCrm);
    const notExported = allOrgs.filter((o) => !o.exportedToCrm);

    const bySegmentNotExported = notExported.reduce(
      (acc, org) => {
        acc[org.segment] = (acc[org.segment] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalOrganizations: allOrgs.length,
      exported: exported.length,
      pendingExport: notExported.length,
      pendingBySegment: bySegmentNotExported,
      readyToExport: {
        hot: bySegmentNotExported.hot || 0,
        warm: bySegmentNotExported.warm || 0,
      },
    };
  },
});

// Get organizations ready for outreach
export const getOutreachQueue = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get hot leads first, then warm, that haven't been contacted
    const hotLeads = await ctx.db
      .query("crawledOrganizations")
      .withIndex("by_segment", (q) => q.eq("segment", "hot"))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "new"),
          q.neq(q.field("email"), undefined),
        ),
      )
      .take(args.limit ?? 50);

    const remaining = (args.limit ?? 50) - hotLeads.length;

    let warmLeads: Doc<"crawledOrganizations">[] = [];
    if (remaining > 0) {
      warmLeads = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_segment", (q) => q.eq("segment", "warm"))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "new"),
            q.neq(q.field("email"), undefined),
          ),
        )
        .take(remaining);
    }

    return [...hotLeads, ...warmLeads].map((org) => ({
      id: org._id,
      name: org.name,
      email: org.email,
      website: org.website,
      totalScore: org.totalScore,
      segment: org.segment,
      personaTags: org.personaTags,
      description: org.description,
      city: org.city,
      state: org.state,
    }));
  },
});

// ============================================
// Sync Status Tracking
// ============================================

// Operator-only (dashboard or `npx convex run`): internal, never callable
// from a browser (it had no sign-in or admin check; found 2026-10-10).
export const recordExportBatch = internalMutation({
  args: {
    organizationIds: v.array(v.id("crawledOrganizations")),
    destination: v.string(), // "upsight" | "hubspot" | "csv"
    batchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const id of args.organizationIds) {
      await ctx.db.patch(id, {
        exportedToCrm: true,
        crmId: args.batchId,
        lastExportedAt: now,
        lastUpdated: now,
      });
    }

    return {
      exported: args.organizationIds.length,
      timestamp: now,
      destination: args.destination,
    };
  },
});
