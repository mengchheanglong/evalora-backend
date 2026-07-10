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
    const [sessions, totalTemplates, reports, modulePerformance] = await Promise.all([
      this.prisma.interviewSession.findMany({
        where: sessionWhere,
        select: {
          id: true,
          candidateId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          candidate: { select: { name: true, email: true } },
          template: { select: { title: true, roleType: true } },
          report: { select: { overallScore: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.assessmentTemplate.count({ where: templateWhere }),
      this.prisma.candidateReport.findMany({
        where: { session: sessionWhere },
        select: { overallScore: true },
      }),
      this.modulePerformance(access),
    ]);

    const statusCounts = emptyStatusCounts();
    for (const session of sessions) statusCounts[fromPrismaStatus(session.status)] += 1;

    const completedAssessments = statusCounts.completed;
    const totalSessions = sessions.length;
    const averageScore = reports.length
      ? round(reports.reduce((total, report) => total + report.overallScore, 0) / reports.length, 2)
      : 0;

    return {
      totalCandidates: new Set(sessions.map((session) => session.candidateId)).size,
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
      recentCompleted: sessions
        .filter((session) => session.status === "COMPLETED")
        .slice(0, 6)
        .map((session) => ({
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
    const evaluations = await this.prisma.evaluation.findMany({
      where: { session: sessionScope(access) },
      select: {
        score: true,
        module: { select: { id: true, title: true, moduleType: true } },
      },
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

  async themes(access: AccessContext) {
    const reports = await this.prisma.candidateReport.findMany({
      where: { session: sessionScope(access) },
      select: { strengths: true, improvementAreas: true },
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
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function rankThemes(values: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const label = value.trim();
    const key = label.toLowerCase();
    const current = counts.get(key) ?? { label, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
