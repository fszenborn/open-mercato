import { createQueue } from '@open-mercato/queue'
import { CATALOG_QUALITY_QUEUE_NAME, type QualityEvaluationJob } from './queue-types'

export type ProductEventPayload = {
  id: string
  tenantId: string
  organizationId: string
}

export async function enqueueQualityEvaluation(payload: ProductEventPayload): Promise<void> {
  try {
    const strategy = process.env.QUEUE_STRATEGY === 'async' ? 'async' : 'local'
    const queue = createQueue<QualityEvaluationJob>(CATALOG_QUALITY_QUEUE_NAME, strategy)
    await queue.enqueue({
      productId: payload.id,
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
  } catch (err) {
    console.error('[catalog:quality-trigger] Failed to enqueue quality evaluation:', err)
  }
}
