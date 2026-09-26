import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard } from '../identity/admin.guard.js';
import type { ActorRequest } from '../identity/auth.guard.js';
import { idSchema, parse } from '../catalog/catalog.schemas.js';
import { InventoryService } from './inventory.service.js';

const adjustment = z.strictObject({ delta: z.number().int().refine(value => value !== 0),
  reason: z.string().trim().min(1).max(500), version: z.number().int().positive(), operationKey: z.uuid() });
@Controller('admin/inventory')
@UseGuards(AdminGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Post(':variantId/adjustments')
  adjust(@Req() request: ActorRequest, @Param('variantId') variantId: string, @Body() body: unknown) {
    return this.inventory.adjust(request.actor!, parse(idSchema, variantId), parse(adjustment, body));
  }
}
