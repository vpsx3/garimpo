"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUGESTOES = [
  "piscina",
  "churrasqueira",
  "sauna",
  "quadra de tênis",
  "vista para o mar",
  "lareira",
  "pet friendly",
  "escritório",
];

/**
 * Busca livre por palavra-chave.
 *
 * O construtor booleano de amenidades só enxerga o vocabulário canônico, que é
 * fechado por necessidade — é ele que torna o filtro E/OU/NÃO confiável. Mas
 * "sauna" e "quadra de tênis" não estão lá, e é isso que esta caixa resolve:
 * procura o texto solto no título, na descrição, nas amenidades e nas regras.
 */
export function KeywordBox({
  keywords,
  mode,
  onChange,
}: {
  keywords: string[];
  mode: "all" | "any";
  onChange: (keywords: string[], mode: "all" | "any") => void;
}) {
  const [draft, setDraft] = useState("");

  // Mantém o campo em dia quando os filtros são limpos por fora.
  useEffect(() => {
    if (keywords.length === 0) setDraft("");
  }, [keywords.length]);

  function commit(raw: string) {
    const novas = raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);

    const unicas = [...new Set([...keywords, ...novas])];
    onChange(unicas, mode);
    setDraft("");
  }

  function remove(keyword: string) {
    onChange(
      keywords.filter((item) => item !== keyword),
      mode,
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="keywords" className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />O que você procura
        </Label>
        {keywords.length > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(keywords, "all")}
              className={
                mode === "all"
                  ? "rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
                  : "rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              }
            >
              todas
            </button>
            <button
              type="button"
              onClick={() => onChange(keywords, "any")}
              className={
                mode === "any"
                  ? "rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
                  : "rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              }
            >
              qualquer
            </button>
          </div>
        ) : null}
      </div>

      <Input
        id="keywords"
        placeholder="quadra de tênis, sauna, piscina, churrasqueira"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => draft.trim() && commit(draft)}
      />

      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="default" className="gap-1 py-1">
              {keyword}
              <button
                type="button"
                onClick={() => remove(keyword)}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remover ${keyword}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 px-1 text-[10px]"
            onClick={() => onChange([], mode)}
          >
            limpar
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {SUGESTOES.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              onClick={() => onChange([...keywords, sugestao], mode)}
              className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {sugestao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
