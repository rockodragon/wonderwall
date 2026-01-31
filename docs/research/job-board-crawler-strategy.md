# Job Board Partner Crawler Strategy

## Executive Summary

This document outlines a comprehensive strategy for identifying, crawling, and classifying potential partner organizations for the Wonderwall job board. The goal is to build a pipeline that discovers values-aligned businesses and organizations that would benefit from accessing our talent pool of faith-driven professionals.

---

## Part 1: Target Organization Personas

### Persona 1: Faith-Based Organizations

**Profile:**
- Churches (all denominations with emphasis on evangelical, Catholic, non-denominational)
- Para-church organizations (ministries, missions organizations)
- Christian schools and universities
- Faith-based nonprofits (food banks, homeless shelters, crisis pregnancy centers)
- Religious media organizations

**Indicators:**
- Website contains: mission statement referencing faith, scripture, "Christ-centered"
- 501(c)(3) religious organization status
- Staff pages with pastoral titles
- Event calendars with worship services
- Keywords: ministry, fellowship, congregation, parish, diocese

**Data Sources:**
- Church finder directories (ChurchFinder.com, Church.org)
- Denominational directories (SBC, LCMS, PCA, USCCB)
- Christian job boards (ChristianJobs.com, Church Staffing)
- GuideStar/Candid for religious nonprofits

**Estimated Volume:** 300,000+ churches in US alone

---

### Persona 2: Values-Aligned Small Businesses

**Profile:**
- Family-owned businesses with explicit Christian values
- PublicSquare marketplace members
- Businesses advertising in Christian media
- Companies with faith statements on websites
- B-Corps and benefit corporations with faith alignment

**Indicators:**
- Website "About" page mentions: faith, family values, "God first"
- Member of faith-based business networks (C12, CBMC, FCCI)
- Closed on Sundays (Chick-fil-A model)
- Charitable giving to faith-based causes
- Owner testimonials referencing faith journey

**Sub-Categories:**

#### 2a: Outdoor/Hunting/Rural Lifestyle (Duck Dynasty Archetype)
- Hunting and fishing outfitters
- Farm and ranch supply stores
- Outdoor recreation companies
- Rural lifestyle brands
- Gun shops and ranges (with family focus)

**Keywords:** family-owned, outdoor lifestyle, heritage, tradition, stewardship

#### 2b: Survivalist/Preparedness Businesses
- Emergency preparedness suppliers
- Homesteading supply companies
- Off-grid living suppliers
- Freeze-dried food companies (Patriot Supply, My Patriot Supply)
- Self-reliance education

**Keywords:** preparedness, self-reliance, independence, family safety

#### 2c: Health & Wellness (Alternative/Natural)
- Faith-based health sharing ministries (Samaritan, Medi-Share)
- Natural/organic food producers
- Supplement companies with faith alignment
- Holistic health practitioners
- Pro-life healthcare providers

---

### Persona 3: Conservative-Aligned Professional Services

**Profile:**
- Law firms specializing in religious liberty, pro-life, family law
- Conservative policy organizations
- Traditional media outlets
- Political consulting (conservative)
- Financial advisors with biblical finance focus

**Sub-Categories:**

#### 3a: Legal Services
- Religious liberty law firms (Alliance Defending Freedom model)
- Pro-life legal organizations
- Family law practices (marriage-focused)
- Estate planning with charitable giving focus
- Small business attorneys

**Data Sources:**
- ADF attorney network
- Federalist Society membership
- State bar Christian lawyer associations

#### 3b: Financial Services
- Biblical financial advisors (Kingdom Advisors network)
- Faith-based credit unions
- Christian estate planners
- Biblically responsible investing (BRI) advisors

**Keywords:** stewardship, biblical principles, kingdom impact, generosity

---

### Persona 4: Trade & Blue-Collar Businesses

