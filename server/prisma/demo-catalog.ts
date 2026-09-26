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
    const row = await tx.category.upsert({ where: { slug: category.slug }, update: {}, create: category });
    categoryIds.set(category.slug, row.id);
  }
  for (const item of products) {
    const row = await tx.product.upsert({ where: { slug: item.slug }, update: {},
      create: { slug: item.slug, name: item.name, categoryId: categoryIds.get(item.category)!, description: item.description,
        status: 'PUBLISHED', confirmed: false, restricted18: 'restricted18' in item && item.restricted18 } });
    await tx.variant.upsert({ where: { sku: item.sku }, update: {},
      create: { productId: row.id, sku: item.sku, label: item.format, packDetails: 'Details pending', priceVnd: null, stock: 0, saleEnabled: false } });
  }
  const settings = await tx.storeSettings.findFirst();
  if (!settings) await tx.storeSettings.create({ data: { salesEnabled: false, wineEnabled: false } });
}

const demoOffers = [
  { slug: 'demo-fresh-mulberries', price: 49000n, pack: 'Demo 500 g pack' },
  { slug: 'demo-mulberry-jam', price: 79000n, pack: 'Demo 250 g jar' },
  { slug: 'demo-dried-mulberries', price: 69000n, pack: 'Demo 200 g pack' },
  { slug: 'demo-mulberry-wine', price: 189000n, pack: 'Demo 750 mL bottle', restricted: true },
  { slug: 'demo-robusta', price: 99000n, pack: 'Demo 250 g pack' },
  { slug: 'demo-arabica', price: 139000n, pack: 'Demo 250 g pack' },
  { slug: 'demo-green-tea', price: 89000n, pack: 'Demo 100 g pack' },
  { slug: 'demo-oolong-tea', price: 119000n, pack: 'Demo 100 g pack' },
  { slug: 'demo-floral-honey', price: 129000n, pack: 'Demo 350 g jar' },
  { slug: 'demo-forest-honey', price: 149000n, pack: 'Demo 350 g jar' },
] as const;

/** Explicitly enables fictional COD shopping in local/test databases only. */
export async function seedDemoShopping(tx: Prisma.TransactionClient): Promise<void> {
  await seedDemoCatalog(tx);
  for (const offer of demoOffers) {
    const product = await tx.product.findUniqueOrThrow({ where: { slug: offer.slug }, include: { variants: true } });
    if (product.name !== products.find(item => item.slug === offer.slug)?.name || product.variants.length !== 1)
      throw new Error(`Demo shopping refuses a seller-edited listing: ${offer.slug}`);
    const variant = product.variants[0];
    if (variant.priceVnd !== null && variant.priceVnd !== offer.price)
      throw new Error(`Demo shopping refuses a seller-edited price: ${offer.slug}`);
    if (product.confirmed) continue;
    if (variant.stock !== 0 || variant.saleEnabled || product.description !== products.find(item => item.slug === offer.slug)?.description)
      throw new Error(`Demo shopping refuses a seller-edited listing: ${offer.slug}`);
    await tx.product.update({ where: { id: product.id }, data: { confirmed: true,
      description: 'Development demo listing. The product, pack, price, stock, and availability are fictional and for local testing only.' } });
    await tx.variant.update({ where: { id: variant.id }, data: { label: offer.pack, packDetails: offer.pack,
      priceVnd: offer.price, stock: 20, saleEnabled: true } });
  }
  await tx.shippingZone.upsert({ where: { code: 'DEMO-LOCAL' }, update: {},
    create: { code: 'DEMO-LOCAL', displayName: 'Demo delivery area', enabled: true, feeVnd: 30000n } });
  for (const slug of ['about', 'contact', 'shipping', 'returns', 'privacy', 'terms'] as const) {
    await tx.contentPage.upsert({ where: { slug }, update: {}, create: { slug,
      title: `Demo ${slug} information`, source: `Development demo only. These are fictional ${slug} details for local checkout testing. No real orders are accepted.`,
      status: 'PUBLISHED', approvedAt: new Date() } });
  }
  const settings = await tx.storeSettings.findFirstOrThrow();
  await tx.storeSettings.update({ where: { id: settings.id }, data: { salesEnabled: true, wineEnabled: false,
    businessName: settings.businessName ?? 'AnhEmFarm local demo', supportEmail: settings.supportEmail ?? 'demo@example.test',
    launchConfirmedAt: settings.launchConfirmedAt ?? new Date() } });
}
