import { expect, test } from '@playwright/test';
import {
  getAuthToken,
  apiRequest,
} from '@open-mercato/core/modules/core/__integration__/helpers/api';
import {
  createProductFixture,
  deleteCatalogProductIfExists,
} from '@open-mercato/core/modules/core/__integration__/helpers/catalogFixtures';

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000';

/**
 * IT-003: Widget API — correct payload shape, empty-list handling, RBAC
 * Spec: SPEC-008 Phase 10 IT-003
 */
test.describe('IT-003: Catalog Health Widget API', () => {
  test('returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/api/catalog/dashboard/widgets/catalog-health`,
    );
    expect(res.status()).toBe(401);
  });

  test('returns valid response shape with admin token', async ({ request }) => {
    const token = await getAuthToken(request, 'admin');
    const res = await apiRequest(
      request,
      'GET',
      '/api/catalog/dashboard/widgets/catalog-health?pageSize=5',
      { token },
    );
    expect(res.ok(), `Widget request failed: ${res.status()}`).toBeTruthy();

    const body = (await res.json()) as {
      items?: unknown[];
      total?: unknown;
    };
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(typeof body.total).toBe('number');

    // Verify each item matches spec shape: { id, title, score, grade, issueCount, evaluatedAt }
    for (const item of body.items ?? []) {
      const r = item as Record<string, unknown>;
      expect(typeof r.id).toBe('string');
      // title can be string or null
      expect(r.title === null || typeof r.title === 'string').toBeTruthy();
      expect(typeof r.score).toBe('number');
      expect((r.score as number) >= 0 && (r.score as number) <= 100).toBeTruthy();
      expect(['A', 'B', 'C', 'D', 'F']).toContain(r.grade);
      expect(typeof r.issueCount).toBe('number');
      // evaluatedAt is ISO string or null
      expect(r.evaluatedAt === null || typeof r.evaluatedAt === 'string').toBeTruthy();
      // Legacy fields must NOT be present
      expect('productId' in r).toBeFalsy();
      expect('productTitle' in r).toBeFalsy();
    }
  });

  test('respects pageSize parameter', async ({ request }) => {
    const token = await getAuthToken(request, 'admin');
    const res = await apiRequest(
      request,
      'GET',
      '/api/catalog/dashboard/widgets/catalog-health?pageSize=3',
      { token },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBeTruthy();
    expect((body.items?.length ?? 0)).toBeLessThanOrEqual(3);
  });

  test('respects maxScore filter — only returns items with score <= maxScore', async ({
    request,
  }) => {
    const token = await getAuthToken(request, 'admin');
    const res = await apiRequest(
      request,
      'GET',
      '/api/catalog/dashboard/widgets/catalog-health?pageSize=20&maxScore=50',
      { token },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items?: Array<{ score: number }> };
    for (const item of body.items ?? []) {
      expect(item.score).toBeLessThanOrEqual(50);
    }
  });

  test('returns empty items array when no quality scores exist for scope', async ({
    request,
  }) => {
    // Use maxScore=0 which admits only score=0 products; most fresh envs may have none
    const token = await getAuthToken(request, 'admin');

    // Create a product with extremely good quality (all fields) to make sure we don't accidentally
    // create low-score noise that lands at score=0
    let productId: string | null = null;
    try {
      productId = await createProductFixture(request, token, {
        title: `QA IT-003 full quality ${Date.now()}`,
        sku: `QA-IT003-${Date.now()}`,
      });

      const res = await apiRequest(
        request,
        'GET',
        '/api/catalog/dashboard/widgets/catalog-health?pageSize=20&maxScore=-1',
        { token },
      );
      // maxScore=-1 is below valid range (min 0), so query should reject with 400 or clamp
      // Either way, zero items for impossible maxScore
      if (res.ok()) {
        const body = (await res.json()) as { items?: unknown[] };
        expect(Array.isArray(body.items)).toBeTruthy();
        // maxScore=-1 ≤ no score can match this, so items should be empty
        expect(body.items?.length ?? 0).toBe(0);
      } else {
        // 400 is also an acceptable response for out-of-range maxScore
        expect([400, 422]).toContain(res.status());
      }
    } finally {
      await deleteCatalogProductIfExists(request, token, productId);
    }
  });
});
