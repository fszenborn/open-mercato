import { expect, test } from '@playwright/test';
import { getAuthToken, apiRequest } from '@open-mercato/core/modules/core/__integration__/helpers/api';

/**
 * IT-001: Full CRUD lifecycle for Quality Rules via API
 * Spec: SPEC-008 Phase 10 IT-001
 * Creates a rule, reads list, updates, soft-deletes, verifies list is empty.
 * Self-contained: cleans up in finally block.
 */
test.describe('IT-001: Quality Rules CRUD API', () => {
  test('should create, list, update and soft-delete a quality rule', async ({ request }) => {
    let token: string | null = null;
    let createdRuleId: string | null = null;

    try {
      token = await getAuthToken(request, 'admin');

      // CREATE
      const createRes = await apiRequest(request, 'POST', '/api/catalog/quality/rules', {
        token,
        data: {
          ruleId: 'attr.required',
          label: 'QA IT-001 test rule',
          severity: 'LOW',
          weight: 0.5,
          params: { field: 'subtitle' },
          highSeverityCap: 40,
          isActive: true,
        },
      });
      expect(createRes.ok(), `Create failed: ${createRes.status()}`).toBeTruthy();
      const createBody = (await createRes.json()) as { id?: string };
      expect(typeof createBody.id).toBe('string');
      createdRuleId = createBody.id as string;

      // LIST — verify rule appears
      const listRes = await apiRequest(request, 'GET', '/api/catalog/quality/rules?pageSize=50', {
        token,
      });
      expect(listRes.ok(), `List failed: ${listRes.status()}`).toBeTruthy();
      const listBody = (await listRes.json()) as { items?: Array<{ id: string; label: string }> };
      expect(Array.isArray(listBody.items)).toBeTruthy();
      const found = listBody.items?.find((r) => r.id === createdRuleId);
      expect(found, 'Created rule not found in list').toBeTruthy();
      expect(found?.label).toBe('QA IT-001 test rule');

      // UPDATE — change label and weight via PUT (in-body id)
      const updateRes = await apiRequest(request, 'PUT', '/api/catalog/quality/rules', {
        token,
        data: { id: createdRuleId, label: 'QA IT-001 updated', weight: 1.5 },
      });
      expect(updateRes.ok(), `Update failed: ${updateRes.status()}`).toBeTruthy();

      // LIST — verify label updated
      const listAfterUpdateRes = await apiRequest(
        request,
        'GET',
        `/api/catalog/quality/rules?pageSize=50`,
        { token },
      );
      const listAfterUpdate = (await listAfterUpdateRes.json()) as {
        items?: Array<{ id: string; label: string; weight: number }>;
      };
      const updated = listAfterUpdate.items?.find((r) => r.id === createdRuleId);
      expect(updated?.label).toBe('QA IT-001 updated');
      expect(updated?.weight).toBe(1.5);

      // SOFT-DELETE
      const deleteRes = await apiRequest(request, 'DELETE', '/api/catalog/quality/rules', {
        token,
        data: { id: createdRuleId },
      });
      expect(deleteRes.ok(), `Delete failed: ${deleteRes.status()}`).toBeTruthy();

      // LIST — verify rule no longer appears (soft-deleted)
      const listAfterDeleteRes = await apiRequest(
        request,
        'GET',
        `/api/catalog/quality/rules?pageSize=50`,
        { token },
      );
      const listAfterDelete = (await listAfterDeleteRes.json()) as {
        items?: Array<{ id: string }>;
      };
      const deletedRule = listAfterDelete.items?.find((r) => r.id === createdRuleId);
      expect(deletedRule).toBeUndefined();

      // Mark as cleaned up
      createdRuleId = null;
    } finally {
      if (token && createdRuleId) {
        await apiRequest(request, 'DELETE', '/api/catalog/quality/rules', {
          token,
          data: { id: createdRuleId },
        }).catch(() => {});
      }
    }
  });

  test('should return 401 when unauthenticated', async ({ request }) => {
    const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000';
    const res = await request.get(`${BASE_URL}/api/catalog/quality/rules`);
    expect(res.status()).toBe(401);
  });
});
