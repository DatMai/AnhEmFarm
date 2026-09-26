import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { categoryListQuery, parse, productQuery, slug } from './catalog.schemas.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('shipping-zones')
  shippingZones(@Query() query: unknown) { const { page, pageSize } = parse(categoryListQuery, query); return this.catalog.shippingZones(page, pageSize); }
  @Get('categories')
  categories(@Query() query: unknown) {
    const { page, pageSize } = parse(categoryListQuery, query);
    return this.catalog.categories(page, pageSize);
  }
  @Get('products')
  products(@Query() query: unknown) { return this.catalog.list(parse(productQuery, query)); }
  @Get('products/:slug')
  product(@Param('slug') value: string) { return this.catalog.detail(parse(slug, value)); }
}
