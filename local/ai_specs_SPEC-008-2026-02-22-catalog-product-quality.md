# SPEC-008: Catalog Product Quality Engine

**Created:** 2026-02-22  
**Replaces:** SPEC-008-2026-01-27-product-quality-widget.md  
**Module:** `catalog` — `packages/core/src/modules/catalog/`  
**Status:** Draft — V1 Implementation Ready

---

## 1. Overview

The Product Quality Engine (PQE) replaces the original simple dashboard widget with a proper,
database-driven quality evaluation system. The core principle:

> **Rule classes are code. Rule configuration (weight, severity, scope) lives in the database.**
> Business changes = database migration only, never code changes.

### V1 Scope (this spec)
- One configuration table: `catalog_quality_configured_rules`
- Hardcoded rule classes: `attr.required`, `media.min_count`, `attr.min_length`, `attr.has_value`
- Simple two-level scope: `global` and `category`
- Async evaluation worker triggered by product save events
- Dashboard widget: "Catalog Health" — shows products with lowest quality scores
- Basic REST API for quality data
- No Admin Panel UI in V1 (seeded default rules only)

### V2 Scope (planned, documented here for compatibility)
- Admin Panel CRUD for configured rules (`backend/catalog/quality`)
- Policy layer (`catalog_quality_policies` + multi-score per product)
- Channel-scoped rules (`scope_type = 'channel'`)
- Bulk backfill CLI command

---

## 2. File Structure

```
packages/core/src/modules/catalog/
├── data/
│   └── entities.ts              # +CatalogQualityConfiguredRule, +CatalogQualityScore
├── lib/
│   └── quality/
│       ├── types.ts             # Rule, RuleResult, Severity, Grade, Snapshot, Binding
│       ├── rules/
│       │   ├── attr-required.rule.ts
│       │   ├── media-min-count.rule.ts
│       │   ├── attr-min-length.rule.ts
│       │   └── attr-has-value.rule.ts
│       ├── registry.ts          # RuleRegistry — maps ruleId → Rule class instance
│       ├── resolver.ts          # ConfiguredRuleResolver — loads + merges bindings
│       ├── calculator.ts        # ScoreCalculator — 2-phase algorithm
│       └── evaluation.service.ts
├── workers/
│   └── quality-evaluation.worker.ts
├── subscribers/
│   └── quality-trigger.subscriber.ts
├── events.ts                    # catalog.quality.score.updated
├── api/
│   └── quality/
│       ├── summary/route.ts     # GET /api/catalog/quality/summary
│       ├── products/route.ts    # GET /api/catalog/quality/products
│       ��── products/[id]/route.ts # GET /api/catalog/quality/products/:id
└── widgets/
    └── dashboard/
        └── catalog-health/
            ├── config.ts
            ├── widget.ts
            └── widget.client.tsx
```

---

## 3. Data Models

### 3.1 Entity: CatalogQualityConfiguredRule

```typescript
// packages/core/src/modules/catalog/data/entities.ts

@Entity({ tableName: 'catalog_quality_configured_rules' })
@Index({ name: 'dqe_rules_scope_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'dqe_rules_scope_type_idx', properties: ['scopeType', 'scopeRefId'] })
export class CatalogQualityConfiguredRule {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // ID registered rule class, e.g. 'attr.required', 'media.min_count'
  @Property({ name: 'rule_id', type: 'text' })
  ruleId!: string

  // Human-readable label for future admin UI
  @Property({ type: 'text', nullable: true })
  label?: string | null

  // 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKER'
  @Property({ type: 'text', default: 'MEDIUM' })
  severity: string = 'MEDIUM'

  // Weight in score aggregation phase
  @Property({ type: 'numeric', precision: 5, scale: 2, default: '1.0' })
  weight: string = '1.0'

  // Rule-specific params, e.g. { "field": "description", "minLength": 20 }
  @Property({ type: 'jsonb', default: '{}' })
  params: Record<string, unknown> = {}

  // 'global' applies to all products; 'category' scoped to scopeRefId category
  // V2 may add 'channel', 'policy' without changing existing rows
  @Property({ name: 'scope_type', type: 'text', default: 'global' })
  scopeType: string = 'global'

  // UUID of category when scopeType='category', null for 'global'
  @Property({ name: 'scope_ref_id', type: 'uuid', nullable: true })
  scopeRefId?: string | null

  // Max score when a HIGH severity rule fails (default 40)
  // Applied only to HIGH severity rules. Stored per-rule for V2 policy flexibility,
  // but in V1 resolved as: min(allFailedHighCaps).
  @Property({ name: 'high_severity_cap', type: 'smallint', default: 40 })
  highSeverityCap: number = 40

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
```

