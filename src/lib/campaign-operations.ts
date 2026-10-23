export type OperationKind = "claim" | "attack";
export interface CampaignOperation {
  attacker_id: string;
  kind: string;
  resolved_at: string | null;
}

/** Neutral expansion and player combat each have their own active-operation limit. */
export function operationBlocked(operations: CampaignOperation[], userId: string, kind: OperationKind) {
  return operations.some((operation) => operation.attacker_id === userId && operation.kind === kind && !operation.resolved_at);
}