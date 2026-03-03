# SPEC-008: Catalog Product Quality Engine

**Created:** 2026-01-27 · **Revised:** 2026-02-28  
**Module:** `catalog` — `packages/core/src/modules/catalog/`  
**Status:** V1 Implementation Ready

---

## TLDR

The Product Quality Engine (PQE) replaces the original simple dashboard widget with a proper, database-driven quality evaluation system focusing on Product entities for V1 simplicity.

## Overview
The Product Quality Engine (PQE) replaces the original simple dashboard widget with a proper,
database-driven quality evaluation system. It focuses on Product entities for V1 simplicity
and keeps the data within the Catalog module.

> **Core principle:** Rule validation logic (classes) is written in TypeScript for performance
> and flexibility. Rule configuration (weight, severity, scope parameters) lives in the DB.
> Administrators can configure and mix these predefined logical classes via the Admin Panel.

### Problem Statement & Design Decision

For V1, all rules apply to all products within the tenant. There is no concept of category or channel scoping yet, in order to keep the implementation extremely simple and fast.
Future iterations may introduce scope targeting.

### Proposed Solution (V1 Scope)
- One configuration table: `catalog_data_quality_rules` (Entity: `CatalogDataQualityRule`)
- Rules apply to all products within the tenant
- Hardcoded rule classes in TypeScript: `attr.required`, `media.min_count`, `attr.min_length`
  - `attr.has_value` is **deferred to V2** (requires tags input in UI, no default seed usage)
- **Admin Panel Configuration:** Users CAN add new rules from the UI by selecting one of the pre-coded TypeScript rule classes (e.g., "Minimum media count"), severity, and weight.
- Async evaluation worker triggered by product save events
- Simple Admin Panel UI: DataTable + CrudForm at `/backend/catalog/quality/rules`
- Dashboard widget: "Catalog Health" — shows products with lowest quality scores
- Default rules seeded at setup (no manual configuration required for initial use)
- `search.ts` — **not required for V1** (quality scores are not fulltext-searchable)
- `translations.ts` — **not required for V1** (`label` is an admin field, not user-facing translated content)


---

## Architecture

### Component Structure

**File Structure**
```
packages/core/src/modules/catalog/
├── data/
│   ├── entities.ts                        # +CatalogDataQualityRule, +CatalogDataQualityScore
│   └── validators.ts                      # +createRuleSchema, updateRuleSchema (Zod)
├── lib/
│   └── quality/
│       ├── types.ts                       # Rule, RuleResult, Severity, Grade, Snapshot, Binding
│       ├── rules/
│       │   ├── attr-required.rule.ts
│       │   ├── media-min-count.rule.ts
│       │   └── attr-min-length.rule.ts    # attr.has_value deferred to V2
│       ├── registry.ts                    # RuleRegistry + getParamFields()
│       ├── resolver.ts                    # ConfiguredRuleResolver
│       ├── calculator.ts                  # ScoreCalculator — 2-phase algorithm
│       └── evaluation.service.ts          # QualityEvaluationService
├── workers/
│   └── quality-evaluation.worker.ts
├── subscribers/
│   └── quality-trigger.subscriber.ts
├── acl.ts                                 # +catalog.quality.view/manage, catalog.widgets.catalog-health
├── di.ts                                  # +QualityEvaluationService, ConfiguredRuleResolver, RuleRegistry
├── events.ts                              # +catalog.quality_score.updated/degraded
├── setup.ts                               # +seedDefaults for default rules, defaultRoleFeatures updates
├── api/
│   ├── openapi.ts                         # shared buildCatalogCrudOpenApi factory
│   ├── catalog/
│   │   ├── dashboard/
│   │   │   └── widgets/
│   │   │       ├── utils.ts               # re-exports resolveWidgetScope
│   │   │       └── catalog-health/
│   │   │           └── route.ts           # GET /api/catalog/dashboard/widgets/catalog-health
│   │   └── quality/
│   │       ├── openapi.ts                 # buildQualityCrudOpenApi factory
│   │       └── rules/
│   │           ├── route.ts               # GET (list) + POST (create)
│   │           └── [id]/route.ts          # GET + PATCH + DELETE
│   │       # summary/, products/, products/[id]/ — deferred to V2 (reporting page)
├── components/
│   └── quality/
│       └── QualityRulesDataTable.tsx
├── backend/
│   └── catalog/
│       └── quality/
│           └── rules/
│               ├── page.tsx
│               ├── page.meta.ts
│               ├── create/
│               │   ├── page.tsx
│               │   └── page.meta.ts
│               └── [id]/
│                   └── edit/
│                       ├── page.tsx
│                       └── page.meta.ts
└── widgets/
    └── dashboard/
        └── catalog-health/
            ├── config.ts
            ├── widget.ts
            └── widget.client.tsx
```

---

**Core Types (`lib/quality/types.ts`)**
```typescript
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
  metadata?: Record<string, unknown>
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
```

---

