// End-to-end probe for the super-admin routes and suspension enforcement.
//
// Runs against a live API (default http://localhost:4000/api, override with
// API_URL). It seeds throwaway accounts under @evalora-test.local — a platform
// admin in its own workspace, plus an owner and an interviewer in a second
// workspace — drives the admin endpoints over HTTP, checks that suspension and
// role changes bite on the target's next request, and deletes everything it
// created. Real workspaces are never touched.
//
//   API_URL=http://localhost:4000/api pnpm exec tsx scripts/e2e-admin-probe.ts
//   ... --keep      leave the probe accounts in place (e.g. to sign in from the UI)
//   ... --cleanup   only delete probe accounts left behind by --keep
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { ADMIN_MESSAGES } from "../src/modules/admin/admin.service";
import { ACCOUNT_SUSPENDED_MESSAGE, WORKSPACE_SUSPENDED_MESSAGE } from "../src/modules/auth/account-status";

const API_URL = (process.env.API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");
const PASSWORD = "AdminProbe123x";
const EMAILS = {
  admin: "e2e-admin-probe@evalora-test.local",
  owner: "e2e-admin-probe-owner@evalora-test.local",
  interviewer: "e2e-admin-probe-interviewer@evalora-test.local",
} as const;
const ORG_NAMES = { admin: "E2E Admin Probe HQ", target: "E2E Admin Probe Workspace" } as const;

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];

function check(step: string, ok: boolean, detail?: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? ` (${detail})` : ""}`);
}

async function api(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

async function login(email: string) {
  return api("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/auth/me`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`API not reachable at ${API_URL}`);
}

async function cleanup() {
  const users = await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  const organizations = await prisma.organization.deleteMany({ where: { name: { in: Object.values(ORG_NAMES) } } });
  return { users: users.count, organizations: organizations.count };
}

async function seed() {
  await cleanup();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const adminOrg = await prisma.organization.create({ data: { name: ORG_NAMES.admin }, select: { id: true } });
  const targetOrg = await prisma.organization.create({ data: { name: ORG_NAMES.target }, select: { id: true } });
  const base = { emailVerified: true, passwordHash };
  const admin = await prisma.user.create({ data: { ...base, name: "E2E Admin Probe", email: EMAILS.admin, role: "ADMIN", organizationId: adminOrg.id }, select: { id: true } });
  const owner = await prisma.user.create({ data: { ...base, name: "E2E Probe Owner", email: EMAILS.owner, role: "ORGANIZATION", organizationId: targetOrg.id }, select: { id: true } });
  const interviewer = await prisma.user.create({ data: { ...base, name: "E2E Probe Interviewer", email: EMAILS.interviewer, role: "INTERVIEWER", organizationId: targetOrg.id }, select: { id: true } });
  return { adminOrg, targetOrg, admin, owner, interviewer };
}

