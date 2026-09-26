import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type ActorRequest } from '../identity/auth.guard.js';
import { parseBody } from '../http/schemas.js';
import { quoteCreateSchema } from './checkout.schemas.js';
import { QuoteService } from './quote.service.js';

@Controller('quotes')
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly quotes: QuoteService) {}
  @Post() create(@Req() request: ActorRequest, @Body() body: unknown) {
    return this.quotes.create(request.actor!, parseBody(quoteCreateSchema, body));
  }
}
