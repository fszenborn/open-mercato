"use client"

import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type QualityRuleFormValues = {
  ruleId: string
  label?: string
  severity: string
  weight: number | string
  highSeverityCap: number | string
  conditionExpression?: string
  isActive?: boolean
}

const SEVERITY_OPTIONS = [
  { value: 'INFO', label: 'Info' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'BLOCKER', label: 'Blocker' },
]

async function submitCreate(values: QualityRuleFormValues, t: (key: string, fallback?: string) => string) {
  const ruleId = typeof values.ruleId === 'string' ? values.ruleId.trim() : ''
  if (!ruleId) {
    const message = t('catalog.quality.rules.form.errors.ruleId', 'Rule identifier is required.')
    throw createCrudFormError(message, { ruleId: message })
  }

  let conditionExpression: Record<string, unknown> = {}
  const rawExpr = typeof values.conditionExpression === 'string' ? values.conditionExpression.trim() : ''
  if (!rawExpr) {
    const message = t('catalog.quality.rules.form.errors.conditionExpression', 'Condition expression is required.')
    throw createCrudFormError(message, { conditionExpression: message })
  }
  try {
    conditionExpression = JSON.parse(rawExpr)
  } catch {
    const message = t('catalog.quality.rules.form.errors.conditionExpressionJson', 'Condition expression must be valid JSON.')
    throw createCrudFormError(message, { conditionExpression: message })
  }

  await createCrud('catalog/quality/rules', {
    ruleId,
    label: typeof values.label === 'string' && values.label.trim() ? values.label.trim() : null,
    severity: values.severity || 'MEDIUM',
    weight: Number(values.weight) || 1.0,
    highSeverityCap: Number(values.highSeverityCap) ?? 40,
    conditionExpression,
    isActive: values.isActive !== false,
  })
}

export default function CreateQualityRulePage() {
  const t = useT()

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'ruleId',
      label: t('catalog.quality.rules.form.field.ruleId', 'Rule ID'),
      type: 'text',
      required: true,
      description: t('catalog.quality.rules.form.field.ruleIdHelp', 'Unique slug for this rule, e.g. quality.title.required'),
    },
    {
      id: 'label',
      label: t('catalog.quality.rules.form.field.label', 'Label'),
      type: 'text',
      description: t('catalog.quality.rules.form.field.labelHelp', 'Human-readable name for this rule configuration.'),
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
      description: t('catalog.quality.rules.form.field.weightHelp', 'Contribution weight (0.1 – 10). Default: 1.0'),
    },
    {
      id: 'highSeverityCap',
      label: t('catalog.quality.rules.form.field.highSeverityCap', 'HIGH severity cap'),
      type: 'number',
      description: t('catalog.quality.rules.form.field.highSeverityCapHelp', 'Maximum score when a HIGH severity rule fails (0–100).'),
    },
    {
      id: 'conditionExpression',
      label: t('catalog.quality.rules.form.field.conditionExpression', 'Condition Expression (JSON)'),
      type: 'textarea',
      required: true,
      description: t('catalog.quality.rules.form.field.conditionExpressionHelp', 'Business Rules expression, e.g. {"operator":"IS_NOT_EMPTY","field":"title"} or {"operator":">=","field":"mediaCount","value":1}'),
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
      fields: ['ruleId', 'label', 'severity', 'weight', 'highSeverityCap', 'conditionExpression', 'isActive'],
    },
  ], [t])

  const successMessage = encodeURIComponent(t('catalog.quality.rules.flash.created', 'Quality rule created'))

  return (
    <Page>
      <PageBody>
        <CrudForm<QualityRuleFormValues>
          title={t('catalog.quality.rules.form.createTitle', 'Add quality rule')}
          backHref="/backend/catalog/quality/rules"
          fields={fields}
          groups={groups}
          initialValues={{ ruleId: '', label: '', severity: 'MEDIUM', weight: 1.0, highSeverityCap: 40, conditionExpression: '{}', isActive: true }}
          submitLabel={t('catalog.quality.rules.form.action.create', 'Create')}
          cancelHref="/backend/catalog/quality/rules"
          successRedirect={`/backend/catalog/quality/rules?flash=${successMessage}&type=success`}
          onSubmit={async (values) => {
            await submitCreate(values, t)
          }}
        />
      </PageBody>
    </Page>
  )
}

export default function CreateQualityRulePage() {
  const t = useT()

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'ruleId',
      label: t('catalog.quality.rules.form.field.ruleId', 'Rule ID'),
      type: 'text',
      required: true,
      description: t('catalog.quality.rules.form.field.ruleIdHelp', 'e.g., attr.required, media.min_count'),
    },
    {
      id: 'label',
      label: t('catalog.quality.rules.form.field.label', 'Label'),
      type: 'text',
      description: t('catalog.quality.rules.form.field.labelHelp', 'Human-readable name for this rule configuration.'),
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
      description: t('catalog.quality.rules.form.field.weightHelp', 'Contribution weight (0.1 – 10). Default: 1.0'),
    },
    {
      id: 'highSeverityCap',
      label: t('catalog.quality.rules.form.field.highSeverityCap', 'HIGH severity cap'),
      type: 'number',
      description: t('catalog.quality.rules.form.field.highSeverityCapHelp', 'Maximum score deduction for HIGH severity (0–100). Ignored for other severities.'),
    },
    {
      id: 'params',
      label: t('catalog.quality.rules.form.field.params', 'Params (JSON)'),
      type: 'textarea',
      description: t('catalog.quality.rules.form.field.paramsHelp', 'Rule-specific parameters as a JSON object, e.g., {"field":"title"}.'),
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

  const successMessage = encodeURIComponent(t('catalog.quality.rules.flash.created', 'Quality rule created'))

  return (
    <Page>
      <PageBody>
        <CrudForm<QualityRuleFormValues>
          title={t('catalog.quality.rules.form.createTitle', 'Add quality rule')}
          backHref="/backend/catalog/quality/rules"
          fields={fields}
          groups={groups}
          initialValues={{ ruleId: '', label: '', severity: 'MEDIUM', weight: 1.0, highSeverityCap: 40, params: '{}', isActive: true }}
          submitLabel={t('catalog.quality.rules.form.action.create', 'Create')}
          cancelHref="/backend/catalog/quality/rules"
          successRedirect={`/backend/catalog/quality/rules?flash=${successMessage}&type=success`}
          onSubmit={async (values) => {
            await submitCreate(values, t)
          }}
        />
      </PageBody>
    </Page>
  )
}