**Rule Implementations (`lib/quality/rules/`)**
#### 5.1 `attr.required`
```typescript
// params: { field: keyof ProductQualitySnapshot }
// Passes if snapshot[field] is non-null and non-empty string
```

#### 5.2 `media.min_count`
```typescript
// params: { min: number }   default: 1
// Passes if snapshot.mediaCount >= params.min
```

#### 5.3 `attr.min_length`
```typescript
// params: { field: string, minLength: number }
// Passes if (snapshot[field] as string)?.length >= params.minLength
```

> **V2:** `attr.has_value` — deferred. Would require a tags-input UI component and has no seed usage.

#### RuleRegistry (`lib/quality/registry.ts`)

```typescript
export type RuleParamField = {
  id: string           // param key, e.g. 'field', 'minLength', 'min'
  label: string
  type: 'text' | 'number' | 'select'
  options?: Array<{ value: string; label: string }>
  required?: boolean
}

export class RuleRegistry {
  private rules = new Map<string, Rule>()
  private paramFields = new Map<string, RuleParamField[]>()

  register(rule: Rule, params: RuleParamField[]): void {
    this.rules.set(rule.ruleId, rule)
    this.paramFields.set(rule.ruleId, params)
  }

  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId)
  }

  listIds(): string[] {
    return Array.from(this.rules.keys())
  }

  // Used by Admin Panel form to render correct param fields per ruleId
  getParamFields(ruleId: string): RuleParamField[] {
    return this.paramFields.get(ruleId) ?? []
  }
}
```

---

**ConfiguredRuleResolver (`lib/quality/resolver.ts`)**
The resolver loads all tenant-wide active rules for the given tenant and organization.
In V1 there is no scoping so we do a direct map — no deduplication logic.

```typescript
export class ConfiguredRuleResolver {
  constructor(private em: EntityManager) {}

  async resolve(
    tenantId: string,
    organizationId: string
  ): Promise<ResolvedRules> {
    const rules = await this.em.find(CatalogDataQualityRule, {
      tenantId,
      organizationId,
      isActive: true,
      deletedAt: null,
    })

    return { bindings: rules.map(toBinding) }
  }
}

function toBinding(rule: CatalogDataQualityRule): ConfiguredRuleBinding {
  return {
    ruleId: rule.ruleId,
    params: rule.params,
    weight: parseFloat(rule.weight),
    severity: rule.severity as Severity,
    highSeverityCap: rule.highSeverityCap,
  }
}
```

---

**QualityEvaluationService — Public Contract (`lib/quality/evaluation.service.ts`)**

```typescript
export class QualityEvaluationService {
  constructor(
    private em: EntityManager,
    private resolver: ConfiguredRuleResolver,
    private registry: RuleRegistry,
  ) {}

  /**
   * Evaluates one product and UPSERTs its quality score.
   * - Loads snapshot from catalog_products + media count
   * - Resolves active rule bindings via ConfiguredRuleResolver
   * - Runs each registered rule (try/catch per rule; failed rule = passed:false with error message)
   * - Calculates score + grade via calculateScore()
   * - UPSERTs CatalogDataQualityScore (unique on productId + tenantId)
   * - Returns { score, grade, previousScore } for event emission
   */
  async evaluateProduct(productId: string): Promise<{ score: number; grade: Grade; previousScore: number | null }>
}
```

---

**ScoreCalculator (`lib/quality/calculator.ts`)**
**Phase 1 — Weighted Aggregation** (LOW + MEDIUM rules only):
```
weightedPassed = Σ weight of passed LOW/MEDIUM bindings
totalWeight    = Σ weight of all LOW/MEDIUM bindings
score          = round((weightedPassed / totalWeight) * 100)   → 100 if totalWeight = 0
```

**Phase 2 — Restriction** (applied in order, first matching wins):
1. Any failed `BLOCKER` → `score = 0`
2. Any failed `HIGH` → `score = min(score, min(highSeverityCap of all failed HIGH bindings))`
3. `INFO` → recorded in violations, never affect score

**Grade thresholds:**

| Score | Grade |
|-------|-------|
| ≥ 90 | A |
| ≥ 75 | B |
| ≥ 60 | C |
| ≥ 40 | D |
| < 40 | F |

```typescript
export function calculateScore(
  bindings: ConfiguredRuleBinding[],
  results: Record<string, RuleResult>
): { score: number; grade: Grade } {
  const lowMed = bindings.filter(b => b.severity === 'LOW' || b.severity === 'MEDIUM')
  const totalWeight = lowMed.reduce((s, b) => s + b.weight, 0)
  const passedWeight = lowMed
    .filter(b => results[b.ruleId]?.passed)
    .reduce((s, b) => s + b.weight, 0)

  let score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100

  const failed = bindings.filter(b => !results[b.ruleId]?.passed)

  if (failed.some(b => b.severity === 'BLOCKER')) {
    score = 0
  } else {
    const failedHigh = failed.filter(b => b.severity === 'HIGH')
    if (failedHigh.length > 0) {
      score = Math.min(score, Math.min(...failedHigh.map(b => b.highSeverityCap)))
    }
  }

  const grade: Grade =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 60 ? 'C' :
    score >= 40 ? 'D' : 'F'

  return { score, grade }
}
```

