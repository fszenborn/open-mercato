import { ConfiguredRuleResolver } from '../resolver'
import type { CatalogDataQualityRule } from '../../../data/entities'

function makeRule(overrides: Partial<CatalogDataQualityRule>): CatalogDataQualityRule {
  return {
    id: 'rule-id',
    organizationId: 'org-1',
    tenantId: 'tenant-1',
    ruleId: 'quality.title.required',
    label: null,
    severity: 'MEDIUM',
    weight: '1.0',
    params: {},
    conditionExpression: { operator: 'IS_NOT_EMPTY', field: 'title' },
    highSeverityCap: 40,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as CatalogDataQualityRule
}

/**
 * TC-004: Rules with isActive=false must not appear in resolved bindings.
 * The resolver passes { isActive: true, deletedAt: null } to em.find.
 * This test verifies: (a) the ORM query includes the correct filter,
 * (b) only active rules with conditionExpression are mapped into bindings.
 */
describe('TC-004: ConfiguredRuleResolver excludes inactive rules', () => {
  it('queries em.find with isActive:true and deletedAt:null', async () => {
    const activeRule = makeRule({ id: 'active', ruleId: 'quality.title.required', isActive: true })
    const findMock = jest.fn().mockResolvedValue([activeRule])
    const em = { find: findMock } as unknown as Parameters<typeof ConfiguredRuleResolver.prototype.resolve>[0] extends never ? never : any

    const resolver = new ConfiguredRuleResolver(em as any)
    const { bindings } = await resolver.resolve('tenant-1', 'org-1')

    expect(findMock).toHaveBeenCalledWith(
      expect.anything(), // entity class
      expect.objectContaining({ isActive: true, deletedAt: null, tenantId: 'tenant-1', organizationId: 'org-1' }),
    )
    expect(bindings).toHaveLength(1)
    expect(bindings[0].ruleId).toBe('quality.title.required')
    expect(bindings[0].conditionExpression).toEqual({ operator: 'IS_NOT_EMPTY', field: 'title' })
  })

  it('excludes rules without conditionExpression', async () => {
    const ruleWithoutExpr = makeRule({ id: 'no-expr', conditionExpression: null })
    const ruleWithExpr = makeRule({ id: 'with-expr' })
    const findMock = jest.fn().mockResolvedValue([ruleWithoutExpr, ruleWithExpr])
    const resolver = new ConfiguredRuleResolver({ find: findMock } as any)

    const { bindings } = await resolver.resolve('tenant-1', 'org-1')
    expect(bindings).toHaveLength(1)
    expect(bindings[0].bindingKey).toBe('with-expr')
  })

  it('returns empty bindings when all rules are soft-deleted or inactive in DB response', async () => {
    const findMock = jest.fn().mockResolvedValue([])
    const resolver = new ConfiguredRuleResolver({ find: findMock } as any)

    const { bindings } = await resolver.resolve('tenant-1', 'org-1')
    expect(bindings).toHaveLength(0)
  })

  it('maps weight as float from numeric DB string', async () => {
    const rule = makeRule({ ruleId: 'quality.media.min', weight: '0.5', severity: 'MEDIUM', highSeverityCap: 40, conditionExpression: { operator: '>=', field: 'mediaCount', value: 1 } })
    const resolver = new ConfiguredRuleResolver({ find: jest.fn().mockResolvedValue([rule]) } as any)

    const { bindings } = await resolver.resolve('tenant-1', 'org-1')
    expect(bindings[0].weight).toBe(0.5)
    expect(typeof bindings[0].weight).toBe('number')
  })
})
