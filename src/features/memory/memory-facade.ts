import {
  prepareHostTurnMemoryInputSchema,
  wakeUpMemoryInputSchema,
} from "./schemas.js";
import type {
  ApplyConservativeMemoryPolicyInput,
  ApplyConservativeMemoryPolicyResult,
  BuildContextForTaskInput,
  BuildContextForTaskResult,
  PrepareHostTurnMemoryInput,
  PrepareHostTurnMemoryResult,
  PrepareTurnMemoryInput,
  PrepareTurnMemoryResult,
  RetrievalTraceProvenance,
  WakeUpMemoryInput,
  WakeUpMemoryResult,
} from "./types.js";

export interface MemoryFacade {
  readonly wakeUpMemory: (
    payload: WakeUpMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ) => Promise<WakeUpMemoryResult>;
  readonly prepareHostTurnMemory: (
    payload: PrepareHostTurnMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ) => Promise<PrepareHostTurnMemoryResult>;
  readonly prepareTurnMemory: (
    payload: PrepareTurnMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ) => Promise<PrepareTurnMemoryResult>;
}

interface MemoryFacadeDependencies {
  readonly buildContext: (
    payload: BuildContextForTaskInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ) => Promise<BuildContextForTaskResult>;
  readonly applyConservativeMemoryPolicy: (
    payload: ApplyConservativeMemoryPolicyInput,
  ) => Promise<ApplyConservativeMemoryPolicyResult>;
}

export function createMemoryFacade(dependencies: MemoryFacadeDependencies): MemoryFacade {
  const wakeUpMemory = async (
    payload: WakeUpMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<WakeUpMemoryResult> => {
    const parsed = wakeUpMemoryInputSchema.parse(payload);
    const base = {
      userId: parsed.userId,
      projectId: parsed.projectId,
      containerId: parsed.containerId,
      sessionId: parsed.sessionId,
      maxItems: parsed.maxItems,
      maxChars: parsed.maxChars,
    };
    const [profile, recent] = await Promise.all([
      dependencies.buildContext({
        ...base,
        task: "Summarize stable user and project context for session startup.",
        mode: "profile",
      }, buildTracePhase(traceProvenance, "wake-up-profile")),
      dependencies.buildContext({
        ...base,
        task: "Summarize recent user and project activity for session startup.",
        mode: "recent",
      }, buildTracePhase(traceProvenance, "wake-up-recent")),
    ]);
    const wakeUpContext = `${profile.context}\n\n---\n\n${recent.context}`;

    return {
      wakeUpContext,
      profile,
      recent,
      truncated: profile.truncated || recent.truncated,
      degraded: profile.degraded || recent.degraded,
    };
  };

  const prepareHostTurnMemory = async (
    payload: PrepareHostTurnMemoryInput,
    traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
  ): Promise<PrepareHostTurnMemoryResult> => {
    const parsed = prepareHostTurnMemoryInputSchema.parse(payload);
    const buildPayload: BuildContextForTaskInput = {
      task: parsed.task,
      mode: parsed.mode,
      userId: parsed.userId,
      projectId: parsed.projectId,
      containerId: parsed.containerId,
      sessionId: parsed.sessionId,
      maxItems: parsed.maxItems,
      maxChars: parsed.maxChars,
      includeMemorySuggestions: true,
      recentConversation: parsed.recentConversation,
      suggestionMaxCandidates: parsed.suggestionMaxCandidates,
    };
    const built = await dependencies.buildContext(
      buildPayload,
      buildTracePhase(traceProvenance, traceProvenance?.phase ?? "prepare-host-turn"),
    );
    const memorySuggestions = built.memorySuggestions;

    if (!memorySuggestions) {
      throw new Error(
        "internal: expected memorySuggestions from build_context_for_task with includeMemorySuggestions",
      );
    }

    const conservativePolicy = await dependencies.applyConservativeMemoryPolicy({
      suggestion: memorySuggestions,
      userId: parsed.userId,
      projectId: parsed.projectId,
      containerId: parsed.containerId,
      sessionId: parsed.sessionId,
      sourceOverride: parsed.sourceOverride,
      extraTags: parsed.extraTags,
    });

    return {
      context: built.context,
      items: built.items,
      truncated: built.truncated,
      degraded: built.degraded,
      memorySuggestions,
      conservativePolicy,
    };
  };

    return {
      wakeUpMemory,
      prepareHostTurnMemory,
      prepareTurnMemory: (
        payload: PrepareTurnMemoryInput,
        traceProvenance?: Omit<RetrievalTraceProvenance, "searchScope">,
      ) =>
        prepareHostTurnMemory(
          payload,
          buildTracePhase(traceProvenance, traceProvenance?.phase ?? "prepare-turn"),
        ),
    };
}

function buildTracePhase(
  traceProvenance: Omit<RetrievalTraceProvenance, "searchScope"> | undefined,
  phase: string,
): Omit<RetrievalTraceProvenance, "searchScope"> | undefined {
  if (!traceProvenance) {
    return undefined;
  }

  return {
    ...traceProvenance,
    phase,
  };
}
