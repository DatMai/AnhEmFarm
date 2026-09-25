export type Category = 'Mulberries' | 'Coffee' | 'Tea' | 'Honey'

export type Product = {
  id: string
  name: string
  category: Category
  description: string
  image: string
  imagePosition?: string
  note: string
  available: boolean
}

export const products: Product[] = [
  { id: 'dau-tuoi', name: 'Fresh mulberries', category: 'Mulberries', description: 'Seasonal mulberries for food and drinks.', image: '/images/mulberry-hero.jpg', imagePosition: '77% center', note: 'Seasonal', available: true },
  { id: 'mut-dau', name: 'Mulberry jam', category: 'Mulberries', description: 'Rich mulberry flavor for toast, yogurt, and desserts.', image: '/images/jam.jpg', note: 'Core product', available: true },
  { id: 'dau-kho', name: 'Dried mulberries', category: 'Mulberries', description: 'Dried mulberries that are easy to store and enjoy.', image: '/images/dried-mulberry.jpg', note: 'Core product', available: true },
  { id: 'ruou-dau', name: 'Mulberry wine', category: 'Mulberries', description: 'Made from mulberries. Alcohol content and bottle size are being confirmed.', image: '/images/mulberry-wine.jpg', note: '18+', available: true },
  { id: 'robusta', name: 'Robusta coffee', category: 'Coffee', description: 'Whole bean or ground coffee. Roast profile and pack sizes are being confirmed.', image: '/images/coffee.jpg', note: 'Whole bean / ground', available: true },
  { id: 'arabica', name: 'Arabica coffee', category: 'Coffee', description: 'Whole bean or ground coffee. Roast profile and pack sizes are being confirmed.', image: '/images/coffee.jpg', imagePosition: '65% center', note: 'Whole bean / ground', available: true },
  { id: 'tra-xanh', name: 'Green tea', category: 'Tea', description: 'Proposed product. Tea variety and sourcing are not confirmed.', image: '/images/tea.jpg', note: 'Proposed', available: false },
  { id: 'tra-oolong', name: 'Oolong tea', category: 'Tea', description: 'Proposed product. Tea variety and sourcing are not confirmed.', image: '/images/tea.jpg', imagePosition: '65% center', note: 'Proposed', available: false },
  { id: 'mat-ong-hoa', name: 'Floral honey', category: 'Honey', description: 'Proposed product. Floral source and pack sizes are not confirmed.', image: '/images/honey.jpg', note: 'Proposed', available: false },
  { id: 'mat-ong-rung', name: 'Forest honey', category: 'Honey', description: 'Proposed product. Origin and pack sizes are not confirmed.', image: '/images/honey.jpg', imagePosition: '65% center', note: 'Proposed', available: false },
]

export const categories: { name: Category; image: string; description: string; count: string }[] = [
  { name: 'Mulberries', image: '/images/mulberry-hero.jpg', description: 'Fresh, dried, jam & wine', count: '04 products' },
  { name: 'Coffee', image: '/images/coffee.jpg', description: 'Robusta & Arabica', count: '02 products' },
  { name: 'Tea', image: '/images/tea.jpg', description: 'Proposed range', count: 'Details pending' },
  { name: 'Honey', image: '/images/honey.jpg', description: 'Proposed range', count: 'Details pending' },
]
