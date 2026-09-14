import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

export const searchInputSchema = z
  .object({
    label: z.string().trim().min(1, "Dê um nome à busca.").max(120),
    locationQuery: z.string().trim().min(2, "Informe a localização."),
    checkIn: isoDate,
    checkOut: isoDate,
    guests: z.number().int().min(1).max(16).default(2),
    adults: z.number().int().min(0).max(16).nullish(),
    children: z.number().int().min(0).max(16).nullish(),
    infants: z.number().int().min(0).max(16).nullish(),
    pets: z.number().int().min(0).max(16).nullish(),
    maxGrossNightly: z.number().positive().nullish(),
    currency: z.string().trim().length(3).default("BRL"),
    isTracked: z.boolean().default(false),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: "A saída precisa ser depois da entrada.",
    path: ["checkOut"],
  });

export type SearchInput = z.infer<typeof searchInputSchema>;