async function run() {
  const seeded = await seed();
  await waitForApi();

  const adminLogin = await login(EMAILS.admin);
  check("admin can sign in", adminLogin.status === 201 || adminLogin.status === 200, `status ${adminLogin.status}`);
  const adminToken: string = adminLogin.json?.token;
  const ownerToken: string = (await login(EMAILS.owner)).json?.token;
  const interviewerToken: string = (await login(EMAILS.interviewer)).json?.token;
  check("owner and interviewer can sign in", Boolean(ownerToken && interviewerToken));

  const forbidden = await api("/admin/overview", { token: ownerToken });
  check("non-admin gets 403 on /admin/overview", forbidden.status === 403, `status ${forbidden.status}`);
  const anonymous = await api("/admin/overview");
  check("anonymous gets 401 on /admin/overview", anonymous.status === 401, `status ${anonymous.status}`);

  const overview = await api("/admin/overview", { token: adminToken });
  check(
    "admin overview returns platform totals and system health",
    overview.status === 200 && overview.json.organizations.total >= 2 && Array.isArray(overview.json.systemHealth.services) && typeof overview.json.ai.costPerTurnUsd === "number",
    `status ${overview.status}, orgs ${overview.json?.organizations?.total}, services ${overview.json?.systemHealth?.services?.length}`,
  );

  const organizations = await api(`/admin/organizations?q=${encodeURIComponent("e2e admin probe")}`, { token: adminToken });
  const target = organizations.json?.items?.find((item: any) => item.id === seeded.targetOrg.id);
  const own = organizations.json?.items?.find((item: any) => item.id === seeded.adminOrg.id);
  check(
    "organizations search finds probe workspaces with owner and counts",
    organizations.status === 200 && target?.owner?.email === EMAILS.owner && target?.memberCount === 2 && target?.plan === "free" && own?.isCurrentWorkspace === true,
    `status ${organizations.status}, total ${organizations.json?.total}`,
  );
  const byOwnerEmail = await api(`/admin/organizations?q=${encodeURIComponent(EMAILS.owner)}`, { token: adminToken });
  check("organizations search matches owner email", byOwnerEmail.json?.items?.some((item: any) => item.id === seeded.targetOrg.id) === true);

  const users = await api(`/admin/users?q=e2e-admin-probe&role=interviewer`, { token: adminToken });
  check(
    "users search + role filter isolates the probe interviewer",
    users.status === 200 && users.json.items.length === 1 && users.json.items[0].id === seeded.interviewer.id && users.json.items[0].organization?.id === seeded.targetOrg.id,
    `status ${users.status}, items ${users.json?.items?.length}`,
  );
  const tooBig = await api(`/admin/users?pageSize=1000`, { token: adminToken });
  check("pageSize above 100 is rejected", tooBig.status === 400, `status ${tooBig.status}`);
  const paged = await api(`/admin/users?q=e2e-admin-probe&pageSize=2&page=2`, { token: adminToken });
  check("pagination returns page 2 of 2", paged.status === 200 && paged.json.page === 2 && paged.json.totalPages === 2 && paged.json.items.length === 1, `total ${paged.json?.total}`);

  const selfSuspend = await api(`/admin/users/${seeded.admin.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: true } });
  check("admin cannot deactivate themselves", selfSuspend.status === 403 && selfSuspend.json.message === ADMIN_MESSAGES.selfDeactivate, `status ${selfSuspend.status}`);
  const selfRole = await api(`/admin/users/${seeded.admin.id}/role`, { method: "PATCH", token: adminToken, body: { role: "organization" } });
  check("admin cannot change their own role", selfRole.status === 403 && selfRole.json.message === ADMIN_MESSAGES.selfRoleChange, `status ${selfRole.status}`);

  const baseline = await api("/organization", { token: interviewerToken });
  check("interviewer can read their workspace before suspension", baseline.status === 200, `status ${baseline.status}`);

  const suspendUser = await api(`/admin/users/${seeded.interviewer.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: true } });
  check("admin suspends the interviewer", suspendUser.status === 200 && suspendUser.json.isSuspended === true && Boolean(suspendUser.json.suspendedAt));
  const blocked = await api("/organization", { token: interviewerToken });
  check("existing JWT is rejected on the next request", blocked.status === 403 && blocked.json.message === ACCOUNT_SUSPENDED_MESSAGE, `status ${blocked.status}: ${blocked.json?.message}`);
  const blockedLogin = await login(EMAILS.interviewer);
  check("suspended login answers 403 with the reason", blockedLogin.status === 403 && blockedLogin.json.message === ACCOUNT_SUSPENDED_MESSAGE, `status ${blockedLogin.status}`);
  const me = await api("/auth/me", { token: interviewerToken });
  check("GET /auth/me is null for a suspended account", me.status === 200 && (me.json === null || me.json === undefined), `status ${me.status}, body ${JSON.stringify(me.json)}`);

  const restoreUser = await api(`/admin/users/${seeded.interviewer.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: false } });
  const restored = await api("/organization", { token: interviewerToken });
  check("reactivation restores access to the same token", restoreUser.json?.isSuspended === false && restored.status === 200, `status ${restored.status}`);

  const selfWorkspace = await api(`/admin/organizations/${seeded.adminOrg.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: true } });
  check("admin cannot suspend their own workspace", selfWorkspace.status === 403 && selfWorkspace.json.message === ADMIN_MESSAGES.selfWorkspaceSuspend, `status ${selfWorkspace.status}`);

  const suspendOrg = await api(`/admin/organizations/${seeded.targetOrg.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: true } });
  check("admin suspends the target workspace", suspendOrg.status === 200 && suspendOrg.json.isSuspended === true);
  const ownerBlocked = await api("/organization", { token: ownerToken });
  const interviewerBlocked = await api("/organization", { token: interviewerToken });
  check(
    "workspace suspension cascades to owner and interviewer tokens",
    ownerBlocked.status === 403 && ownerBlocked.json.message === WORKSPACE_SUSPENDED_MESSAGE && interviewerBlocked.status === 403,
    `owner ${ownerBlocked.status}, interviewer ${interviewerBlocked.status}`,
  );
  const ownerLogin = await login(EMAILS.owner);
  check("owner login is refused while the workspace is suspended", ownerLogin.status === 403 && ownerLogin.json.message === WORKSPACE_SUSPENDED_MESSAGE, `status ${ownerLogin.status}`);
  const adminStill = await api("/admin/overview", { token: adminToken });
  check("admin keeps working while another workspace is suspended", adminStill.status === 200);
  const usersDuring = await api(`/admin/users?q=${encodeURIComponent(EMAILS.owner)}`, { token: adminToken });
  check("user list shows the workspace suspension", usersDuring.json?.items?.[0]?.organization?.isSuspended === true);

  const restoreOrg = await api(`/admin/organizations/${seeded.targetOrg.id}/status`, { method: "PATCH", token: adminToken, body: { isSuspended: false } });
  const ownerRestored = await api("/organization", { token: ownerToken });
  check("workspace reactivation restores members", restoreOrg.json?.isSuspended === false && ownerRestored.status === 200, `status ${ownerRestored.status}`);

  const plan = await api(`/admin/organizations/${seeded.targetOrg.id}/plan`, { method: "PATCH", token: adminToken, body: { plan: "pro" } });
  check("plan change persists", plan.status === 200 && plan.json.plan === "pro", `status ${plan.status}`);
  const badPlan = await api(`/admin/organizations/${seeded.targetOrg.id}/plan`, { method: "PATCH", token: adminToken, body: { plan: "gold" } });
  check("unknown plan is rejected", badPlan.status === 400, `status ${badPlan.status}`);
  const extraField = await api(`/admin/organizations/${seeded.targetOrg.id}/plan`, { method: "PATCH", token: adminToken, body: { plan: "pro", isSuspended: true } });
  check("unexpected body fields are rejected", extraField.status === 400, `status ${extraField.status}`);

  const lastOwner = await api(`/admin/users/${seeded.owner.id}/role`, { method: "PATCH", token: adminToken, body: { role: "interviewer" } });
  check("the only owner cannot be demoted", lastOwner.status === 400 && lastOwner.json.message === ADMIN_MESSAGES.onlyOwner, `status ${lastOwner.status}`);
  const promote = await api(`/admin/users/${seeded.interviewer.id}/role`, { method: "PATCH", token: adminToken, body: { role: "organization" } });
  const meAfterRole = await api("/auth/me", { token: interviewerToken });
  check("role change applies to the existing session immediately", promote.status === 200 && promote.json.role === "organization" && meAfterRole.json?.role === "organization", `status ${promote.status}, me role ${meAfterRole.json?.role}`);
  const candidateRole = await api(`/admin/users/${seeded.owner.id}/role`, { method: "PATCH", token: adminToken, body: { role: "candidate" } });
  check("candidate is not an assignable role", candidateRole.status === 400, `status ${candidateRole.status}`);
  const missing = await api(`/admin/users/00000000-0000-4000-8000-000000000000/status`, { method: "PATCH", token: adminToken, body: { isSuspended: true } });
  check("unknown user answers 404", missing.status === 404, `status ${missing.status}`);

  return seeded;
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--cleanup")) {
    console.log("CLEANUP", JSON.stringify(await cleanup()));
    return;
  }

  let failed = false;
  try {
    await run();
  } finally {
    failed = results.some((result) => !result.ok);
    console.log(`\n${results.filter((result) => result.ok).length}/${results.length} checks passed`);
    if (flags.has("--keep")) {
      console.log(`KEPT probe accounts. Admin: ${EMAILS.admin} / ${PASSWORD}. Remove with --cleanup.`);
    } else {
      console.log("CLEANUP", JSON.stringify(await cleanup()));
    }
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
