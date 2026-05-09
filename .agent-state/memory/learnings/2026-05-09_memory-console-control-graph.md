# Memory console control and graph

Tags: memory-console, guarded-purge, graph-projection, local-ui, verification

When converting a read-only local memory viewer into a management console, preserve the old browse safety as an explicit mode rather than treating it as legacy behavior. Management controls should live only in management routes, and destructive flows need a preview-first POST plus exact typed confirmation.

For rejected memory cleanup, keep the purge API narrow and internal unless there is a separate public-tool plan. The service should re-read current records, delete only `reviewStatus === "rejected"` records in the requested scope, remove retrieval rows only for actually deleted ids, and report per-id outcomes for mixed batches.

For graph inspection, use a derived projection from memory metadata rather than creating graph storage. It is enough to expose memory/source/tag/evidence nodes, metadata edges, related-memory edges from review hints or assist suggestions, and warnings for missing related ids. Render it with GET-only filters and no mutation controls.

Final verification should include both evidence files and independent reviewer gates. Product identity grep should separate current product surface from historical `.agent-state` notes so old retrospectives do not block a successful rename.
