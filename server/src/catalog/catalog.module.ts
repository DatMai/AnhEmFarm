import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditService } from '../admin/audit.service.js';
import { CatalogController } from './catalog.controller.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({ imports: [IdentityModule], controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, AuditService], exports: [CatalogService, AuditService] })
export class CatalogModule {}