### 3.2 Entity: CatalogQualityScore

```typescript
@Entity({ tableName: 'catalog_quality_scores' })
@Unique({ name: 'dqe_scores_product_tenant_unique', properties: ['productId', 'tenantId'] })
// NOTE: In V2, change UNIQUE to (productId, policyId) when policy layer is added.
// policyId column is already reserved for V2 compatibility (always NULL in V1).
@Index({ name: 'dqe_scores_score_idx', properties: ['score'] })
@Index({ name: 'dqe_scores_grade_idx', properties: ['grade'] })
@Index({ name: 'dqe_scores_scope_idx', properties: ['organizationId', 'tenantId'] })
export class CatalogQualityScore {
  [OptionalProps]?: never

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'product_id', type: 'uuid' })
  productId!: string

  // Reserved for V2 Policy layer. Always NULL in V1.
  @Property({ name: 'policy_id', type: 'uuid', nullable: true })
  policyId?: string | null

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

## 4. Core Types (`lib/quality/types.ts`)

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

// Flat snapshot of product data passed to rule evaluation (no DB queries inside rules)
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
  // categories the product belongs to (for resolver scope matching)
  categoryIds: string[]
  // counts for media rules
  mediaCount: number
  // metadata for extensibility
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

## 5. Rule Implementations (`lib/quality/rules/`)

### 5.1 `attr.required` — Field is not null/empty

```typescript
// attr-required.rule.ts
// params: { field: string }
// Passes if product[field] is non-null and non-empty string
```

### 5.2 `media.min_count` — Minimum media count

```typescript
// media-min-count.rule.ts
// params: { min: number } — default 1
// Passes if product.mediaCount >= params.min
```

### 5.3 `attr.min_length` — Minimum text length

```typescript
// attr-min-length.rule.ts
// params: { field: string, minLength: number }
// Passes if product[field]?.length >= params.minLength
```

### 5.4 `attr.has_value` — Field matches allowed value set

```typescript
// attr-has-value.rule.ts
// params: { field: string, values: string[] }
// Passes if product[field] is in params.values
```

### Rule Registry

```typescript
// registry.ts
export class RuleRegistry {
  private rules = new Map<string, Rule>()

  register(rule: Rule): void {
    this.rules.set(rule.ruleId, rule)
  }

  get(ruleId: string): Rule | undefined {
    return this.rules.get(ruleId)
  }

  listIds(): string[] {
    return Array.from(this.rules.keys())
  }
}

// Singleton populated at startup via DI registration
export const defaultRuleRegistry = new RuleRegistry()
// register all 4 built-in rules here
```

---

## 6. ConfiguredRuleResolver (`lib/quality/resolver.ts`)

```typescript
export class ConfiguredRuleResolver {
  constructor(private em: EntityManager) {}

