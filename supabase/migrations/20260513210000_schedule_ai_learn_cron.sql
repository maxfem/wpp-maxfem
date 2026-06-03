-- Cron diário às 04:00 BRT (07:00 UTC) para a Ana aprender com as conversas
-- do dia anterior e atualizar o dashboard de saúde.
-- (pg_cron e pg_net já habilitados no projeto)

-- Remove agendamento anterior se houver
do $$
declare j record;
begin
  for j in select jobid, jobname from cron.job where jobname = 'ai-learn-daily' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- Agenda novo
select cron.schedule(
  'ai-learn-daily',
  '0 7 * * *',
  $cron$
    select net.http_post(
      url := 'https://lfpwubqmpztxhrmxadcl.supabase.co/functions/v1/ai-learn-from-conversations',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);