---

### Data Flow

#### Events (`events.ts`)

> **BC Contract — FROZEN:** Event IDs below are immutable once shipped. Payload fields are additive-only. See `BACKWARD_COMPATIBILITY.md` § Event IDs.

```typescript
import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  {
    id: 'catalog.quality_score.updated',
    label: 'Quality Score Updated',
    entity: 'quality_score',
    category: 'crud',
    description: 'Emitted after every successful quality evaluation.',
  },
  {
    id: 'catalog.quality_score.degraded',
    label: 'Quality Score Degraded',
    entity: 'quality_score',
    category: 'lifecycle',
    description: 'Emitted when the new score is lower than the previous score.',
  },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'catalog', events })
export const emitCatalogQualityEvent = eventsConfig.emit
export type CatalogQualityEventId = typeof events[number]['id']
export default eventsConfig
```

#### Subscriber (`subscribers/quality-trigger.subscriber.ts`)
Listens to `catalog.product.updated` + `catalog.product.created`.
Enqueues: `{ type: 'catalog.data_quality_score.evaluate', productId }`.

#### Worker (`workers/quality-evaluation.worker.ts`)

```typescript
export const metadata = {
  queue: 'catalog.quality_evaluation',
  id: 'catalog-quality-evaluation',
  concurrency: 2,  // I/O-bound: DB reads + writes only
}
```

- Must export `id` — required by worker auto-discovery convention.
- Calls `QualityEvaluationService.evaluateProduct(productId)`
- UPSERTs into `catalog_quality_scores`
- Emits `catalog.quality_score.updated` after every evaluation; additionally emits `catalog.quality_score.degraded` when `score < previousScore`
- Job is idempotent: re-processing the same `productId` is safe (UPSERT on unique constraint)
- If `evaluateProduct` throws, the queue retries up to **3 times** with exponential backoff; after exhaustion the job is dead-lettered
- Processes one product per job (no batch in V1)

---

### Permission Model

```typescript
// Add to existing catalog features array:
{ id: 'catalog.quality.view',           title: 'View product quality data', module: 'catalog' },
{ id: 'catalog.quality.manage',         title: 'Manage quality rules',      module: 'catalog' },
{ id: 'catalog.widgets.catalog-health', title: 'Catalog health widget',     module: 'catalog' },
```

---

## Data Models

### 3.1 Entity: CatalogDataQualityRule

```typescript
// packages/core/src/modules/catalog/data/entities.ts

@Entity({ tableName: 'catalog_data_quality_rules' })
@Index({ name: 'dqe_rules_tenant_org_idx', properties: ['organizationId', 'tenantId'] })
export class CatalogDataQualityRule {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Registered rule class ID, e.g. 'attr.required', 'media.min_count'
  @Property({ name: 'rule_id', type: 'text' })
  ruleId!: string

  // Human-readable label for Admin Panel and reports
  @Property({ type: 'text', nullable: true })
  label?: string | null

  // 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER'
  @Property({ type: 'text', default: 'MEDIUM' })
  severity: string = 'MEDIUM'

  // Weight in score aggregation Phase 1 (LOW + MEDIUM rules)
  @Property({ type: 'numeric', precision: 5, scale: 2, default: '1.0' })
  weight: string = '1.0'

  // Rule-specific parameters, e.g. { "field": "description", "minLength": 20 }
  @Property({ type: 'jsonb', default: '{}' })
  params: Record<string, unknown> = {}

  // Max score cap when a HIGH severity rule fails.
  // Resolution in calculator: min(highSeverityCap of all failed HIGH bindings).
  // Relevant only when severity = 'HIGH'. Default 40.
  @Property({ name: 'high_severity_cap', type: 'smallint', default: 40 })
  highSeverityCap: number = 40

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
```

### 3.2 Entity: CatalogDataQualityScore

```typescript
@Entity({ tableName: 'catalog_data_quality_scores' })
@Unique({ name: 'dqe_scores_product_tenant_unique', properties: ['productId', 'tenantId'] })
@Index({ name: 'dqe_scores_score_idx', properties: ['score'] })
@Index({ name: 'dqe_scores_grade_idx', properties: ['grade'] })
@Index({ name: 'dqe_scores_tenant_org_idx', properties: ['organizationId', 'tenantId'] })
export class CatalogDataQualityScore {
  [OptionalProps]?: 'evaluatedAt' | 'violations'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'smallint' })
  score!: number // 0–100

  @Property({ type: 'char' })
  grade!: string // 'A'|'B'|'C'|'D'|'F'

  // Map of ruleId → { passed, message }
  @Property({ type: 'jsonb', default: '{}' })
  violations: Record<string, { passed: boolean; message?: string }> = {}

  @Property({ name: 'evaluated_at', type: Date })
  evaluatedAt!: Date
}
```

