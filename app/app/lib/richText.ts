// Re-export shim — the rich content model's single source of truth lives on
// the SERVER side (convex/garden/richText.ts) so validation, rendering and
// editing can never drift from each other. Same convention as
// app/app/garden/capabilities.ts. Pure TS; the only runtime dependency is
// convex/values, which the client already ships.
export * from "../../convex/garden/richText";
