-- 0009_server_api_access: the Vercel server API uses the Supabase service role only.
-- The service role credential is held exclusively in Vercel encrypted environment
-- variables; it is never sent to the browser. Explicit grants are needed because
-- the pilot migrations revoke client-role table ACLs.
grant select on organizations to service_role;
grant select, insert on staff_signatures to service_role;
grant select, insert, update, delete on handovers to service_role;
grant select, insert, update, delete on handover_tasks to service_role;
