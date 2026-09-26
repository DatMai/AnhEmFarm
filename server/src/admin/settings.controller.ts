import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../identity/admin.guard.js';
import type { ActorRequest } from '../identity/auth.guard.js';
import { SettingsService } from './settings.service.js';

@Controller('store')
export class StoreController {
  constructor(private readonly settings: SettingsService) {}
  @Get() get() { return this.settings.publicStore(); }
}

@Controller('admin')
@UseGuards(AdminGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get('settings') get(@Req() r: ActorRequest) { return this.settings.get(r.actor!); }
  @Put('settings') update(@Req() r: ActorRequest, @Body() body: unknown) { return this.settings.update(r.actor!, body as Parameters<SettingsService['update']>[1]); }
  @Get('shipping-zones') zones(@Req() r: ActorRequest, @Query() query: unknown) { return this.settings.zones(r.actor!, query); }
  @Post('shipping-zones') addZone(@Req() r: ActorRequest, @Body() body: unknown) { return this.settings.addZone(r.actor!, body as Parameters<SettingsService['addZone']>[1]); }
  @Patch('shipping-zones/:id') patchZone(@Req() r: ActorRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.settings.patchZone(r.actor!, id, body as Parameters<SettingsService['patchZone']>[2]);
  }
  @Get('audit') audit(@Req() r: ActorRequest, @Query() query: unknown) { return this.settings.audit(r.actor!, query); }
  @Get('email-jobs') emailJobs(@Req() r: ActorRequest) { return this.settings.emailJobs(r.actor!); }
}
