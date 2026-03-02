type ProductCategory = {
  id: number;
  name: string;
};

export const PRODUCT_CATEGORIES: ReadonlyArray<ProductCategory> = [
  { id: 1, name: 'Panels' },
  { id: 2, name: 'Inverters' },
  { id: 3, name: 'Batteries' },
  { id: 4, name: 'Solar Cameras' },
  { id: 5, name: 'Accessories' },
  { id: 6, name: 'Solar Streetlights' },
];

const CATEGORY_ID_SET = new Set<number>(PRODUCT_CATEGORIES.map((item) => item.id));
const CATEGORY_NAME_TO_ID = new Map<string, number>(
  PRODUCT_CATEGORIES.map((item) => [item.name.toLowerCase(), item.id])
);

export const isValidProductCategoryId = (value: number) =>
  Number.isInteger(value) && CATEGORY_ID_SET.has(value);

export const resolveProductCategoryId = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return isValidProductCategoryId(value) ? value : null;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && CATEGORY_ID_SET.has(numeric)) {
    return numeric;
  }

  return CATEGORY_NAME_TO_ID.get(normalized.toLowerCase()) ?? null;
};

export const PRODUCT_CATEGORY_HINT = PRODUCT_CATEGORIES.map((item) => `${item.id}: ${item.name}`).join(', ');
