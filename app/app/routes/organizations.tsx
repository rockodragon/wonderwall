import { useEffect, useState } from "react";
import { Link } from "react-router";
import { usePostHog } from "@posthog/react";
import type { Route } from "./+types/organizations";

declare global {
  interface Window {
    UpSight?: {
      create: (
        containerId: string,
        slug: string,
        options: {
          layout: string;
          theme: string;
          accent: string;
          radius: number;
          branding: boolean;
          buttonText: string;
          placeholder: string;
          success: string;
        },
      ) => void;
    };
  }
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Hire Kingdom Creatives | Wonderwall" },
    {
      name: "description",
      content:
        "Connect with talented creatives known for integrity and excellence. Post jobs, build your team, and find values-aligned talent—whether you're a church, nonprofit, startup, or enterprise.",
    },
    { property: "og:title", content: "Hire Kingdom Creatives | Wonderwall" },
    {
      property: "og:description",
      content:
        "Connect with talented creatives known for integrity and excellence—for any organization.",
    },
    { property: "og:type", content: "website" },
  ];
}

const TIERS = [
  {
    name: "Community",
    price: 0,
    period: "year",
    description: "Get listed and start connecting with the creative community",
    features: [
      "Organization name in directory",
      "Website link and contact info",
      "Organization type badge",
      "Browse creative portfolios",
      "1 job posting at a time",
    ],
    highlighted: false,
    free: true,
  },
  {
    name: "Partner",
    price: 100,
    period: "month",
    description: "For organizations ready to actively hire creative talent",
    features: [
      "Everything in Community, plus:",
      "Logo displayed in directory",
      "Dedicated organization profile page",
      "Up to 5 active job postings",
      "Direct messaging with creatives",
    ],
    highlighted: false,
    patronage: 5,
  },
  {
    name: "Patron",
    price: 5000,
    period: "year",
    description: "For established organizations investing in Kingdom creatives",
    features: [
      "Everything in Partner, plus:",
      "Up to 15 active job postings",
      "Featured organization badge",
      "Spotlight organizational profile",
      "Homepage feature rotation",
      "Priority support & talent matching",
    ],
    highlighted: false,
    patronage: 20,
  },
  {
    name: "Founding Partner",
    price: 25000,
    period: "year",
    description:
      "Strategic partnership shaping the future of Kingdom creativity",
    features: [
      "Everything in Patron, plus:",
      "Unlimited job postings",
      "Spotlight organizational profile",
      "Event and feature naming rights",
      "Advisory board participation",
      "Custom platform integrations",
    ],
    highlighted: false,
    custom: true,
    patronage: "50+",
  },
];

const FAQS = [
  {
    question: "What types of organizations can join?",
    answer:
      "Wonderwall welcomes any organization seeking values-aligned creative talent. This includes churches, Christian nonprofits, mission organizations, faith-based media companies, as well as secular businesses, startups, agencies, and nonprofits who want to hire creatives known for their integrity, work ethic, and character.",
  },
  {
    question: "I'm not a church or Christian organization. Can I still join?",
    answer:
      "Absolutely. Many businesses value working with creatives who bring strong ethics, reliability, and character to their work. Our community includes talented professionals across every creative discipline who happen to share Kingdom values—and that translates into excellent work for any organization.",
  },
  {
    question: "What's the difference between the tiers?",
    answer:
      "The free Community tier gets your organization listed in our directory—great for getting started. The Partner tier ($100/month) unlocks job posting and direct messaging. Patron and Founding Partner tiers add premium visibility, dedicated support, and the ability to sponsor creative memberships as a 'patron of the arts.'",
  },
  {
    question: "What does 'sponsor creative memberships' mean?",
    answer:
      "Like Renaissance patrons who supported artists, your organization can sponsor memberships for emerging creatives who couldn't otherwise afford to join. Partner tier sponsors 5, Patron sponsors 20, and Founding Partners sponsor 50+ creatives. It's a tangible way to invest in Kingdom creativity while building goodwill with future talent.",
  },
  {
    question: "What creative roles can we hire for?",
    answer:
      "Our community includes designers, filmmakers, photographers, musicians, writers, developers, marketers, worship leaders, and 30+ creative disciplines. Whether you need a full-time creative director, a freelancer for a campaign, or a worship leader, you'll find talented professionals here.",
  },
  {
    question: "How is Wonderwall different from other job boards?",
    answer:
      "Unlike traditional job boards, Wonderwall is a community first. Creatives showcase portfolios, share their journey, and connect based on shared values. When you post a job, you see complete portfolios—not just resumes. You're hiring people whose work quality and character you can evaluate before reaching out.",
  },
  {
    question: "Can we try before we commit?",
    answer:
      "Yes—our Community tier is completely free. Get listed, browse portfolios, and see if Wonderwall is right for your organization. When you're ready to post jobs and connect directly with creatives, upgrading is simple.",
  },
  {
    question: "What if we have larger partnership needs?",
    answer:
      "Our Founding Partner tier is designed for organizations wanting to make a significant impact—think Life.Church, Compassion International, or values-aligned businesses like Chick-fil-A. We offer custom integrations, naming rights, advisory board participation, and tailored solutions. Let's talk.",
  },
];

