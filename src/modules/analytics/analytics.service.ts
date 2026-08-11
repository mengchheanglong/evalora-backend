import { Inject, Injectable } from "@nestjs/common";
// Avoid direct Prisma type references here; use `any` where needed to
// prevent compiler errors when generated types differ in environments.
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSessionOwnershipWhere,
  buildTemplateOwnershipWhere,
  type AccessContext,
} from "../auth/access-control";

type StatusKey = "not_started" | "in_progress" | "completed" | "expired";
const DAY_MS = 24 * 60 * 60 * 1_000;
const TREND_DAYS = 14;
const THEME_WINDOW_DAYS = 90;
const THEME_SAMPLE_LIMIT = 500;
const AUTO_EXPIRY_GRACE_MS = 5_000;

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(access: AccessContext) {
    const asOf = new Date();
    await this.reconcileExpiredInvitations(access, asOf);
    const sessionWhere = sessionScope(access);
    const completedSessionWhere = completedSessionScope(access);
    const templateWhere = buildTemplateOwnershipWhere(access) as any;

    // Prefer aggregates over loading every session row (much faster on Neon).
    const [statusGroups, totalTemplates, reportStats, distinctCandidates] =
      await Promise.all([
        this.prisma.interviewSession.groupBy({
          by: ["status"],
          where: sessionWhere,
          _count: { _all: true },
        }),
        this.prisma.assessmentTemplate.count({ where: templateWhere }),
        this.prisma.candidateReport.aggregate({
          where: { session: completedSessionWhere },
          _count: { _all: true },
        }),
        this.prisma.interviewSession.findMany({
          where: sessionWhere,
          select: { candidateId: true },
          distinct: ["candidateId"],
        }),
      ]);

    const statusCounts = emptyStatusCounts();
    let totalSessions = 0;
    for (const group of statusGroups) {
      const key = fromPrismaStatus(group.status);
      statusCounts[key] = group._count._all;
      totalSessions += group._count._all;
    }

    const completedAssessments = statusCounts.completed;
    const closedAssessments = completedAssessments + statusCounts.expired;
    const reportReadyAssessments = reportStats._count._all;

    return {
      asOf: asOf.toISOString(),
      dataWindow: "all_time" as const,
      scope: access.role === "admin" ? "platform" as const : "organization" as const,
      totalCandidates: distinctCandidates.length,
      totalTemplates,
      totalSessions,
      completedAssessments,
      inProgressAssessments: statusCounts.in_progress,
      pendingAssessments: statusCounts.not_started,
      expiredAssessments: statusCounts.expired,
      activeAssessments: statusCounts.not_started + statusCounts.in_progress,
      closedAssessments,
      reportReadyAssessments,
      reportsPending: Math.max(0, completedAssessments - reportReadyAssessments),
      closedCompletionRate: closedAssessments ? round(completedAssessments / closedAssessments, 4) : null,
      reportCoverageRate: completedAssessments
        ? round(Math.min(reportReadyAssessments, completedAssessments) / completedAssessments, 4)
        : null,
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    };
  }

  async activity(access: AccessContext) {
    await this.reconcileExpiredInvitations(access, new Date());
    const sessions = await this.prisma.interviewSession.findMany({
      relationLoadStrategy: "join",
      where: sessionScope(access),
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        candidate: { select: { name: true } },
        template: { select: { title: true } },
        report: { select: { id: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    });

    return sessions.map((session: any) => {
      const status = fromPrismaStatus(session.status);
      const event = activityCopy(status, Boolean(session.report));
      return {
        id: `${session.id}:${status}`,
        sessionId: session.id,
        type: event.type,
        message: `${session.candidate.name} ${event.action} ${session.template.title}`,
        candidateName: session.candidate.name,
        assessmentName: session.template.title,
        status,
        createdAt: (session.updatedAt ?? session.createdAt).toISOString(),
      };
    });
  }

  async readyReports(access: AccessContext) {
    const reports = await this.prisma.candidateReport.findMany({
      relationLoadStrategy: "join",
      where: { session: completedSessionScope(access) },
      select: {
        id: true,
        updatedAt: true,
        session: {
          select: {
            id: true,
            candidate: { select: { name: true } },
            template: { select: { title: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    });

    return reports.map((report: any) => ({
      id: report.id,
      sessionId: report.session.id,
      type: "report_ready" as const,
      message: `${report.session.candidate.name}'s report is ready for ${report.session.template.title}`,
      candidateName: report.session.candidate.name,
      assessmentName: report.session.template.title,
      status: "completed" as const,
      createdAt: report.updatedAt.toISOString(),
    }));
  }

  async modulePerformance(access: AccessContext, templateId: string) {
    const evaluationGroups = await this.prisma.evaluation.groupBy({
      by: ["moduleId"],
      where: { session: completedSessionScope(access, templateId) },
      _avg: { score: true },
      _count: { _all: true },
    });
    const moduleIds = evaluationGroups
      .map((group: any) => group.moduleId)
      .filter((moduleId: any): moduleId is string => Boolean(moduleId));
    const modules = moduleIds.length
      ? await this.prisma.assessmentModule.findMany({
          where: { id: { in: moduleIds } },
          select: { id: true, moduleType: true },
        })
      : [];
    const moduleTypes = new Map(modules.map((module: any) => [module.id, module.moduleType.toLowerCase()]));

    const groups = new Map<string, { moduleType: string; title: string; total: number; count: number }>();
    for (const evaluation of evaluationGroups) {
      const moduleType = evaluation.moduleId ? moduleTypes.get((evaluation as any).moduleId) ?? "unassigned" : "unassigned";
      const group = groups.get(moduleType) ?? {
        moduleType,
        title: titleCase(moduleType),
        total: 0,
        count: 0,
      };
      group.total += (evaluation._avg.score ?? 0) * evaluation._count._all;
      group.count += evaluation._count._all;
      groups.set(moduleType, group);
    }

    return Array.from(groups.values())
      .map((group: any) => ({
        moduleType: group.moduleType,
        title: group.title,
        average: round(group.total / group.count, 2),
        evaluationCount: group.count,
      }))
      .sort((a, b) => b.average - a.average);
  }

  async scoreDistribution(access: AccessContext, templateId: string) {
    const reportGroups = await this.prisma.candidateReport.groupBy({
      by: ["overallScore"],
      where: { session: completedSessionScope(access, templateId) },
      _count: { _all: true },
    });
    const buckets = [
      { label: "No assessable evidence", min: 0, max: 0, count: 0, noEvidence: true },
      { label: ">0-0.9", min: 0, max: 1, count: 0, noEvidence: false },
      { label: "1.0-1.9", min: 1, max: 2, count: 0 },
      { label: "2.0-2.9", min: 2, max: 3, count: 0 },
      { label: "3.0-3.9", min: 3, max: 4, count: 0 },
      { label: "4.0-5.0", min: 4, max: 5.01, count: 0 },
    ];

    for (const report of reportGroups) {
      const r: any = report;
      const bucket = r.overallScore === 0
        ? buckets[0]
        : buckets.find((item, index) => index > 0 && r.overallScore >= item.min && r.overallScore < item.max);
      if (bucket) bucket.count += r._count._all;
    }

    return buckets.map(({ label, count, noEvidence }) => (
      typeof noEvidence === "boolean" ? { label, count, noEvidence } : { label, count }
    ));
  }

  async completionDuration(access: AccessContext, templateId: string) {
    const sessions = await this.prisma.interviewSession.findMany({
      where: {
        ...completedSessionScope(access, templateId),
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: { startedAt: true, completedAt: true },
    });
    const durations = sessions
      .map((session: any) => {
        if (!session.startedAt || !session.completedAt) return null;
        const minutes = (session.completedAt.getTime() - session.startedAt.getTime()) / 60_000;
        return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
      })
      .filter((minutes: any): minutes is number => minutes !== null)
      .sort((a: number, b: number) => a - b);

    return {
      templateId,
      medianMinutes: durations.length ? round(median(durations), 1) : null,
      sampleSize: durations.length,
      buckets: [
        { label: "Under 30 min", count: durations.filter((minutes) => minutes < 30).length },
        { label: "30-59 min", count: durations.filter((minutes) => minutes >= 30 && minutes < 60).length },
        { label: "60-89 min", count: durations.filter((minutes) => minutes >= 60 && minutes < 90).length },
        { label: "90+ min", count: durations.filter((minutes) => minutes >= 90).length },
      ],
    };
  }

  async templateUsage(access: AccessContext) {
    const groups = await this.prisma.interviewSession.groupBy({
      by: ["templateId", "status"],
      where: sessionScope(access),
      _count: { _all: true },
    });
    const templateIds = [...new Set(groups.map((group: any) => group.templateId))];
    const templates = templateIds.length
      ? await this.prisma.assessmentTemplate.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, title: true },
        })
      : [];
    const titles = new Map(templates.map((template: any) => [template.id, template.title]));
    const usage = new Map<string, { templateId: string; title: string; assignments: number; completed: number }>();

    for (const group of groups) {
      const g: any = group;
      const row = usage.get(g.templateId) ?? {
        templateId: g.templateId,
        title: titles.get(g.templateId) ?? "Untitled assessment",
        assignments: 0,
        completed: 0,
      };
      row.assignments += g._count._all;
      if (g.status === "COMPLETED") row.completed += g._count._all;
      usage.set(g.templateId, row);
    }

    return Array.from(usage.values()).sort((a, b) => b.assignments - a.assignments || a.title.localeCompare(b.title));
  }

  /**
   * Assessment performance trend: average overall score per day (converted from
   * the 0-5 report scale to a 0-100 percentage), scoped to the caller's
   * workspace, ordered oldest-to-newest. Powers the dashboard trend chart.
   */
  async trend(access: AccessContext): Promise<Array<{ date: string; score: number; completedCount: number }>> {
    const from = startOfUtcDay(new Date(Date.now() - (TREND_DAYS - 1) * DAY_MS));
    const reports = await this.prisma.candidateReport.findMany({
      relationLoadStrategy: "join",
      where: { session: { ...completedSessionScope(access), completedAt: { gte: from } } },
      select: { overallScore: true, createdAt: true, session: { select: { completedAt: true } } },
      orderBy: { createdAt: "asc" },
    });

    const byDay = new Map<string, { total: number; count: number }>();
    for (const report of reports) {
      const r: any = report;
      const when = r.session?.completedAt ?? r.createdAt;
      if (!when) continue;
      const day = when.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { total: 0, count: 0 };
      entry.total += r.overallScore;
      entry.count += 1;
      byDay.set(day, entry);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, count }]) => ({
        date,
        score: Math.round((total / count) * 20),
        completedCount: count,
      }));
  }

  async upcoming(access: AccessContext) {
    await this.reconcileExpiredInvitations(access, new Date());
    const activeScope: any = {
      ...sessionScope(access),
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    };
    const select = {
      id: true,
      status: true,
      scheduledAt: true,
      expiresAt: true,
      targetRole: true,
      candidate: { select: { name: true } },
      template: { select: { roleType: true } },
    } as any;
    const scheduled = await this.prisma.interviewSession.findMany({
      where: { ...activeScope, scheduledAt: { not: null } },
      select,
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    const unscheduled = scheduled.length < 5
      ? await this.prisma.interviewSession.findMany({
          where: { ...activeScope, scheduledAt: null },
          select,
          orderBy: { updatedAt: "desc" },
          take: 5 - scheduled.length,
        })
      : [];

    return [...scheduled, ...unscheduled].map((session: any) => ({
      sessionId: session.id,
      candidateName: session.candidate.name,
      targetRole: session.targetRole?.trim() || session.template.roleType,
      status: fromPrismaStatus(session.status),
      scheduledAt: session.scheduledAt?.toISOString(),
      expiresAt: session.expiresAt?.toISOString(),
    }));
  }

  async themes(access: AccessContext) {
    const from = new Date(Date.now() - THEME_WINDOW_DAYS * DAY_MS);
    const reports = await this.prisma.candidateReport.findMany({
      where: { createdAt: { gte: from }, session: completedSessionScope(access) },
      select: { overallScore: true, strengths: true, improvementAreas: true },
      orderBy: { createdAt: "desc" },
      take: THEME_SAMPLE_LIMIT + 1,
    });
    const sampled = reports.length > THEME_SAMPLE_LIMIT;
    const sample = reports.slice(0, THEME_SAMPLE_LIMIT);

    return {
      strengths: rankThemes(
        sample.filter((report) => report.overallScore > 0).flatMap((report) => stringArray(report.strengths)),
      ),
      improvementAreas: rankThemes(sample.flatMap((report) => stringArray(report.improvementAreas))),
      meta: { windowDays: THEME_WINDOW_DAYS, reportCount: sample.length, sampled },
    };
  }

  private async reconcileExpiredInvitations(access: AccessContext, asOf: Date): Promise<void> {
    if (typeof this.prisma.interviewSession.updateMany !== "function") return;
    await this.prisma.interviewSession.updateMany({
      where: {
        ...sessionScope(access),
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        expiresAt: { lte: asOf },
      },
      data: { status: "EXPIRED" },
    });

    const inProgress = await this.prisma.interviewSession.findMany({
      where: { ...sessionScope(access), status: "IN_PROGRESS", startedAt: { not: null } },
      select: {
        id: true,
        startedAt: true,
        template: { select: { timeLimitMin: true } },
      },
    });
    const timedOutIds = inProgress
      .filter((session) => {
        const timeLimitMin = session.template.timeLimitMin;
        return Boolean(
          session.startedAt
          && timeLimitMin
          && timeLimitMin > 0
          && session.startedAt.getTime() + timeLimitMin * 60_000 + AUTO_EXPIRY_GRACE_MS <= asOf.getTime(),
        );
      })
      .map((session) => session.id);
    if (!timedOutIds.length) return;
    await this.prisma.interviewSession.updateMany({
      where: { ...sessionScope(access), id: { in: timedOutIds }, status: "IN_PROGRESS" },
      data: { status: "EXPIRED" },
    });
  }

}

function sessionScope(access: AccessContext): any {
  return buildSessionOwnershipWhere(access) as any;
}

function completedSessionScope(access: AccessContext, templateId?: string): any {
  return { ...sessionScope(access), status: "COMPLETED", ...(templateId ? { templateId } : {}) } as any;
}

function emptyStatusCounts(): Record<StatusKey, number> {
  return { not_started: 0, in_progress: 0, completed: 0, expired: 0 };
}

function fromPrismaStatus(status: string): StatusKey {
  return status.toLowerCase() as StatusKey;
}

function activityCopy(status: StatusKey, reportReady: boolean) {
  if (status === "completed" && reportReady) return { type: "report_ready", action: "completed" };
  if (status === "completed") return { type: "session_completed", action: "completed" };
  if (status === "in_progress") return { type: "session_started", action: "started" };
  if (status === "expired") return { type: "session_expired", action: "reached the expiry date for" };
  return { type: "session_created", action: "was invited to" };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function rankThemes(values: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const label = value.trim().replace(/\s+/g, " ");
    const key = label.toLocaleLowerCase();
    if (!key) continue;
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function startOfUtcDay(value: Date): Date {
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function titleCase(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
