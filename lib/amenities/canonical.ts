/**
 * Vocabulário canônico de amenidades.
 *
 * A origem usa rótulos inconsistentes entre idiomas e versões: "Ar
 * condicionado", "Ar-condicionado", "Air conditioning" e "AC" são a mesma
 * coisa. Filtro booleano sobre texto livre é inútil; por isso tudo é mapeado
 * para chaves estáveis antes de entrar no banco.
 *
 * Rótulo que não casa com nada é descartado da lista canônica — mas o texto
 * original sobrevive no `raw` do anúncio.
 */

export const AMENITY_KEYS = [
  "air_conditioning",
  "heating",
  "washer",
  "dryer",
  "dishwasher",
  "kitchen",
  "wifi",
  "wifi_fast",
  "dedicated_workspace",
  "tv",
  "elevator",
  "free_parking",
  "paid_parking",
  "pool",
  "hot_tub",
  "gym",
  "balcony",
  "garden",
  "bbq",
  "crib",
  "high_chair",
  "pet_friendly",
  "smoking_allowed",
  "self_checkin",
  "smoke_alarm",
  "carbon_monoxide_alarm",
  "first_aid_kit",
  "step_free_access",
  "breakfast",
  "private_entrance",
  "shared_bathroom",
  "bathtub",
  "hair_dryer",
  "iron",
  "essentials",
  "long_term_stays",
  "ev_charger",
  "waterfront",
  "beach_access",
  "city_view",
  "sea_view",
] as const;

export type AmenityKey = (typeof AMENITY_KEYS)[number];

/**
 * Padrões por chave. Testados contra o rótulo normalizado (minúsculo, sem
 * acento, sem pontuação). A ordem importa: chaves mais específicas primeiro,
 * porque o primeiro casamento vence.
 */
const PATTERNS: [AmenityKey, RegExp][] = [
  ["wifi_fast", /\b(wifi|wi fi|internet)\b.*\b(rapid|fast|\d{2,}\s*mbps|fibra)\b|\b(\d{2,}\s*mbps)\b/],
  ["dedicated_workspace", /(espaco de trabalho|area de trabalho|workspace|dedicated workspace|escritorio)/],
  ["air_conditioning", /(ar condicionado|air conditioning|\bac\b|climatizacao|split)/],
  ["heating", /(aquecimento|heating|calefacao|aquecedor)/],
  ["washer", /(maquina de lavar roupa|maquina de lavar\b|lavadora|washer|washing machine)/],
  ["dryer", /(secadora|secador de roupa|\bdryer\b|tumble dryer)/],
  ["dishwasher", /(lava loucas|lava-loucas|dishwasher|maquina de lavar louca)/],
  ["kitchen", /(cozinha|kitchen|kitchenette)/],
  ["wifi", /(wifi|wi fi|internet sem fio|wireless internet)/],
  ["tv", /\b(tv|televisao|television|smart tv)\b/],
  ["elevator", /(elevador|elevator|lift)/],
  ["free_parking", /(estacionamento gratuito|free parking|garagem gratuita|estacionamento incluido)/],
  ["paid_parking", /(estacionamento pago|paid parking|estacionamento por|garagem paga)/],
  ["pool", /(piscina|\bpool\b|swimming pool)/],
  ["hot_tub", /(banheira de hidromassagem|jacuzzi|hot tub|hidromassagem)/],
  ["gym", /(academia|\bgym\b|fitness|equipamentos de ginastica)/],
  ["balcony", /(varanda|sacada|balcony|terraco|patio)/],
  ["garden", /(jardim|quintal|garden|backyard)/],
  ["bbq", /(churrasqueira|churrasco|\bbbq\b|barbecue|grelha)/],
  ["crib", /(berco|\bcrib\b|cama de bebe|travel crib)/],
  ["high_chair", /(cadeira alta|cadeirao|high chair|cadeira de alimentacao)/],
  ["pet_friendly", /(aceita animais|aceita pets|pets allowed|pet friendly|animais de estimacao)/],
  ["smoking_allowed", /(permitido fumar|smoking allowed)/],
  ["self_checkin", /(check in autonomo|self check|autocheck|entrada autonoma|fechadura inteligente|lockbox|keypad)/],
  ["smoke_alarm", /(detector de fumaca|smoke alarm|smoke detector)/],
  ["carbon_monoxide_alarm", /(monoxido de carbono|carbon monoxide)/],
  ["first_aid_kit", /(kit de primeiros socorros|first aid)/],
  ["step_free_access", /(sem degraus|step free|acesso sem escada|entrada sem degrau|acessivel para cadeira)/],
  ["breakfast", /(cafe da manha|breakfast)/],
  ["private_entrance", /(entrada privativa|private entrance|entrada independente)/],
  ["shared_bathroom", /(banheiro compartilhado|shared bathroom)/],
  ["bathtub", /(banheira|bathtub)/],
  ["hair_dryer", /(secador de cabelo|hair dryer)/],
  ["iron", /(ferro de passar|\biron\b|passar roupa)/],
  ["essentials", /(itens basicos|essentials|toalhas.*lencois|roupa de cama)/],
  ["long_term_stays", /(estadias longas|long term stays|estadia de longa duracao)/],
  ["ev_charger", /(carregador de veiculo|ev charger|carregador eletrico)/],
  ["waterfront", /(beira mar|a beira d|waterfront|frente para a agua)/],
  ["beach_access", /(acesso a praia|beach access|pe na areia)/],
  ["sea_view", /(vista para o mar|vista mar|sea view|ocean view|vista para o oceano)/],
  ["city_view", /(vista para a cidade|city view|vista da cidade)/],
];

