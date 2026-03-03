"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type QualityRuleFormValues = {
  id?: string
  ruleId: string
  label?: string | null
  severity: string
  weight: number | string
  highSeverityCap: number | string
  params?: string
  isActive?: boolean
}

type RuleRow = {
  id: string
  ruleId: string
  label: string | null
  severity: string
  weight: number
  highSeverityCap: number
  params: Record<string, unknown>
  isActive: boolean
}

type RulesResponse = {
  items?: RuleRow[]
}

const SEVERITY_OPTIONS = [
  { value: 'INFO', label: 'Info' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'BLOCKER', label: 'Blocker' },
]

async function submitUpdate(values: QualityRuleFormValues, t: (key: string, fallback?: string) => string) {
  const id = typeof values.id === 'string' ? values.id : ''
  if (!id) {
    const message = t('catalog.quality.rules.form.errors.idRequired', 'Quality rule identifier is required.')
    throw createCrudFormError(message, { id: message })
  }

  let params: Record<string, unknown> = {}
  if (typeof values.params === 'string' && values.params.trim()) {
    try {
      params = JSON.parse(values.params.trim())
    } catch {
      const message = t('catalog.quality.rules.form.errors.params', 'Params must be valid JSON.')
      throw createCrudFormError(message, { params: message })
    }
  }

  await updateCrud('catalog/quality/rules', {
    id,
    ruleId: typeof values.ruleId === 'string' ? values.ruleId.trim() : undefined,
    label: typeof values.label === 'string' && values.label.trim() ? values.label.trim() : null,
    severity: values.severity || undefined,
    weight: typeof values.weight !== 'undefined' ? Number(values.weight) : undefined,
    highSeverityCap: typeof values.highSeverityCap !== 'undefined' ? Number(values.highSeverityCap) : undefined,
    params,
    isActive: values.isActive,
  })
}

export default function EditQualityRulePage({ params }: { params?: { id?: string } }) {
  const ruleId = params?.id ?? ''
  const t = useT()
  const [initialValues, setInitialValues] = React.useState<QualityRuleFormValues | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!ruleId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { ok, result } = await apiCall<RulesResponse>(
          `/api/catalog/quality/rules?ids=${encodeURIComponent(ruleId)}&page=1&pageSize=1`,
        )
        if (!ok) throw new Error(t('catalog.quality.rules.form.errors.load', 'Failed to load quality rule'))
        const record = Array.isArray(result?.items) ? result.items?.[0] : null
        if (!record) throw new Error(t('catalog.quality.rules.form.errors.notFound', 'Quality rule not found'))
        if (!cancelled) {
          setInitialValues({
            id: record.id,
            ruleId: record.ruleId,
            label: record.label ?? '',
            severity: record.severity,
            weight: record.weight,
            highSeverityCap: record.highSeverityCap,
            params: JSON.stringify(record.params ?? {}, null, 2),
            isActive: record.isActive,
          })
        }
      } catch (err) {
        if (!cancelled) {
          const fallback = t('catalog.quality.rules.form.errors.load', 'Failed to load quality rule')
          setError(err instanceof Error ? err.message : fallback)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ruleId, t])

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'ruleId',
      label: t('catalog.quality.rules.form.field.ruleId', 'Rule ID'),
      type: 'text',
      required: true,
    },
    {
      id: 'label',
      label: t('catalog.quality.rules.form.field.label', 'Label'),
      type: 'text',
    },
    {
      id: 'severity',
      label: t('catalog.quality.rules.form.field.severity', 'Severity'),
      type: 'select',
      options: SEVERITY_OPTIONS,
      required: true,
    },
    {
      id: 'weight',
      label: t('catalog.quality.rules.form.field.weight', 'Weight'),
      type: 'number',
    },
    {
      id: 'highSeverityCap',
      label: t('catalog.quality.rules.form.field.highSeverityCap', 'HIGH severity cap'),
      type: 'number',
    },
    {
      id: 'params',
      label: t('catalog.quality.rules.form.field.params', 'Params (JSON)'),
      type: 'textarea',
    },
    {
      id: 'isActive',
      label: t('catalog.quality.rules.form.field.isActive', 'Active'),
      type: 'checkbox',
    },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    {
      id: 'details',
      title: t('catalog.quality.rules.form.group.details', 'Rule Configuration'),
      column: 1,
      fields: ['ruleId', 'label', 'severity', 'weight', 'highSeverityCap', 'params', 'isActive'],
    },
  ], [t])

  const successMessage = encodeURIComponent(t('catalog.quality.rules.flash.updated', 'Quality rule updated'))

  if (loading) return <LoadingMessage />
  if (error || !initialValues) return <ErrorMessage message={error ?? t('catalog.quality.rules.form.errors.notFound', 'Quality rule not found')} />

  return (
    <Page>
      <PageBody>
        <CrudForm<QualityRuleFormValues>
          title={t('catalog.quality.rules.form.editTitle', 'Edit quality rule')}
          backHref="/backend/catalog/quality/rules"
          fields={fields}
          groups={groups}
          initialValues={initialValues}
          submitLabel={t('catalog.quality.rules.form.action.update', 'Update')}
          cancelHref="/backend/catalog/quality/rules"
          successRedirect={`/backend/catalog/quality/rules?flash=${successMessage}&type=success`}
          onSubmit={async (values) => {
            await submitUpdate({ ...values, id: ruleId }, t)
          }}
        />
      </PageBody>
    </Page>
  )
}
