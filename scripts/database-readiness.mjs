export const DATABASE_FEATURES = [
  { name: '캘린더 기록', migration: '20260922_0036_calendar_event_outcomes.sql', tables: ['calendar_event_outcomes'], functions: [] },
  { name: '콘텐츠', migration: '20260912_0026_content_workflow.sql',
    tables: ['content_revisions', 'content_workflow_receipts', 'content_transform_runs'], functions: ['content_workflow_v1(uuid,uuid,text,jsonb)'] },
  { name: '메모', migration: '20260913_0027_journal_notes.sql',
    tables: ['journal_note_revisions', 'journal_links', 'journal_workflow_receipts'], functions: ['journal_workflow_v1(uuid,uuid,jsonb)'] },
  { name: '문의', migration: '20260913_0028_unified_inquiries.sql',
    tables: ['inquiries', 'inquiry_events', 'inquiry_sync_states'], functions: ['inquiry_command_v1(uuid,jsonb)'] },
  { name: '메모 검색', migration: '20260913_0030_journal_search.sql', tables: [],
    functions: ['journal_search_v1(uuid,text,timestamptz,timestamptz,text,text,uuid,text,timestamptz,uuid,integer)'] },
  { name: '발견 후속 행동', migration: '20260913_0031_discovery_nudges.sql',
    tables: ['discovery_nudge_states', 'discovery_nudge_receipts'], functions: ['read_discovery_nudge_v1(uuid,uuid)', 'save_discovery_nudge_v1(uuid,jsonb)'] },
  { name: 'Agent 명령', migration: '20260913_0032_agent_commands.sql', tables: ['agent_command_receipts'],
    functions: ['agent_command_v1(uuid,text,text[],jsonb)', 'agent_command_receipt_v1(uuid,text,text[],uuid)'] },
  { name: 'Agent 작업', migration: '20260913_0033_agent_jobs.sql',
    tables: ['agent_jobs', 'agent_job_events', 'agent_workers'], functions: ['agent_jobs_v1(uuid,text,text,jsonb)', 'agent_worker_v1(uuid,text,text,jsonb)'] },
];
const literal = value => "'" + value.replaceAll("'", "''") + "'";
export function readinessSql() {
  const rows = DATABASE_FEATURES.flatMap(feature => [
    ...feature.tables.map(name => [feature.migration, 'table', name]),
    ...feature.functions.map(name => [feature.migration, 'function', name]),
  ]);
  return `with required(migration,kind,name) as (values ${rows.map(row => '(' + row.map(literal).join(',') + ')').join(',')}),
  objects as (select *,case when kind='table' then to_regclass('public.'||name)::oid else to_regprocedure('public.'||name)::oid end as object_id from required)
  select migration,kind,name,object_id is not null as present,
    case when object_id is null then false when kind='table' then coalesce((select relrowsecurity from pg_class where oid=object_id),false)
      else has_function_privilege('service_role',object_id,'EXECUTE') and not has_function_privilege('anon',object_id,'EXECUTE')
        and not has_function_privilege('authenticated',object_id,'EXECUTE') end as protected
  from objects order by migration,kind,name`;
}
export function summarizeReadiness(rows) {
  if (!Array.isArray(rows)) throw Error('Invalid database readiness response');
  return DATABASE_FEATURES.map(feature => {
    const expected = [...feature.tables.map(name => ['table', name]), ...feature.functions.map(name => ['function', name])];
    const failed = expected.filter(([kind,name]) => !rows.some(row => row.migration === feature.migration && row.kind === kind && row.name === name && row.present === true && row.protected === true));
    return { feature: feature.name, migration: feature.migration, ready: failed.length === 0, missingOrUnprotected: failed.map(([, name]) => name) };
  });
}
