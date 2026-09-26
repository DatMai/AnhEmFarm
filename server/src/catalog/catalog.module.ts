import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditService } from '../admin/audit.service.js';
import { CatalogController } from './catalog.controller.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { InventoryController } from '../inventory/inventory.controller.js';

@Module({ imports: [IdentityModule], controllers: [CatalogController, AdminCatalogController, InventoryController],
  providers: [CatalogService, AuditService, InventoryService], exports: [CatalogService, AuditService, InventoryService] })
export class CatalogModule {}
