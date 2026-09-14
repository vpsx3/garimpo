"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AMENITY_KEYS, AMENITY_LABELS } from "@/lib/amenities/canonical";
import type { AmenityExpr } from "@/lib/filters/types";
import { cn } from "@/lib/utils";

/**
 * Construtor de grupos aninhados E/OU/NÃO.
 *
 * A spec é explícita: isto é exposto como árvore clicável, não como texto
 * livre. O usuário monta `ar_condicionado AND (lavadora OR secadora) AND NOT
 * banheiro_compartilhado` sem escrever uma linha de código.
 */
export function AmenityBuilder({
  value,
  onChange,
}: {
  value: AmenityExpr | null;
  onChange: (expr: AmenityExpr | null) => void;
}) {
  if (!value) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Nenhuma regra de amenidade.
        </p>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => onChange({ op: "has", amenity: "air_conditioning" })}
          >
            <Plus className="h-3 w-3" />
            Amenidade
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              onChange({
                op: "and",
                children: [{ op: "has", amenity: "air_conditioning" }],
              })
            }
          >
            <Plus className="h-3 w-3" />
            Grupo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ExprNode expr={value} onChange={(next) => onChange(next)} depth={0} />
  );
}

function ExprNode({
  expr,
  onChange,
  depth,
}: {
  expr: AmenityExpr;
  onChange: (expr: AmenityExpr | null) => void;
  depth: number;
}) {
  if (expr.op === "has") {
    return (
      <div className="flex items-center gap-1">
        <Select
          value={expr.amenity}
          onValueChange={(amenity) => onChange({ op: "has", amenity })}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AMENITY_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {AMENITY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <NodeActions expr={expr} onChange={onChange} />
      </div>
    );
  }

  if (expr.op === "not") {
    return (
      <div className="flex items-start gap-1">
        <span className="mt-1.5 shrink-0 text-[11px] font-semibold uppercase text-destructive">
          não
        </span>
        <div className="flex-1">
          <ExprNode
            expr={expr.child}
            depth={depth + 1}
            onChange={(child) =>
              onChange(child ? { op: "not", child } : null)
            }
          />
        </div>
        <Button size="xs" variant="ghost" onClick={() => onChange(expr.child)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-md border p-2",
        depth > 0 && "bg-muted/40",
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant={expr.op === "and" ? "default" : "outline"}
          onClick={() => onChange({ ...expr, op: "and" })}
        >
          E
        </Button>
        <Button
          size="xs"
          variant={expr.op === "or" ? "default" : "outline"}
          onClick={() => onChange({ ...expr, op: "or" })}
        >
          OU
        </Button>
        <div className="flex-1" />
        <Button
          size="xs"
          variant="ghost"
          title="Adicionar amenidade"
          onClick={() =>
            onChange({
              ...expr,
              children: [...expr.children, { op: "has", amenity: "wifi" }],
            })
          }
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          title="Adicionar subgrupo"
          onClick={() =>
            onChange({
              ...expr,
              children: [
                ...expr.children,
                { op: "or", children: [{ op: "has", amenity: "washer" }] },
              ],
            })
          }
        >
          ( )
        </Button>
        <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-1.5 pl-1">
        {expr.children.map((child, index) => (
          <ExprNode
            key={index}
            expr={child}
            depth={depth + 1}
            onChange={(next) => {
              const children = [...expr.children];
              if (next === null) children.splice(index, 1);
              else children[index] = next;
              onChange(children.length ? { ...expr, children } : null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NodeActions({
  expr,
  onChange,
}: {
  expr: AmenityExpr;
  onChange: (expr: AmenityExpr | null) => void;
}) {
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        title="Negar"
        onClick={() => onChange({ op: "not", child: expr })}
      >
        ¬
      </Button>
      <Button size="xs" variant="ghost" onClick={() => onChange(null)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </>
  );
}
