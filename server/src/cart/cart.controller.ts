import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type ActorRequest } from '../identity/auth.guard.js';
import { parseBody, uuidSchema } from '../http/schemas.js';
import { CartService } from './cart.service.js';

const editSchema = z.strictObject({ quantity: z.number().int().min(1).max(99), optionId: uuidSchema.nullable(), version: z.number().int().min(1) });
const removeSchema = z.strictObject({ optionId: uuidSchema.nullable(), version: z.number().int().min(1) });
const mergeSchema = z.strictObject({ key: uuidSchema, items: z.array(z.strictObject({ variantId: uuidSchema, quantity: z.number().int().min(1).max(99), optionId: uuidSchema.nullable().optional().transform(value => value ?? null) })).max(50) });

@Controller('cart')
@UseGuards(AuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}
  @Get() get(@Req() request: ActorRequest) { return this.cart.get(request.actor!); }
  @Put('items/:variantId') set(@Req() request: ActorRequest, @Param('variantId') id: string, @Body() body: unknown) {
    const input = parseBody(editSchema, body);
    return this.cart.set(request.actor!, parseBody(uuidSchema, id), input.quantity, input.version, input.optionId);
  }
  @Delete('items/:variantId') remove(@Req() request: ActorRequest, @Param('variantId') id: string, @Body() body: unknown) {
    const input = parseBody(removeSchema, body);
    return this.cart.remove(request.actor!, parseBody(uuidSchema, id), input.version, input.optionId);
  }
  @Post('merge') merge(@Req() request: ActorRequest, @Body() body: unknown) { return this.cart.merge(request.actor!, parseBody(mergeSchema, body)); }
}
