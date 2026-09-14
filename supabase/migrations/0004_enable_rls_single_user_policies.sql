-- Uso pessoal, usuário único. RLS fica ligado em tudo; o acesso é concedido
-- ao papel autenticado e ao papel de aplicação usado pelo servidor.
-- A role `anon` nunca recebe policy: sem sessão, nada é legível.
do $$
declare
  t text;
begin
  foreach t in array array[
    'searches', 'listings', 'listing_snapshots', 'reviews', 'anchors',
    'filter_sets', 'listing_verdicts', 'alerts', 'geocode_cache'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_single_user', t);
    execute format(
      'create policy %I on public.%I for all to authenticated, garimpo_app using (true) with check (true)',
      t || '_single_user', t
    );
  end loop;
end $$;

grant usage on schema public to garimpo_app;
grant all privileges on all tables in schema public to garimpo_app;
grant all privileges on all sequences in schema public to garimpo_app;
grant execute on all functions in schema public to garimpo_app;