---

## API Contracts

### Validators (`data/validators.ts`)

All Zod schemas live in `data/validators.ts` per platform convention. The `openapi.ts` factory imports from there.

```typescript
// packages/core/src/modules/catalog/data/validators.ts
import { z } from 'zod'

export const severityEnum = z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKER'])

export const createQualityRuleSchema = z.object({
  ruleId:          z.string().min(1),
  label:           z.string().nullable().optional(),
  severity:        severityEnum.default('MEDIUM'),
  weight:          z.number().min(0.1).max(10).default(1.0),
  params:          z.record(z.unknown()).default({}),
  highSeverityCap: z.number().int().min(0).max(100).default(40),
  isActive:        z.boolean().default(true),
})

export const updateQualityRuleSchema = createQualityRuleSchema.partial()

export const qualityRuleItemSchema = z.object({
  id:              z.string(),
  ruleId:          z.string(),
  label:           z.string().nullable(),
  severity:        severityEnum,
  weight:          z.number(),
  params:          z.record(z.unknown()),
  highSeverityCap: z.number(),
  isActive:        z.boolean(),
  createdAt:       z.string(),
  updatedAt:       z.string(),
})

export const qualityRuleListQuerySchema = z.object({
  page:     z.coerce.number().optional(),
  pageSize: z.coerce.number().max(100).optional(),
  isActive: z.coerce.boolean().optional(),
})
```

#### GET & POST `/api/catalog/quality/rules`

File: `api/catalog/quality/openapi.ts`
```typescript
import { createCrudOpenApiFactory } from '@open-mercato/shared/lib/openapi/crud'
import { createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/pagination'
import {
  qualityRuleItemSchema,
  qualityRuleListQuerySchema,
  createQualityRuleSchema,
  updateQualityRuleSchema,
} from '../../data/validators'

export const buildQualityCrudOpenApi = createCrudOpenApiFactory({
  defaultTag: 'CatalogDataQuality',
})

export const openApi = buildQualityCrudOpenApi({
  resourceName: 'DataQualityRule',
  querySchema: qualityRuleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(qualityRuleItemSchema),
  create: { schema: createQualityRuleSchema, description: 'Create new data quality rule' },
})

export const metadata = {
  GET:  { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  POST: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
}
```

File: `api/catalog/quality/rules/route.ts`
```typescript
// Uses makeCrudRoute with indexer for query index coverage
export default makeCrudRoute({
  entity: CatalogDataQualityRule,
  createSchema: createQualityRuleSchema,
  indexer: { entityType: 'catalog:data_quality_rule' },
  // POST: call validateCrudMutationGuard before insert
  //       call runCrudMutationGuardAfterSuccess after successful persist
})
```

#### GET / PATCH / DELETE `/api/catalog/quality/rules/[id]`
```typescript
export const openApi = buildQualityCrudOpenApi({
  resourceName: 'DataQualityRule',
  get:    { responseSchema: qualityRuleItemSchema, description: 'Get rule by ID' },
  update: { schema: updateQualityRuleSchema, responseSchema: qualityRuleItemSchema, description: 'Update data quality rule' },
  del:    { schema: z.object({}), responseSchema: z.object({}), description: 'Soft delete data quality rule' },
})

export const metadata = {
  GET:    { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  PATCH:  { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['catalog.quality.manage'] },
}
// PATCH/DELETE: call validateCrudMutationGuard before mutation
//               call runCrudMutationGuardAfterSuccess after success
// DELETE: soft-delete (sets deletedAt) — returns 204 No Content
```

---

### Quality Data API

Only the widget API endpoint is in V1 scope. The summary and product-list APIs are deferred to V2 (reporting dashboard page).

All routes require `catalog.quality.view` feature and resolve scope via
`resolveWidgetScope` from `packages/core/src/modules/customers/api/dashboard/widgets/utils.ts`
(re-exported in `api/catalog/dashboard/widgets/utils.ts` for module encapsulation).  
_Note: direct import from customers is acceptable in V1; a dedicated catalog-level scope utility can be extracted in V2._

> **V2 Deferred:**
> `GET /api/catalog/quality/summary` — aggregate health index, grade histogram  
> `GET /api/catalog/quality/products` — paginated list with filtering  
> `GET /api/catalog/quality/products/[id]` — per-product violation detail  
> These will be backed by a dedicated reporting page in V2.

#### GET `/api/catalog/dashboard/widgets/catalog-health` (V1)

### Admin Panel UI

#### Philosophy
Identical style to existing `catalog/categories` pages. No JSON editor.
Param fields are rendered dynamically based on the selected `ruleId`
via `RuleRegistry.getParamFields(ruleId)`.

#### 8.1 List Page — `/backend/catalog/quality/rules`

**DataTable columns:**

| Column | Renderer |
|--------|----------|
| `label` / `ruleId` | Text, fallback to ruleId if no label |
| `ruleId` | Badge |
| `severity` | `EnumBadge` with severity color preset |
| `weight` | Numeric |
| `isActive` | `BooleanIcon` |

