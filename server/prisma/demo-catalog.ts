import type { Prisma } from '../src/generated/prisma/client.js';

const categories = [
  { slug: 'mulberries', name: 'Mulberries' },
  { slug: 'coffee', name: 'Coffee' },
  { slug: 'tea', name: 'Tea' },
  { slug: 'honey', name: 'Honey' },
] as const;

const products = [
  { slug: 'demo-fresh-mulberries', name: 'Fresh mulberries', category: 'mulberries', sku: 'DEMO-MULBERRY-FRESH', format: 'Fresh fruit', description: 'Seasonal mulberries for food and drinks. Harvest dates, pack size, price, and availability are being confirmed.' },
  { slug: 'demo-mulberry-jam', name: 'Mulberry jam', category: 'mulberries', sku: 'DEMO-MULBERRY-JAM', format: 'Jar', description: 'A preview of the planned mulberry jam range. Ingredients, jar size, price, and availability are being confirmed.' },
  { slug: 'demo-dried-mulberries', name: 'Dried mulberries', category: 'mulberries', sku: 'DEMO-MULBERRY-DRIED', format: 'Dried fruit', description: 'A preview of the planned dried mulberries range. Pack details, price, and availability are being confirmed.' },
  { slug: 'demo-mulberry-wine', name: 'Mulberry wine', category: 'mulberries', sku: 'DEMO-MULBERRY-WINE', format: 'Bottle', description: 'A proposed mulberry wine listing. Alcohol content, bottle size, eligibility, price, and availability are not confirmed.', restricted18: true },
  { slug: 'demo-robusta', name: 'Robusta coffee', category: 'coffee', sku: 'DEMO-ROBUSTA-250G', format: 'Whole bean or ground', description: 'A preview of the planned Robusta coffee range. Roast profile, grind options, pack size, price, and availability are being confirmed.' },
  { slug: 'demo-arabica', name: 'Arabica coffee', category: 'coffee', sku: 'DEMO-ARABICA', format: 'Whole bean or ground', description: 'A preview of the planned Arabica coffee range. Roast profile, grind options, pack size, price, and availability are being confirmed.' },
  { slug: 'demo-green-tea', name: 'Green tea concept', category: 'tea', sku: 'DEMO-GREEN-TEA', format: 'Variety pending', description: 'A proposed tea concept for browsing only. The tea variety, source, pack size, price, and availability are not confirmed.' },
  { slug: 'demo-oolong-tea', name: 'Oolong tea concept', category: 'tea', sku: 'DEMO-OOLONG-TEA', format: 'Variety pending', description: 'A proposed tea concept for browsing only. The tea variety, source, pack size, price, and availability are not confirmed.' },
  { slug: 'demo-floral-honey', name: 'Floral honey concept', category: 'honey', sku: 'DEMO-FLORAL-HONEY', format: 'Jar details pending', description: 'A proposed honey concept for browsing only. Floral source, origin, jar size, price, and availability are not confirmed.' },
  { slug: 'demo-forest-honey', name: 'Forest honey concept', category: 'honey', sku: 'DEMO-FOREST-HONEY', format: 'Jar details pending', description: 'A proposed honey concept for browsing only. Source, origin, jar size, price, and availability are not confirmed.' },
] as const;

/** Explicit local/test fixture. Never call this from application startup or production. */
export async function seedDemoCatalog(tx: Prisma.TransactionClient): Promise<void> {
  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const row = await tx.category.upsert({ where: { slug: category.slug }, update: { name: category.name }, create: category });
    categoryIds.set(category.slug, row.id);
  }
  for (const item of products) {
    const row = await tx.product.upsert({ where: { slug: item.slug },
      update: { name: item.name, categoryId: categoryIds.get(item.category)!, description: item.description,
        status: 'PUBLISHED', confirmed: false, restricted18: 'restricted18' in item && item.restricted18 },
      create: { slug: item.slug, name: item.name, categoryId: categoryIds.get(item.category)!, description: item.description,
        status: 'PUBLISHED', confirmed: false, restricted18: 'restricted18' in item && item.restricted18 } });
    await tx.variant.upsert({ where: { sku: item.sku },
      update: { productId: row.id, label: item.format, packDetails: 'Details pending', priceVnd: null, stock: 0, saleEnabled: false },
      create: { productId: row.id, sku: item.sku, label: item.format, packDetails: 'Details pending', priceVnd: null, stock: 0, saleEnabled: false } });
  }
  const settings = await tx.storeSettings.findFirst();
  if (settings) await tx.storeSettings.update({ where: { id: settings.id }, data: { salesEnabled: false, wineEnabled: false } });
  else await tx.storeSettings.create({ data: { salesEnabled: false, wineEnabled: false } });
}
