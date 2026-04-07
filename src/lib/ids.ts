/** Matches IDs from {@link newId} with prefix `"workflow"` (hyphenless lowercase UUID). */
export const WORKFLOW_REQUEST_ID_PATTERN = /^workflow_[0-9a-f]{32}$/;

export function isWorkflowRequestId(value: string): boolean {
  return WORKFLOW_REQUEST_ID_PATTERN.test(value);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}