**Row actions:** Edit, Toggle active (`PATCH isActive`), Delete (`useConfirmDialog` with `deleteCrud` handler)  
**Toolbar:** "Add rule" → `/backend/catalog/quality/rules/create`

*Note: Use `createCrud`, `updateCrud`, `deleteCrud` from `@open-mercato/ui/backend/crud` for all server forms instead of raw `apiCall` to handle form state and error propagation cleanly.*

```typescript
// page.meta.ts (list page)
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['catalog.quality.manage'],
  pageTitle: 'Quality Rules',
  pageGroup: 'Catalog',
  pageOrder: 50,
}
```

```typescript
// create/page.meta.ts
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['catalog.quality.manage'],
  pageTitle: 'Add Quality Rule',
  pageGroup: 'Catalog',
}
```

```typescript
// [id]/edit/page.meta.ts
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['catalog.quality.manage'],
  pageTitle: 'Edit Quality Rule',
  pageGroup: 'Catalog',
}
```

#### 8.2 Create/Edit Form Fields

```typescript
// Shared between create and edit pages via CrudForm

const fields: CrudField[] = [
  {
    id: 'ruleId',
    label: t('catalog.quality.rules.form.ruleId', 'Rule type'),
    type: 'select',
    required: true,
    options: registry.listIds().map(id => ({ value: id, label: id })),
    description: t('catalog.quality.rules.form.ruleIdHelp', 'The rule class to evaluate.'),
  },
  {
    id: 'label',
    label: t('catalog.quality.rules.form.label', 'Label'),
    type: 'text',
    description: t('catalog.quality.rules.form.labelHelp', 'Optional display name for reports.'),
  },
  {
    id: 'severity',
    label: t('catalog.quality.rules.form.severity', 'Severity'),
    type: 'select',
    required: true,
    options: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKER'].map(v => ({ value: v, label: v })),
  },
  {
    id: 'weight',
    label: t('catalog.quality.rules.form.weight', 'Weight'),
    type: 'number',
    description: t('catalog.quality.rules.form.weightHelp', '0.1–10. Applies to LOW and MEDIUM rules.'),
  },
  {
    // Shown only when severity = 'HIGH'
    id: 'highSeverityCap',
    label: t('catalog.quality.rules.form.highSeverityCap', 'Score cap'),
    type: 'number',
    description: t('catalog.quality.rules.form.highSeverityCapHelp', 'Max score when this HIGH rule fails (0–100, default 40).'),
  },
  {
    // Dynamic param fields rendered by a CrudFormGroup custom component.
    // Watches ruleId value and renders fields from registry.getParamFields(ruleId).
    // Collects values into the `params` JSONB field on submit.
    id: 'params',
    label: t('catalog.quality.rules.form.params', 'Rule parameters'),
    type: 'custom',
    component: RuleParamsEditor,  // internal component in this page
  },
  {
    id: 'isActive',
    label: t('catalog.quality.rules.form.isActive', 'Active'),
    type: 'boolean',
  },
]
```

**`RuleParamsEditor`** is a small inline component (not a shared primitive) that:
1. Reads current `ruleId` from form values
2. Calls `registry.getParamFields(ruleId)`
3. Renders appropriate inputs (`text`, `number`, `select`) for each param field
4. Writes collected values back as `{ [paramKey]: value }` to `params`

Example param fields per ruleId:

| ruleId | Param fields |
|--------|-------------|
| `attr.required` | `field`: select (title, description, sku, defaultMediaId, subtitle, handle) |
| `media.min_count` | `min`: number |
| `attr.min_length` | `field`: select + `minLength`: number |

> **V2:** `attr.has_value` param fields (field + values tags) deferred with the rule itself.

---

### Dashboard Widget: `catalog.dashboard.catalogHealth`

```typescript
// widgets/dashboard/catalog-health/config.ts
export type CatalogHealthSettings = {
  pageSize: number    // 1–20, default 10
  maxScore?: number   // 0–100 optional upper bound
}
export const DEFAULT_SETTINGS: CatalogHealthSettings = { pageSize: 10 }

// widgets/dashboard/catalog-health/widget.ts
const widget: DashboardWidgetModule<CatalogHealthSettings> = {
  metadata: {
    id: 'catalog.dashboard.catalogHealth',
    title: 'Catalog Health',
    description: 'Products with quality issues sorted by score.',
    features: ['dashboards.view', 'catalog.widgets.catalog-health'],
    defaultSize: 'md',
    defaultEnabled: true,
    defaultSettings: DEFAULT_SETTINGS,
    tags: ['catalog'],
    category: 'catalog',
    icon: 'package',
    supportsRefresh: true,
  },
  Widget: CatalogHealthWidget,
  hydrateSettings,
  dehydrateSettings: (s) => ({ pageSize: s.pageSize, maxScore: s.maxScore }),
}
```

