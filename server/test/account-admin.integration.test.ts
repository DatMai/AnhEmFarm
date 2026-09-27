import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarness, type Harness } from "./harness.js";
import { seedScenario, type Scenario } from "./fixtures.js";
import { CustomersService } from "../src/admin/customers.service.js";
import { ReportsService } from "../src/admin/reports.service.js";
import { CartService } from "../src/cart/cart.service.js";
import { QuoteService } from "../src/checkout/quote.service.js";
import { CheckoutService } from "../src/checkout/checkout.service.js";
const actor = (id: string, role: "ADMIN" | "CUSTOMER" = "CUSTOMER") => ({
  id,
  role,
  authVersion: 1,
});
describe("accounts, customer administration and reports", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  async function login(user: Scenario["customer"]) {
    const c = h.client();
    expect(
      (
        await c.request("POST", "/api/v1/auth/login", {
          email: user.email,
          password: user.password,
        })
      ).status,
    ).toBe(200);
    return c;
  }
  async function quote(s: Scenario) {
    const a = actor(s.customer.id);
    const cart = h.resolve(CartService);
    await cart.set(a, s.variant.id, 1, (await cart.get(a)).version);
    const { note, ...address } = s.address;
    return h.resolve(QuoteService).create(a, { address, ageConfirmed: false });
  }
  it("scopes address CRUD, versions mutations and preserves order snapshots", async () => {
    const s = await seedScenario(h.db),
      c = await login(s.customer),
      other = await login(s.otherCustomer);
    const { note, ...address } = s.address;
    expect(
      (
        await c.request("PATCH", "/api/v1/account", {
          name: "Updated customer",
        })
      ).body.name,
    ).toBe("Updated customer");
    expect(
      (
        await c.request("PATCH", "/api/v1/account", {
          name: "Name",
          role: "ADMIN",
        })
      ).status,
    ).toBe(422);
    const created = await c.request(
      "POST",
      "/api/v1/account/addresses",
      address,
    );
    expect(created.status).toBe(201);
    const id = created.body.id;
    for (const method of ["GET", "PATCH", "DELETE"])
      expect(
        (
          await other.request(
            method,
            `/api/v1/account/addresses/${id}`,
            method === "GET"
              ? undefined
              : method === "PATCH"
                ? { line1: "Another address", version: 1 }
                : { version: 1 },
          )
        ).status,
      ).toBe(404);
    expect(
      (await other.request("GET", "/api/v1/account/addresses")).body.total,
    ).toBe(0);
    expect(
      (await c.request("GET", `/api/v1/account/addresses/${id}`)).body.line1,
    ).toBe(address.line1);
    const q = await quote(s);
    const o = (
      await h
        .resolve(CheckoutService)
        .place(actor(s.customer.id), q.id, randomUUID())
    ).order;
    expect(
      (
        await c.request("PATCH", `/api/v1/account/addresses/${id}`, {
          line1: "Changed address",
          version: 1,
        })
      ).body.version,
    ).toBe(2);
    expect(
      (
        await c.request("DELETE", `/api/v1/account/addresses/${id}`, {
          version: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await c.request("DELETE", `/api/v1/account/addresses/${id}`, {
          version: 2,
        })
      ).status,
    ).toBe(204);
    expect(
      (await h.db.order.findUniqueOrThrow({ where: { id: o.id } }))
        .recipientJson,
    ).toEqual(address);
    expect(
      (await c.request("GET", "/api/v1/account/addresses?page=999999999999999"))
        .status,
    ).toBe(422);
  });
  it("restricts administration, invalidates old sessions permanently and minimizes customer data", async () => {
    const s = await seedScenario(h.db),
      c = await login(s.customer),
      admin = await login(s.admin);
    const path = `/api/v1/admin/customers/${s.customer.id}/status`;
    const body = { status: "SUSPENDED", reason: "Test review", version: 1 };
    expect((await c.request("PATCH", path, body)).status).toBe(403);
    expect(
      (
        await admin.request(
          "PATCH",
          `/api/v1/admin/customers/${s.admin.id}/status`,
          body,
        )
      ).status,
    ).toBe(403);
    await expect(
      h
        .resolve(CustomersService)
        .setStatus(
          actor(s.customer.id, "ADMIN"),
          s.otherCustomer.id,
          body as any,
        ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await admin.request("PATCH", path, body)).status).toBe(204);
    expect(await h.db.session.count({ where: { userId: s.customer.id } })).toBe(
      0,
    );
    expect((await c.request("GET", "/api/v1/account/addresses")).status).toBe(
      401,
    );
    expect(
      (
        await admin.request("PATCH", path, {
          status: "ACTIVE",
          reason: "Review complete",
          version: 2,
        })
      ).status,
    ).toBe(204);
    expect((await c.request("GET", "/api/v1/account/addresses")).status).toBe(
      401,
    );
    expect((await admin.request("PATCH", path, body)).status).toBe(409);
    const list = await admin.request(
      "GET",
      `/api/v1/admin/customers?q=${encodeURIComponent(s.customer.email)}`,
    );
    expect(list.body.total).toBe(1);
    expect(Object.keys(list.body.items[0]).sort()).toEqual([
      "id",
      "name",
      "status",
      "version",
    ]);
    const detail = await admin.request(
      "GET",
      `/api/v1/admin/customers/${s.customer.id}`,
    );
    expect(detail.body.customer.email).toBe(s.customer.email);
    expect(detail.body.orders.items).toEqual([]);
    expect(JSON.stringify(detail.body)).not.toMatch(
      /password|authVersion|digest/,
    );
    const audit = await h.db.auditLog.findMany({
      where: { targetId: s.customer.id },
    });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit.map((x) => x.changesJson))).not.toContain(
      s.customer.email,
    );
    expect(
      (
        await c.request(
          "GET",
          "/api/v1/admin/reports?from=2026-09-25&to=2026-09-25",
        )
      ).status,
    ).toBe(401);
  });
  it("uses inclusive Vietnam dates, current COD state, exclusions and safe totals", async () => {
    const s = await seedScenario(h.db);
    const reports = h.resolve(ReportsService);
    const latest = await h.db.order.aggregate({ _max: { deliveredAt: true } });
    const year =
      Math.max(2040, latest._max.deliveredAt?.getUTCFullYear() ?? 0) + 1;
    const from = `${year}-09-25`;
    const ids: string[] = [];
    for (const time of [
      `${year}-09-24T17:00:00Z`,
      `${year}-09-25T17:00:00Z`,
      `${year}-09-25T02:00:00Z`,
      `${year}-09-25T03:00:00Z`,
    ]) {
      const q = await quote(s);
      const o = (
        await h
          .resolve(CheckoutService)
          .place(actor(s.customer.id), q.id, randomUUID())
      ).order;
      ids.push(o.id);
      await h.db.order.update({
        where: { id: o.id },
        data: { status: "DELIVERED", deliveredAt: new Date(time) },
      });
    }
    await h.db.order.update({
      where: { id: ids[2] },
      data: { status: "CANCELLED" },
    });
    await h.db.order.update({
      where: { id: ids[3] },
      data: { status: "RETURNED" },
    });
    expect(await reports.summary({ from, to: from })).toEqual({
      deliveredOrderValueVnd: 130000,
      codCollectedVnd: 0,
      codDueVnd: 130000,
      orderCount: 1,
    });
    await h.db.order.update({
      where: { id: ids[0] },
      data: {
        collectionState: "COLLECTED",
        collectedAt: new Date(`${year}-09-25T01:00:00Z`),
      },
    });
    expect(await reports.summary({ from, to: from })).toMatchObject({
      codCollectedVnd: 130000,
      codDueVnd: 0,
    });
    await h.db.order.update({
      where: { id: ids[0] },
      data: { collectionState: "DUE" },
    });
    expect(await reports.summary({ from, to: from })).toMatchObject({
      codCollectedVnd: 0,
      codDueVnd: 130000,
    });
    for (const range of [
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "2026-01-01", to: "2027-01-02" },
      { from: "2026-09-26", to: "2026-09-25" },
    ])
      await expect(reports.summary(range)).rejects.toMatchObject({
        status: 422,
      });
    await h.db.order.update({
      where: { id: ids[0] },
      data: { totalVnd: 9007199254740992n, subtotalVnd: 9007199254710992n },
    });
    await expect(reports.summary({ from, to: from })).rejects.toMatchObject({
      status: 422,
    });
    await h.db.order.update({
      where: { id: ids[0] },
      data: { totalVnd: 130000n, subtotalVnd: 100000n },
    });
  });
  it("suspension commits while checkout waits on the customer row and rejects placement", async () => {
    const s = await seedScenario(h.db);
    const q = await quote(s);
    let unlock!: () => void;
    let held!: () => void;
    const gate = new Promise<void>((r) => (unlock = r)),
      ready = new Promise<void>((r) => (held = r));
    // A trigger barrier pauses the actual suspension transaction after its target lock.
    const key = Math.floor(Math.random() * 1000000000);
    const fn = `test_suspend_${s.customer.id.replaceAll("-", "")}`;
    await h.db.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${s.customer.id}'::uuid AND NEW.status = 'SUSPENDED' THEN PERFORM pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$`,
    );
    await h.db.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    const blocker = h.db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key})`);
        held();
        await gate;
      },
      { timeout: 15000 },
    );
    await ready;
    const suspension = h
      .resolve(CustomersService)
      .setStatus(actor(s.admin.id, "ADMIN"), s.customer.id, {
        status: "SUSPENDED",
        reason: "Race fixture",
        version: 1,
      });
    async function waiting(query: string) {
      for (let i = 0; i < 100; i++) {
        const rows = await h.db.$queryRawUnsafe<Array<{ n: bigint }>>(query);
        if (Number(rows[0].n) > 0) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("Expected blocked database transaction");
    }
    let placement: Promise<unknown> | undefined;
    try {
      await waiting(
        `SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory'`,
      );
      placement = h
        .resolve(CheckoutService)
        .place(actor(s.customer.id), q.id, randomUUID())
        .then(
          (value) => ({ value }),
          (error) => ({ status: error.status }),
        );
      await waiting(
        `SELECT count(*) n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='transactionid'`,
      );
      unlock();
      await blocker;
      await suspension;
      expect(await placement).toEqual({ status: 401 });
      expect(await h.db.order.count({ where: { quoteId: q.id } })).toBe(0);
      expect(
        (await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } }))
          .stock,
      ).toBe(5);
    } finally {
      unlock();
      await blocker;
      await suspension.catch(() => {});
      await placement;
      await h.db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fn} ON users`);
      await h.db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
  it("rolls back suspension and session revocation when audit insertion fails", async () => {
    const s = await seedScenario(h.db);
    const customer = await login(s.customer);
    const fn = `test_audit_${s.customer.id.replaceAll("-", "")}`;
    await h.db.$executeRawUnsafe(
      `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetId" = '${s.customer.id}' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await h.db.$executeRawUnsafe(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    );
    try {
      await expect(
        h
          .resolve(CustomersService)
          .setStatus(actor(s.admin.id, "ADMIN"), s.customer.id, {
            status: "SUSPENDED",
            reason: "Test rollback",
            version: 1,
          }),
      ).rejects.toThrow();
      expect(
        await h.db.user.findUniqueOrThrow({ where: { id: s.customer.id } }),
      ).toMatchObject({ status: "ACTIVE", version: 1, authVersion: 1 });
      expect(
        await h.db.session.count({ where: { userId: s.customer.id } }),
      ).toBe(1);
      expect(
        (await customer.request("GET", "/api/v1/account/addresses")).status,
      ).toBe(200);
    } finally {
      await h.db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS ${fn} ON audit_logs`,
      );
      await h.db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fn}()`);
    }
  });
  it("guards report HTTP access, strict dates, pagination and stale admin actors", async () => {
    const s = await seedScenario(h.db);
    const customer = await login(s.customer),
      admin = await login(s.admin);
    const path = "/api/v1/admin/reports?from=2026-02-01&to=2026-02-28";
    expect((await customer.request("GET", path)).status).toBe(403);
    expect((await admin.request("GET", path)).status).toBe(200);
    expect((await admin.request("GET", path + "&extra=1")).status).toBe(422);
    expect(
      (await admin.request("GET", "/api/v1/admin/customers?pageSize=101"))
        .status,
    ).toBe(422);
    expect(
      (
        await admin.request(
          "GET",
          "/api/v1/admin/customers?page=999999999999999",
        )
      ).status,
    ).toBe(422);
    expect(
      (await admin.request("GET", "/api/v1/admin/customers/" + s.admin.id))
        .status,
    ).toBe(404);
    await expect(
      h
        .resolve(ReportsService)
        .summary(
          { from: "2026-02-01", to: "2026-02-28" },
          actor(s.customer.id, "ADMIN"),
        ),
    ).rejects.toMatchObject({ status: 403 });
    await h.db.user.update({
      where: { id: s.admin.id },
      data: { authVersion: { increment: 1 } },
    });
    await expect(
      h
        .resolve(CustomersService)
        .setStatus(actor(s.admin.id, "ADMIN"), s.customer.id, {
          status: "SUSPENDED",
          reason: "Stale",
          version: 1,
        }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
