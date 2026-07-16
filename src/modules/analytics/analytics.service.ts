import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSessionOwnershipWhere,
  buildTemplateOwnershipWhere,
  type AccessContext,
} from "../auth/access-control";

type StatusKey = "not_started" | "in_progress" | "completed" | "expired";

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(access: AccessContext) {
    const sessionWhere = sessionScope(access);
    const templateWhere = buildTemplateOwnershipWhere(access) as Prisma.AssessmentTemplateWhereInput;

    // Prefer aggregates over loading every session row (much faster on Neon).
    const [statusGroups, totalTemplates, reportStats, distinctCandidates, modulePerformance, recentCompleted] =
      await Promise.all([
        this.prisma.interviewSession.groupBy({
          by: ["status"],
          where: sessionWhere,
          _count: { _all: true },
        }),
        this.prisma.assessmentTemplate.count({ where: templateWhere }),
        this.prisma.candidateReport.aggregate({
          where: { session: sessionWhere },
          _avg: { overallScore: true },
          _count: { _all: true },
        }),
        this.prisma.interviewSession.findMany({
          where: sessionWhere,
          select: { candidateId: true },
          distinct: ["candidateId"],
        }),
        this.modulePerformance(access),
        this.prisma.interviewSession.findMany({
          where: { ...sessionWhere, status: "COMPLETED" },
          select: {
            id: true,
            completedAt: true,
            candidate: { select: { name: true, email: true } },
            template: { select: { title: true, roleType: true } },
            report: { select: { overallScore: true } },
          },
          orderBy: { completedAt: "desc" },
          take: 6,
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
    const averageScore = reportStats._count._all
      ? round(reportStats._avg.overallScore ?? 0, 2)
      : 0;

    return {
      totalCandidates: distinctCandidates.length,
      totalTemplates,
      totalSessions,
      completedAssessments,
      inProgressAssessments: statusCounts.in_progress,
      pendingAssessments: statusCounts.not_started,
      expiredAssessments: statusCounts.expired,
      averageScore,
      completionRate: totalSessions ? round(completedAssessments / totalSessions, 4) : 0,
      statusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      modulePerformance,
      recentCompleted: recentCompleted.map((session) => ({
        sessionId: session.id,
        candidateName: session.candidate.name,
        candidateEmail: session.candidate.email,
        assessmentName: session.template.title,
        targetRole: session.template.roleType,
        overallScore: session.report?.overallScore,
        completedAt: session.completedAt?.toISOString(),
      })),
    };
  }

  async activity(access: AccessContext) {
    const sessions = await this.prisma.interviewSession.findMany({
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

    return sessions.map((session) => {
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

  async modulePerformance(access: AccessContext) {
    // Cap rows scanned for dashboard speed; averages stay representative for MVP volumes.
    const evaluations = await this.prisma.evaluation.findMany({
      where: { session: sessionScope(access) },
      select: {
        score: true,
        module: { select: { id: true, title: true, moduleType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const groups = new Map<string, { moduleId?: string; moduleType: string; title: string; total: number; count: number }>();
    for (const evaluation of evaluations) {
      const moduleType = evaluation.module?.moduleType.toLowerCase() ?? "unassigned";
      const key = evaluation.module?.id ?? moduleType;
      const group = groups.get(key) ?? {
        moduleId: evaluation.module?.id,
        moduleType,
        title: evaluation.module?.title ?? titleCase(moduleType),
        total: 0,
        count: 0,
      };
      group.total += evaluation.score;
      group.count += 1;
      groups.set(key, group);
    }

    return Array.from(groups.values())
      .map((group) => ({
        moduleId: group.moduleId,
        moduleType: group.moduleType,
        title: group.title,
        average: round(group.total / group.count, 2),
        evaluationCount: group.count,
      }))
      .sort((a, b) => b.average - a.average);
  }

  async scoreDistribution(access: AccessContext) {
    const reports = await this.prisma.candidateReport.findMany({
      where: { session: sessionScope(access) },
      select: { overallScore: true },
      take: 1000,
    });
    const buckets = [
      { label: "1.0-1.9", min: 1, max: 2, count: 0 },
      { label: "2.0-2.9", min: 2, max: 3, count: 0 },
      { label: "3.0-3.9", min: 3, max: 4, count: 0 },
      { label: "4.0-5.0", min: 4, max: 5.01, count: 0 },
    ];

    for (const report of reports) {
      const bucket = buckets.find((item) => report.overallScore >= item.min && report.overallScore < item.max);
      if (bucket) bucket.count += 1;
    }

    return buckets.map(({ label, count }) => ({ label, count }));
  }

  /**
   * Assessment performance trend: average overall score per day (converted from
   * the 0-5 report scale to a 0-100 percentage), scoped to the caller's
   * workspace, ordered oldest-to-newest. Powers the dashboard trend chart.
   */
  async trend(access: AccessContext): Promise<Array<{ date: string; score: number }>> {
    const reports = await this.prisma.candidateReport.findMany({
      where: { session: sessionScope(access) },
      select: { overallScore: true, createdAt: true, session: { select: { completedAt: true } } },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    const byDay = new Map<string, { total: number; count: number }>();
    for (const report of reports) {
      const when = report.session?.completedAt ?? report.createdAt;
      if (!when) continue;
      const day = when.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { total: 0, count: 0 };
      entry.total += report.overallScore;
      entry.count += 1;
      byDay.set(day, entry);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, count }]) => ({ date, score: Math.round((total / count) * 20) }))
      .slice(-14);
  }

  async themes(access: AccessContext) {
    const reports = await this.prisma.candidateReport.findMany({
      where: { session: sessionScope(access) },
      select: { strengths: true, improvementAreas: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    return {
      strengths: rankThemes(reports.flatMap((report) => stringArray(report.strengths))),
      improvementAreas: rankThemes(reports.flatMap((report) => stringArray(report.improvementAreas))),
    };
  }

}

function sessionScope(access: AccessContext): Prisma.InterviewSessionWhereInput {
  return buildSessionOwnershipWhere(access) as Prisma.InterviewSessionWhereInput;
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
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
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
