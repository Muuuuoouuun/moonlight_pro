// Hub read layer — delegates to the shared @com-moon/supabase-rest client.
// Kept as a module so repositories keep their import path; add hub-only read
// helpers here, not another fetch implementation.
export {
  countSupabaseRows,
  eqFilter,
  fetchSupabaseRows,
  fetchSupabaseRowsDetailed,
  inFilter,
  withWorkspaceFilter,
} from "@com-moon/supabase-rest";
