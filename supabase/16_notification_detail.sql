-- PART 16: the notification list also returns notice_id (so a tapped push can open its detail page)
-- Run once in Supabase > SQL Editor. Safe to run again.
create or replace function public.api_get_notifications(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid();
begin
  return jsonb_build_object(
    'push_enabled', coalesce((select push_enabled from users where id = v_uid), true),
    'unread', (select count(*) from user_notifications where user_id = v_uid and read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'notice_id', n.notice_id, 'title', n.title, 'body', n.body, 'type', n.type,
                                          'url', n.url, 'read', n.read_at is not null, 'created_at', n.created_at)
                       order by n.id desc)
        from (select * from user_notifications where user_id = v_uid order by id desc limit 100) n
    ), '[]'::jsonb));
end $$;
revoke all on function public.api_get_notifications(jsonb) from public, anon;
grant execute on function public.api_get_notifications(jsonb) to authenticated;
notify pgrst, 'reload schema';