**Profile:**
- Construction companies (family-owned)
- HVAC and plumbing contractors
- Electrical contractors
- Landscaping and lawn care
- Auto repair shops
- Manufacturing (small/medium)

**Indicators:**
- "Family owned since [year]" messaging
- Emphasis on integrity, honesty, fair dealing
- Community involvement (local church, youth sports)
- Apprenticeship programs
- Veterans-owned

**Why They Fit:**
- Often struggle to find reliable workers
- Value work ethic, punctuality, character
- Looking for employees who share values
- Willing to train right attitude

---

### Persona 5: Social Services & Healthcare

**Profile:**
- Crisis pregnancy centers
- Adoption agencies (faith-based)
- Foster care organizations
- Christian counseling practices
- Hospice and elder care (faith-based)
- Addiction recovery programs (faith-based)

**Data Sources:**
- Care Net pregnancy center network
- Bethany Christian Services affiliates
- AACC (American Association of Christian Counselors)
- Celebrate Recovery network

---

### Persona 6: Education Sector

**Profile:**
- Christian K-12 schools
- Classical Christian schools (ACCS members)
- Homeschool co-ops and support organizations
- Christian colleges and universities (CCCU members)
- Tutoring and test prep (faith-based)

**Data Sources:**
- ACSI (Association of Christian Schools International)
- ACCS (Association of Classical Christian Schools)
- CCCU member institutions
- Homeschool Legal Defense Association network

---

### Persona 7: Media & Creative

**Profile:**
- Christian publishers
- Faith-based film production
- Christian music labels and artists
- Podcasters and content creators
- Christian radio stations
- Conservative news outlets

**Data Sources:**
- NRB (National Religious Broadcasters)
- ECPA (Evangelical Christian Publishers Association)
- Christian music charts
- Conservative media directories

---

## Part 2: Data Sources & Discovery Methods

### Primary Discovery Channels

#### 1. Business Directories (Values-Aligned)
| Source | URL | Data Available | API/Scraping |
|--------|-----|----------------|--------------|
| PublicSquare | publicsquare.com | Business listings, categories | Scraping required |
| Christian Business Directory | christiandirectory.com | Name, category, location | Scraping |
| Kingdom Business Directory | kingdombusiness.network | Business profiles | Scraping |
| LocalWorks | localworks.com | Conservative businesses | Scraping |

#### 2. Church & Ministry Directories
| Source | URL | Data Available |
|--------|-----|----------------|
| Church Finder | churchfinder.com | Name, denomination, location, website |
| Find A Church | findachurch.com | Church profiles |
| SBC Church Search | sbc.net | Southern Baptist churches |
| LCMS Locator | locator.lcms.org | Lutheran churches |
| Catholic Parish Finder | usccb.org | Catholic parishes |

#### 3. Professional Networks
| Source | Type | Members |
|--------|------|---------|
| C12 Group | CEO peer groups | 2,500+ Christian CEOs |
| CBMC | Christian business men | 50,000+ members |
| FCCI | Christian business leaders | 3,000+ members |
| Kingdom Advisors | Financial advisors | 2,500+ members |

#### 4. Job Board Cross-Reference
| Source | Type | Why Useful |
|--------|------|------------|
| ChristianJobs.com | Faith-based jobs | Organizations already hiring |
| Church Staffing | Church positions | Active church employers |
| MinistryJobs.com | Ministry positions | Para-church organizations |
| HigherEdJobs (Christian filter) | Academic | Christian colleges |

### Secondary Discovery (Inferred Alignment)

#### 5. Political/Advocacy Affiliations
- Chamber of Commerce (local chapters)
- NFIB (National Federation of Independent Business)
- State Policy Network affiliates
- Heritage Foundation events
- Faith & Freedom Coalition members

#### 6. Social Media Signals
- Following conservative/faith accounts
- Sharing faith-based content
- Bible verses in bios
- Sunday closure announcements

---

## Part 3: Deep Research Prompts

