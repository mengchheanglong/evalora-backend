import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BadRequestException } from "@nestjs/common";
import { ValidateDto } from "../src/common/pipes/validate-dto.pipe";
import { ValidateQuery } from "../src/common/validation/pipes/validate-query.pipe";
import {
  CreateTemplateDto,
  CloneFromCatalogDto,
  UpdateTemplateDto,
  ListTemplatesQueryDto,
} from "../src/modules/templates/dto/template.dto";
import { CreateSessionDto, ListSessionsQueryDto } from "../src/modules/sessions/dto/session.dto";
import {
  UpdateWorkspaceDto,
  DeleteWorkspaceDataDto,
  CreateInviteDto,
  AcceptInviteDto,
} from "../src/modules/organization/dto/organization.dto";
import { AddReviewerNoteDto } from "../src/modules/reports/dto/report.dto";
import { RegisterDto, LoginDto } from "../src/modules/auth/dto/auth.dto";

test("ValidateDto strictly forbids unexpected/extraneous fields (payload sanitization)", () => {
  const registerPipe = new ValidateDto(RegisterDto);

  // Extra field smuggled into registration must be rejected
  assert.throws(
    () =>
      registerPipe.transform({
        name: "Alice Candidate",
        email: "alice@example.com",
        password: "Password123!",
        role: "ADMIN", // Smuggled privilege escalation field
      }),
    (err: unknown) =>
      err instanceof BadRequestException &&
      (err.message.includes("property role should not exist") ||
        JSON.stringify((err as any).getResponse()).includes("role")),
  );
});

test("CreateTemplateDto validates nested module and question payloads and strips unexpected fields", () => {
  const pipe = new ValidateDto(CreateTemplateDto);

  const valid = pipe.transform({
    title: "  Senior Backend Engineer Assessment  ",
    description: "Evaluates distributed systems and Node.js skills.",
    timeLimitMin: 60,
    modules: [
      {
        title: "Coding Assessment",
        type: "coding",
        weight: 50,
        questions: [
          {
            questionText: "Implement a rate limiter in TypeScript.",
            rubric: "Check sliding window implementation.",
          },
        ],
      },
    ],
  });

  assert.equal(valid.title, "Senior Backend Engineer Assessment");
  assert.equal(valid.timeLimitMin, 60);
  assert.equal(valid.modules?.length, 1);
  assert.equal(valid.modules[0].questions?.length, 1);

  // Missing required title in module
  assert.throws(
    () =>
      pipe.transform({
        title: "Invalid Template",
        modules: [{ type: "coding" }],
      }),
    BadRequestException,
  );

  // Smuggled extra field in nested module
  assert.throws(
    () =>
      pipe.transform({
        title: "Smuggled Field Template",
        modules: [
          {
            title: "Module 1",
            type: "coding",
            unauthorizedKey: "malicious_payload",
          },
        ],
      }),
    BadRequestException,
  );
});

test("CreateSessionDto validates candidate email format and strips unknown properties", () => {
  const pipe = new ValidateDto(CreateSessionDto);

  const valid = pipe.transform({
    templateId: "  tmpl-12345  ",
    candidateName: "  Bob Tester  ",
    candidateEmail: "  bob@test.com  ",
    expiresAt: "2026-10-01T00:00:00.000Z",
    title: "  Frontend Engineer Assessment  ",
    notes: "Follow up on React performance.",
    targetRole: "Frontend Engineer",
    department: "Engineering",
    interviewType: "technical",
    interviewers: ["Alice Interviewer", "Bob Reviewer"],
    scheduledAt: "2026-10-05T14:00:00.000Z",
    sessionDate: "2026-10-05",
    startTime: "14:00",
    durationMin: 60,
    language: "en",
    timeZone: "America/New_York",
  });

  assert.equal(valid.templateId, "tmpl-12345");
  assert.equal(valid.candidateName, "Bob Tester");
  assert.equal(valid.candidateEmail, "bob@test.com");
  assert.equal(valid.expiresAt, "2026-10-01T00:00:00.000Z");
  assert.equal(valid.title, "Frontend Engineer Assessment");
  assert.equal(valid.targetRole, "Frontend Engineer");
  assert.equal(valid.department, "Engineering");
  assert.equal(valid.durationMin, 60);

  // Invalid email format
  assert.throws(
    () =>
      pipe.transform({
        templateId: "tmpl-1",
        candidateEmail: "not-an-email",
      }),
    BadRequestException,
  );

  // Smuggled status/scoring override
  assert.throws(
    () =>
      pipe.transform({
        templateId: "tmpl-1",
        status: "COMPLETED",
        overallScore: 5.0,
      }),
    BadRequestException,
  );
});

