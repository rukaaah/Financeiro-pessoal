import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: false,
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // Branches novos nao expiram: o branch `dev` e permanente (ADR-004).
      // O `ttl: "7d"` gerado pelo `neon config init` foi removido de proposito.
      return {};
    }
    // Existing branch: no changes
    return {};
  },
});