### For Grok AI / Deep Research Agents

#### Prompt 1: Church Discovery
```
Research and compile a comprehensive list of churches in [STATE/REGION] that:
1. Have active websites with contact information
2. Employ 5+ staff members (larger churches more likely to hire)
3. Have recently posted job openings or mentioned hiring needs
4. Are part of denominations known for community engagement

For each church, extract:
- Church name and denomination
- Website URL
- City and state
- Senior pastor name
- Contact email (general or HR if available)
- Approximate congregation size (if mentioned)
- Any job postings or "join our team" pages

Focus on: evangelical, non-denominational, Baptist, Catholic, Lutheran, Presbyterian churches. Exclude: Unitarian, progressive denominations.
```

#### Prompt 2: PublicSquare Business Mining
```
Analyze the PublicSquare marketplace (publicsquare.com) and identify businesses that:
1. Have physical locations (not just online-only)
2. Employ multiple people (not sole proprietors)
3. Are in industries likely to hire: retail, trades, professional services, food service, healthcare

For each business, research and compile:
- Business name
- Category/industry
- Website (if separate from PS profile)
- Location(s)
- Owner name if available
- Social media presence
- Any hiring indicators

Organize by state and industry vertical.
```

#### Prompt 3: Values-Aligned Professional Services
```
Find law firms, accounting firms, and financial advisors in [STATE] that:
1. Explicitly mention faith, biblical principles, or Christian values on their website
2. Are members of: Alliance Defending Freedom, Federalist Society, Kingdom Advisors, or similar networks
3. Specialize in: religious liberty, pro-life, family law, estate planning, business law

Extract:
- Firm name and specialty
- Website URL
- Partner/owner names
- Location
- Contact information
- Network affiliations
- Size estimate (number of attorneys/advisors)
```

#### Prompt 4: Trade Businesses Discovery
```
Research family-owned trade businesses (HVAC, plumbing, electrical, construction, landscaping) in [METRO AREA] that:
1. Emphasize family values, integrity, or faith in their marketing
2. Have been in business 10+ years (established)
3. Have 5-50 employees (sweet spot for hiring needs)
4. Have positive community reputation

Look for signals like:
- "Family owned" or "Since [year]" messaging
- Community involvement mentioned
- Veterans-owned indicators
- BBB membership with faith-based mission
- Apprenticeship or training programs

Extract: Business name, trade type, website, location, owner name, contact info, years in business
```

#### Prompt 5: Crisis Pregnancy & Social Services
```
Compile a list of faith-based social service organizations in [STATE]:

1. Crisis pregnancy centers (Care Net, Heartbeat International affiliates)
2. Faith-based adoption and foster care agencies
3. Christian counseling centers
4. Faith-based addiction recovery programs
5. Religious homeless shelters and food banks

For each organization:
- Organization name
- Type of service
- Network affiliation (if any)
- Website
- Location(s)
- Executive director name
- Contact information
- Size indicators (staff, clients served)
```

#### Prompt 6: Christian Education Institutions
```
Research Christian educational institutions in [STATE/REGION]:

1. Christian K-12 schools (ACSI, ACCS members)
2. Classical Christian schools
3. Christian colleges and universities
4. Large homeschool co-ops and organizations

For each:
- Institution name
- Type (K-12, college, homeschool)
- Accreditation/network membership
- Website
- Location
- Head of school/president name
- HR or employment contact
- Approximate enrollment
- Notable programs or specialties
```

---

## Part 4: Classification & Scoring System

### Scoring Rubric (0-100 Scale)

#### Category 1: Values Alignment (0-40 points)

| Signal | Points |
|--------|--------|
| Explicit faith/Christian statement on website | 15 |
| Scripture or biblical references | 10 |
| Member of faith-based business network | 10 |
| Charitable giving to faith causes mentioned | 5 |
| "Closed Sundays" or similar | 5 |
| Conservative political indicators | 5 |

