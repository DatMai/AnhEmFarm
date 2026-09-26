import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../identity/admin.guard.js';
import type { ActorRequest } from '../identity/auth.guard.js';
import { parseBody } from '../http/schemas.js';
import { collectionSchema, transitionSchema } from './order-rules.js';
import { OrdersService } from './orders.service.js';
@Controller('admin/orders')
@UseGuards(AdminGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@Req() r: ActorRequest, @Query() query: Record<string, string>) { return this.orders.list(r.actor!, query); }
  @Get(':id') get(@Req() r: ActorRequest, @Param('id') id: string) { return this.orders.get(r.actor!, id); }
  @Post(':id/transitions') @HttpCode(200)
  transition(@Req() r: ActorRequest, @Param('id') id: string, @Body() body: unknown) { return this.orders.transition(r.actor!, id, parseBody(transitionSchema, body)); }
  @Post(':id/collection') @HttpCode(200)
  collect(@Req() r: ActorRequest, @Param('id') id: string, @Body() body: unknown) { return this.orders.collect(r.actor!, id, parseBody(collectionSchema, body)); }
}
