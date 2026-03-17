export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface RuleResult {
  passed: boolean
  message?: string
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
  /** Unique key for this binding — DB entity UUID. Used as the results map key. */
  bindingKey: string
  /** Human-readable rule identifier (e.g., 'quality.title.required'). Informational only. */
  ruleId: string
  conditionExpression: Record<string, unknown>
  weight: number
  severity: Severity
  highSeverityCap: number
}

export interface ResolvedRules {
  bindings: ConfiguredRuleBinding[]
}
