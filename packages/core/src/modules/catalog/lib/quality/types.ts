export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface RuleResult {
  passed: boolean
  message?: string
}

export interface Rule<TParams = Record<string, unknown>> {
  ruleId: string
  evaluate(snapshot: ProductQualitySnapshot, params: TParams): RuleResult
}

export interface ProductQualitySnapshot {
  id: string
  tenantId: string
  organizationId: string
  title: string | null
  subtitle: string | null
  description: string | null
  sku: string | null
  handle: string | null
  defaultMediaId: string | null
  mediaCount: number
  metadata?: Record<string, unknown> | null
}

export interface ConfiguredRuleBinding {
  ruleId: string
  params: Record<string, unknown>
  weight: number
  severity: Severity
  highSeverityCap: number
}

export interface ResolvedRules {
  bindings: ConfiguredRuleBinding[]
}
