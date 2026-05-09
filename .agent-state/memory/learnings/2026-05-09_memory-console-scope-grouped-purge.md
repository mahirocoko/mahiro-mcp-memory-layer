# Lesson: Group destructive memory actions by stored scope

Tags: memory-console, purge, ux, guardrails, scope

When rejected records already contain scope metadata, the console should infer purge scope from the records and group the UI by that stored boundary. Users should not manually enter `projectId` or `containerId` just to delete records the system already knows how to scope.

For guarded destructive flows, backend validation is necessary but not enough. A good UI prevents invalid mixed-scope submissions by construction, explains non-purgeable records before submission, and reserves backend `skipped_scope_mismatch` for hostile or malformed requests rather than normal human interaction.

Concrete pattern:

- Global rejected records render inside a global purge preview form.
- Complete project rejected records render inside a project-specific purge preview form with hidden exact scope fields.
- Records missing complete scope metadata remain visible for inspection but do not render purge checkboxes.
- Final destructive confirmation remains exact and server-enforced.
