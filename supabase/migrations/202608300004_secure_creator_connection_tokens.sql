-- OAuth token ciphertext is server-only. Authenticated clients may read and
-- update connection metadata, but can never select or write the token column.
revoke insert, delete on table public.instagram_creator_connections from authenticated;
revoke select (access_token_ciphertext) on public.instagram_creator_connections from authenticated;
revoke insert (access_token_ciphertext) on public.instagram_creator_connections from authenticated;
revoke update (access_token_ciphertext) on public.instagram_creator_connections from authenticated;