**API Route:** `GET /api/catalog/dashboard/widgets/catalog-health`  
File: `api/catalog/dashboard/widgets/catalog-health/route.ts`
```typescript
// Query: limit (1–20), maxScore (0–100 optional)
// Response: { items: Array<{ id, title, score, grade, issueCount, evaluatedAt }> }
// Auth: ['dashboards.view', 'catalog.widgets.catalog-health']
// Reads from catalog_data_quality_scores — no live recalculation
```

---

## UI/UX**
```
┌──────────────────────────────────────────┐
│ [F] Sample Product                    →  │
│     Score: 35% · 3 issues                │
└──────────────────────────────────────────┘
```
Grade badge colors: A=green, B=blue, C=yellow, D=orange, F=red.
Click → `/backend/catalog/products/:id`

---

## Configuration

### I18n Keys (`i18n/en.json`)

```json
{
  "catalog.quality.rules.page.title": "Quality Rules",
  "catalog.quality.rules.actions.create": "Add rule",
  "catalog.quality.rules.list.columns.label": "Label",
  "catalog.quality.rules.list.columns.ruleId": "Rule type",
  "catalog.quality.rules.list.columns.severity": "Severity",
  "catalog.quality.rules.list.columns.weight": "Weight",
  "catalog.quality.rules.form.ruleId": "Rule type",
  "catalog.quality.rules.form.ruleIdHelp": "The rule class to evaluate.",
  "catalog.quality.rules.form.labelHelp": "Optional display name for reports.",
  "catalog.quality.rules.form.severity": "Severity",
  "catalog.quality.rules.form.weight": "Weight",
  "catalog.quality.rules.form.weightHelp": "0.1–10. Applies to LOW and MEDIUM severity rules.",
  "catalog.quality.rules.form.highSeverityCap": "Score cap (HIGH only)",
  "catalog.quality.rules.form.highSeverityCapHelp": "Max score when this HIGH rule fails (0–100, default 40).",
  "catalog.quality.rules.form.isActive": "Active",
  "catalog.quality.rules.form.params": "Rule parameters",
  "catalog.quality.rules.form.params.field": "Field",
  "catalog.quality.rules.form.params.min": "Minimum count",
  "catalog.quality.rules.form.params.minLength": "Minimum length",
  "catalog.quality.rules.form.params.values": "Allowed values",
  "catalog.quality.rules.flash.created": "Rule created",
  "catalog.quality.rules.flash.updated": "Rule updated",
  "catalog.quality.rules.flash.deleted": "Rule deleted",
  "catalog.quality.rules.flash.toggled": "Rule status updated",
  "catalog.widgets.catalogHealth.title": "Catalog Health",
  "catalog.widgets.catalogHealth.description": "Products with quality issues sorted by score.",
  "catalog.widgets.catalogHealth.empty": "All products meet quality standards.",
  "catalog.widgets.catalogHealth.error": "Failed to load quality data.",
  "catalog.widgets.catalogHealth.untitled": "(Untitled)",
  "catalog.widgets.catalogHealth.settings.pageSize": "Items to display",
  "catalog.widgets.catalogHealth.settings.maxScore": "Maximum score (0–100)"
}
```

---

## Implementation Checklist

### Phase 1 — Core Types & Rules
- [ ] `lib/quality/types.ts`
- [ ] `lib/quality/rules/attr-required.rule.ts`
- [ ] `lib/quality/rules/media-min-count.rule.ts`
- [ ] `lib/quality/rules/attr-min-length.rule.ts`
- [ ] `lib/quality/registry.ts` (with `getParamFields()`)
- [ ] `lib/quality/calculator.ts`

### Phase 2 — Resolver & Service
- [ ] `lib/quality/resolver.ts`
- [ ] `lib/quality/evaluation.service.ts`
- [ ] Register in `di.ts`

### Phase 3 — Database
- [ ] Add `CatalogDataQualityRule` and `CatalogDataQualityScore` to `data/entities.ts`
- [ ] Add validators to `data/validators.ts` (`createQualityRuleSchema`, `updateQualityRuleSchema`, `qualityRuleItemSchema`, `qualityRuleListQuerySchema`)
- [ ] `yarn db:generate && yarn db:migrate`
- [ ] Default seed in `setup.ts` (`seedDefaults`, idempotent on `ruleId + tenantId + organizationId`)

### Phase 4 — Events, Worker, Subscriber
- [ ] `events.ts` (with `entity`, `category`, `as const`, emit export)
- [ ] `subscribers/quality-trigger.subscriber.ts`
- [ ] `workers/quality-evaluation.worker.ts` (with `id` in metadata, retry semantics)

### Phase 5 — CRUD API (Rules)
- [ ] `api/catalog/quality/openapi.ts` (`buildQualityCrudOpenApi` factory, proper typed schemas)
- [ ] `api/catalog/quality/rules/route.ts` (GET + POST, `makeCrudRoute` + `indexer`, mutation guards)
- [ ] `api/catalog/quality/rules/[id]/route.ts` (GET + PATCH + DELETE, mutation guards)

