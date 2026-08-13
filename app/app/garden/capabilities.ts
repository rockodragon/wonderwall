// Re-export shim — the capability module's single source of truth lives on
// the SERVER side (convex/garden/capabilities.ts) so production entitlement
// enforcement and this client copy can never drift. Pure TS, no runtime deps.
export * from "../../convex/garden/capabilities";
