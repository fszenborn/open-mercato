"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'

type QualityRuleRow = {
  id: string
  ruleId: string
  label: string | null
  severity: string
  weight: number
  highSeverityCap: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type RulesResponse = {
  items: QualityRuleRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const PAGE_SIZE = 50

const SEVERITY_LABELS: Record<string, string> = {
  INFO: 'Info',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  BLOCKER: 'Blocker',
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: 'text-slate-500',
  LOW: 'text-blue-600',
  MEDIUM: 'text-yellow-600',
  HIGH: 'text-orange-600',
  BLOCKER: 'text-red-600',
}

export default function QualityRulesDataTable() {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const [canManage, setCanManage] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function checkFeature() {
      try {
        const call = await apiCallOrThrow<{ ok?: boolean }>('/api/auth/feature-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ features: ['catalog.quality.manage'] }),
        })
        if (!cancelled) setCanManage(call?.ok === true)
      } catch {
        if (!cancelled) setCanManage(false)
      }
    }
    checkFeature()
    return () => { cancelled = true }
  }, [])

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return params.toString()
  }, [page])

  const { data, isLoading } = useQuery<RulesResponse>({
    queryKey: ['catalog-quality-rules', queryParams, scopeVersion],
    queryFn: async () => {
      const payload = await readApiResultOrThrow<RulesResponse>(
        `/api/catalog/quality/rules?${queryParams}`,
        undefined,
        { errorMessage: t('catalog.quality.rules.list.error.load', 'Failed to load quality rules') },
      )
      return {
        items: Array.isArray(payload.items) ? payload.items : [],
        total: typeof payload.total === 'number' ? payload.total : 0,
        page: typeof payload.page === 'number' ? payload.page : 1,
        pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : PAGE_SIZE,
        totalPages: typeof payload.totalPages === 'number' ? payload.totalPages : 1,
      }
    },
  })

  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleDelete = React.useCallback(async (rule: QualityRuleRow) => {
    const confirmed = await confirm({
      title: t('catalog.quality.rules.delete.title', 'Delete quality rule?'),
      description: t('catalog.quality.rules.delete.description', 'This action cannot be undone.'),
      confirmLabel: t('common.delete', 'Delete'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await apiCallOrThrow('/api/catalog/quality/rules', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: rule.id }),
      })
      flash(t('catalog.quality.rules.delete.success', 'Quality rule deleted.'), 'success')
      queryClient.invalidateQueries({ queryKey: ['catalog-quality-rules'] })
    } catch {
      flash(t('catalog.quality.rules.delete.error', 'Failed to delete quality rule.'), 'error')
    }
  }, [confirm, t, queryClient])

  const columns = React.useMemo<ColumnDef<QualityRuleRow>[]>(() => [
    {
      accessorKey: 'ruleId',
      header: t('catalog.quality.rules.list.columns.rule', 'Rule'),
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="text-sm font-medium font-mono text-foreground">{row.original.ruleId}</span>
      ),
    },
    {
      accessorKey: 'label',
      header: t('catalog.quality.rules.list.columns.label', 'Label'),
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.label ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'severity',
      header: t('catalog.quality.rules.list.columns.severity', 'Severity'),
      meta: { priority: 2 },
      cell: ({ row }) => {
        const sev = row.original.severity
        return (
          <span className={`text-xs font-semibold uppercase ${SEVERITY_COLORS[sev] ?? ''}`}>
            {SEVERITY_LABELS[sev] ?? sev}
          </span>
        )
      },
    },
    {
      accessorKey: 'weight',
      header: t('catalog.quality.rules.list.columns.weight', 'Weight'),
      meta: { priority: 3 },
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.weight}</span>,
    },
    {
      accessorKey: 'isActive',
      header: t('catalog.quality.rules.list.columns.active', 'Active'),
      meta: { priority: 2 },
      cell: ({ row }) => <BooleanIcon value={row.original.isActive} />,
    },
    {
      id: 'actions',
      cell: ({ row }) =>
        canManage ? (
          <RowActions
            items={[
              { id: 'edit', label: t('common.edit', 'Edit'), href: `/backend/catalog/quality/rules/${row.original.id}/edit` },
              { id: 'delete', label: t('common.delete', 'Delete'), destructive: true, onSelect: () => handleDelete(row.original) },
            ]}
          />
        ) : null,
    },
  ], [t, canManage, handleDelete])

  return (
    <>
      {ConfirmDialogElement}
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        totalPages={totalPages}
        onPageChange={setPage}
        toolbar={
          canManage ? (
            <Button asChild size="sm">
              <Link href="/backend/catalog/quality/rules/create">
                {t('catalog.quality.rules.list.create', 'Add Rule')}
              </Link>
            </Button>
          ) : null
        }
      />
    </>
  )
}