### Phase 6 — Widget API (V1)
- [ ] `api/catalog/dashboard/widgets/utils.ts` (re-exports `resolveWidgetScope`)
- [ ] `api/catalog/dashboard/widgets/catalog-health/route.ts`
- [ ] _V2: summary, products, products/[id] routes_

### Phase 7 — Admin Panel UI
- [ ] `components/quality/QualityRulesDataTable.tsx`
- [ ] `backend/catalog/quality/rules/page.tsx` + `page.meta.ts`
- [ ] `backend/catalog/quality/rules/create/page.tsx` + `page.meta.ts`
- [ ] `backend/catalog/quality/rules/[id]/edit/page.tsx` + `page.meta.ts`
- [ ] `RuleParamsEditor` inline component (param fields per ruleId, V1: text/number/select only)

### Phase 8 — Dashboard Widget
- [ ] `widgets/dashboard/catalog-health/config.ts`
- [ ] `widgets/dashboard/catalog-health/widget.ts`
- [ ] `widgets/dashboard/catalog-health/widget.client.tsx`

### Phase 9 — ACL, I18n, Registration
- [ ] Add features to `acl.ts` (`catalog.quality.view`, `catalog.quality.manage`, `catalog.widgets.catalog-health`)
- [ ] Update `setup.ts` `defaultRoleFeatures`: grant `catalog.quality.view` + `catalog.widgets.catalog-health` to `employee`, `catalog.quality.manage` to `admin`/`superadmin`
- [ ] Add keys to `i18n/en.json`
- [ ] `yarn modules:prepare`

### Phase 10 — Tests

**Integration Tests (Required — see `.ai/qa/AGENTS.md` for test structure):**
- [ ] `IT-001` Full CRUD lifecycle for Quality Rules via API (create, read list, update, soft-delete). Use API fixtures; verify DB state. Clean up in finally block.
- [ ] `IT-002` Async Worker Flow: Product saved via API → Subscriber enqueues job → Worker processes → `catalog_data_quality_scores` row upserted. Verify idempotency (run twice, expect single row).
- [ ] `IT-003` Widget API returns correct payload, empty list when no scores, respects RBAC (`catalog.widgets.catalog-health` feature required).

**Unit Tests (Calculator):**
- [ ] `TC-001` Product missing title → score = 0, grade = F (BLOCKER rule)
- [ ] `TC-002` Product missing description → score ≤ 40 (HIGH cap = 40)
- [ ] `TC-003` All default fields present → score = 100, grade = A
- [ ] `TC-004` Rule with `isActive = false` not included in bindings (resolver test)
- [ ] `TC-005` All bindings are LOW/MEDIUM and `totalWeight = 0` → score = 100 (edge case in calculator)

---

## Migration & Deployment

### Database Migration & Default Seed

#### New Tables
1. `catalog_data_quality_rules`
2. `catalog_data_quality_scores`

#### Default Tenant-Wide Rules Seed (`setup.ts`, idempotent on `ruleId + tenantId`)

| ruleId | severity | weight | params | label |
|--------|----------|--------|--------|-------|
| `attr.required` | BLOCKER | 1.0 | `{ "field": "title" }` | Title required |
| `attr.required` | HIGH | 1.0 | `{ "field": "description" }` | Description required |
| `attr.required` | HIGH | 1.0 | `{ "field": "defaultMediaId" }` | Primary image required |
| `attr.required` | MEDIUM | 1.0 | `{ "field": "sku" }` | SKU required |
| `media.min_count` | MEDIUM | 0.5 | `{ "min": 1 }` | At least 1 media |
| `attr.required` | LOW | 0.5 | `{ "field": "subtitle" }` | Subtitle recommended |

With defaults: missing title → score = 0 (BLOCKER). Missing description + image → score ≤ 40 (two HIGH caps).

#### Upgrade Path
```bash
yarn db:generate
yarn db:migrate
# seed default rules (idempotent — handled by setup.ts seedDefaults)
yarn modules:prepare
```

---

## Future Enhancements

### V2+ Extensions Overview

- Targeted scope system (channels, categories)
- Quality reporting page with summary + product list (APIs: `quality/summary`, `quality/products`, `quality/products/[id]`)
- `attr.has_value` rule class (requires tags-input UI component)
- Policy layer for grouped rules
- Admin Panel: policy management UI
- Bulk backfill CLI: `yarn cli catalog:quality:backfill`

### V2 Extension Path Details

1. Provide targeted scoping via business rules engine or separate linkage entity if needed.

#### Adding Policy layer (V3)
1. Add `catalog_quality_policies` table (id, name, tenantId, parentId)
2. Add linkage tables mappings to specific channels / product sources.

---

## Backward Compatibility Contract

The following surfaces are **FROZEN** once shipped. See `BACKWARD_COMPATIBILITY.md` for full protocol.

