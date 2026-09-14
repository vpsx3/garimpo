import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Garimpo",
  description:
    "Busca de acomodações com filtros compostos e preço total real, sem login e sem histórico.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="flex h-full flex-col overflow-hidden">{children}</body>
    </html>
  );
}
