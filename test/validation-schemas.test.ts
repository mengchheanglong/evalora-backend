import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BadRequestException } from "@nestjs/common";
import {
  IdParamDto,
  UuidParamDto,
  UserIdParamDto,
  SessionIdParamDto,
  TemplateIdParamDto,
  OrganizationIdParamDto,
  CandidateIdParamDto,
  PaginationQueryDto,
  SortQueryDto,
  PaginationAndSortQueryDto,
  DateParamDto,
  DateRangeQueryDto,
  CreatedAtRangeQueryDto,
  SearchQueryDto,
  BaseQueryDto,
  ValidateQuery,
  ValidateParam,
  ParseUuidParamPipe,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../src/common/validation";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUID = "not-a-valid-uuid-12345";

test("IdParamDto validates and trims generic entity IDs", () => {
  const pipe = new ValidateParam(IdParamDto);

  const result = pipe.transform({ id: "  entity-123  " });
  assert.equal(result.id, "entity-123");

  assert.throws(
    () => pipe.transform({ id: "" }),
    (err: unknown) => err instanceof BadRequestException,
  );

  assert.throws(
    () => pipe.transform({ id: "a".repeat(129) }),
    (err: unknown) => err instanceof BadRequestException,
  );

  assert.throws(
    () => pipe.transform({}),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UuidParamDto enforces valid UUID v4 format", () => {
  const pipe = new ValidateParam(UuidParamDto);

  const result = pipe.transform({ id: `  ${VALID_UUID}  ` });
  assert.equal(result.id, VALID_UUID);

  assert.throws(
    () => pipe.transform({ id: INVALID_UUID }),
    (err: unknown) => err instanceof BadRequestException,
  );

  assert.throws(
    () => pipe.transform({ id: "12345" }),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("Domain-specific ID DTOs (UserId, SessionId, TemplateId, OrgId, CandidateId) validate non-empty string IDs", () => {
  const userPipe = new ValidateParam(UserIdParamDto);
  const sessionPipe = new ValidateParam(SessionIdParamDto);
  const templatePipe = new ValidateParam(TemplateIdParamDto);
  const orgPipe = new ValidateParam(OrganizationIdParamDto);
  const candidatePipe = new ValidateParam(CandidateIdParamDto);

  assert.equal(userPipe.transform({ userId: "  user-1  " }).userId, "user-1");
  assert.equal(sessionPipe.transform({ sessionId: "  session-1  " }).sessionId, "session-1");
  assert.equal(templatePipe.transform({ templateId: "  tmpl-1  " }).templateId, "tmpl-1");
  assert.equal(orgPipe.transform({ organizationId: "  org-1  " }).organizationId, "org-1");
  assert.equal(candidatePipe.transform({ candidateId: "  cand-1  " }).candidateId, "cand-1");

  assert.throws(() => userPipe.transform({ userId: "" }), BadRequestException);
  assert.throws(() => sessionPipe.transform({ sessionId: "" }), BadRequestException);
  assert.throws(() => templatePipe.transform({ templateId: "" }), BadRequestException);
  assert.throws(() => orgPipe.transform({ organizationId: "" }), BadRequestException);
  assert.throws(() => candidatePipe.transform({ candidateId: "" }), BadRequestException);
});

test("ParseUuidParamPipe validates standalone UUID route params", () => {
  const pipe = new ParseUuidParamPipe();

  assert.equal(pipe.transform(VALID_UUID), VALID_UUID);
  assert.equal(pipe.transform(`  ${VALID_UUID}  `), VALID_UUID);

  assert.throws(
    () => pipe.transform(INVALID_UUID),
    (err: unknown) => err instanceof BadRequestException && err.message.includes("Invalid ID format"),
  );

  assert.throws(
    () => pipe.transform(""),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("PaginationQueryDto applies defaults and calculates pagination offsets", () => {
  const pipe = new ValidateQuery(PaginationQueryDto);

  const emptyResult = pipe.transform({});
  assert.equal(emptyResult.page, DEFAULT_PAGE);
  assert.equal(emptyResult.limit, DEFAULT_PAGE_SIZE);
  assert.equal(emptyResult.getSkip(), 0);
  assert.equal(emptyResult.getTake(), DEFAULT_PAGE_SIZE);
  assert.deepEqual(emptyResult.toPrisma(), { skip: 0, take: DEFAULT_PAGE_SIZE });

  // Custom string inputs from HTTP query
  const customResult = pipe.transform({ page: "3", limit: "15" });
  assert.equal(customResult.page, 3);
  assert.equal(customResult.limit, 15);
  assert.equal(customResult.getSkip(), 30);
  assert.equal(customResult.getTake(), 15);
  assert.deepEqual(customResult.toPrisma(), { skip: 30, take: 15 });

  // Offset override
  const offsetResult = pipe.transform({ offset: "45", limit: "10" });
  assert.equal(offsetResult.offset, 45);
  assert.equal(offsetResult.getSkip(), 45);
  assert.equal(offsetResult.getTake(), 10);
});

test("PaginationQueryDto rejects invalid pagination bounds", () => {
  const pipe = new ValidateQuery(PaginationQueryDto);

  // Negative / 0 page
  assert.throws(() => pipe.transform({ page: "0" }), BadRequestException);
  assert.throws(() => pipe.transform({ page: "-1" }), BadRequestException);

  // Negative / 0 limit
  assert.throws(() => pipe.transform({ limit: "0" }), BadRequestException);
  assert.throws(() => pipe.transform({ limit: "-5" }), BadRequestException);

  // Limit exceeding max
  assert.throws(
    () => pipe.transform({ limit: String(MAX_PAGE_SIZE + 1) }),
    (err: unknown) => err instanceof BadRequestException && err.message.includes("limit cannot exceed"),
  );

  // Non-numeric strings
  assert.throws(() => pipe.transform({ page: "abc" }), BadRequestException);
  assert.throws(() => pipe.transform({ limit: "xyz" }), BadRequestException);

  // Negative offset
  assert.throws(() => pipe.transform({ offset: "-1" }), BadRequestException);
});

test("SortQueryDto validates sort fields and sort directions", () => {
  const pipe = new ValidateQuery(SortQueryDto);

  const ascResult = pipe.transform({ sortBy: "createdAt", sortOrder: "asc" });
  assert.equal(ascResult.sortBy, "createdAt");
  assert.equal(ascResult.sortOrder, "asc");

  const descResult = pipe.transform({ sortBy: "name", sortOrder: "desc" });
  assert.equal(descResult.sortBy, "name");
  assert.equal(descResult.sortOrder, "desc");

  assert.throws(
    () => pipe.transform({ sortOrder: "invalid-order" }),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("PaginationAndSortQueryDto combines pagination and sorting correctly", () => {
  const pipe = new ValidateQuery(PaginationAndSortQueryDto);

  const result = pipe.transform({
    page: "2",
    limit: "25",
    sortBy: "updatedAt",
    sortOrder: "desc",
  });

  assert.equal(result.page, 2);
  assert.equal(result.limit, 25);
  assert.equal(result.getSkip(), 25);
  assert.equal(result.getTake(), 25);
  assert.equal(result.sortBy, "updatedAt");
  assert.equal(result.sortOrder, "desc");
});

test("DateParamDto validates single ISO-8601 date parameter", () => {
  const pipe = new ValidateQuery(DateParamDto);

  const valid = pipe.transform({ date: "2026-09-01T12:00:00.000Z" });
  assert.equal(valid.date, "2026-09-01T12:00:00.000Z");

  assert.throws(
    () => pipe.transform({ date: "not-a-date" }),
    (err: unknown) => err instanceof BadRequestException,
  );

  assert.throws(
    () => pipe.transform({}),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("DateRangeQueryDto validates date intervals and converts to Prisma range", () => {
  const pipe = new ValidateQuery(DateRangeQueryDto);

  const start = "2026-09-01T00:00:00.000Z";
  const end = "2026-09-10T23:59:59.000Z";

  const valid = pipe.transform({ startDate: start, endDate: end });
  assert.equal(valid.startDate, start);
  assert.equal(valid.endDate, end);
  assert.equal(valid.getStartDate()?.toISOString(), start);
  assert.equal(valid.getEndDate()?.toISOString(), end);

  const prismaRange = valid.toDateRange();
  assert.ok(prismaRange);
  assert.equal(prismaRange?.gte?.toISOString(), start);
  assert.equal(prismaRange?.lte?.toISOString(), end);

  // Inverted range (startDate > endDate) must be rejected
  assert.throws(
    () => pipe.transform({ startDate: end, endDate: start }),
    (err: unknown) => err instanceof BadRequestException && err.message.includes("startDate must be before or equal to endDate"),
  );

  // Equal dates are valid
  const sameDate = pipe.transform({ startDate: start, endDate: start });
  assert.equal(sameDate.startDate, start);
  assert.equal(sameDate.endDate, start);

  // Invalid date format
  assert.throws(
    () => pipe.transform({ startDate: "invalid-date" }),
    BadRequestException,
  );
});

test("CreatedAtRangeQueryDto validates from and to creation dates", () => {
  const pipe = new ValidateQuery(CreatedAtRangeQueryDto);

  const from = "2026-01-01T00:00:00.000Z";
  const to = "2026-06-01T00:00:00.000Z";

  const valid = pipe.transform({ from, to });
  assert.equal(valid.getFromDate()?.toISOString(), from);
  assert.equal(valid.getToDate()?.toISOString(), to);

  const range = valid.toCreatedAtRange();
  assert.equal(range?.gte?.toISOString(), from);
  assert.equal(range?.lte?.toISOString(), to);

  // Inverted range
  assert.throws(
    () => pipe.transform({ from: to, to: from }),
    (err: unknown) => err instanceof BadRequestException && err.message.includes("from date must be before or equal to to date"),
  );
});

test("SearchQueryDto trims and normalizes search terms", () => {
  const pipe = new ValidateQuery(SearchQueryDto);

  const withSearch = pipe.transform({ search: "  senior frontend engineer  " });
  assert.equal(withSearch.search, "senior frontend engineer");
  assert.equal(withSearch.getSearchTerm(), "senior frontend engineer");

  const withQ = pipe.transform({ q: "  react typescript  " });
  assert.equal(withQ.q, "react typescript");
  assert.equal(withQ.getSearchTerm(), "react typescript");

  const empty = pipe.transform({});
  assert.equal(empty.getSearchTerm(), undefined);

  assert.throws(
    () => pipe.transform({ search: "x".repeat(201) }),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("BaseQueryDto seamlessly validates pagination, sorting, search, and date range in a single schema", () => {
  const pipe = new ValidateQuery(BaseQueryDto);

  const start = "2026-08-01T00:00:00.000Z";
  const end = "2026-08-31T23:59:59.000Z";

  const result = pipe.transform({
    page: "2",
    limit: "50",
    sortBy: "score",
    sortOrder: "desc",
    search: "  candidate evaluation  ",
    startDate: start,
    endDate: end,
  });

  assert.equal(result.page, 2);
  assert.equal(result.limit, 50);
  assert.equal(result.getSkip(), 50);
  assert.equal(result.getTake(), 50);
  assert.equal(result.sortBy, "score");
  assert.equal(result.sortOrder, "desc");
  assert.equal(result.getSearchTerm(), "candidate evaluation");
  assert.equal(result.getStartDate()?.toISOString(), start);
  assert.equal(result.getEndDate()?.toISOString(), end);
  assert.deepEqual(result.toDateRange(), {
    gte: new Date(start),
    lte: new Date(end),
  });

  // Rejects invalid combined parameters (e.g. inverted dates)
  assert.throws(
    () =>
      pipe.transform({
        page: "1",
        startDate: end,
        endDate: start,
      }),
    BadRequestException,
  );
});
