import { Body, Controller, Post, Req, Res, Headers, UseGuards } from '@nestjs/common';
import { AuthGuard, type ActorRequest } from '../identity/auth.guard.js';
import { parseBody } from '../http/schemas.js';
import { quoteCreateSchema } from './checkout.schemas.js';
import type { Response } from 'express';
import { z } from 'zod';
import { uuidSchema } from '../http/schemas.js';
import { CheckoutService, placementReplayed } from './checkout.service.js';
import { QuoteService } from './quote.service.js';

@Controller('quotes')
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly quotes: QuoteService) {}
  @Post() create(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.quotes.create(request.actor!, parseBody(quoteCreateSchema, body));
  }
}

@Controller('orders')
@UseGuards(AuthGuard)
export class OrderPlacementController {
  constructor(private readonly checkout: CheckoutService) {}
  @Post() async place(@Req() request: ActorRequest, @Body() body: unknown,
    @Headers('idempotency-key') key: string, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(z.strictObject({ quoteId: uuidSchema }), body);
    const result = await this.checkout.place(request.actor!, input.quoteId, key);
    response.status(result[placementReplayed] ? 200 : 201);
    return result;
  }
}
