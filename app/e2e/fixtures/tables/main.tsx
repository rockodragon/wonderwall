import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import TablesIndex from "../../../app/routes/tables._index";
import TableDetailPage from "../../../app/routes/tables.$slug";
import NewTablePage from "../../../app/routes/tables.new";
import "../../../public/tokens.css";
import "./fixture.css";

const router = createMemoryRouter(
  [
    { path: "/tables", Component: TablesIndex },
    { path: "/tables/new", Component: NewTablePage },
    { path: "/tables/:slug", Component: TableDetailPage },
    { path: "/checkout-target", element: <p>Mock checkout opened</p> },
  ],
  { initialEntries: [window.location.pathname + window.location.search] },
);
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
