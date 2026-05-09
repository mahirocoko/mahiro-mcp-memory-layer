import type { MemoryReviewDecision, MemoryVerificationEvidence } from "../memory/types.js";
import type {
  MemoryGraph,
  MemoryGraphBuildOptions,
  MemoryGraphEdge,
  MemoryGraphInputMemory,
  MemoryGraphNode,
  MemoryGraphRelatedInput,
  MemoryGraphRelationSource,
  MemoryGraphWarning,
} from "./types.js";

const nodeTypeOrder: Record<MemoryGraphNode["type"], number> = {
  memory: 0,
  source: 1,
  tag: 2,
  evidence: 3,
};

const edgeTypeOrder: Record<MemoryGraphEdge["type"], number> = {
  has_source: 0,
  tagged_with: 1,
  has_evidence: 2,
  reviewed_as: 3,
  related_memory: 4,
};

export function buildMemoryGraph(
  memories: readonly MemoryGraphInputMemory[],
  options: MemoryGraphBuildOptions = {},
): MemoryGraph {
  const nodes = new Map<string, MemoryGraphNode>();
  const edges = new Map<string, MemoryGraphEdge>();
  const warnings: MemoryGraphWarning[] = [];
  const memoryIds = new Set(memories.map((memory) => memory.id));

  for (const memory of sortById(memories)) {
    const memoryNodeId = memoryNodeKey(memory.id);
    const reviewDecisions = memory.reviewDecisions ?? [];
    const verificationEvidence = memory.verificationEvidence ?? [];
    nodes.set(memoryNodeId, {
      id: memoryNodeId,
      type: "memory",
      label: memory.id,
      memoryId: memory.id,
      metadata: compactMetadata({
        kind: memory.kind,
        scope: memory.scope,
        projectId: memory.projectId,
        containerId: memory.containerId,
        verificationStatus: memory.verificationStatus,
        reviewStatus: memory.reviewStatus,
        importance: memory.importance,
        createdAt: memory.createdAt,
        updatedAt: memory.updatedAt,
      }),
    });

    const sourceNodeId = sourceNodeKey(memory.source);
    nodes.set(sourceNodeId, {
      id: sourceNodeId,
      type: "source",
      label: sourceLabel(memory.source.type, memory.source.uri, memory.source.title),
      metadata: compactMetadata({
        sourceType: memory.source.type,
        uri: memory.source.uri,
        title: memory.source.title,
      }),
    });
    addEdge(edges, "has_source", memoryNodeId, sourceNodeId, "has source");

    for (const tag of [...memory.tags].sort(compareText)) {
      const tagNodeId = tagNodeKey(tag);
      nodes.set(tagNodeId, { id: tagNodeId, type: "tag", label: tag, metadata: { tag } });
      addEdge(edges, "tagged_with", memoryNodeId, tagNodeId, "tagged with");
    }

    for (const evidence of collectEvidence(verificationEvidence, reviewDecisions)) {
      const evidenceNodeId = evidenceNodeKey(evidence);
      nodes.set(evidenceNodeId, {
        id: evidenceNodeId,
        type: "evidence",
        label: `${evidence.type}: ${evidence.value}`,
        metadata: compactMetadata({ evidenceType: evidence.type, value: evidence.value, note: evidence.note }),
      });
      addEdge(edges, "has_evidence", memoryNodeId, evidenceNodeId, "has evidence");
    }

    for (const decision of [...reviewDecisions].sort(compareReviewDecision)) {
      addEdge(edges, "reviewed_as", memoryNodeId, memoryNodeId, decision.action, {
        action: decision.action,
        decidedAt: decision.decidedAt,
        note: decision.note,
      });
    }
  }

  for (const relatedInput of sortRelatedInputs(options.related ?? [])) {
    if (!memoryIds.has(relatedInput.memoryId)) {
      continue;
    }

    for (const hint of [...(relatedInput.hints ?? [])].sort((left, right) => compareText(left.type, right.type))) {
      for (const relatedMemoryId of [...hint.relatedMemoryIds].sort(compareText)) {
        addRelatedEdgeOrWarning({
          edges,
          warnings,
          memoryIds,
          memoryId: relatedInput.memoryId,
          relatedMemoryId,
          relationSource: "review_hint",
          relationType: hint.type,
          label: hint.type,
          metadata: { hintType: hint.type, note: hint.note },
        });
      }
    }

    for (const suggestion of [...(relatedInput.assistSuggestions ?? [])].sort((left, right) => compareText(left.kind, right.kind))) {
      for (const relatedMemoryId of [...suggestion.relatedMemoryIds].sort(compareText)) {
        addRelatedEdgeOrWarning({
          edges,
          warnings,
          memoryIds,
          memoryId: relatedInput.memoryId,
          relatedMemoryId,
          relationSource: "review_assist_suggestion",
          relationType: suggestion.kind,
          label: suggestion.kind,
          metadata: {
            suggestionKind: suggestion.kind,
            suggestedAction: suggestion.suggestedAction,
            rationale: suggestion.rationale,
          },
        });
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort(compareNode),
    edges: [...edges.values()].sort(compareEdge),
    warnings: warnings.sort(compareWarning),
  };
}

function sourceNodeKey(source: MemoryGraphInputMemory["source"]): string {
  return `source:${source.type}:${source.uri ?? ""}:${source.title ?? ""}`;
}

function tagNodeKey(tag: string): string {
  return `tag:${tag}`;
}

function evidenceNodeKey(evidence: MemoryVerificationEvidence): string {
  return `evidence:${evidence.type}:${evidence.value}`;
}

function memoryNodeKey(memoryId: string): string {
  return `memory:${memoryId}`;
}

function sourceLabel(type: string, uri: string | undefined, title: string | undefined): string {
  return title ?? uri ?? type;
}

function collectEvidence(
  verificationEvidence: readonly MemoryVerificationEvidence[],
  reviewDecisions: readonly MemoryReviewDecision[],
): readonly MemoryVerificationEvidence[] {
  return [
    ...verificationEvidence,
    ...reviewDecisions.flatMap((decision) => decision.evidence ?? []),
  ].sort(compareEvidence);
}

function addEdge(
  edges: Map<string, MemoryGraphEdge>,
  type: MemoryGraphEdge["type"],
  source: string,
  target: string,
  label?: string,
  metadata?: Readonly<Record<string, string | number | boolean | undefined>>,
): void {
  const edge = {
    id: edgeKey(type, source, target, label),
    type,
    source,
    target,
    label,
    metadata: metadata ? compactMetadata(metadata) : undefined,
  } satisfies MemoryGraphEdge;

  edges.set(edge.id, edge);
}

function edgeKey(type: MemoryGraphEdge["type"], source: string, target: string, qualifier: string | undefined): string {
  return `${type}:${source}->${target}${qualifier ? `:${qualifier}` : ""}`;
}

function addRelatedEdgeOrWarning(input: {
  readonly edges: Map<string, MemoryGraphEdge>;
  readonly warnings: MemoryGraphWarning[];
  readonly memoryIds: ReadonlySet<string>;
  readonly memoryId: string;
  readonly relatedMemoryId: string;
  readonly relationSource: MemoryGraphRelationSource;
  readonly relationType: string;
  readonly label: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | undefined>>;
}): void {
  if (!input.memoryIds.has(input.relatedMemoryId)) {
    input.warnings.push({
      type: "missing_related_memory",
      memoryId: input.memoryId,
      relatedMemoryId: input.relatedMemoryId,
      relationSource: input.relationSource,
      relationType: input.relationType,
      message: `Related memory ${input.relatedMemoryId} referenced by ${input.memoryId} was not included in the graph input.`,
    });
    return;
  }

  addEdge(
    input.edges,
    "related_memory",
    memoryNodeKey(input.memoryId),
    memoryNodeKey(input.relatedMemoryId),
    input.label,
    { ...input.metadata, relationSource: input.relationSource, relationType: input.relationType },
  );
}

function compactMetadata(
  metadata: Readonly<Record<string, string | number | boolean | undefined>>,
): Readonly<Record<string, string | number | boolean>> | undefined {
  const entries = Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sortById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => compareText(left.id, right.id));
}

function sortRelatedInputs(inputs: readonly MemoryGraphRelatedInput[]): readonly MemoryGraphRelatedInput[] {
  return [...inputs].sort((left, right) => compareText(left.memoryId, right.memoryId));
}

function compareNode(left: MemoryGraphNode, right: MemoryGraphNode): number {
  const typeDifference = nodeTypeOrder[left.type] - nodeTypeOrder[right.type];
  return typeDifference !== 0 ? typeDifference : compareText(left.id, right.id);
}

function compareEdge(left: MemoryGraphEdge, right: MemoryGraphEdge): number {
  const sourceDifference = compareText(left.source, right.source);
  if (sourceDifference !== 0) {
    return sourceDifference;
  }

  const typeDifference = edgeTypeOrder[left.type] - edgeTypeOrder[right.type];
  if (typeDifference !== 0) {
    return typeDifference;
  }

  const targetDifference = compareText(left.target, right.target);
  return targetDifference !== 0 ? targetDifference : compareText(left.id, right.id);
}

function compareWarning(left: MemoryGraphWarning, right: MemoryGraphWarning): number {
  return compareText(
    `${left.memoryId}\u0000${left.relatedMemoryId}\u0000${left.relationSource}\u0000${left.relationType}`,
    `${right.memoryId}\u0000${right.relatedMemoryId}\u0000${right.relationSource}\u0000${right.relationType}`,
  );
}

function compareEvidence(left: MemoryVerificationEvidence, right: MemoryVerificationEvidence): number {
  return compareText(evidenceNodeKey(left), evidenceNodeKey(right));
}

function compareReviewDecision(left: MemoryReviewDecision, right: MemoryReviewDecision): number {
  return compareText(`${left.action}\u0000${left.decidedAt}`, `${right.action}\u0000${right.decidedAt}`);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
