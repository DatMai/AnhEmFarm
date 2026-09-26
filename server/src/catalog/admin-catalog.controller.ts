import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../identity/admin.guard.js';
import type { ActorRequest } from '../identity/auth.guard.js';
import { CatalogService } from './catalog.service.js';
import { z } from 'zod';
import { adminListQuery, categoryCreate, categoryPatch, idSchema, pagination, parse, productCreate,
  productPatch, variantCreate, variantPatch } from './catalog.schemas.js';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('categories')
  categories(@Query() query: unknown) {
    const { page, pageSize } = parse(pagination, query);
    return this.catalog.adminCategories(page, pageSize);
  }
  @Post('categories')
  createCategory(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.catalog.createCategory(request.actor!, parse(categoryCreate, body));
  }
  @Patch('categories/:id')
  updateCategory(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateCategory(request.actor!, parse(idSchema, id), parse(categoryPatch, body));
  }
  @Get('products')
  products(@Query() query: unknown) { return this.catalog.adminList(parse(adminListQuery, query)); }
  @Get('products/:id')
  product(@Param('id') id: string) { return this.catalog.adminDetail(parse(idSchema, id)); }
  @Post('products')
  createProduct(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.catalog.createProduct(request.actor!, parse(productCreate, body));
  }
  @Patch('products/:id')
  updateProduct(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateProduct(request.actor!, parse(idSchema, id), parse(productPatch, body));
  }
  @Post('products/:id/images')
  addImage(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    const { mediaId } = parse(z.strictObject({ mediaId: idSchema }), body);
    return this.catalog.addImage(request.actor!, parse(idSchema, id), mediaId);
  }
  @Post('products/:id/variants')
  createVariant(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.catalog.createVariant(request.actor!, parse(idSchema, id), parse(variantCreate, body));
  }
  @Patch('variants/:id')
  updateVariant(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.catalog.updateVariant(request.actor!, parse(idSchema, id), parse(variantPatch, body));
  }
}
