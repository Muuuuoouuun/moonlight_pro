-- Enforce idempotency for provider webhook deliveries.
--
-- Existing duplicate rows keep their audit value, but only the first row keeps
-- the raw provider_event_id. Later duplicates receive a deterministic suffix so
-- the partial unique index can be created without deleting history.

with ranked_webhook_events as (
  select
    id,
    row_number() over (
      partition by workspace_id, source, provider_event_id
      order by received_at asc, id asc
    ) as duplicate_rank
  from webhook_events
  where provider_event_id is not null
)
update webhook_events
set provider_event_id = provider_event_id || ':duplicate:' || id::text
where id in (
  select id
  from ranked_webhook_events
  where duplicate_rank > 1
);

drop index if exists idx_webhook_events_provider_event;

create unique index if not exists idx_webhook_events_provider_event
  on webhook_events (workspace_id, source, provider_event_id)
  where provider_event_id is not null;
