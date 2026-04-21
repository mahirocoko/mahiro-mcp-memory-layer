import { suggestMemoryCandidates } from "./suggest-memory-candidates.js";
import type {
  ApplyConservativeMemoryPolicyInput,
  ApplyConservativeMemoryPolicyResult,
  MemorySuggestionCandidate,
  RememberInput,
  SuggestMemoryCandidatesInput,
  SuggestMemoryCandidatesResult,
} from "../types.js";

function scopeIdsComplete(
  scope: MemorySuggestionCandidate["scope"],
  input: Pick<
    ApplyConservativeMemoryPolicyInput,
    "projectId" | "containerId"
  >,
): boolean {
  switch (scope) {
    case "global":
      return true;
    case "project":
      return Boolean(input.projectId && input.containerId);
    default:
      return false;
  }
}

function toRememberInput(
  candidate: MemorySuggestionCandidate,
  input: ApplyConservativeMemoryPolicyInput,
): RememberInput {
  const base = {
    content: candidate.draftContent,
    kind: candidate.kind,
    scope: candidate.scope,
    projectId: input.projectId,
    containerId: input.containerId,
    source: input.sourceOverride ?? { type: "tool" as const, title: "apply_conservative_memory_policy" },
    tags: [...(input.extraTags ?? []), "conservative_auto_save", "strong_candidate"],
    summary: candidate.reason,
  };
  return base;
}

/**
 * Runs `suggest_memory_candidates` (unless `suggestion` is provided), then applies the conservative save policy:
 * - `strong_candidate` → auto-`remember` each candidate whose scope ids are complete (see scope rules in `assertValidScope`)
 * - `consider_saving` → no writes; same candidates returned as `reviewOnlySuggestions`
 * - `likely_skip` → no writes
 */
export async function applyConservativeMemoryPolicy(input: {
  readonly payload: ApplyConservativeMemoryPolicyInput;
  readonly remember: (payload: RememberInput) => Promise<{ readonly id: string }>;
}): Promise<ApplyConservativeMemoryPolicyResult> {
  const suggestion: SuggestMemoryCandidatesResult =
    input.payload.suggestion ??
    suggestMemoryCandidates(toSuggestInput(input.payload));

  const { recommendation, signals, candidates } = suggestion;

  if (recommendation === "likely_skip") {
    return {
      recommendation,
      signals,
      candidates,
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [],
    };
  }

  if (recommendation === "consider_saving") {
    return {
      recommendation,
      signals,
      candidates,
      autoSaved: [],
      autoSaveSkipped: [],
      reviewOnlySuggestions: [...candidates],
    };
  }

  const autoSaved: { candidateIndex: number; id: string }[] = [];
  const autoSaveSkipped: { candidateIndex: number; reason: "incomplete_scope_ids" }[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    if (!scopeIdsComplete(candidate.scope, input.payload)) {
      autoSaveSkipped.push({ candidateIndex: i, reason: "incomplete_scope_ids" });
      continue;
    }
    const rememberPayload = toRememberInput(candidate, input.payload);
    const out = await input.remember(rememberPayload);
    autoSaved.push({ candidateIndex: i, id: out.id });
  }

  return {
    recommendation,
    signals,
    candidates,
    autoSaved,
    autoSaveSkipped,
    reviewOnlySuggestions: [],
  };
}

function toSuggestInput(payload: ApplyConservativeMemoryPolicyInput): SuggestMemoryCandidatesInput {
  const conversation = payload.conversation?.trim() ?? "";
  return {
    conversation,
    projectId: payload.projectId,
    containerId: payload.containerId,
    maxCandidates: payload.maxCandidates,
  };
}