| Surface | Value | Classification |
|---------|-------|----------------|
| Event ID | `catalog.quality_score.updated` | FROZEN |
| Event ID | `catalog.quality_score.degraded` | FROZEN |
| Widget spot ID | `catalog.dashboard.catalogHealth` | FROZEN |
| ACL feature ID | `catalog.quality.view` | FROZEN |
| ACL feature ID | `catalog.quality.manage` | FROZEN |
| ACL feature ID | `catalog.widgets.catalog-health` | FROZEN |
| API route | `GET /api/catalog/quality/rules` | STABLE |
| API route | `GET /api/catalog/dashboard/widgets/catalog-health` | STABLE |
| DB table | `catalog_data_quality_rules` | ADDITIVE-ONLY |
| DB table | `catalog_data_quality_scores` | ADDITIVE-ONLY |

Event payload fields are additive-only after first release. Do not rename or remove the above IDs.


---

## Risks & Impact Review

| Risk | Severity | Mitigation |
|------|----------|------------|
| Performance — full catalog scan | HIGH | Worker one-at-a-time; paginated backfill CLI in V2 |
| Score staleness | LOW | Widget shows `evaluatedAt`; async design is explicit |

---

## Final Compliance Report

- **Security Focus:** Tenant isolation properly established via `tenantId` and `organizationId` matching on all queries and updates. Soft-delete on rules (`deletedAt`) respected in resolver.
- **Testing Standard Reached:** IT-001/002/003 with fixture setup/teardown requirements; TC-001–TC-005 covering calculation invariants including edge case (all rules disabled → score = 100).
- **ORM Contract Met:** Loose UUID joins only (`productId`, no ORM relations across module boundary); `deleted_at` soft-delete on rules.
- **API Spec Requirements Met:** `buildQualityCrudOpenApi` via `createCrudOpenApiFactory`; all schemas come from `data/validators.ts`; no `z.any()` in response schemas; `makeCrudRoute` + `indexer` used; `validateCrudMutationGuard` / `runCrudMutationGuardAfterSuccess` wired on all write routes.
- **UI Contract Met:** CRUD UI uses `createCrud`/`updateCrud`/`deleteCrud` from `@open-mercato/ui/backend/crud`. `page.meta.ts` declared for all three backend pages (list, create, edit).
- **Naming Convention Met:** All new entities follow `Catalog` prefix (`CatalogDataQualityRule`, `CatalogDataQualityScore`). Event IDs use `catalog.quality_score.*` (no double-underscore entity names). Worker exports `id` in metadata.
- **ACL Met:** `acl.ts` features added and reflected in `setup.ts` `defaultRoleFeatures` for all standard roles.
- **Backward Compatibility Met:** FROZEN contract table added; event IDs and widget spot ID explicitly marked.
- **V1 Scope Respected:** `attr.has_value` deferred; summary/products API endpoints deferred; no `search.ts` or `translations.ts` required.
- **Commands conformant:** `yarn db:generate`, `yarn db:migrate`, `yarn modules:prepare` used consistently.

---

## References

### Related Specs
- [SPEC-001: UI Reusable Components](SPEC-001-2026-01-21-ui-reusable-components.md) - Dashboard widget patterns

### Code References
- Dashboard widget types: [packages/shared/src/modules/dashboard/widgets.ts](../../packages/shared/src/modules/dashboard/widgets.ts)
- Example widget: [packages/core/src/modules/customers/widgets/dashboard/new-customers/](../../packages/core/src/modules/customers/widgets/dashboard/new-customers/)
- Product entities: [packages/core/src/modules/catalog/data/entities.ts](../../packages/core/src/modules/catalog/data/entities.ts)
- Scope utilities: [packages/core/src/modules/customers/api/dashboard/widgets/utils.ts](../../packages/core/src/modules/customers/api/dashboard/widgets/utils.ts)

---

## Changelog

### 2026-02-28 (v3)
- Removed `attr.has_value` rule class and `attr-has-value.rule.ts` (deferred to V2; no seed usage)
- Added `data/validators.ts` section with typed Zod schemas; removed `z.any()` from all response schemas
- Fixed event IDs: `catalog.data_quality_score.*` → `catalog.quality_score.*`; added `entity`, `category`, `as const`, emit export
- Added `QualityEvaluationService` public method contract
- Resolved `ConfiguredRuleResolver` map/merge logic — direct mapper in V1
- Added `makeCrudRoute` + `indexer` and mutation guard requirements to CRUD routes
- Added `page.meta.ts` for create and edit pages
- Added worker `id` in metadata and retry/idempotency semantics
- Deferred summary/products/products[id] API endpoints to V2
- Added Backward Compatibility Contract table (FROZEN/STABLE/ADDITIVE-ONLY markers)
- Added TC-005: all rules disabled → score = 100 edge case
- Added `search.ts` and `translations.ts` “not required for V1” notes

### 2026-02-22 (v2)
- Promoted from widget to configurable engine
- Modified names to follow Catalog prefix convention (`CatalogDataQualityRule`, `CatalogDataQualityScore`)
- Ensure fully DB-driven rule config mechanism

### 2026-01-27 (v1)
- Initial: simple product quality widget with hardcoded weights