test("Organization DTOs sanitize workspace names, emails, and invite acceptance payloads", () => {
  const workspacePipe = new ValidateDto(UpdateWorkspaceDto);
  const invitePipe = new ValidateDto(CreateInviteDto);
  const acceptPipe = new ValidateDto(AcceptInviteDto);

  // Trims workspace name
  const ws = workspacePipe.transform({ name: "  Acme Corp Technologies  " });
  assert.equal(ws.name, "Acme Corp Technologies");

  // Empty workspace name rejected
  assert.throws(() => workspacePipe.transform({ name: "   " }), BadRequestException);

  // Valid invite
  const inv = invitePipe.transform({ email: "  colleague@company.com  " });
  assert.equal(inv.email, "colleague@company.com");

  // Invalid invite email
  assert.throws(() => invitePipe.transform({ email: "invalid-email" }), BadRequestException);

  // Accept invite
  const acc = acceptPipe.transform({
    token: "  valid-invite-token-123  ",
    name: "  Colleague Name  ",
    password: "Password123!",
  });
  assert.equal(acc.token, "valid-invite-token-123");
  assert.equal(acc.name, "Colleague Name");

  // Smuggled organization ID on accept
  assert.throws(
    () =>
      acceptPipe.transform({
        token: "valid-token",
        organizationId: "org-hijack-attempt",
      }),
    BadRequestException,
  );
});

test("AddReviewerNoteDto validates non-empty reviewer notes and bounds length", () => {
  const pipe = new ValidateDto(AddReviewerNoteDto);

  const valid = pipe.transform({ note: "  Candidate demonstrated great depth in concurrency.  " });
  assert.equal(valid.note, "Candidate demonstrated great depth in concurrency.");

  // Empty note
  assert.throws(() => pipe.transform({ note: "" }), BadRequestException);
  assert.throws(() => pipe.transform({ note: "    " }), BadRequestException);

  // Overly long note (> 4000 chars)
  assert.throws(() => pipe.transform({ note: "x".repeat(4001) }), BadRequestException);
});

test("ListSessionsQueryDto validates query filters and forbids unauthorized query params", () => {
  const pipe = new ValidateQuery(ListSessionsQueryDto);

  const valid = pipe.transform({
    status: "in_progress",
    candidateId: "cand-123",
  });
  assert.equal(valid.status, "in_progress");
  assert.equal(valid.candidateId, "cand-123");

  // Invalid session status
  assert.throws(() => pipe.transform({ status: "invalid_status" }), BadRequestException);

  // Unknown query parameter
  assert.throws(
    () => pipe.transform({ status: "completed", sqlInjection: "1=1" }),
    BadRequestException,
  );
});

test("ListTemplatesQueryDto validates organizationId and strips unknown query params", () => {
  const pipe = new ValidateQuery(ListTemplatesQueryDto);

  const valid = pipe.transform({ organizationId: "  org-456  " });
  assert.equal(valid.organizationId, "org-456");

  // Unknown query parameter
  assert.throws(
    () => pipe.transform({ organizationId: "org-1", adminBypass: "true" }),
    BadRequestException,
  );
});
