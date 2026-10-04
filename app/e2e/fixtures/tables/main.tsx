import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider, useParams } from "react-router";
import TablesIndex from "../../../app/routes/tables._index";
import TableDetailPage from "../../../app/routes/tables.$slug";
import NewTablePage from "../../../app/routes/tables.new";
import { BackLink } from "../../../app/components/BackLink";
import "../../../public/tokens.css";
import "./fixture.css";

function FixtureDestination({ kind }: { kind: "event" | "profile" | "community" | "org" }) {
  const { id = "", slug = "" } = useParams();
  const destination = kind === "event"
    ? { title: "First gathering", eyebrow: "Event details", detail: "Tuesday, October 20 · 6:00 PM · Pasadena", body: "A fixture Event connected to the Community studio Table." }
    : kind === "profile"
      ? { title: id === "host-profile" ? "Marta" : "Accepted participant", eyebrow: "Community profile", detail: "Member studio · Creative community", body: "This synthetic profile is shown only in the isolated Tables preview." }
      : kind === "community"
        ? { title: slug === "member-studio" ? "Member studio" : "Community", eyebrow: "Community details", detail: "A place for local creative gatherings", body: "Explore Tables, Events, and people in this demo community." }
        : { title: "Member studio", eyebrow: "Organization details", detail: "Community host · Local design preview", body: "This synthetic organization page is included to keep host links inside the preview." };
  return <main className="fixture-destination">
    <BackLink fallback="/tables" />
    <p className="fixture-eyebrow">{destination.eyebrow}</p>
    <h1>{destination.title}</h1>
    <p>{destination.detail}</p>
    <p>{destination.body}</p>
  </main>;
}

function DemoCheckout() {
  const returnTo = sessionStorage.getItem("tablesFixtureReturnTo") || "/tables";
  return <main className="fixture-destination fixture-checkout">
    <p className="fixture-eyebrow">Tables preview · checkout demo</p>
    <h1>Demo checkout</h1>
    <p>This is a simulated checkout destination. No payment details are collected and no charge will be made.</p>
    <p>The $25.00 price shown on the Table is sample data for this local preview.</p>
    <Link to={returnTo}>Return to the Table</Link>
  </main>;
}

const router = createBrowserRouter(
  [
    { path: "/tables", Component: TablesIndex },
    { path: "/tables/new", Component: NewTablePage },
    { path: "/tables/:slug", Component: TableDetailPage },
    { path: "/checkout-target", Component: DemoCheckout },
    { path: "/events/:id", element: <FixtureDestination kind="event" /> },
    { path: "/profile/:id", element: <FixtureDestination kind="profile" /> },
    { path: "/communities/:slug", element: <FixtureDestination kind="community" /> },
    { path: "/orgs/:slug", element: <FixtureDestination kind="org" /> },
  ],
);
window.addEventListener("beforeunload", () => {
  if (window.location.pathname.startsWith("/tables/"))
    sessionStorage.setItem("tablesFixtureReturnTo", window.location.pathname + window.location.search);
});
createRoot(document.getElementById("root")!).render(<>
  <aside className="fixture-preview-banner">Local design preview · sample data · no real enrollment or payments</aside>
  <RouterProvider router={router} />
</>);