#### Category 2: Hiring Potential (0-30 points)

| Signal | Points |
|--------|--------|
| Active "Careers" or "Join Us" page | 10 |
| Multiple locations/offices | 5 |
| Recent job postings found | 10 |
| Growth indicators (new location, expansion) | 5 |
| Industry with high turnover (food, retail, trades) | 5 |

#### Category 3: Organization Quality (0-20 points)

| Signal | Points |
|--------|--------|
| Professional website | 5 |
| Active social media presence | 5 |
| Positive reviews/reputation | 5 |
| Years in business (10+) | 5 |

#### Category 4: Contact Quality (0-10 points)

| Signal | Points |
|--------|--------|
| Direct email available | 4 |
| Phone number available | 2 |
| Contact form available | 2 |
| LinkedIn profiles for owners/HR | 2 |

### Persona Tags

Each organization receives one or more persona tags:
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

### Priority Segments

| Segment | Score Range | Action |
|---------|-------------|--------|
| Hot Leads | 80-100 | Immediate outreach |
| Warm Leads | 60-79 | Email campaign |
| Nurture | 40-59 | Add to newsletter |
| Research | 20-39 | Needs more info |
| Low Priority | 0-19 | Archive |

---

## Part 5: Technical Implementation

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Crawler Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Sources    │    │   Crawler    │    │  Classifier  │       │
│  │  (Extracts)  │───▶│   (Fetch)    │───▶│    (AI)      │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│                                                  │               │
│                                                  ▼               │
│                      ┌──────────────┐    ┌──────────────┐       │
│                      │    Convex    │◀───│   Scorer     │       │
│                      │   Database   │    │  (Ranking)   │       │
│                      └──────────────┘    └──────────────┘       │
│                             │                                    │
│                             ▼                                    │
│                      ┌──────────────┐                           │
│                      │  CRM Export  │                           │
│                      │  (Upsight)   │                           │
│                      └──────────────┘                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### AI Classification (Low-Cost Options)

#### Option 1: Cloudflare Workers AI (Recommended)
- **Model:** `@cf/meta/llama-3.1-8b-instruct`
- **Cost:** Free tier includes 10,000 requests/day
- **Latency:** ~200ms per request
- **Accuracy:** Sufficient for classification tasks

#### Option 2: OpenAI GPT-4o-mini
- **Cost:** $0.15/1M input tokens, $0.60/1M output tokens
- **Per classification:** ~$0.0001 (very cheap)
- **Accuracy:** Higher than Llama

#### Option 3: Anthropic Claude Haiku
- **Cost:** $0.25/1M input, $1.25/1M output
- **Per classification:** ~$0.0002
- **Accuracy:** Good balance

### Classification Prompt Template

```
You are analyzing a business website to determine if it aligns with Christian/conservative values and would be a good partner for a faith-based job board.

Website content:
{extracted_text}

Analyze and respond with JSON:
{
  "values_alignment": {
    "faith_signals": ["list of faith-related phrases found"],
    "conservative_signals": ["list of conservative indicators"],
    "alignment_score": 0-40
  },
  "hiring_potential": {
    "has_careers_page": boolean,
    "recent_postings": boolean,
    "growth_indicators": ["list"],
    "hiring_score": 0-30
  },
  "organization_info": {
    "name": "string",
    "type": "CHURCH|MINISTRY|BUSINESS|NONPROFIT",
    "industry": "string",
    "location": "city, state",
    "employees_estimate": "1-5|5-20|20-50|50-100|100+",
    "quality_score": 0-20
  },
  "contact_info": {
    "email": "string or null",
    "phone": "string or null",
    "contact_form_url": "string or null",
    "contact_score": 0-10
  },
  "persona_tags": ["list of applicable tags"],
  "total_score": 0-100,
  "summary": "2-3 sentence description"
}
```

### Data Storage Schema (Convex)

