import postgres, { type Sql } from "postgres";
import { env, requireEnv } from "@/lib/env";

/**
 * Conexão direta com o Postgres do Supabase.
 *
 * Por que não supabase-js: o produto inteiro é um query builder de filtros
 * compostos (§7). Escrever isso como SQL parametrizado exige uma conexão
 * Postgres real; PostgREST não expressa `ST_DWithin`, `@>` sobre arrays com
 * lógica booleana aninhada nem `tsquery` correlacionado sem uma RPC por
 * filtro. A conexão roda exclusivamente no servidor.
 *
 * O host do pooler (Supavisor) varia por projeto (`aws-0-*` vs `aws-1-*`) e a
 * conexão direta `db.<ref>.supabase.co` é IPv6-only, o que não funciona na
 * Vercel. Por isso: se `DATABASE_URL` estiver definida, ela manda; caso
 * contrário montamos candidatos a partir do ref do projeto e da senha, e o
 * primeiro que conectar é memorizado para o resto do processo.
 */

const POOLER_PORT = 6543;

let cached: Sql | undefined;
let pending: Promise<Sql> | undefined;

function options(): postgres.Options<Record<string, never>> {
  return {
    ssl: "require",
    // Supavisor em modo transaction não suporta prepared statements nomeados.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    // `raw` do provider é jsonb; deixamos o driver serializar normalmente.
    transform: { undefined: null },
  };
}

function candidateUrls(): string[] {
  const explicit = env("DATABASE_URL");
  if (explicit) return [explicit];

  const ref = env("SUPABASE_PROJECT_REF");
  const password = env("SUPABASE_DB_PASSWORD");
  const user = env("SUPABASE_DB_USER") ?? "garimpo_app";
  const region = env("SUPABASE_REGION") ?? "sa-east-1";
  if (!ref || !password) {
    requireEnv("DATABASE_URL");
  }
  const auth = `${encodeURIComponent(`${user}.${ref}`)}:${encodeURIComponent(password!)}`;
  return ["aws-1", "aws-0"].map(
    (prefix) =>
      `postgresql://${auth}@${prefix}-${region}.pooler.supabase.com:${POOLER_PORT}/postgres`,
  );
}

async function connect(): Promise<Sql> {
  const urls = candidateUrls();
  let lastError: unknown;
  for (const url of urls) {
    const sql = postgres(url, options());
    try {
      await sql`select 1`;
      return sql;
    } catch (error) {
      lastError = error;
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
  throw new Error(
    `Não foi possível conectar ao Postgres (${urls.length} candidato(s) testado(s)): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function getSql(): Promise<Sql> {
  if (cached) return cached;
  if (!pending) {
    pending = connect()
      .then((sql) => {
        cached = sql;
        return sql;
      })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}

/** Encerra a conexão. Usado só em testes e scripts. */
export async function closeSql(): Promise<void> {
  const sql = cached;
  cached = undefined;
  if (sql) await sql.end({ timeout: 5 });
}
