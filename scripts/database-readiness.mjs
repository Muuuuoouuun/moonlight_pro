// db:check contract. A feature is ready only when every check below passes.
//   tables / functions   the object exists; tables have RLS on, functions run for service_role only
// Optional checks that tell create-or-replace versions apart (there is no applied-migrations table;
// migration filenames are the identity, so a redefined function or constraint must be read back):
//   bodyIncludes       [[functionSignature, substring]]        pg_proc.prosrc contains substring
//   bodyExcludes       [[functionSignature, substring]]        the function exists and its body lacks substring
//   constraintIncludes [[table, constraintName, substring]]    pg_get_constraintdef contains substring
//   tableNoWrite       [[table, role]]                         role holds no INSERT/UPDATE/DELETE/TRUNCATE
// Markers are copied verbatim (case-sensitive) from the migration body; database-readiness.test.mjs
// proves each one is in its migration and absent from the version that migration replaces.
const JOURNAL_SEARCH = 'journal_search_v1(uuid,text,timestamptz,timestamptz,text,text,uuid,text,timestamptz,uuid,integer)';
const CONTENT_WORKFLOW = 'content_workflow_v1(uuid,uuid,text,jsonb)';
const GOAL_COMMAND = 'operating_goal_command_v1(uuid,text,jsonb)';
const AI_COMMAND = 'operating_ai_command_v1(uuid,text,jsonb,jsonb)';
export const DATABASE_FEATURES = [
  { name: '콘텐츠', migration: '20260912_0026_content_workflow.sql',
    tables: ['content_revisions', 'content_workflow_receipts', 'content_transform_runs'], functions: [CONTENT_WORKFLOW] },
  { name: '메모', migration: '20260913_0027_journal_notes.sql',
    tables: ['journal_note_revisions', 'journal_links', 'journal_workflow_receipts'], functions: ['journal_workflow_v1(uuid,uuid,jsonb)'] },
  { name: '문의', migration: '20260913_0028_unified_inquiries.sql',
    tables: ['inquiries', 'inquiry_events', 'inquiry_sync_states'], functions: ['inquiry_command_v1(uuid,jsonb)'] },
  { name: '메모 검색', migration: '20260913_0030_journal_search.sql', tables: [], functions: [JOURNAL_SEARCH] },
  { name: '발견 후속 행동', migration: '20260913_0031_discovery_nudges.sql',
    tables: ['discovery_nudge_states', 'discovery_nudge_receipts'], functions: ['read_discovery_nudge_v1(uuid,uuid)', 'save_discovery_nudge_v1(uuid,jsonb)'] },
  { name: 'Agent 명령', migration: '20260913_0032_agent_commands.sql', tables: ['agent_command_receipts'],
    functions: ['agent_command_v1(uuid,text,text[],jsonb)', 'agent_command_receipt_v1(uuid,text,text[],uuid)'] },
  { name: 'Agent 작업', migration: '20260913_0033_agent_jobs.sql',
    tables: ['agent_jobs', 'agent_job_events', 'agent_workers'], functions: ['agent_jobs_v1(uuid,text,text,jsonb)', 'agent_worker_v1(uuid,text,text,jsonb)'] },
  { name: 'Threads 변형 유형', migration: '20260914_0001_content_threads_post.sql', tables: [], functions: [],
    constraintIncludes: [['content_variants', 'content_variants_variant_type_check', "'threads_post'"]] },
  { name: 'Threads 스튜디오 채널', migration: '20260915_0034_threads_studio_compat.sql', tables: [], functions: [],
    bodyIncludes: [['content_workflow_channel_v1(text,text)', "p_type = 'threads_post'"]] },
  { name: '메모 태그 검색', migration: '20260920_0035_journal_tags_search.sql', tables: [], functions: [],
    bodyIncludes: [[JOURNAL_SEARCH, 'matched_tag']] },
  { name: '운영 목표·지표', migration: '20260921_0036_operating_goals.sql',
    tables: ['operating_objectives', 'operating_metrics', 'operating_observations', 'operating_goal_links', 'operating_goal_receipts'],
    functions: [GOAL_COMMAND, 'operating_goal_receipt_v1(uuid,text,uuid)'] },
  { name: 'AI 어시스트', migration: '20260921_0037_ai_assistance.sql',
    tables: ['operating_ai_candidates', 'operating_ai_receipts'],
    functions: [AI_COMMAND, 'operating_ai_receipt_v1(uuid,text,uuid,jsonb)', 'operating_ai_finish_v1(uuid,text,uuid,jsonb)'] },
  { name: 'Office 업무 연결', migration: '20260921_0038_office_requests.sql', tables: ['office_requests'],
    functions: ['office_request_receipt_v1(uuid,text,uuid,jsonb)', 'office_request_claim_v1(uuid,text,jsonb,jsonb)',
      'office_request_finish_v1(uuid,text,uuid,uuid,jsonb)', 'office_request_list_v1(uuid,text,text,text,jsonb,integer,jsonb)',
      'office_request_log_v1(uuid,text,uuid,uuid,text)', 'office_application_claim_v1(uuid,text,uuid,integer,jsonb,jsonb)',
      'office_apply_task_v1(uuid,text,uuid)', 'office_application_refresh_v1(uuid,text,uuid)', 'office_requests_expire_v1(timestamptz)'] },
  { name: '캘린더 기록', migration: '20260922_0036_calendar_event_outcomes.sql', tables: ['calendar_event_outcomes'], functions: [] },
  { name: '콘텐츠 복원 성과 보존', migration: '20260922_0037_content_performance_restore.sql', tables: [], functions: [],
    bodyIncludes: [[CONTENT_WORKFLOW, "v_variant.meta ? 'performance'"]] },
  { name: '목표 명령 해시 수정', migration: '20260922_0039_operating_goal_hash_fix.sql', tables: [], functions: [],
    bodyIncludes: [[GOAL_COMMAND, 'sha256(convert_to'], [GOAL_COMMAND, 'invalid_time_zone_displacement_value']],
    bodyExcludes: [[GOAL_COMMAND, 'digest(']] },
  { name: 'Office 적용 재시도', migration: '20260922_0040_office_apply_transient_retry.sql', tables: [], functions: [],
    bodyIncludes: [['office_apply_task_v1(uuid,text,uuid)', 'same-command-id-and-input-only']] },
  { name: 'AI 어시스트 보강', migration: '20260922_0041_ai_assistance_hardening.sql', tables: [], functions: [],
    bodyIncludes: [[AI_COMMAND, "v_input->>'expectedRevision' IS NULL"], [AI_COMMAND, "v_input->>'expectedSourceUpdatedAt' IS NULL"]],
    tableNoWrite: [['operating_ai_candidates', 'service_role'], ['operating_ai_receipts', 'service_role']] },
];
// One row per check: kind + name (table or function signature) + subject (constraint or role) + detail (marker).
export function featureChecks(feature) {
  return [
    ...(feature.tables ?? []).map(name => ({ kind: 'table', name, subject: '', detail: '' })),
    ...(feature.functions ?? []).map(name => ({ kind: 'function', name, subject: '', detail: '' })),
    ...(feature.bodyIncludes ?? []).map(([name, detail]) => ({ kind: 'body_includes', name, subject: '', detail })),
    ...(feature.bodyExcludes ?? []).map(([name, detail]) => ({ kind: 'body_excludes', name, subject: '', detail })),
    ...(feature.constraintIncludes ?? []).map(([name, subject, detail]) => ({ kind: 'constraint_includes', name, subject, detail })),
    ...(feature.tableNoWrite ?? []).map(([name, subject]) => ({ kind: 'table_no_write', name, subject, detail: '' })),
  ];
}
const literal = value => "'" + value.replaceAll("'", "''") + "'";
// A single read-only SELECT. `present` = the object exists; `protected` = its check passes.
export function readinessSql(features = DATABASE_FEATURES) {
  const rows = features.flatMap(feature => featureChecks(feature).map(check => [feature.migration, check.kind, check.name, check.subject, check.detail]));
  return `with required(migration,kind,name,subject,detail) as (values ${rows.map(row => '(' + row.map(literal).join(',') + ')').join(',')}),
  objects as (select *,case when kind in ('function','body_includes','body_excludes') then to_regprocedure('public.'||name)::oid
    else to_regclass('public.'||name)::oid end as object_id from required),
  facts as (select *,(select p.prosrc from pg_proc p where p.oid=object_id and kind in ('body_includes','body_excludes')) as body,
    (select pg_get_constraintdef(c.oid) from pg_constraint c where kind='constraint_includes' and c.conrelid=object_id and c.conname=subject limit 1) as constraint_def
    from objects)
  select migration,kind,name,subject,detail,object_id is not null and (kind<>'constraint_includes' or constraint_def is not null) as present,
    case when object_id is null then false when kind='table' then coalesce((select relrowsecurity from pg_class where oid=object_id),false)
      when kind='function' then has_function_privilege('service_role',object_id,'EXECUTE') and not has_function_privilege('anon',object_id,'EXECUTE')
        and not has_function_privilege('authenticated',object_id,'EXECUTE')
      when kind='body_includes' then coalesce(strpos(body,detail)>0,false)
      when kind='body_excludes' then coalesce(strpos(body,detail)=0,false)
      when kind='constraint_includes' then coalesce(strpos(constraint_def,detail)>0,false)
      when kind='table_no_write' then not has_table_privilege(subject,object_id,'INSERT,UPDATE,DELETE,TRUNCATE')
      else false end as protected
  from facts order by migration,kind,name,subject,detail`;
}
// Tables and functions keep their bare name (the pre-existing output); newer checks say what failed.
function failureReason(check, row) {
  const { kind, name, subject, detail } = check;
  if (kind === 'table' || kind === 'function') return name;
  const present = row?.present === true;
  if (kind === 'constraint_includes') return present ? `${name}.${subject}에 ${detail} 없음 (이전 버전)` : `${name}.${subject} 없음`;
  if (kind === 'table_no_write') return present ? `${name}: ${subject} 직접 쓰기 권한 남음` : `${name} 없음`;
  if (!present) return `${name} 없음`;
  const fn = name.split('(')[0];
  return `${fn} 본문에 "${detail}" ${kind === 'body_excludes' ? '남음' : '없음'} (이전 버전)`;
}
export function summarizeReadiness(rows, features = DATABASE_FEATURES) {
  if (!Array.isArray(rows)) throw Error('Invalid database readiness response');
  return features.map(feature => {
    const failed = featureChecks(feature).flatMap(check => {
      const matches = rows.filter(row => row?.migration === feature.migration && row.kind === check.kind && row.name === check.name
        && (row.subject ?? '') === check.subject && (row.detail ?? '') === check.detail);
      if (matches.some(row => row.present === true && row.protected === true)) return [];
      return [failureReason(check, matches.find(row => row.present === true) ?? matches[0])];
    });
    return { feature: feature.name, migration: feature.migration, ready: failed.length === 0, missingOrUnprotected: failed };
  });
}
