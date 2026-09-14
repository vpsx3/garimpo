import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  return (
    <AppShell className="mx-auto w-full max-w-3xl gap-4 px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Alertas</h1>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          O rastreamento de preço entra na Etapa 9.
        </CardContent>
      </Card>
    </AppShell>
  );
}
