import {
  CATALOG_QUALITY_QUEUE_NAME,
  type QualityEvaluationJob,
} from '../lib/quality/queue-types'
import type { QualityEvaluationService } from '../lib/quality/evaluation.service'
import { emitCatalogEvent } from '../events'

export { CATALOG_QUALITY_QUEUE_NAME }

export const metadata = {
  queue: CATALOG_QUALITY_QUEUE_NAME,
  id: 'catalog:quality-evaluation',
  concurrency: 2,
}

type HandlerContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(
  job: { payload: QualityEvaluationJob },
  ctx: HandlerContext,
): Promise<void> {
  const { productId } = job.payload

  const qualityEvaluationService = ctx.resolve<QualityEvaluationService>('qualityEvaluationService')
  const { score, grade, previousScore } = await qualityEvaluationService.evaluateProduct(productId)

  await emitCatalogEvent('catalog.quality_score.updated', { productId, score, grade })

  if (previousScore !== null && score < previousScore) {
    await emitCatalogEvent('catalog.quality_score.degraded', { productId, score, grade, previousScore })
  }
}

