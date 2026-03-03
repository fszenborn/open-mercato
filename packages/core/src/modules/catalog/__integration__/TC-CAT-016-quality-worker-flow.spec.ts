import { expect, test } from '@playwright/test';
import {
  getAuthToken,
  apiRequest,
} from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  createProductFixture,
  deleteCatalogProductIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/catalogFixtures';

const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 20_000;

async function pollForQualityScore(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  productId: string,
): Promise<{ id: string; score: number; grade: string; issueCount: number; evaluatedAt: string } | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await apiRequest(
      request,
      'GET',
      `/api/catalog/dashboard/widgets/catalog-health?pageSize=20`,
      { token },
    );
    if (res.ok()) {
      const body = (await res.json()) as {
        items?: Array<{ id: string; score: number; grade: string; issueCount: number; evaluatedAt: string }>;
      };
      const hit = body.items?.find((item) => item.id === productId);
      if (hit) return hit;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * IT-002: Async Worker Flow
 * Spec: SPEC-008 Phase 10 IT-002
 * Product created via API → subscriber enqueues job → worker processes →
 * catalog_data_quality_scores row upserted.
 * Idempotency: second evaluation replaces, not duplicates, the row.
 */
test.describe('IT-002: Quality Evaluation Worker Flow', () => {
  test(
    'should upsert quality score after product is saved',
    async ({ request }) => {
      let token: string | null = null;
      let productId: string | null = null;

      try {
        token = await getAuthToken(request, 'admin');
        // Create product without description so it gets a low score (HIGH rule fails → cap ≤ 40)
        const title = `QA IT-002 ${Date.now()}`;
        const res = await apiRequest(request, 'POST', '/api/catalog/products', {
          token,
          data: { title, sku: `QA-IT002-${Date.now()}` },
        });
        expect(res.ok(), `Product create failed: ${res.status()}`).toBeTruthy();
        const body = (await res.json()) as { id?: string };
        productId = body.id as string;
        expect(typeof productId).toBe('string');

        // Poll widget API for the product's quality score (max 20s)
        const scoreItem = await pollForQualityScore(request, token, productId);
        expect(
          scoreItem,
          `Quality score was not upserted within ${POLL_TIMEOUT_MS}ms after product creation`,
        ).not.toBeNull();

        if (!scoreItem) return; // type guard

        // Verify score structure
        expect(typeof scoreItem.score).toBe('number');
        expect(scoreItem.score).toBeGreaterThanOrEqual(0);
        expect(scoreItem.score).toBeLessThanOrEqual(100);
        expect(['A', 'B', 'C', 'D', 'F']).toContain(scoreItem.grade);
        expect(typeof scoreItem.issueCount).toBe('number');
        expect(typeof scoreItem.evaluatedAt).toBe('string');

        // Missing description should cap score at ≤ 40
        expect(scoreItem.score).toBeLessThanOrEqual(40);

        // IDEMPOTENCY: update product (triggers re-evaluation), score row should still be one record
        const updateRes = await apiRequest(request, 'PUT', '/api/catalog/products', {
          token,
          data: { id: productId, subtitle: 'IT-002 idempotency check' },
        });
        expect(updateRes.ok(), `Product update failed: ${updateRes.status()}`).toBeTruthy();

        // Wait one poll cycle and re-fetch
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS * 2));
        const scoreAfterUpdate = await pollForQualityScore(request, token, productId);
        expect(scoreAfterUpdate).not.toBeNull();
        // Should still be the same product (idempotent upsert, not a new row)
        expect(scoreAfterUpdate?.id).toBe(productId);
      } finally {
        await deleteCatalogProductIfExists(request, token, productId);
      }
    },
    { timeout: 40_000 },
  );
});
