"use client"

import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import QualityRulesDataTable from '../../../../components/quality/QualityRulesDataTable'

export default function QualityRulesPage() {
  return (
    <Page>
      <PageBody>
        <QualityRulesDataTable />
      </PageBody>
    </Page>
  )
}
