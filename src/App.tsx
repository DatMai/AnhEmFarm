import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Leaf, Menu, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { categories, products, type Category, type Product } from './catalog'

type Filter = Category | 'Tất cả'
type Cart = Record<string, number>

function readCart(): Cart {
  try {
    const saved = JSON.parse(localStorage.getItem('anhemfarm-cart') || '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(saved).filter(([id, quantity]) => products.some(product => product.id === id && product.available) && Number.isInteger(quantity) && Number(quantity) > 0 && Number(quantity) <= 99)) as Cart
  } catch {
    return {}
  }
}

function Brand({ light = false }: { light?: boolean }) {
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="#top" aria-label="AnhEmFarm - về đầu trang">
    <span className="brand-mark" aria-hidden="true"><span className="berry berry-one" /><span className="berry berry-two" /><span className="berry berry-three" /><span className="berry-leaf" /></span>
    <span>AnhEm<span>Farm</span></span>
  </a>
}

function App() {
  const [filter, setFilter] = useState<Filter>('Tất cả')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState<Cart>(readCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => localStorage.setItem('anhemfarm-cart', JSON.stringify(cart)), [cart])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    document.body.style.overflow = cartOpen || selected || menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [cartOpen, selected, menuOpen])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCartOpen(false); setSelected(null); setMenuOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filtered = useMemo(() => products.filter(product => {
    const matchesCategory = filter === 'Tất cả' || product.category === filter
    const normalized = query.trim().toLocaleLowerCase('vi-VN')
    const matchesQuery = !normalized || `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('vi-VN').includes(normalized)
    return matchesCategory && matchesQuery
  }), [filter, query])
  const cartItems = products.filter(product => cart[product.id] > 0)
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)

  function chooseCategory(category: Filter) {
    setFilter(category)
    setMenuOpen(false)
    document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth' })
  }
  function addToCart(product: Product) {
    if (!product.available) return
    setCart(current => ({ ...current, [product.id]: Math.min(99, (current[product.id] || 0) + 1) }))
    setToast(`Đã thêm ${product.name} vào danh sách`)
  }
  function changeQuantity(id: string, delta: number) {
    setCart(current => {
      const next = { ...current }
      const quantity = (next[id] || 0) + delta
      if (quantity <= 0) delete next[id]
      else next[id] = Math.min(99, quantity)
      return next
    })
  }
  async function copyList() {
    const text = `Danh sách quan tâm - AnhEmFarm\n${cartItems.map(product => `• ${product.name}: ${cart[product.id]}`).join('\n')}\n\nGiá, quy cách và tình trạng hàng cần được AnhEmFarm xác nhận.`
    try {
      await navigator.clipboard.writeText(text)
      setToast('Đã sao chép danh sách sản phẩm')
    } catch {
      setToast('Không thể sao chép tự động trên trình duyệt này')
    }
  }

  return <div id="top" className="site-shell">
    <div className="announcement"><Sparkles size={14} strokeWidth={1.8} /><span>Chào mừng đến với AnhEmFarm — chọn món ngon cho mỗi ngày</span><Sparkles size={14} strokeWidth={1.8} /></div>
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <a href="#top">Trang chủ</a>
          <a href="#danh-muc">Danh mục</a>
          <a href="#san-pham">Sản phẩm</a>
          <a href="#ve-chung-toi">Về AnhEmFarm</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button search-shortcut" aria-label="Đến ô tìm kiếm" onClick={() => { document.getElementById('product-search')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('product-search')?.focus() }}><Search size={21} /></button>
          <button className="cart-trigger" aria-label={`Mở danh sách quan tâm, ${cartCount} sản phẩm`} onClick={() => setCartOpen(true)}><ShoppingBag size={20} /><span>Danh sách</span>{cartCount > 0 && <b>{cartCount}</b>}</button>
          <button className="icon-button mobile-menu-button" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Menu size={23} /></button>
        </div>
      </div>
    </header>

    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-image" role="img" aria-label="Dâu tằm tươi trong bát gốm" />
        <div className="hero-wash" />
        <div className="container hero-content">
          <span className="eyebrow"><span className="eyebrow-line" /> TỪ VƯỜN ĐẾN GIAN BẾP</span>
          <h1 id="hero-title">Một chút vị lành,<br /><em>thật nhiều niềm vui.</em></h1>
          <p>Dâu tằm, cà phê và những hương vị nông sản được AnhEmFarm tuyển chọn cho bữa ăn thường ngày.</p>
          <div className="hero-actions"><a className="button button-primary" href="#san-pham">Khám phá sản phẩm <ArrowRight size={18} /></a><a className="text-link" href="#ve-chung-toi">Tìm hiểu về chúng tôi <ArrowRight size={16} /></a></div>
        </div>
        <div className="hero-caption"><span className="caption-dot" /> MÙA DÂU TẰM · GỢI Ý HÔM NAY</div>
      </section>

      <div className="trust-strip"><div className="container trust-inner"><span><Leaf size={19} /> Danh mục rõ ràng</span><i /><span><Check size={19} /> Thông tin minh bạch</span><i /><span><ShoppingBag size={19} /> Chọn món thật dễ</span></div></div>

      <section id="danh-muc" className="section categories-section container">
        <div className="section-heading"><div><span className="section-kicker">KHÁM PHÁ ANHEMFARM</span><h2>Ghé qua từng gian hàng</h2><p>Từ trái dâu tằm quen thuộc đến những hương vị đang được chuẩn bị.</p></div><a className="section-link" href="#san-pham">Xem tất cả sản phẩm <ArrowRight size={18} /></a></div>
        <div className="category-grid">
          {categories.map(category => <button className="category-card" key={category.name} onClick={() => chooseCategory(category.name)}>
            <img src={category.image} alt="" loading="lazy" />
            <span className="category-shade" />
            <span className="category-info"><small>{category.count}</small><strong>{category.name}</strong><span>{category.description}</span></span>
            <span className="category-arrow"><ArrowRight size={20} /></span>
          </button>)}
        </div>
      </section>

      <section className="feature-section"><div className="container feature-inner"><div className="feature-visual"><img src="/images/mulberry-hero.jpg" alt="Dâu tằm tươi" loading="lazy" /><span>VỊ NGON MÙA DÂU</span></div><div className="feature-copy"><span className="section-kicker">MÓN NGON CHỦ LỰC</span><h2>Dâu tằm, thêm chút sáng tạo mỗi ngày.</h2><p>Một loại quả, nhiều cách thưởng thức: dùng tươi theo mùa, làm mứt, chọn dạng khô hoặc khám phá rượu dâu tằm.</p><button className="button button-outline" onClick={() => chooseCategory('Dâu tằm')}>Khám phá dâu tằm <ArrowRight size={18} /></button></div></div></section>

      <section id="san-pham" className="section products-section container">
        <div className="section-heading products-heading"><div><span className="section-kicker">DANH MỤC SẢN PHẨM</span><h2>Chọn món hợp gu của bạn</h2><p>Giá và quy cách sẽ được cập nhật khi thông tin sản phẩm được xác nhận.</p></div><span className="result-count">{filtered.length.toString().padStart(2, '0')} sản phẩm</span></div>
        <div className="catalog-toolbar"><div className="filter-list" aria-label="Lọc danh mục">{(['Tất cả', 'Dâu tằm', 'Cà phê', 'Trà', 'Mật ong'] as Filter[]).map(item => <button key={item} className={`filter-chip ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}</div><label className="search-box"><Search size={18} /><input id="product-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm sản phẩm..." aria-label="Tìm sản phẩm" /></label></div>
        {filtered.length ? <div className="product-grid">{filtered.map(product => <article className="product-card" key={product.id}>
          <button className="product-image" onClick={() => setSelected(product)} aria-label={`Xem chi tiết ${product.name}`}><img src={product.image} alt={product.name} style={{ objectPosition: product.imagePosition }} loading="lazy" /><span className={`product-badge ${!product.available ? 'badge-muted' : ''}`}>{product.note}</span></button>
          <div className="product-body"><span className="product-category">{product.category}</span><button className="product-name" onClick={() => setSelected(product)}>{product.name}</button><p>{product.description}</p><div className="product-bottom"><span className="product-price">{product.available ? 'Giá đang cập nhật' : 'Chưa mở bán'}</span><button className="add-button" onClick={() => product.available ? addToCart(product) : setSelected(product)} aria-label={product.available ? `Thêm ${product.name} vào danh sách` : `Xem thông tin ${product.name}`} title={product.available ? 'Thêm vào danh sách' : 'Xem thông tin'}>{product.available ? <Plus size={21} /> : <ArrowRight size={20} />}</button></div></div>
        </article>)}</div> : <div className="empty-results"><SlidersHorizontal size={28} /><h3>Chưa tìm thấy sản phẩm</h3><p>Thử từ khóa khác hoặc xem lại toàn bộ danh mục.</p><button className="button button-outline" onClick={() => { setQuery(''); setFilter('Tất cả') }}>Xem tất cả</button></div>}
        <p className="catalog-note">* Trà và mật ong là các gợi ý danh mục, chưa phải sản phẩm đã được xác nhận. Hình ảnh mang tính minh họa.</p>
      </section>

      <section id="ve-chung-toi" className="about-section"><div className="container about-inner"><div><span className="section-kicker">CÂU CHUYỆN ANHEMFARM</span><h2>Ăn ngon bắt đầu từ<br /><em>sự chân thành.</em></h2></div><div><p>AnhEmFarm đang xây dựng một góc nhỏ để anh em dễ tìm và chọn nông sản mình thích. Trước mắt là dâu tằm và cà phê; trà, mật ong sẽ được giới thiệu khi có thông tin chính thức.</p><a href="#san-pham" className="button button-light">Xem sản phẩm <ArrowRight size={18} /></a></div></div></section>
    </main>

    <footer className="footer"><div className="container footer-main"><div><Brand light /><p>Một góc nhỏ dành cho những hương vị nông sản gần gũi mỗi ngày.</p></div><div className="footer-links"><div><strong>Khám phá</strong><a href="#danh-muc">Danh mục</a><a href="#san-pham">Sản phẩm</a><a href="#ve-chung-toi">Về chúng tôi</a></div><div><strong>Danh mục</strong>{categories.map(category => <button key={category.name} onClick={() => chooseCategory(category.name)}>{category.name}</button>)}</div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} AnhEmFarm</span><span>Thông tin sản phẩm đang được cập nhật.</span></div></footer>

    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}

    {menuOpen && <div className="overlay" onMouseDown={() => setMenuOpen(false)}><aside className="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu" onMouseDown={event => event.stopPropagation()}><div className="drawer-head"><Brand /><button className="icon-button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><X /></button></div><a href="#top" onClick={() => setMenuOpen(false)}>Trang chủ</a><a href="#danh-muc" onClick={() => setMenuOpen(false)}>Danh mục</a><a href="#san-pham" onClick={() => setMenuOpen(false)}>Sản phẩm</a><a href="#ve-chung-toi" onClick={() => setMenuOpen(false)}>Về AnhEmFarm</a><div className="mobile-menu-label">DANH MỤC <ChevronDown size={16} /></div>{categories.map(category => <button key={category.name} onClick={() => chooseCategory(category.name)}>{category.name}</button>)}</aside></div>}

    {cartOpen && <div className="overlay" onMouseDown={() => setCartOpen(false)}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Danh sách quan tâm" onMouseDown={event => event.stopPropagation()}><div className="drawer-head"><div><span className="section-kicker">ANHEMFARM</span><h2>Danh sách quan tâm</h2></div><button className="icon-button" aria-label="Đóng danh sách" onClick={() => setCartOpen(false)}><X /></button></div><div className="drawer-content">{cartItems.length ? cartItems.map(product => <div className="cart-item" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>Giá đang cập nhật</span><div className="quantity"><button aria-label={`Giảm ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Minus size={14} /></button><span>{cart[product.id]}</span><button aria-label={`Tăng ${product.name}`} onClick={() => changeQuantity(product.id, 1)}><Plus size={14} /></button></div></div><button className="remove-item" aria-label={`Xóa ${product.name}`} onClick={() => changeQuantity(product.id, -cart[product.id])}><Trash2 size={17} /></button></div>) : <div className="cart-empty"><ShoppingBag size={34} /><h3>Danh sách đang trống</h3><p>Chọn những sản phẩm anh thích để lưu lại tại đây.</p><button className="button button-primary" onClick={() => setCartOpen(false)}>Xem sản phẩm <ArrowRight size={17} /></button></div>}</div>{cartItems.length > 0 && <div className="drawer-footer"><p>Đây là danh sách tham khảo. AnhEmFarm chưa nhận đơn và thanh toán trực tuyến trên website.</p><button className="button button-primary" onClick={copyList}>Sao chép danh sách <ArrowRight size={18} /></button></div>}</aside></div>}

    {selected && <div className="overlay modal-overlay" onMouseDown={() => setSelected(null)}><div className="product-modal" role="dialog" aria-modal="true" aria-label={`Thông tin ${selected.name}`} onMouseDown={event => event.stopPropagation()}><button className="icon-button modal-close" aria-label="Đóng chi tiết" onClick={() => setSelected(null)}><X /></button><img src={selected.image} alt={selected.name} /><div className="modal-copy"><span className="section-kicker">{selected.category.toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.description}</p><div className="modal-status"><span>{selected.available ? 'Sản phẩm hiện có trong danh mục' : 'Danh mục dự kiến'}</span><strong>{selected.available ? 'Giá và quy cách đang cập nhật' : 'Chưa mở bán'}</strong></div>{selected.available ? <button className="button button-primary" onClick={() => { addToCart(selected); setSelected(null) }}>Thêm vào danh sách <Plus size={18} /></button> : <p className="modal-disclaimer">Thông tin này là giả định để minh họa danh mục; chưa xác nhận sản phẩm thực tế.</p>}</div></div></div>}
  </div>
}

export default App
