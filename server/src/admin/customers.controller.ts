import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../identity/admin.guard.js";
import type { ActorRequest } from "../identity/auth.guard.js";
import { parseBody } from "../http/schemas.js";
import { statusSchema } from "./admin.schemas.js";
import { CustomersService } from "./customers.service.js";
@Controller("admin/customers")
@UseGuards(AdminGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Req() r: ActorRequest, @Query() q: unknown) {
    return this.customers.list(r.actor!, q);
  }
  @Get(":id") get(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Query() q: unknown,
  ) {
    return this.customers.get(r.actor!, id, q);
  }
  @Patch(":id/status") @HttpCode(204) status(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.customers.setStatus(
      r.actor!,
      id,
      parseBody(statusSchema, body),
    );
  }
}