```typescript
// crawledOrganizations table
{
  // Discovery info
  sourceUrl: string,
  source: "publicsquare" | "directory" | "manual" | "referral",
  discoveredAt: number,

  // Organization details
  name: string,
  website: string,
  industry: string,
  location: {
    city: string,
    state: string,
    zip?: string,
  },
  employeeEstimate: string,

  // Classification
  personaTags: string[],
  valuesScore: number,
  hiringScore: number,
  qualityScore: number,
  contactScore: number,
  totalScore: number,

  // AI analysis
  faithSignals: string[],
  conservativeSignals: string[],
  summary: string,

  // Contact info
  email?: string,
  phone?: string,
  contactFormUrl?: string,
  ownerName?: string,

  // Workflow
  status: "new" | "contacted" | "responded" | "converted" | "declined" | "nurture",
  segment: "hot" | "warm" | "nurture" | "research" | "low",

  // CRM sync
  exportedToCrm: boolean,
  crmId?: string,
  lastExportedAt?: number,

  // Metadata
  crawledAt: number,
  lastUpdated: number,
  notes?: string,
}
```

### CRM Export Format (Upsight Compatible)

```csv
Name,Website,Industry,City,State,Email,Phone,Score,Segment,Personas,Summary,Source
"Example Church","https://example.church","Religious","Austin","TX","info@example.church","512-555-0100",85,"hot","CHURCH,NONPROFIT","Large evangelical church with active hiring...","directory"
```

---

## Part 6: Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Set up database schema for crawled organizations
- [ ] Implement basic crawler action in Convex
- [ ] Create Cloudflare Workers AI integration
- [ ] Build manual entry form for testing

### Phase 2: Discovery (Week 2)
- [ ] Implement PublicSquare scraper
- [ ] Add church directory integration
- [ ] Create batch import from CSV
- [ ] Build admin dashboard for monitoring

### Phase 3: Classification (Week 3)
- [ ] Implement AI classification pipeline
- [ ] Build scoring algorithm
- [ ] Add persona tagging
- [ ] Create segment assignment logic

### Phase 4: Export & Integration (Week 4)
- [ ] Build CSV export functionality
- [ ] Create Upsight integration (if API available)
- [ ] Implement webhook notifications
- [ ] Add email outreach tracking

---

## Appendix A: Sample Discovery Queries

### Google Search Operators

```
# Find churches with job pages
site:*.church "join our team" OR "employment" OR "careers"

# Faith-based businesses in specific area
"family owned" "since" christian OR faith Dallas TX

# PublicSquare businesses by category
site:publicsquare.com "home services" OR "contractor"

# Christian professional services
"biblical" OR "Christ-centered" lawyer OR attorney OR CPA [city]

# Crisis pregnancy centers
"pregnancy center" OR "pregnancy resource" [state] -planned -parenthood
```

### LinkedIn Sales Navigator Queries
- Industry: Religious Institutions
- Company size: 11-50, 51-200
- Geography: [target state]
- Keywords: "faith-based", "ministry", "Christian"

---

## Appendix B: Compliance Considerations

### Data Collection
- Respect robots.txt on all crawled sites
- Rate limit requests (1 request per 2 seconds)
- Store only publicly available information
- Include opt-out mechanism for organizations

### Outreach
- CAN-SPAM compliance for email campaigns
- Clear identification as Wonderwall
- Easy unsubscribe mechanism
- No misleading subject lines

### Privacy
- Secure storage of contact information
- Access controls on sensitive data
- Data retention policy (archive after 2 years)
- GDPR considerations for any EU entities

---

## Appendix C: Success Metrics

| Metric | Target |
|--------|--------|
| Organizations discovered per week | 500+ |
| Classification accuracy | 85%+ |
| Contact info capture rate | 70%+ |
| Hot lead conversion rate | 10%+ |
| Time from discovery to outreach | <48 hours |
| Database growth per month | 2,000+ |
