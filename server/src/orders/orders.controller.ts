import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type ActorRequest } from '../identity/auth.guard.js';
import { parseBody } from '../http/schemas.js';
import { cancellationSchema } from './order-rules.js';
import { OrdersService } from './orders.service.js';
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@Req() r: ActorRequest, @Query() query: Record<string, string>) { return this.orders.list(r.actor!, query); }
  @Get(':id') get(@Req() r: ActorRequest, @Param('id') id: string) { return this.orders.get(r.actor!, id); }
  @Post(':id/cancel') @HttpCode(200)
  cancel(@Req() r: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.orders.transition(r.actor!, id, { ...parseBody(cancellationSchema, body), to: 'CANCELLED' });
  }
}
