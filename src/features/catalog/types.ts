export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type Category = { id: string; slug: string; name: string }
export type Media = { id: string; objectKey: string; illustrative: boolean }
export type ProductSummary = { id: string; slug: string; name: string; category: Category; images: Media[]; startingPriceVnd: number | null; purchasable: boolean }
export type ProductDetail = ProductSummary & { description: string; confirmed: boolean; restricted18: boolean; variants: { id: string; label: string; packDetails: string; priceVnd: number | null; inStock: boolean; saleEnabled: boolean }[] }
export function imageUrl(media?: Media): string | undefined {
  return media && /^products\/[0-9a-f-]+\.webp$/.test(media.objectKey) ? `/api/v1/media/${media.objectKey}` : undefined
}

export function variantAvailable(product: ProductDetail, variant: ProductDetail['variants'][number]): boolean {
  return product.purchasable && product.confirmed && variant.saleEnabled && variant.inStock &&
    variant.priceVnd !== null && variant.priceVnd > 0 && variant.packDetails.trim().length > 0
}
