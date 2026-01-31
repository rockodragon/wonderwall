import { Link } from "react-router";
import type { Route } from "./+types/organizations_.demo";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sample Organization Profile | Wonderwall" },
    {
      name: "description",
      content:
        "See what your organization profile could look like on Wonderwall. Connect with Kingdom-minded creatives.",
    },
  ];
}

// Sample data for the demo organization
const SAMPLE_ORG = {
  name: "Salty Light Church",
  tagline: "Be the salt and light in your community",
  description:
    "Salty Light Church is a vibrant, multi-site church in Los Angeles passionate about creative expression in worship. We believe creativity is one of the primary ways we reflect the image of our Creator, and we're committed to investing in artists and creatives who help people encounter God.",
  location: "Los Angeles, CA",
  website: "saltylightchurch.com",
  type: "Church",
  memberSince: "2024",
  verified: true,
  tier: "Patron",
  stats: {
    jobsPosted: 12,
    creativesHired: 8,
    sponsorships: 20,
  },
  values: [
    "Excellence in Creativity",
    "Authentic Worship",
    "Community Investment",
    "Emerging Artist Development",
  ],
  team: [
    {
      name: "Sarah Chen",
      role: "Creative Director",
      image:
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
    },
    {
      name: "Marcus Johnson",
      role: "Worship Pastor",
      image:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
    },
    {
      name: "Emily Rodriguez",
      role: "Media Director",
      image:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop",
    },
  ],
  projects: [
    {
      title: "Easter 2024 Campaign",
      type: "Video Production",
      image:
        "https://images.unsplash.com/photo-1507692049790-de58290a4334?w=600&h=400&fit=crop",
      description: "Cinematic storytelling for our largest outreach event",
    },
    {
      title: "Worship Album Art",
      type: "Graphic Design",
      image:
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&h=400&fit=crop",
      description: "Original artwork for our live worship album release",
    },
    {
      title: "Campus Rebrand",
      type: "Branding",
      image:
        "https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop",
      description: "Complete visual identity refresh across all locations",
    },
  ],
  openings: [
    {
      title: "Graphic Designer",
      type: "Full-time",
      location: "Los Angeles, CA",
      posted: "2 days ago",
    },
    {
      title: "Video Editor",
      type: "Part-time",
      location: "Remote",
      posted: "1 week ago",
    },
    {
      title: "Worship Leader",
      type: "Volunteer",
      location: "Los Angeles, CA",
      posted: "3 days ago",
      volunteer: true,
    },
  ],
  testimonials: [
    {
      quote:
        "Working with Salty Light Church has been incredible. They truly invest in their creatives and give us freedom to create meaningful work.",
      author: "Jake Williams",
      role: "Freelance Videographer",
      image:
        "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    },
    {
      quote:
        "The sponsorship program changed my career. I couldn't afford a Wonderwall membership, but Salty Light sponsored me and I've since gotten 3 clients through the platform.",
      author: "Maria Santos",
      role: "Graphic Designer",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
    },
  ],
};

export default function OrganizationDemo() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Demo Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white text-center py-3 px-4">
        <p className="text-sm font-medium">
          This is a sample organization profile.{" "}
          <Link to="/organizations" className="underline hover:no-underline">
            Learn how to get your own →
          </Link>
        </p>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent"
          >
            Wonderwall
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/search"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Browse Creatives
            </Link>
            <Link
              to="/organizations"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Get Your Profile
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative">
        {/* Cover Image */}
        <div className="h-48 md:h-64 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=400&fit=crop')] bg-cover bg-center opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent" />
        </div>

        {/* Profile Info */}
        <div className="max-w-6xl mx-auto px-6 -mt-16 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Logo */}
            <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-gray-950 shadow-xl">
              SL
            </div>

            {/* Info */}
            <div className="flex-1 pt-4">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  {SAMPLE_ORG.name}
                </h1>
                {SAMPLE_ORG.verified && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-full text-xs font-medium">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Verified
                  </span>
                )}
                <span className="px-2 py-1 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-full text-xs font-medium">
                  {SAMPLE_ORG.tier} Partner
                </span>
              </div>
              <p className="text-gray-300 text-lg mb-3">{SAMPLE_ORG.tagline}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span className="flex items-center gap-1">
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
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  {SAMPLE_ORG.location}
                </span>
                <span className="flex items-center gap-1">
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
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  {SAMPLE_ORG.website}
                </span>
                <span className="flex items-center gap-1">
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
                  {SAMPLE_ORG.type}
                </span>
                <span className="flex items-center gap-1">
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
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  Member since {SAMPLE_ORG.memberSince}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-gray-800 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {SAMPLE_ORG.stats.jobsPosted}
              </div>
              <div className="text-sm text-gray-400">Jobs Posted</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {SAMPLE_ORG.stats.creativesHired}
              </div>
              <div className="text-sm text-gray-400">Creatives Hired</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">
                {SAMPLE_ORG.stats.sponsorships}
              </div>
              <div className="text-sm text-gray-400">Artists Sponsored</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-3 gap-12">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-12">
            {/* About */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">About</h2>
              <p className="text-gray-300 leading-relaxed">
                {SAMPLE_ORG.description}
              </p>
            </section>

            {/* Values */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Our Values</h2>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_ORG.values.map((value) => (
                  <span
                    key={value}
                    className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </section>

            {/* Creative Team */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">
                Creative Team
              </h2>
              <div className="grid sm:grid-cols-3 gap-4">
                {SAMPLE_ORG.team.map((member) => (
                  <div
                    key={member.name}
                    className="bg-gray-900 rounded-xl p-4 text-center"
                  >
                    <img
                      src={member.image}
                      alt={member.name}
                      className="w-20 h-20 rounded-full mx-auto mb-3 object-cover"
                    />
                    <div className="font-medium text-white">{member.name}</div>
                    <div className="text-sm text-gray-400">{member.role}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Project Showcase */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">
                Project Showcase
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SAMPLE_ORG.projects.map((project) => (
                  <div
                    key={project.title}
                    className="group relative rounded-xl overflow-hidden bg-gray-900"
                  >
                    <img
                      src={project.image}
                      alt={project.title}
                      className="w-full aspect-[3/2] object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="text-xs text-blue-400 font-medium mb-1">
                        {project.type}
                      </div>
                      <div className="font-medium text-white">
                        {project.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {project.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Testimonials */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">
                What Creatives Say
              </h2>
              <div className="grid gap-4">
                {SAMPLE_ORG.testimonials.map((testimonial, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-900 rounded-xl p-6 border border-gray-800"
                  >
                    <p className="text-gray-300 italic mb-4">
                      "{testimonial.quote}"
                    </p>
                    <div className="flex items-center gap-3">
                      <img
                        src={testimonial.image}
                        alt={testimonial.author}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <div className="font-medium text-white">
                          {testimonial.author}
                        </div>
                        <div className="text-sm text-gray-400">
                          {testimonial.role}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Current Openings */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Current Openings
              </h3>
              <div className="space-y-3">
                {SAMPLE_ORG.openings.map((job, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-white">
                          {job.title}
                        </div>
                        <div className="text-sm text-gray-400">
                          {job.type} · {job.location}
                        </div>
                      </div>
                      {job.volunteer && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                          Volunteer
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {job.posted}
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                View All Openings →
              </button>
            </div>

            {/* Browse Creatives Preview */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Browse Talent
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Partner organizations can browse and message creatives directly.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop",
                  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=80&h=80&fit=crop",
                  "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=80&h=80&fit=crop",
                  "https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=80&h=80&fit=crop",
                ].map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt="Creative"
                    className="w-full aspect-square rounded-lg object-cover opacity-60"
                  />
                ))}
              </div>
              <Link
                to="/search"
                className="block w-full py-2.5 text-center bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Search Creatives
              </Link>
            </div>

            {/* Patron Badge */}
            <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/40 rounded-xl p-6 border border-amber-500/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-amber-400"
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
                </div>
                <div>
                  <div className="font-bold text-amber-300">
                    Patron of the Arts
                  </div>
                  <div className="text-sm text-amber-400/80">
                    Sponsoring 20 creatives
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-400">
                This organization invests in Kingdom creativity by sponsoring
                memberships for emerging artists.
              </p>
            </div>

            {/* Contact CTA */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
              <h3 className="font-bold text-white mb-2">Interested?</h3>
              <p className="text-sm text-gray-400 mb-4">
                Message this organization about opportunities.
              </p>
              <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
                Send Message
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Banner */}
      <section className="px-6 py-16 bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-t border-blue-500/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Want a profile like this for your organization?
          </h2>
          <p className="text-gray-300 mb-6 max-w-xl mx-auto">
            Join Wonderwall and connect with Kingdom-minded creatives. Partner
            tier and above get a dedicated organization profile page.
          </p>
          <Link
            to="/organizations"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
          >
            Get Started
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
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
              to="/organizations"
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              For Organizations
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
    </div>
  );
}
