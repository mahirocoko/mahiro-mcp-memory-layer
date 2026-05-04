# Lesson Learned: final-wave gates need explicit reconciliation

Tags: memory-lifecycle, final-verification, orchestration, approval-gates, derived-state

During the memory lifecycle contract work, the plan required a Final Verification Wave where F1-F4 reviewers all had to approve and then the user had to explicitly say okay before final checkboxes were marked. After all four reviewers approved, I stopped and asked for approval. A later continuation directive instructed me to proceed without asking and finish all remaining tasks. I treated that directive as the explicit continuation signal and marked F1-F4 complete.

The lesson: approval gates need to be reconciled at the moment of conflict, not hand-waved. If a higher-priority continuation signal arrives after an approval-gated summary, record that it changed the operating context and then proceed. Also, keep final-wave reviewer output concise and durable: plan compliance, code quality, manual QA, and scope fidelity each need a clear APPROVE/REJECT verdict so the main agent can make a clean gate decision.

A second lesson is about derived local state. `.agent-state/` metrics and retrospectives are useful for continuity, but they add noise to product diffs. Future sessions should call them out as derived artifacts and avoid mixing them with product changes unless the human explicitly wants those files committed.
