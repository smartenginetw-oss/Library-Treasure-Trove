-- Column-level grants replace table-wide SELECT/UPDATE so OAuth ciphertext
-- remains readable only by the server's service_role client.
revoke select, update on table public.instagram_creator_connections from authenticated;
grant select (id, instagram_user_id, username, display_name, token_expires_at, status, last_synced_at, last_error, created_at, updated_at) on table public.instagram_creator_connections to authenticated;
grant update (status, last_error) on table public.instagram_creator_connections to authenticated;
