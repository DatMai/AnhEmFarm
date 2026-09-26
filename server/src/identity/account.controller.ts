import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, type ActorRequest } from "./auth.guard.js";
import { AccountService, profileSchema } from "./account.service.js";
import { parseBody } from "../http/schemas.js";
@Controller("account")
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly accounts: AccountService) {}
  @Patch() update(@Req() r: ActorRequest, @Body() body: unknown) {
    return this.accounts.update(r.actor!, parseBody(profileSchema, body));
  }
  @Get("addresses") list(@Req() r: ActorRequest, @Query() q: unknown) {
    return this.accounts.list(r.actor!, q);
  }
  @Get("addresses/:id") get(@Req() r: ActorRequest, @Param("id") id: string) {
    return this.accounts.get(r.actor!, id);
  }
  @Post("addresses") create(@Req() r: ActorRequest, @Body() body: unknown) {
    return this.accounts.create(r.actor!, body);
  }
  @Patch("addresses/:id") change(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.accounts.change(r.actor!, id, body);
  }
  @Delete("addresses/:id") @HttpCode(204) remove(
    @Req() r: ActorRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.accounts.change(r.actor!, id, body, true);
  }
}
