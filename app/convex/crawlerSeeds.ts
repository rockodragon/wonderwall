import { v } from "convex/values";
import { mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

// ============================================
// Seed Data Sources
// ============================================

export const seedDataSources = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sources = [
      {
        name: "publicsquare",
        displayName: "PublicSquare Marketplace",
        baseUrl: "https://publicsquare.com",
        crawlFrequency: "weekly",
        requestsPerMinute: 10,
        delayBetweenRequests: 6000,
        selectors: JSON.stringify({
          businessList: ".business-card",
          businessName: ".business-name",
          businessUrl: "a.business-link",
        }),
      },
      {
        name: "church_finder",
        displayName: "Church Finder Directory",
        baseUrl: "https://www.churchfinder.com",
        crawlFrequency: "weekly",
        requestsPerMinute: 5,
        delayBetweenRequests: 12000,
        selectors: JSON.stringify({
          churchList: ".church-listing",
          churchName: ".church-name",
          churchUrl: "a.church-website",
        }),
      },
      {
        name: "christian_jobs",
        displayName: "Christian Jobs (Cross-reference)",
        baseUrl: "https://www.christianjobs.com",
        crawlFrequency: "daily",
        requestsPerMinute: 10,
        delayBetweenRequests: 6000,
        selectors: JSON.stringify({
          jobList: ".job-listing",
          employer: ".employer-name",
          employerUrl: "a.employer-link",
        }),
      },
      {
        name: "kingdom_advisors",
        displayName: "Kingdom Advisors Network",
        baseUrl: "https://kingdomadvisors.com",
        crawlFrequency: "monthly",
        requestsPerMinute: 5,
        delayBetweenRequests: 12000,
        selectors: JSON.stringify({
          advisorList: ".advisor-card",
          advisorName: ".advisor-name",
          firmUrl: "a.firm-website",
        }),
      },
      {
        name: "manual",
        displayName: "Manual Entry",
        baseUrl: "",
        crawlFrequency: "manual",
        requestsPerMinute: 0,
        delayBetweenRequests: 0,
      },
      {
        name: "csv_import",
        displayName: "CSV Import",
        baseUrl: "",
        crawlFrequency: "manual",
        requestsPerMinute: 0,
        delayBetweenRequests: 0,
      },
      {
        name: "referral",
        displayName: "Partner Referral",
        baseUrl: "",
        crawlFrequency: "manual",
        requestsPerMinute: 0,
        delayBetweenRequests: 0,
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const source of sources) {
      const existing = await ctx.db
        .query("crawlerSources")
        .withIndex("by_name", (q) => q.eq("name", source.name))
        .first();

      if (!existing) {
        await ctx.db.insert("crawlerSources", {
          ...source,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      } else {
        skipped++;
      }
    }

    return { created, skipped };
  },
});

// ============================================
// Sample Test Organizations
// ============================================

export const seedTestOrganizations = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const testOrgs = [
      {
        name: "Faith Community Church",
        website: "https://faithcommunitychurch.example.com",
        source: "church_finder",
        industry: "Religious Organization",
        city: "Dallas",
        state: "TX",
        orgType: "church",
        personaTags: ["CHURCH", "NONPROFIT"],
        valuesScore: 35,
        hiringScore: 20,
        qualityScore: 15,
        contactScore: 8,
        email: "info@faithcommunitychurch.example.com",
        phone: "214-555-0100",
        ownerName: "Pastor John Smith",
        faithSignals: [
          "Christ-centered mission",
          "Sunday worship services",
          "Bible study groups",
        ],
        conservativeSignals: ["Traditional family values"],
        description:
          "Large evangelical church in Dallas with active community outreach and multiple staff positions.",
      },
      {
        name: "Heritage Plumbing & HVAC",
        website: "https://heritageplumbing.example.com",
        source: "publicsquare",
        industry: "Trades - Plumbing/HVAC",
        city: "Austin",
        state: "TX",
        orgType: "business",
        personaTags: ["TRADES"],
        valuesScore: 25,
        hiringScore: 25,
        qualityScore: 12,
        contactScore: 6,
        email: "jobs@heritageplumbing.example.com",
        phone: "512-555-0200",
        ownerName: "Mike Johnson",
        faithSignals: ["Family-owned since 1985", "Honest service guaranteed"],
        conservativeSignals: ["Veteran-owned", "Family business"],
        description:
          "Family-owned plumbing and HVAC company seeking reliable technicians and apprentices.",
      },
      {
        name: "Liberty Law Group",
        website: "https://libertylawgroup.example.com",
        source: "directory",
        industry: "Legal Services",
        city: "Nashville",
        state: "TN",
        orgType: "business",
        personaTags: ["LEGAL", "PROFESSIONAL"],
        valuesScore: 30,
        hiringScore: 15,
        qualityScore: 18,
        contactScore: 8,
        email: "careers@libertylawgroup.example.com",
        phone: "615-555-0300",
        ownerName: "Sarah Williams, Esq.",
        faithSignals: [
          "Religious liberty practice",
          "Pro-life advocacy",
          "Biblical principles",
        ],
        conservativeSignals: ["Constitutional law focus", "First Amendment specialists"],
        description:
          "Religious liberty law firm seeking associate attorneys passionate about defending faith.",
      },
      {
        name: "Grace Academy",
        website: "https://graceacademy.example.com",
        source: "directory",
        industry: "Education",
        city: "Phoenix",
        state: "AZ",
        orgType: "nonprofit",
        personaTags: ["EDUCATION", "NONPROFIT"],
        valuesScore: 38,
        hiringScore: 22,
        qualityScore: 16,
        contactScore: 8,
        email: "employment@graceacademy.example.com",
        phone: "602-555-0400",
        ownerName: "Dr. Robert Davis",
        faithSignals: [
          "Classical Christian education",
          "Scripture integrated curriculum",
          "ACCS member",
        ],
        conservativeSignals: ["Traditional education values"],
        description:
          "Classical Christian school with K-12 programs seeking teachers and administrators.",
      },
      {
        name: "Stewardship Financial Advisors",
        website: "https://stewardshipfa.example.com",
        source: "kingdom_advisors",
        industry: "Financial Services",
        city: "Charlotte",
        state: "NC",
        orgType: "business",
        personaTags: ["FINANCIAL", "PROFESSIONAL"],
        valuesScore: 32,
        hiringScore: 18,
        qualityScore: 17,
        contactScore: 10,
        email: "join@stewardshipfa.example.com",
        phone: "704-555-0500",
        linkedinUrl: "https://linkedin.com/company/stewardship-fa",
        ownerName: "Michael Chen, CFP",
        faithSignals: [
          "Biblical financial principles",
          "Kingdom Advisors member",
          "Generosity-focused planning",
        ],
        conservativeSignals: ["Biblically responsible investing"],
        description:
          "Faith-based financial advisory firm seeking advisors who share commitment to biblical stewardship.",
      },
      {
        name: "Hope Pregnancy Center",
        website: "https://hopepregnancy.example.com",
        source: "directory",
        industry: "Healthcare/Social Services",
        city: "Atlanta",
        state: "GA",
        orgType: "nonprofit",
        personaTags: ["SOCIAL_SERVICES", "NONPROFIT", "HEALTHCARE"],
        valuesScore: 40,
        hiringScore: 20,
        qualityScore: 14,
        contactScore: 8,
        email: "volunteer@hopepregnancy.example.com",
        phone: "404-555-0600",
        ownerName: "Jennifer Martinez",
        faithSignals: [
          "Pro-life ministry",
          "Care Net affiliate",
          "Christ-centered counseling",
        ],
        conservativeSignals: ["Life-affirming care"],
        description:
          "Crisis pregnancy center seeking nurses, counselors, and administrative staff.",
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const org of testOrgs) {
      const existing = await ctx.db
        .query("crawledOrganizations")
        .withIndex("by_website", (q) => q.eq("website", org.website))
        .first();

      if (!existing) {
        const totalScore =
          org.valuesScore + org.hiringScore + org.qualityScore + org.contactScore;
        let segment: string;
        if (totalScore >= 80) segment = "hot";
        else if (totalScore >= 60) segment = "warm";
        else if (totalScore >= 40) segment = "nurture";
        else segment = "research";

        await ctx.db.insert("crawledOrganizations", {
          sourceUrl: org.website,
          source: org.source,
          name: org.name,
          website: org.website,
          industry: org.industry,
          description: org.description,
          city: org.city,
          state: org.state,
          orgType: org.orgType,
          personaTags: org.personaTags,
          valuesScore: org.valuesScore,
          hiringScore: org.hiringScore,
          qualityScore: org.qualityScore,
          contactScore: org.contactScore,
          totalScore,
          faithSignals: org.faithSignals,
          conservativeSignals: org.conservativeSignals,
          email: org.email,
          phone: org.phone,
          ownerName: org.ownerName,
          linkedinUrl: org.linkedinUrl,
          status: "new",
          segment,
          exportedToCrm: false,
          discoveredAt: now,
          crawledAt: now,
          lastUpdated: now,
        });
        created++;
      } else {
        skipped++;
      }
    }

    return { created, skipped };
  },
});

// ============================================
// Sample URLs for Testing Classification
// ============================================

export const getTestUrls = action({
  args: {},
  handler: async () => {
    // These are real websites that can be used to test the classifier
    // Note: Always respect robots.txt and rate limits
    return {
      churches: [
        { url: "https://www.northpoint.org", source: "church_finder" },
        { url: "https://www.lifechurch.tv", source: "church_finder" },
        { url: "https://www.saddleback.com", source: "church_finder" },
      ],
      businesses: [
        { url: "https://www.publicsquare.com", source: "publicsquare" },
        { url: "https://www.hobby-lobby.com", source: "directory" },
        { url: "https://www.chick-fil-a.com", source: "directory" },
      ],
      professional: [
        { url: "https://adflegal.org", source: "directory" },
        { url: "https://www.kingdomadvisors.com", source: "kingdom_advisors" },
      ],
      education: [
        { url: "https://www.accsedu.org", source: "directory" },
        { url: "https://www.acsi.org", source: "directory" },
      ],
      note: "Use these URLs to test the classifier. Always respect rate limits and robots.txt.",
    };
  },
});