export default function Organizations() {
  const posthog = usePostHog();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [utmParams, setUtmParams] = useState("");
  const [registerModalPlan, setRegisterModalPlan] = useState<string | null>(
    null,
  );

  // Capture UTM params on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const utmKeys = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
      ];
      const utms = utmKeys
        .filter((key) => params.has(key))
        .map((key) => `${key}=${encodeURIComponent(params.get(key) || "")}`);
      if (utms.length > 0) {
        setUtmParams(utms.join("&"));
      }
    }
  }, []);

  // Check feature flag for org sales details
  useEffect(() => {
    if (posthog) {
      const enabled = posthog.isFeatureEnabled("ffOrgSales");
      setShowPricing(!!enabled);
    }
  }, [posthog]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 px-6 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <Link
          to="/"
          className="text-2xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
        >
          Wonderwall
        </Link>
        <Link
          to="/login"
          className="px-4 py-2 text-white/80 hover:text-white font-medium transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-sm font-medium mb-6">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            For Any Organization
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
            Hire{" "}
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Kingdom-Minded Creatives
            </span>
          </h1>

          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-4">
            Churches, nonprofits, businesses, and mission-driven
            organizations—connect with talented designers, filmmakers,
            musicians, writers, and more who share your values.
          </p>

          <p className="text-lg text-gray-300 max-w-xl mx-auto mb-8">
            Whether you're a church, a startup, or a Fortune 500—find creatives
            whose work ethic and integrity speak for themselves.
          </p>

          {/* Inline Registration Form */}
          <div className="max-w-md mx-auto">
            <UpSightOrgEmbed id="upsight-hero" accentColor="#60a5fa" />
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="px-6 py-16 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              }
              title="See Their Work First"
              description="Browse complete portfolios, not just resumes. Evaluate creative talent by their actual work before you reach out."
            />
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              }
              title="Values-Aligned Talent"
              description="Every creative on Wonderwall is part of a Kingdom-minded community. Hire with confidence knowing you share the same foundation."
            />
            <ValueProp
              icon={
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              }
              title="Direct Connection"
              description="Message creatives directly through the platform. Build relationships with talent for ongoing projects and referrals."
            />
          </div>
        </div>
      </section>

      {/* Patron of the Arts Explainer */}
      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Wrapper for badge positioning */}
          <div className="relative pt-4">
            {/* Badge positioned above the card */}
            <div className="absolute -top-1 left-6 inline-flex items-center gap-2 px-3 py-1 bg-amber-600 text-white rounded-full text-sm font-medium shadow-lg z-10">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Become a Patron of the Arts
            </div>
            {/* Card with overflow-hidden for blur effect */}
            <div className="relative rounded-2xl bg-gradient-to-br from-amber-900/30 via-amber-800/20 to-gray-900 border border-amber-500/30 p-8 md:p-10 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                  Invest in Kingdom Creativity
                </h2>
                <p className="text-gray-300 text-lg mb-4 max-w-2xl">
                  Like the Medicis of Renaissance Florence, your organization
                  can invest in Kingdom creativity by sponsoring memberships for
                  talented artists who couldn't otherwise afford to join.
                </p>
                <p className="text-gray-400 mb-6 max-w-2xl">
                  Every paid tier includes creative sponsorships—so you're not
                  just hiring talent, you're building the ecosystem. Sponsored
                  creatives get full platform access, and you get first look at
                  emerging talent while making a tangible Kingdom impact.
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="font-bold">Partner:</span>
                    <span className="text-gray-400">5 sponsorships</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="font-bold">Patron:</span>
                    <span className="text-gray-400">20 sponsorships</span>
                  </div>
                  <div className="flex items-center gap-2 text-amber-300">
                    <span className="font-bold">Founding Partner:</span>
                    <span className="text-gray-400">50+ sponsorships</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partnership Tiers */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Organization Partnership Tiers
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Choose the level that fits your hiring needs. All tiers include a
              dedicated organization profile and access to our creative
              community.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIERS.map((tier) => (
              <TierCard
                key={tier.name}
                tier={tier}
                showPricing={showPricing}
                onRegister={(planName) => setRegisterModalPlan(planName)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Stats */}
      <section className="px-6 py-16 bg-gray-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <Stat number="100%" label="Values-Aligned" />
            <Stat number="32+" label="Creative Disciplines" />
            <Stat number="Free" label="For Creatives" />
            <Stat number="Direct" label="Connection" />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className="border border-gray-800 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left bg-gray-900/50 hover:bg-gray-900 transition-colors"
                >
                  <span className="font-medium text-white">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${openFaq === idx ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openFaq === idx && (
                  <div className="px-6 py-4 bg-gray-900/30 border-t border-gray-800">
                    <p className="text-gray-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="register" className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 p-12">
            <div className="absolute inset-0 bg-black/20" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Find Your Next Creative?
              </h2>
              <p className="text-white/90 text-lg mb-8 max-w-xl mx-auto">
                Join the growing community of organizations discovering
                exceptional creative talent with integrity and purpose.
              </p>
              <div className="max-w-md mx-auto">
                <iframe
                  src="https://getupsight.com/embed/5ky-bxs?layout=inline-email&theme=transparent&accent=%23ffffff&radius=12&branding=false&buttonText=Register&placeholder=you%40organization.com&success=Thanks%21+We%27ll+be+in+touch."
                  width="100%"
                  height="80"
                  frameBorder="0"
                  scrolling="no"
                  allowTransparency={true}
                  style={{ border: "none", overflow: "hidden" }}
                  allow="camera; microphone"
                  title="Register Interest"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            Wonderwall — A community for Kingdom-minded creatives
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              Home
            </Link>
            <Link
              to="/login"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </footer>

      {/* Register Interest Modal */}
      {registerModalPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={() => setRegisterModalPlan(null)}
        >
          <div
            className="relative w-full max-w-md bg-gray-900 rounded-2xl p-6 border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setRegisterModalPlan(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <h3 className="text-xl font-bold text-white mb-2">
              Register Interest
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              {registerModalPlan} tier selected. We'll reach out to discuss next
              steps.
            </p>
            <iframe
              src={`https://getupsight.com/embed/5ky-bxs?layout=inline-email&theme=dark&accent=%2360a5fa&radius=12&branding=false&buttonText=Continue&placeholder=you%40organization.com&success=Thanks%21+We%27ll+be+in+touch.`}
              width="100%"
              height="120"
              frameBorder="0"
              scrolling="no"
              allowTransparency={true}
              style={{ border: "none", overflow: "hidden" }}
              allow="camera; microphone"
              title="Register Interest"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UpSightOrgEmbed({
  id,
  accentColor = "#60a5fa",
}: {
  id: string;
  accentColor?: string;
}) {
  useEffect(() => {
    // Load the UpSight script if not already loaded
    const existingScript = document.querySelector(
      'script[src="https://getupsight.com/embed.js"]',
    );

    const initForm = () => {
      if (window.UpSight && typeof window.UpSight.create === "function") {
        window.UpSight.create(id, "5ky-bxs", {
          layout: "inline-email",
          theme: "transparent",
          accent: accentColor,
          radius: 12,
          branding: false,
          buttonText: "Register",
          placeholder: "you@organization.com",
          success: "Thanks! We'll be in touch.",
        });
      }
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://getupsight.com/embed.js";
      script.async = true;
      script.onload = initForm;
      document.body.appendChild(script);
    } else {
      // Script already loaded, just init
      initForm();
    }
  }, [id, accentColor]);

  return (
    <>
      <style>{`
        #${id}, #${id} * {
          background: transparent !important;
          background-color: transparent !important;
        }
        #${id} input {
          background: rgba(255,255,255,0.1) !important;
          border: 1px solid rgba(255,255,255,0.2) !important;
          color: white !important;
        }
        #${id} input::placeholder {
          color: rgba(255,255,255,0.5) !important;
        }
        #${id} button {
          background: ${accentColor} !important;
        }
        #${id} label, #${id} p, #${id} span {
          color: rgba(255,255,255,0.7) !important;
        }
      `}</style>
      <div id={id} />
    </>
  );
}

function ValueProp({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 bg-blue-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-7 h-7 text-blue-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {icon}
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}

function TierCard({
  tier,
  showPricing,
  onRegister,
}: {
  tier: (typeof TIERS)[0];
  showPricing: boolean;
  onRegister: (planName: string) => void;
}) {
  const isFree = "free" in tier && tier.free;
  const hasPatronage = "patronage" in tier && tier.patronage;
  const isCustom = "custom" in tier && tier.custom;
  const patronageCount = hasPatronage ? tier.patronage : 0;

  return (
    <div
      className={`relative rounded-2xl p-6 transition-all ${
        isFree
          ? "bg-gray-900/50 border border-gray-700 hover:border-gray-600"
          : "bg-gray-900 border border-gray-800 hover:border-gray-700"
      }`}
    >
      {isFree && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-full">
          Free Forever
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-xl font-bold text-white">{tier.name}</h3>
        <p className="text-sm text-gray-400 mt-1">{tier.description}</p>
      </div>

      {/* Patronage section - moved up high in the card */}
      {hasPatronage && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-1">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Patron of the Arts
          </div>
          <p className="text-amber-200 text-sm font-medium">
            Sponsor {patronageCount} creative memberships
          </p>
        </div>
      )}

      <div className="mb-6">
        {isFree ? (
          <span className="text-4xl font-bold text-green-400">Free</span>
        ) : showPricing ? (
          <>
            {isCustom && (
              <span className="block text-sm text-gray-500 mb-1">
                Starting at
              </span>
            )}
            <span className="text-4xl font-bold text-white">
              ${tier.price.toLocaleString()}
            </span>
            <span className="text-gray-400">/{tier.period}</span>
            {tier.period === "month" && (
              <span className="block text-sm text-gray-500 mt-1">
                ${(tier.price * 12).toLocaleString()}/year
              </span>
            )}
          </>
        ) : null}
      </div>

      <ul className="space-y-3 mb-6">
        {tier.features.map((feature, idx) => (
          <li key={idx} className="flex items-start gap-2 text-sm">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onRegister(tier.name)}
        className={`block w-full py-3 rounded-xl font-medium text-center transition-all ${
          isFree
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-gray-800 text-white hover:bg-gray-700"
        }`}
      >
        {isFree ? "Join Free" : "Register Interest"}
      </button>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-bold text-white mb-1">
        {number}
      </div>
      <div className="text-gray-400 text-sm">{label}</div>
    </div>
  );
}