  async resolve(
    tenantId: string,
    organizationId: string,
    productCategoryIds: string[]
  ): Promise<ResolvedRules> {
    const rules = await this.em.find(CatalogQualityConfiguredRule, {
      tenantId,
      organizationId,
      isActive: true,
      $or: [
        { scopeType: 'global' },
        ...(productCategoryIds.length > 0
          ? [{ scopeType: 'category', scopeRefId: { $in: productCategoryIds } }]
          : []),
      ],
    })

    // Category-scoped rules override global rules for the same ruleId.
    // If a product has multiple matching categories, rules are UNIONED
    // (a ruleId present in any category takes precedence over global;
    // if two categories both define the same ruleId, category-scoped one with
    // higher weight wins — deterministic tie-break by id DESC).
    const merged = new Map<string, ConfiguredRuleBinding>()

    for (const rule of rules.filter(r => r.scopeType === 'global')) {
      merged.set(rule.ruleId, toBinding(rule))
    }

    const categoryRules = rules.filter(r => r.scopeType === 'category')
    // Sort deterministically: higher weight wins, then by id DESC as tie-break
    categoryRules.sort((a, b) =>
      parseFloat(b.weight) - parseFloat(a.weight) || b.id.localeCompare(a.id)
    )
    for (const rule of categoryRules) {
      merged.set(rule.ruleId, toBinding(rule))
    }

    return { bindings: Array.from(merged.values()) }
  }
}

