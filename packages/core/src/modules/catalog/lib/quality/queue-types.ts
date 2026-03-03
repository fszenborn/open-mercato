export const CATALOG_QUALITY_QUEUE_NAME = 'catalog-quality-evaluation'

export type QualityEvaluationJob = {
  productId: string
  tenantId: string
  organizationId: string
}
