import { Migration } from '@mikro-orm/migrations';

export class Migration20260228120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`
      create table "catalog_data_quality_rules" (
        "id" uuid not null default gen_random_uuid(),
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "rule_id" text not null,
        "label" text null,
        "severity" text not null default 'MEDIUM',
        "weight" numeric(5, 2) not null default 1.0,
        "params" jsonb not null default '{}',
        "high_severity_cap" smallint not null default 40,
        "is_active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "catalog_data_quality_rules_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index "dqe_rules_tenant_org_idx" on "catalog_data_quality_rules" ("organization_id", "tenant_id");`);

    this.addSql(`
      create table "catalog_data_quality_scores" (
        "id" uuid not null default gen_random_uuid(),
        "product_id" uuid not null,
        "organization_id" uuid not null,
        "tenant_id" uuid not null,
        "score" smallint not null,
        "grade" char(1) not null,
        "violations" jsonb not null default '{}',
        "evaluated_at" timestamptz not null,
        constraint "catalog_data_quality_scores_pkey" primary key ("id")
      );
    `);
    this.addSql(`alter table "catalog_data_quality_scores" add constraint "dqe_scores_product_tenant_unique" unique ("product_id", "tenant_id");`);
    this.addSql(`create index "dqe_scores_score_idx" on "catalog_data_quality_scores" ("score");`);
    this.addSql(`create index "dqe_scores_grade_idx" on "catalog_data_quality_scores" ("grade");`);
    this.addSql(`create index "dqe_scores_tenant_org_idx" on "catalog_data_quality_scores" ("organization_id", "tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "catalog_data_quality_scores";`);
    this.addSql(`drop table if exists "catalog_data_quality_rules";`);
  }

}
