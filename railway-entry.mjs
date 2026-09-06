// Railway entry point fallback to prevent MODULE_NOT_FOUND errors if Railway defaults to railway-entry.mjs
import(".output/server/index.mjs").catch((err) => {
  console.error("Failed to load .output/server/index.mjs:", err);
  process.exit(1);
});
