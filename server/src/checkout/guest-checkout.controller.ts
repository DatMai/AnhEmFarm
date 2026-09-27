import { Body, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { parseBody, uuidSchema } from '../http/schemas.js';
import { OrdersService } from '../orders/orders.service.js';
import { CheckoutService, placementReplayed } from './checkout.service.js';
import { guestCartSchema, guestQuoteCreateSchema } from './checkout.schemas.js';
import { GuestQuoteService } from './guest-quote.service.js';
import { GuestSessionService } from './guest-session.service.js';

@Controller('guest')
export class GuestCheckoutController {
  constructor(private readonly sessions: GuestSessionService, private readonly quotes: GuestQuoteService,
    private readonly checkout: CheckoutService, private readonly orders: OrdersService) {}

  @Post('cart-preview')
  preview(@Body() body: unknown) { return this.quotes.preview(parseBody(guestCartSchema, body)); }

  @Post('quotes')
  async quote(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Body() body: unknown) {
    response.setHeader('Cache-Control', 'private, no-store');
    const input = parseBody(guestQuoteCreateSchema, body);
    const session = await this.sessions.getOrCreate(request, response);
    return this.quotes.create(session.id, input);
  }

  @Post('orders')
  async place(@Req() request: Request, @Res({ passthrough: true }) response: Response,
    @Body() body: unknown, @Headers('idempotency-key') key: string) {
    const input = parseBody(z.strictObject({ quoteId: uuidSchema }), body);
    response.setHeader('Cache-Control', 'private, no-store');
    const session = await this.sessions.require(request);
    const result = await this.checkout.placeGuest(session.id, input.quoteId, key);
    response.status(result[placementReplayed] ? 200 : 201);
    return result;
  }

  @Get('orders/:id')
  async get(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Param('id') id: string) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Robots-Tag', 'noindex');
    const session = await this.sessions.require(request);
    return this.orders.getGuest(session.id, id);
  }
}
