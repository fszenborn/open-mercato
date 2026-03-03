import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCatalogUnits, seedCatalogPriceKinds, seedCatalogExamplesForScope } from './lib/seeds'
import { seedDefaultQualityRules } from './lib/quality/seeds'

export const setup: ModuleSetupConfig = {
  seedDefaults: async (ctx) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedCatalogUnits(ctx.em, scope)
    await seedCatalogPriceKinds(ctx.em, scope)
    await seedDefaultQualityRules(ctx.em, scope)
  },

  seedExamples: async (ctx) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedCatalogExamplesForScope(ctx.em, ctx.container, scope)
  },

  defaultRoleFeatures: {
    superadmin: ['catalog.*', 'catalog.variants.manage', 'catalog.pricing.manage', 'catalog.quality.manage', 'catalog.widgets.catalog-health'],
    admin: ['catalog.*', 'catalog.variants.manage', 'catalog.pricing.manage', 'catalog.quality.manage', 'catalog.widgets.catalog-health'],
    employee: [
      'catalog.products.view',
      'catalog.products.manage',
      'catalog.categories.view',
      'catalog.categories.manage',
      'catalog.variants.manage',
      'catalog.pricing.manage',
      'catalog.quality.view',
      'catalog.widgets.catalog-health',
    ],
  },
}

export default setup