/** Minúsculo, sem acento, sem pontuação, espaços colapsados. */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeAmenity(label: string): AmenityKey | null {
  const normalized = normalizeLabel(label);
  if (!normalized) return null;

  // Um rótulo que já chega canônico passa direto.
  const asKey = normalized.replace(/\s+/g, "_") as AmenityKey;
  if ((AMENITY_KEYS as readonly string[]).includes(asKey)) return asKey;

  for (const [key, pattern] of PATTERNS) {
    if (pattern.test(normalized)) return key;
  }
  return null;
}

export function canonicalizeAmenities(labels: readonly string[] | null | undefined): AmenityKey[] {
  if (!labels) return [];
  const keys = new Set<AmenityKey>();
  for (const label of labels) {
    const key = canonicalizeAmenity(label);
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

/** Rótulos legíveis para a UI do construtor booleano. */
export const AMENITY_LABELS: Record<AmenityKey, string> = {
  air_conditioning: "Ar-condicionado",
  heating: "Aquecimento",
  washer: "Máquina de lavar",
  dryer: "Secadora",
  dishwasher: "Lava-louças",
  kitchen: "Cozinha",
  wifi: "Wi-Fi",
  wifi_fast: "Wi-Fi rápido",
  dedicated_workspace: "Espaço de trabalho",
  tv: "TV",
  elevator: "Elevador",
  free_parking: "Estacionamento gratuito",
  paid_parking: "Estacionamento pago",
  pool: "Piscina",
  hot_tub: "Hidromassagem",
  gym: "Academia",
  balcony: "Varanda",
  garden: "Jardim",
  bbq: "Churrasqueira",
  crib: "Berço",
  high_chair: "Cadeira alta",
  pet_friendly: "Aceita pets",
  smoking_allowed: "Permitido fumar",
  self_checkin: "Check-in autônomo",
  smoke_alarm: "Detector de fumaça",
  carbon_monoxide_alarm: "Detector de monóxido",
  first_aid_kit: "Kit de primeiros socorros",
  step_free_access: "Acesso sem degraus",
  breakfast: "Café da manhã",
  private_entrance: "Entrada privativa",
  shared_bathroom: "Banheiro compartilhado",
  bathtub: "Banheira",
  hair_dryer: "Secador de cabelo",
  iron: "Ferro de passar",
  essentials: "Itens básicos",
  long_term_stays: "Estadias longas",
  ev_charger: "Carregador elétrico",
  waterfront: "Beira-mar",
  beach_access: "Acesso à praia",
  city_view: "Vista para a cidade",
  sea_view: "Vista para o mar",
};