function toBinding(rule: CatalogQualityConfiguredRule): ConfiguredRuleBinding {
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

## 7. ScoreCalculator (`lib/quality/calculator.ts`)

Two-phase algorithm:

**Phase 1 — Weighted Aggregation** (LOW + MEDIUM rules only):
```
weightedPassed = Σ weight of passed LOW/MEDIUM bindings
totalWeight    = Σ weight of all LOW/MEDIUM bindings
score          = round((weightedPassed / totalWeight) * 100)   [100 if totalWeight == 0]
```

**Phase 2 — Restriction** (applied in order):
1. Any failed `BLOCKER` → `score = 0`
2. Any failed `HIGH` → `score = min(score, min(highSeverityCap of all failed HIGH bindings))`
3. `INFO` rules: recorded in violations but never affect score

**Grade thresholds:**
| Score | Grade |
|-------|-------|
| ≥ 90  | A     |
| ≥ 75  | B     |
| ≥ 60  | C     |
| ≥ 40  | D     |
| < 40  | F     |

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

  const failedBindings = bindings.filter(b => !results[b.ruleId]?.passed)
  const hasBlocker = failedBindings.some(b => b.severity === 'BLOCKER')

  if (hasBlocker) {
    score = 0
  } else {
    const failedHigh = failedBindings.filter(b => b.severity === 'HIGH')
    if (failedHigh.length > 0) {
      const minCap = Math.min(...failedHigh.map(b => b.highSeverityCap))
      score = Math.min(score, minCap)
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

## 8. Evaluation Service (`lib/quality/evaluation.service.ts`)

```typescript
export class QualityEvaluationService {
  constructor(
    private em: EntityManager,
    private registry: RuleRegistry,
    private resolver: ConfiguredRuleResolver,
  ) {}

  async evaluateProduct(productId: string): Promise<void> {
    const product = await this.em.findOne(CatalogProduct, { id: productId })
    if (!product) return

    const snapshot = await this.buildSnapshot(product)
    const { bindings } = await this.resolver.resolve(
      product.tenantId,
      product.organizationId,
      snapshot.categoryIds,
    )

    const results: Record<string, RuleResult> = {}
    for (const binding of bindings) {
      const rule = this.registry.get(binding.ruleId)
      if (!rule) {
        results[binding.ruleId] = { passed: true } // unknown rule = skip
        continue
      }
      results[binding.ruleId] = rule.evaluate(snapshot, binding.params)
    }

    const violations: Record<string, { passed: boolean; message?: string }> = {}
    for (const binding of bindings) {
      const r = results[binding.ruleId]
      if (r && (!r.passed || binding.severity === 'INFO')) {
        violations[binding.ruleId] = { passed: r.passed, message: r.message }
      }
    }

    const { score, grade } = calculateScore(bindings, results)

    // UPSERT into catalog_quality_scores
    await this.em.upsert(CatalogQualityScore, {
      productId,
      policyId: null,
      organizationId: product.organizationId,
      tenantId: product.tenantId,
      score,
      grade,
      violations,
      evaluatedAt: new Date(),
    })
  }

  private async buildSnapshot(product: CatalogProduct): Promise<ProductQualitySnapshot> {
    // Load category IDs from product relations
    // Load media count from attachments or product.defaultMediaId
    // ...
    return {
      id: product.id,
      tenantId: product.tenantId,
      organizationId: product.organizationId,
      title: product.title ?? null,
      subtitle: product.subtitle ?? null,
      description: product.description ?? null,
      sku: product.sku ?? null,
      handle: product.handle ?? null,
      defaultMediaId: product.defaultMediaId ?? null,
      categoryIds: [], // populated from product relations
      mediaCount: product.defaultMediaId ? 1 : 0,
    }
  }
}
```

---

## 9. Events (`events.ts`)

```typescript
// Add to catalog events:
export type CatalogQualityScoreUpdatedPayload = {
  productId: string
  tenantId: string
  organizationId: string
  score: number
  grade: string
  previousScore?: number
}

// Event names:
// 'catalog.quality.score.updated'
// 'catalog.quality.score.degraded' — emitted when new score < previous score
```

---

## 10. Worker & Subscriber

### Subscriber (`subscribers/quality-trigger.subscriber.ts`)
Listens to `catalog.product.updated` and `catalog.product.created` events.
Enqueues a job: `{ type: 'catalog.quality.evaluate', productId }`.

### Worker (`workers/quality-evaluation.worker.ts`)
- Processes one product at a time
- Calls `QualityEvaluationService.evaluateProduct(productId)`
- Emits `catalog.quality.score.updated` after successful evaluation
- Emits `catalog.quality.score.degraded` if score dropped

---

## 11. API Endpoints

All routes require `tenantId` via auth. Organization resolved via `resolveWidgetScope` from
`packages/core/src/modules/customers/api/dashboard/widgets/utils.ts`
(copy or re-export into `catalog/api/dashboard/widgets/utils.ts` for module encapsulation).

### GET `/api/catalog/quality/summary`
```typescript
export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dashboards.view', 'catalog.quality.view'] },
}
// Response:
// { healthIndex: number, totalProducts: number, gradeCounts: Record<Grade, number> }
// healthIndex = average score across all products in scope
```

### GET `/api/catalog/quality/products`
```typescript
// Query params:
// limit: number (1–100, default 20)
// grade: Grade (optional filter)
// maxScore: number (optional, return products with score ≤ maxScore)
// Response:
// { items: Array<{ id, title, score, grade, evaluatedAt, issueCount }>, total }
// issueCount = count of violations where passed=false
```

### GET `/api/catalog/quality/products/:id`
```typescript
// Response:
// { id, title, score, grade, evaluatedAt, violations: Record<ruleId, { passed, message }> }
```

---

## 12. Dashboard Widget: `catalog.dashboard.catalogHealth`

Replaces the original `catalog.dashboard.productQuality` widget from SPEC-008 v1.

### Widget Metadata

```typescript
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

### Settings

```typescript
// widgets/dashboard/catalog-health/config.ts
export type CatalogHealthSettings = {
  pageSize: number   // 1–20, default 10
  maxScore?: number  // 0–100, optional upper bound filter
}

export const DEFAULT_SETTINGS: CatalogHealthSettings = {
  pageSize: 10,
}
```

### API Route (`api/dashboard/widgets/catalog-health/route.ts`)
```typescript
// GET /api/catalog/dashboard/widgets/catalog-health
// Query: limit (1-20), maxScore (0-100, optional)
// Response: { items: Array<{ id, title, score, grade, issueCount, evaluatedAt }> }
// Auth: requireFeatures: ['dashboards.view', 'catalog.widgets.catalog-health']
// Delegates to CatalogQualityScore table — no live recalculation.
```

### Widget States
- **Loading**: Spinner + "Loading..."
- **Empty**: "All products meet quality standards."
- **Error**: Red error message
- **Loaded**: List of product cards with score, grade badge, issue count

### Product Card Layout
```
┌──────────────────────────────────────────┐
│ [F] Sample Product                    →  │
│     Score: 35% · 3 issues                │
└──────────────────────────────────────────┘
```
Grade badge: A=green, B=blue, C=yellow, D=orange, F=red.
Click navigates to `/backend/catalog/products/:id`.

---

## 13. ACL (`acl.ts`)

```typescript
// packages/core/src/modules/catalog/acl.ts
// Add to existing features array:
{ id: 'catalog.quality.view', title: 'View product quality data', module: 'catalog' },
{ id: 'catalog.quality.manage', title: 'Manage quality rules', module: 'catalog' },   // V2 Admin Panel
{ id: 'catalog.widgets.catalog-health', title: 'Use catalog health widget', module: 'catalog' },
```

---

## 14. I18n Keys (`i18n/en.json`)

```json
{
  "catalog.widgets.catalogHealth.title": "Catalog Health",
  "catalog.widgets.catalogHealth.description": "Products with quality issues sorted by score.",
  "catalog.widgets.catalogHealth.empty": "All products meet quality standards.",
  "catalog.widgets.catalogHealth.error": "Failed to load quality data.",
  "catalog.widgets.catalogHealth.untitled": "(Untitled)",
  "catalog.widgets.catalogHealth.settings.pageSize": "Items to display",
  "catalog.widgets.catalogHealth.settings.maxScore": "Maximum score (0–100)",
  "catalog.quality.grade.A": "Excellent",
  "catalog.quality.grade.B": "Good",
  "catalog.quality.grade.C": "Fair",
  "catalog.quality.grade.D": "Poor",
  "catalog.quality.grade.F": "Critical"
}
```

---

## 15. Database Migration & Default Seed

### New Tables
1. `catalog_quality_configured_rules`
2. `catalog_quality_scores`

### Default Seed (V1 global rules, seeded in `setup.ts`)

| ruleId | severity | weight | params | label |
|--------|----------|--------|--------|-------|
| `attr.required` | BLOCKER | 1.0 | `{ "field": "title" }` | Title required |
| `attr.required` | HIGH | 1.0 | `{ "field": "description" }` | Description required |
| `attr.required` | HIGH | 1.0 | `{ "field": "defaultMediaId" }` | Primary image required |
| `attr.required` | MEDIUM | 1.0 | `{ "field": "sku" }` | SKU required |
| `media.min_count` | MEDIUM | 0.5 | `{ "min": 1 }` | At least 1 media file |
| `attr.required` | LOW | 0.5 | `{ "field": "subtitle" }` | Subtitle recommended |

With these defaults, a product missing title → score = 0 (BLOCKER).
A product missing description + image → score ≤ 40 (two HIGH failures → cap = 40).

### Upgrade Path
```bash
npm run db:generate
npm run db:migrate
# Seed default rules (idempotent)
npm run modules:prepare
```

---

## 16. Implementation Checklist

### Phase 1 — Core Types & Rules
- [ ] `lib/quality/types.ts` — all interfaces
- [ ] `lib/quality/rules/attr-required.rule.ts`
- [ ] `lib/quality/rules/media-min-count.rule.ts`
- [ ] `lib/quality/rules/attr-min-length.rule.ts`
- [ ] `lib/quality/rules/attr-has-value.rule.ts`
- [ ] `lib/quality/registry.ts`
- [ ] `lib/quality/calculator.ts`

### Phase 2 — Resolver & Service
- [ ] `lib/quality/resolver.ts` — ConfiguredRuleResolver
- [ ] `lib/quality/evaluation.service.ts`
- [ ] Register in `di.ts`

### Phase 3 — Database
- [ ] Add `CatalogQualityConfiguredRule` + `CatalogQualityScore` to `data/entities.ts`
- [ ] `npm run db:generate && npm run db:migrate`
- [ ] Add default seed in `setup.ts`

### Phase 4 — Events, Worker, Subscriber
- [ ] `events.ts` — `catalog.quality.score.updated`, `catalog.quality.score.degraded`
- [ ] `subscribers/quality-trigger.subscriber.ts`
- [ ] `workers/quality-evaluation.worker.ts`

### Phase 5 — API
- [ ] `api/quality/summary/route.ts`
- [ ] `api/quality/products/route.ts`
- [ ] `api/quality/products/[id]/route.ts`
- [ ] `api/dashboard/widgets/catalog-health/route.ts`

### Phase 6 — Dashboard Widget
- [ ] `widgets/dashboard/catalog-health/config.ts`
- [ ] `widgets/dashboard/catalog-health/widget.ts`
- [ ] `widgets/dashboard/catalog-health/widget.client.tsx`

### Phase 7 — ACL, I18n, Registration
- [ ] Add features to `acl.ts`
- [ ] Add keys to `i18n/en.json`
- [ ] `npm run modules:prepare` — widget auto-registered
- [ ] Add feature to default admin role in `auth/cli.ts` setup

### Phase 8 — Tests
- [ ] `TC-001` Product missing title → score = 0, grade = F (BLOCKER)
- [ ] `TC-002` Product missing description → score ≤ 40 (HIGH cap)
- [ ] `TC-003` All fields present → score = 100, grade = A
- [ ] `TC-004` Category rule overrides global rule for same ruleId
- [ ] `TC-005` Disabled rule (`isActive=false`) excluded from evaluation
- [ ] `TC-006` Widget API returns products ordered by score ASC
- [ ] `TC-007` Product save → job queued → score persisted (integration)

---

## 17. V2 Extension Path (Policy Layer)

When V2 is needed:
1. Add table `catalog_quality_policies` (id, name, tenantId, level, parentId)
2. Add nullable `policy_id` FK to `catalog_quality_configured_rules`
3. Change UNIQUE on `catalog_quality_scores` from `(productId, tenantId)` → `(productId, policyId)`
4. Extend `ConfiguredRuleResolver` to accept `policyId` parameter
5. Add Admin Panel CRUD (`backend/catalog/quality/page.tsx`)

**All existing V1 rows with `policy_id = NULL` continue to work as "default flat rules" — zero breaking changes.**

---

## 18. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Full catalog scan performance | HIGH | Worker processes one product at a time; paginated backfill in V2 |
| Category rule conflict (product in 2 categories) | MEDIUM | Deterministic merge: higher weight wins, then id DESC tie-break |
| Score staleness | LOW | Widget shows `evaluatedAt` timestamp; async is an explicit design choice |
| Migration from SPEC-008 v1 simple widget | LOW | Old widget id `catalog.dashboard.productQuality` deprecated; new id `catalog.dashboard.catalogHealth` |

---

## 19. References

- Widget patterns: `packages/core/src/modules/customers/widgets/dashboard/new-customers/`
- `resolveWidgetScope`: `packages/core/src/modules/customers/api/dashboard/widgets/utils.ts`
- ACL format: `packages/core/src/modules/sales/acl.ts`
- Entity patterns: `packages/core/src/modules/catalog/data/entities.ts`
- MikroORM entity conventions: `[OptionalProps]`, `@Index`, `@Unique`, snake_case columns
- Dashboard widget registration: `packages/shared/src/modules/dashboard/widgets.ts`

---

## Changelog

### 2026-02-22
- Promoted from simple widget to configurable quality engine
- Merged best ideas from DQE proposal (configurable rules table, 2-phase score algorithm, 5 severity levels, V2 policy path)
- Removed Admin Panel UI from V1 scope (added to V2)
- Fixed `highSeverityCap` resolution: `min()` of all failed HIGH caps (was non-deterministic)
- Fixed category rule conflict resolution: higher weight wins + id DESC tie-break
- Fixed entity conventions: `[OptionalProps]`, correct MikroORM decorators matching existing codebase
- Fixed ACL format: `{ id, title, module }` objects matching `customers/acl.ts` pattern
- Fixed command convention: `npm run *` instead of `yarn *`
- Removed Policy/`catalog_quality_policies` table from V1 (documented as V2 extension)

### 2026-01-27 (SPEC-008 v1)
- Initial specification: simple product quality widget with hardcoded field weights