import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Garimpo" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Garimpo</h1>
        <p className="text-sm text-muted-foreground">
          Ferramenta pessoal. Informe a senha de acesso.
        </p>
      </div>
      <LoginForm next={next} />
    </main>
  );
}
