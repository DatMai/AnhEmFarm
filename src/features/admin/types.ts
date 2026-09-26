import type { Media, Page } from '../catalog/types'
export type Category = { id: string; slug: string; name: string; version: number }
export type Variant = { id: string; sku: string; label: string; packDetails: string; priceVnd: number | null; stock: number; saleEnabled: boolean; version: number }
export type Product = { id: string; slug: string; name: string; description: string; categoryId: string; category: { id: string; name: string; slug: string }; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; confirmed: boolean; restricted18: boolean; version: number; variants: Variant[]; images: Media[] }
export type AdminPage<T> = Page<T>
