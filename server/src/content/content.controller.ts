import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../identity/admin.guard.js';
import type { ActorRequest } from '../identity/auth.guard.js';
import { ContentService } from './content.service.js';

@Controller('content')
export class PublicContentController {
  constructor(private readonly content: ContentService) {}
  @Get(':slug') page(@Param('slug') slug: string) { return this.content.publicPage(slug); }
}

@Controller('admin/content')
@UseGuards(AdminGuard)
export class AdminContentController {
  constructor(private readonly content: ContentService) {}
  @Get() list(@Req() r: ActorRequest, @Query() query: unknown) { return this.content.list(r.actor!, query); }
  @Put(':slug') save(@Req() r: ActorRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.content.save(r.actor!, slug, body as Parameters<ContentService['save']>[2]);
  }
}
