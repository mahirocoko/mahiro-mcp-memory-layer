# Lesson Learned — Memory Console React Stack

Tags: memory-console, validation, final-wave, orchestration

When modernizing a UI around destructive or guarded memory-console actions, broad success signals are not enough. Typecheck, full tests, build, and browser QA can all pass while a JSON endpoint still accepts malformed payloads in a dangerous way. The concrete lesson from this session: array validation for destructive actions must fail closed. Do not filter invalid entries out of a client-provided `ids` array and proceed with the remaining valid IDs; reject the entire payload and prove the writer was not called.

For final verification, keep reviewer reruns surgical. If F2 code quality rejects one validation bug while F1/F3/F4 approve, fix the blocker, independently verify it, then rerun F2 in the same session instead of restarting the whole final wave.
