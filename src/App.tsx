import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Leaf, Menu, Minus, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import { categories, products, type Category, type Product } from './catalog'

type Filter = Category | 'All'
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
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="#top" aria-label="AnhEmFarm - back to top">
    <span className="brand-mark" aria-hidden="true"><span className="berry berry-one" /><span className="berry berry-two" /><span className="berry berry-three" /><span className="berry-leaf" /></span>
    <span>AnhEm<span>Farm</span></span>
  </a>
}

function App() {
  const [filter, setFilter] = useState<Filter>('All')
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
    const matchesCategory = filter === 'All' || product.category === filter
    const normalized = query.trim().toLocaleLowerCase('en')
    const matchesQuery = !normalized || `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase('en').includes(normalized)
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
    setToast(`Added ${product.name} to your list`)
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
    const text = `Interest list - AnhEmFarm\n${cartItems.map(product => `• ${product.name}: ${cart[product.id]}`).join('\n')}\n\nPrices, pack sizes, and availability must be confirmed by AnhEmFarm.`
    try {
      await navigator.clipboard.writeText(text)
      setToast('Product list copied')
    } catch {
      setToast('This browser could not copy the list automatically')
    }
  }

  return <div id="top" className="site-shell">
    <div className="announcement"><Sparkles size={14} strokeWidth={1.8} /><span>Welcome to AnhEmFarm — good food for every day</span><Sparkles size={14} strokeWidth={1.8} /></div>
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#top">Home</a>
          <a href="#categories">Categories</a>
          <a href="#products">Products</a>
          <a href="#about">About AnhEmFarm</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button search-shortcut" aria-label="Go to product search" onClick={() => { document.getElementById('product-search')?.scrollIntoView({ behavior: 'smooth' }); document.getElementById('product-search')?.focus() }}><Search size={21} /></button>
          <button className="cart-trigger" aria-label={`Open interest list, ${cartCount} products`} onClick={() => setCartOpen(true)}><ShoppingBag size={20} /><span>My list</span>{cartCount > 0 && <b>{cartCount}</b>}</button>
          <button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={23} /></button>
        </div>
      </div>
    </header>

    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-image" role="img" aria-label="Fresh mulberries in a ceramic bowl" />
        <div className="hero-wash" />
        <div className="container hero-content">
          <span className="eyebrow"><span className="eyebrow-line" /> FROM FARM TO TABLE</span>
          <h1 id="hero-title">Simple ingredients,<br /><em>more to enjoy.</em></h1>
          <p>Mulberries, coffee, and everyday farm flavors gathered in one place.</p>
          <div className="hero-actions"><a className="button button-primary" href="#products">Explore products <ArrowRight size={18} /></a><a className="text-link" href="#about">Get to know us <ArrowRight size={16} /></a></div>
        </div>
        <div className="hero-caption"><span className="caption-dot" /> MULBERRY SEASON · TODAY'S PICK</div>
      </section>

      <div className="trust-strip"><div className="container trust-inner"><span><Leaf size={19} /> Clear categories</span><i /><span><Check size={19} /> Clear product details</span><i /><span><ShoppingBag size={19} /> Easy to explore</span></div></div>

      <section id="categories" className="section categories-section container">
        <div className="section-heading"><div><span className="section-kicker">EXPLORE ANHEMFARM</span><h2>Explore our ranges</h2><p>From familiar mulberries to new ranges in the making.</p></div><a className="section-link" href="#products">View all products <ArrowRight size={18} /></a></div>
        <div className="category-grid">
          {categories.map(category => <button className="category-card" key={category.name} onClick={() => chooseCategory(category.name)}>
            <img src={category.image} alt="" loading="lazy" />
            <span className="category-shade" />
            <span className="category-info"><small>{category.count}</small><strong>{category.name}</strong><span>{category.description}</span></span>
            <span className="category-arrow"><ArrowRight size={20} /></span>
          </button>)}
        </div>
      </section>

      <section className="feature-section"><div className="container feature-inner"><div className="feature-visual"><img src="/images/mulberry-hero.jpg" alt="Fresh mulberries" loading="lazy" /><span>MULBERRY SEASON</span></div><div className="feature-copy"><span className="section-kicker">A FARM FAVORITE</span><h2>Mulberries, your way.</h2><p>One fruit, many ways to enjoy it: fresh in season, as jam, dried, or made into mulberry wine.</p><button className="button button-outline" onClick={() => chooseCategory('Mulberries')}>Explore mulberries <ArrowRight size={18} /></button></div></div></section>

      <section id="products" className="section products-section container">
        <div className="section-heading products-heading"><div><span className="section-kicker">PRODUCT CATALOG</span><h2>Find something you like</h2><p>Prices and pack sizes will appear once product details are confirmed.</p></div><span className="result-count">{filtered.length.toString().padStart(2, '0')} products</span></div>
        <div className="catalog-toolbar"><div className="filter-list" aria-label="Filter categories">{(['All', 'Mulberries', 'Coffee', 'Tea', 'Honey'] as Filter[]).map(item => <button key={item} className={`filter-chip ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}</div><label className="search-box"><Search size={18} /><input id="product-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search products..." aria-label="Search products" /></label></div>
        {filtered.length ? <div className="product-grid">{filtered.map(product => <article className="product-card" key={product.id}>
          <button className="product-image" onClick={() => setSelected(product)} aria-label={`View details for ${product.name}`}><img src={product.image} alt={product.name} style={{ objectPosition: product.imagePosition }} loading="lazy" /><span className={`product-badge ${!product.available ? 'badge-muted' : ''}`}>{product.note}</span></button>
          <div className="product-body"><span className="product-category">{product.category}</span><button className="product-name" onClick={() => setSelected(product)}>{product.name}</button><p>{product.description}</p><div className="product-bottom"><span className="product-price">{product.available ? 'Price pending' : 'Not available yet'}</span><button className="add-button" onClick={() => product.available ? addToCart(product) : setSelected(product)} aria-label={product.available ? `Add ${product.name} to your list` : `View information for ${product.name}`} title={product.available ? 'Add to list' : 'View information'}>{product.available ? <Plus size={21} /> : <ArrowRight size={20} />}</button></div></div>
        </article>)}</div> : <div className="empty-results"><SlidersHorizontal size={28} /><h3>No products found</h3><p>Try another search term or browse the full catalog.</p><button className="button button-outline" onClick={() => { setQuery(''); setFilter('All') }}>View all</button></div>}
        <p className="catalog-note">* Tea and honey are proposed ranges, not confirmed products. Images are illustrative.</p>
      </section>

      <section id="about" className="about-section"><div className="container about-inner"><div><span className="section-kicker">OUR STORY</span><h2>Good food starts with<br /><em>care.</em></h2></div><div><p>AnhEmFarm is building a simple place to explore farm products. Mulberries and coffee come first; tea and honey will follow when their details are confirmed.</p><a href="#products" className="button button-light">View products <ArrowRight size={18} /></a></div></div></section>
    </main>

    <footer className="footer"><div className="container footer-main"><div><Brand light /><p>A small home for everyday farm flavors.</p></div><div className="footer-links"><div><strong>Explore</strong><a href="#categories">Categories</a><a href="#products">Products</a><a href="#about">About us</a></div><div><strong>Categories</strong>{categories.map(category => <button key={category.name} onClick={() => chooseCategory(category.name)}>{category.name}</button>)}</div></div></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} AnhEmFarm</span><span>Product details are being updated.</span></div></footer>

    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}

    {menuOpen && <div className="overlay" onMouseDown={() => setMenuOpen(false)}><aside className="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu" onMouseDown={event => event.stopPropagation()}><div className="drawer-head"><Brand /><button className="icon-button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X /></button></div><a href="#top" onClick={() => setMenuOpen(false)}>Home</a><a href="#categories" onClick={() => setMenuOpen(false)}>Categories</a><a href="#products" onClick={() => setMenuOpen(false)}>Products</a><a href="#about" onClick={() => setMenuOpen(false)}>About AnhEmFarm</a><div className="mobile-menu-label">CATEGORIES <ChevronDown size={16} /></div>{categories.map(category => <button key={category.name} onClick={() => chooseCategory(category.name)}>{category.name}</button>)}</aside></div>}

    {cartOpen && <div className="overlay" onMouseDown={() => setCartOpen(false)}><aside className="drawer" role="dialog" aria-modal="true" aria-label="Interest list" onMouseDown={event => event.stopPropagation()}><div className="drawer-head"><div><span className="section-kicker">ANHEMFARM</span><h2>Interest list</h2></div><button className="icon-button" aria-label="Close list" onClick={() => setCartOpen(false)}><X /></button></div><div className="drawer-content">{cartItems.length ? cartItems.map(product => <div className="cart-item" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>Price pending</span><div className="quantity"><button aria-label={`Decrease ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Minus size={14} /></button><span>{cart[product.id]}</span><button aria-label={`Increase ${product.name}`} onClick={() => changeQuantity(product.id, 1)}><Plus size={14} /></button></div></div><button className="remove-item" aria-label={`Remove ${product.name}`} onClick={() => changeQuantity(product.id, -cart[product.id])}><Trash2 size={17} /></button></div>) : <div className="cart-empty"><ShoppingBag size={34} /><h3>Your list is empty</h3><p>Save the products you are interested in here.</p><button className="button button-primary" onClick={() => setCartOpen(false)}>View products <ArrowRight size={17} /></button></div>}</div>{cartItems.length > 0 && <div className="drawer-footer"><p>This is a reference list. AnhEmFarm does not yet accept orders or online payments through this website.</p><button className="button button-primary" onClick={copyList}>Copy list <ArrowRight size={18} /></button></div>}</aside></div>}

    {selected && <div className="overlay modal-overlay" onMouseDown={() => setSelected(null)}><div className="product-modal" role="dialog" aria-modal="true" aria-label={`Information about ${selected.name}`} onMouseDown={event => event.stopPropagation()}><button className="icon-button modal-close" aria-label="Close details" onClick={() => setSelected(null)}><X /></button><img src={selected.image} alt={selected.name} /><div className="modal-copy"><span className="section-kicker">{selected.category.toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.description}</p><div className="modal-status"><span>{selected.available ? 'Listed product' : 'Proposed range'}</span><strong>{selected.available ? 'Price and pack size pending' : 'Not available yet'}</strong></div>{selected.available ? <button className="button button-primary" onClick={() => { addToCart(selected); setSelected(null) }}>Add to list <Plus size={18} /></button> : <p className="modal-disclaimer">This is a proposed category example, not a confirmed product.</p>}</div></div></div>}
  </div>
}

export default App
