export type Category = 'Dâu tằm' | 'Cà phê' | 'Trà' | 'Mật ong'

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
  { id: 'dau-tuoi', name: 'Dâu tằm tươi', category: 'Dâu tằm', description: 'Trái dâu tằm dành cho những món ăn và thức uống theo mùa.', image: '/images/mulberry-hero.jpg', imagePosition: '77% center', note: 'Theo mùa', available: true },
  { id: 'mut-dau', name: 'Mứt dâu tằm', category: 'Dâu tằm', description: 'Vị dâu tằm đậm đà, hợp với bánh mì, sữa chua và món tráng miệng.', image: '/images/jam.jpg', note: 'Sản phẩm chủ lực', available: true },
  { id: 'dau-kho', name: 'Dâu tằm khô', category: 'Dâu tằm', description: 'Dâu tằm dạng khô, tiện bảo quản và dùng hằng ngày.', image: '/images/dried-mulberry.jpg', note: 'Sản phẩm chủ lực', available: true },
  { id: 'ruou-dau', name: 'Rượu dâu tằm', category: 'Dâu tằm', description: 'Dòng sản phẩm từ dâu tằm; thông tin nồng độ và dung tích đang cập nhật.', image: '/images/mulberry-wine.jpg', note: '18+', available: true },
  { id: 'robusta', name: 'Cà phê Robusta', category: 'Cà phê', description: 'Cà phê rang hoặc xay; thông số rang và quy cách đang cập nhật.', image: '/images/coffee.jpg', note: 'Rang / xay', available: true },
  { id: 'arabica', name: 'Cà phê Arabica', category: 'Cà phê', description: 'Cà phê rang hoặc xay; thông số rang và quy cách đang cập nhật.', image: '/images/coffee.jpg', imagePosition: '65% center', note: 'Rang / xay', available: true },
  { id: 'tra-xanh', name: 'Trà xanh', category: 'Trà', description: 'Gợi ý danh mục. Loại trà và nguồn hàng sẽ xác nhận sau.', image: '/images/tea.jpg', note: 'Dự kiến', available: false },
  { id: 'tra-oolong', name: 'Trà ô long', category: 'Trà', description: 'Gợi ý danh mục. Loại trà và nguồn hàng sẽ xác nhận sau.', image: '/images/tea.jpg', imagePosition: '65% center', note: 'Dự kiến', available: false },
  { id: 'mat-ong-hoa', name: 'Mật ong hoa', category: 'Mật ong', description: 'Gợi ý danh mục. Nguồn mật và quy cách sẽ xác nhận sau.', image: '/images/honey.jpg', note: 'Dự kiến', available: false },
  { id: 'mat-ong-rung', name: 'Mật ong rừng', category: 'Mật ong', description: 'Gợi ý danh mục. Nguồn mật và quy cách sẽ xác nhận sau.', image: '/images/honey.jpg', imagePosition: '65% center', note: 'Dự kiến', available: false },
]

export const categories: { name: Category; image: string; description: string; count: string }[] = [
  { name: 'Dâu tằm', image: '/images/mulberry-hero.jpg', description: 'Tươi, khô, mứt & rượu', count: '04 sản phẩm' },
  { name: 'Cà phê', image: '/images/coffee.jpg', description: 'Robusta & Arabica', count: '02 sản phẩm' },
  { name: 'Trà', image: '/images/tea.jpg', description: 'Danh mục dự kiến', count: 'Đang cập nhật' },
  { name: 'Mật ong', image: '/images/honey.jpg', description: 'Danh mục dự kiến', count: 'Đang cập nhật' },
]
