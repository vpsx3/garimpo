# Migrations

Aplicadas no projeto Supabase via MCP (`apply_migration`) e espelhadas aqui
para que o schema viva no repositório.

O papel `garimpo_app` (usado pelo servidor da aplicação) é criado fora das
migrations, porque a instrução carrega a senha:

```sql
create role garimpo_app with login password '<senha>';
grant usage on schema public, extensions to garimpo_app;
alter role garimpo_app set search_path = public, extensions;
```

Depois de cada migration, regenerar `lib/db/types.ts` com
`generate_typescript_types`.
