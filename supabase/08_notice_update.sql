-- =====================================================================
-- KirayaSaathi  |  PART 8: change the move-out date of a tenant who is already on notice
-- Run once after part 7. Safe to run again.
-- =====================================================================
create or replace function public.api_give_notice(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid bigint := public._uid(); v_bid bigint := public._bid(p->>'id');
  v_nd date := public._date(p->>'notice_date'); v_ld date := public._date(p->>'leave_date');
begin
  perform public._assert_write(v_uid);
  perform public._chk_booking(v_bid, v_uid);
  if v_nd is null or v_ld is null or v_ld < v_nd then perform public._err('E_VALIDATION', 'Please check the details you entered.'); end if;
  -- an active stay gets a notice; a stay already on notice only gets new dates
  update bookings set status = 'notice', notice_date = v_nd, leave_date = v_ld where id = v_bid and status in ('active', 'notice');
  if not found then perform public._err('E_VALIDATION', 'Notice can be given to an active booking only.'); end if;
  return jsonb_build_object('id', v_bid);
end $$;
notify pgrst, 'reload schema';
