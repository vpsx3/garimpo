import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

/** Os únicos parâmetros que vão à origem. Todo o resto é filtrado aqui. */
export const searchQuerySchema = z
  .object({
    locationQuery: z.string().trim().min(2, "Informe a localização."),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.number().int().min(1).max(16).default(2),
    maxGrossNightly: z.number().positive().nullish(),
    currency: z.string().trim().length(3).default("BRL"),
    limit: z.number().int().min(1).max(300).default(200),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: "A saída precisa ser depois da entrada.",
    path: ["checkOut"],
  });

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const anchorSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  maxDistanceM: z.number().int().positive().nullish(),
  weight: z.number().min(0).max(10).default(0),
});

export type AnchorInput = z.infer<typeof anchorSchema>;
