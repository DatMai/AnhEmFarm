import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../identity/admin.guard.js";
import type { ActorRequest } from "../identity/auth.guard.js";
import { ReportsService } from "./reports.service.js";
@Controller("admin/reports")
@UseGuards(AdminGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get() summary(
    @Req() r: ActorRequest,
    @Query() query: { from: string; to: string },
  ) {
    return this.reports.summary(query, r.actor!);
  }
}
