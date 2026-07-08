import type { JsonValue, ModuleType, QuestionType } from "../../domain/evalora.types";

export interface PrebuiltQuestionDefinition {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options?: JsonValue;
  rubric: string[];
}

export interface PrebuiltModuleDefinition {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
  settings?: JsonValue;
  questions: PrebuiltQuestionDefinition[];
}

export interface PrebuiltAssessmentTemplateDefinition {
  id: string;
  title: string;
  description: string;
  roleType: string;
  timeLimitMin: number;
  scoringRules: JsonValue;
  modules: PrebuiltModuleDefinition[];
}

export interface PrebuiltTemplateSeedContext {
  createdById: string;
  organizationId?: string;
}

interface PrismaQuestionSeedData {
  id: string;
  questionText: string;
  questionType: string;
  options?: JsonValue;
  rubric: string[];
}

interface PrismaModuleSeedData {
  id: string;
  moduleType: string;
  title: string;
  description: string;
  weight: number;
  orderIndex: number;
  settings?: JsonValue;
  questions: { create: PrismaQuestionSeedData[] };
}

export interface PrebuiltTemplateCreateData {
  id: string;
  title: string;
  description: string;
  roleType: string;
  timeLimitMin: number;
  scoringRules: JsonValue;
  createdById: string;
  organizationId?: string;
  modules: { create: PrismaModuleSeedData[] };
}

export interface PrebuiltTemplateUpdateData extends Omit<PrebuiltTemplateCreateData, "id" | "modules"> {
  modules: {
    deleteMany: Record<string, never>;
    create: PrismaModuleSeedData[];
  };
}

export const PREBUILT_ASSESSMENT_TEMPLATES: PrebuiltAssessmentTemplateDefinition[] = [
  {
    "id": "prebuilt-hr-generalist-assessment",
    "title": "HR Generalist Assessment",
    "description": "Research-backed prebuilt HR assessment covering STAR behavior, employee relations judgment, candidate communication, HR operations, ethics, and data-informed people-process improvement.",
    "roleType": "HR Generalist",
    "timeLimitMin": 75,
    "scoringRules": {
      "passScore": 3.5,
      "scale": "1-5",
      "source": "prebuilt-researched-v2",
      "recommendedCandidateQuestionCount": {
        "min": 10,
        "max": 14
      },
      "researchBasis": [
        "Amazon Leadership Principles behavioral loops",
        "Oracle STAR competency interviews",
        "PwC competency and business interviews",
        "Accenture behavioral scenarios",
        "Deloitte situational and behavioral questioning"
      ],
      "notes": "Use as an editable starter bank. Assign only a subset per candidate so the experience stays realistic."
    },
    "modules": [
      {
        "id": "prebuilt-hr-behavioral",
        "type": "behavioral",
        "title": "Behavioral and STAR Interview",
        "description": "Checks past behavior around confidentiality, fairness, adaptability, conflict, and learning from mistakes.",
        "weight": 1.15,
        "orderIndex": 1,
        "settings": {
          "recommendedMinutes": 15,
          "allowFollowUps": true
        },
        "questions": [
          {
            "id": "prebuilt-hr-behavioral-sensitive-issue",
            "questionText": "Tell us about a time you handled a sensitive employee or candidate issue while staying fair and confidential.",
            "questionType": "scenario",
            "rubric": [
              "confidentiality",
              "fairness",
              "empathy",
              "policy-awareness",
              "evidence"
            ]
          },
          {
            "id": "prebuilt-hr-behavioral-process-integrity",
            "questionText": "How would you handle a hiring manager who wants to skip a required interview or documentation step?",
            "questionType": "scenario",
            "rubric": [
              "process-discipline",
              "stakeholder-communication",
              "risk-management",
              "professionalism"
            ]
          },
          {
            "id": "prebuilt-hr-behavioral-conflict",
            "questionText": "Tell us about a time you helped resolve conflict between employees, managers, or candidates. What did you do first?",
            "questionType": "short_answer",
            "rubric": [
              "listening",
              "neutrality",
              "evidence-gathering",
              "resolution",
              "follow-up"
            ]
          },
          {
            "id": "prebuilt-hr-behavioral-change",
            "questionText": "Describe a time an HR policy or process changed quickly. How did you adapt and help others understand the change?",
            "questionType": "short_answer",
            "rubric": [
              "adaptability",
              "communication",
              "policy-understanding",
              "change-management"
            ]
          },
          {
            "id": "prebuilt-hr-behavioral-failure",
            "questionText": "Tell us about an HR or administrative mistake you made. How did you fix it and prevent it from happening again?",
            "questionType": "short_answer",
            "rubric": [
              "ownership",
              "transparency",
              "root-cause-analysis",
              "process-improvement"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-hr-communication",
        "type": "communication",
        "title": "Candidate and Manager Communication",
        "description": "Assesses candidate-facing clarity, manager updates, written communication, empathy, and expectation setting.",
        "weight": 1.1,
        "orderIndex": 2,
        "settings": {
          "recommendedMinutes": 14,
          "roleplay": true
        },
        "questions": [
          {
            "id": "prebuilt-hr-communication-delayed-offer",
            "questionText": "Roleplay explaining a delayed offer decision to a candidate while keeping trust and professionalism.",
            "questionType": "roleplay",
            "rubric": [
              "clarity",
              "empathy",
              "expectation-setting",
              "professionalism"
            ]
          },
          {
            "id": "prebuilt-hr-communication-pipeline-risk",
            "questionText": "Write a concise update to a department head about a hiring pipeline risk and the next actions you recommend.",
            "questionType": "short_answer",
            "rubric": [
              "conciseness",
              "risk-framing",
              "action-orientation",
              "stakeholder-awareness"
            ]
          },
          {
            "id": "prebuilt-hr-communication-rejection",
            "questionText": "Write a respectful rejection message to a strong candidate who reached the final round but was not selected.",
            "questionType": "short_answer",
            "rubric": [
              "respect",
              "brevity",
              "brand-protection",
              "candidate-experience"
            ]
          },
          {
            "id": "prebuilt-hr-communication-policy",
            "questionText": "A manager says an attendance policy is unfair. Explain how you would respond without escalating defensiveness.",
            "questionType": "roleplay",
            "rubric": [
              "policy-clarity",
              "empathy",
              "de-escalation",
              "consistency"
            ]
          },
          {
            "id": "prebuilt-hr-communication-documentation",
            "questionText": "Write a short message to a manager explaining why performance concerns need timely documentation before HR action.",
            "questionType": "short_answer",
            "rubric": [
              "clarity",
              "risk-awareness",
              "manager-coaching",
              "professional-tone"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-hr-work-style",
        "type": "work_style",
        "title": "HR Work Style and Operating Habits",
        "description": "Explores organization, workload ownership, documentation, service mindset, and confidentiality habits.",
        "weight": 1.0,
        "orderIndex": 3,
        "settings": {
          "recommendedMinutes": 12
        },
        "questions": [
          {
            "id": "prebuilt-hr-work-style-workload",
            "questionText": "Which work environment helps you perform best, and how do you communicate workload limits before quality drops?",
            "questionType": "short_answer",
            "rubric": [
              "self-awareness",
              "communication",
              "ownership",
              "prioritization"
            ]
          },
          {
            "id": "prebuilt-hr-work-style-documentation",
            "questionText": "Rate how consistently you document hiring decisions and explain what you do when details are missing.",
            "questionType": "scale",
            "options": {
              "min": 1,
              "max": 5,
              "labels": [
                "rarely",
                "always"
              ]
            },
            "rubric": [
              "documentation",
              "accountability",
              "process-consistency"
            ]
          },
          {
            "id": "prebuilt-hr-work-style-prioritization",
            "questionText": "Three urgent requests arrive at once: payroll error, candidate offer deadline, and manager policy question. How do you prioritize?",
            "questionType": "scenario",
            "rubric": [
              "urgency-assessment",
              "employee-impact",
              "risk-management",
              "communication"
            ]
          },
          {
            "id": "prebuilt-hr-work-style-confidentiality",
            "questionText": "What daily habits help you protect confidential employee and candidate information?",
            "questionType": "short_answer",
            "rubric": [
              "privacy-awareness",
              "systems-discipline",
              "need-to-know",
              "consistency"
            ]
          },
          {
            "id": "prebuilt-hr-work-style-service",
            "questionText": "How do you stay helpful to employees while still enforcing policy consistently?",
            "questionType": "short_answer",
            "rubric": [
              "service-mindset",
              "boundaries",
              "fairness",
              "policy-consistency"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-hr-problem-solving",
        "type": "problem_solving",
        "title": "People Process Problem Solving",
        "description": "Tests structured diagnosis and improvement planning for HR operations, hiring funnels, onboarding, and workforce issues.",
        "weight": 1.2,
        "orderIndex": 4,
        "settings": {
          "recommendedMinutes": 18
        },
        "questions": [
          {
            "id": "prebuilt-hr-problem-solving-onboarding-dropoff",
            "questionText": "A new-hire onboarding process has high drop-off in the first two weeks. How would you diagnose the causes and improve it?",
            "questionType": "scenario",
            "rubric": [
              "root-cause-analysis",
              "data-use",
              "stakeholder-collaboration",
              "implementation-plan",
              "measurement"
            ]
          },
          {
            "id": "prebuilt-hr-problem-solving-turnover",
            "questionText": "A department has 25% turnover in six months. What data would you review first, and what actions might you recommend?",
            "questionType": "scenario",
            "rubric": [
              "data-selection",
              "hypothesis-building",
              "employee-experience",
              "action-plan",
              "measurement"
            ]
          },
          {
            "id": "prebuilt-hr-problem-solving-payroll",
            "questionText": "An employee reports a payroll discrepancy and is upset. How do you handle the issue from intake to resolution?",
            "questionType": "scenario",
            "rubric": [
              "urgency",
              "accuracy",
              "cross-functional-follow-up",
              "communication",
              "documentation"
            ]
          },
          {
            "id": "prebuilt-hr-problem-solving-absenteeism",
            "questionText": "You notice repeated absenteeism in one team. How would you investigate without making unfair assumptions?",
            "questionType": "scenario",
            "rubric": [
              "fairness",
              "data-review",
              "manager-consultation",
              "employee-support",
              "policy-awareness"
            ]
          },
          {
            "id": "prebuilt-hr-problem-solving-funnel",
            "questionText": "A role has many applicants but few qualified interviews. How would you improve the recruiting funnel?",
            "questionType": "scenario",
            "rubric": [
              "funnel-analysis",
              "job-description-quality",
              "screening-criteria",
              "stakeholder-alignment",
              "measurement"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-hr-leadership",
        "type": "leadership",
        "title": "Manager Advisory and Employee Relations Judgment",
        "description": "Assesses HR partnership with managers, conflict mediation, policy rollouts, and fair escalation decisions.",
        "weight": 1.15,
        "orderIndex": 5,
        "settings": {
          "recommendedMinutes": 14
        },
        "questions": [
          {
            "id": "prebuilt-hr-leadership-termination-pressure",
            "questionText": "A manager asks HR to terminate an employee immediately without documentation. What do you do?",
            "questionType": "scenario",
            "rubric": [
              "risk-management",
              "policy-process",
              "manager-coaching",
              "fairness",
              "escalation"
            ]
          },
          {
            "id": "prebuilt-hr-leadership-feedback-coaching",
            "questionText": "How would you coach a manager who gives vague negative feedback but expects HR to solve the performance issue?",
            "questionType": "scenario",
            "rubric": [
              "manager-coaching",
              "specificity",
              "accountability",
              "documentation",
              "employee-fairness"
            ]
          },
          {
            "id": "prebuilt-hr-leadership-team-conflict",
            "questionText": "Two team members accuse each other of disrespectful behavior. What process would you follow before recommending action?",
            "questionType": "scenario",
            "rubric": [
              "neutrality",
              "fact-finding",
              "confidentiality",
              "de-escalation",
              "resolution-path"
            ]
          },
          {
            "id": "prebuilt-hr-leadership-policy-rollout",
            "questionText": "You need to roll out a new attendance policy that managers support but employees may dislike. How would you communicate it?",
            "questionType": "short_answer",
            "rubric": [
              "change-communication",
              "stakeholder-planning",
              "empathy",
              "consistency"
            ]
          },
          {
            "id": "prebuilt-hr-leadership-complaint",
            "questionText": "An employee raises a complaint involving a senior manager. How do you protect fairness and trust in the process?",
            "questionType": "scenario",
            "rubric": [
              "independence",
              "confidentiality",
              "escalation",
              "anti-retaliation-awareness",
              "documentation"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-hr-ai-ethics",
        "type": "ai_interview",
        "title": "HR Case and Ethics Interview",
        "description": "Modern HR case questions covering structured investigation, AI tool use, employee advocacy, and evidence-based recommendations.",
        "weight": 1.0,
        "orderIndex": 6,
        "settings": {
          "recommendedMinutes": 12,
          "allowFollowUps": true
        },
        "questions": [
          {
            "id": "prebuilt-hr-ai-ethics-investigation",
            "questionText": "Design a fair intake process for an employee relations complaint. What information do you collect and what do you avoid promising?",
            "questionType": "scenario",
            "rubric": [
              "structured-intake",
              "fairness",
              "confidentiality",
              "scope-control",
              "documentation"
            ]
          },
          {
            "id": "prebuilt-hr-ai-ethics-resume-ai",
            "questionText": "If an AI tool ranks resumes for a role, what risks would you check before trusting the shortlist?",
            "questionType": "scenario",
            "rubric": [
              "bias-awareness",
              "human-review",
              "job-relevance",
              "auditability",
              "compliance-risk"
            ]
          },
          {
            "id": "prebuilt-hr-ai-ethics-advocacy",
            "questionText": "How do you balance being approachable to employees with protecting company policy and legal risk?",
            "questionType": "short_answer",
            "rubric": [
              "balanced-judgment",
              "trust",
              "boundaries",
              "policy-awareness"
            ]
          },
          {
            "id": "prebuilt-hr-ai-ethics-survey",
            "questionText": "An engagement survey shows low trust in management. What follow-up questions and data would you gather before recommending action?",
            "questionType": "scenario",
            "rubric": [
              "data-triangulation",
              "employee-voice",
              "manager-context",
              "actionability",
              "measurement"
            ]
          },
          {
            "id": "prebuilt-hr-ai-ethics-confidential-ai",
            "questionText": "A manager wants to paste employee complaint details into a public AI chatbot to draft a response. What guidance do you give?",
            "questionType": "scenario",
            "rubric": [
              "privacy",
              "ai-risk-awareness",
              "safe-alternatives",
              "manager-coaching"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "prebuilt-software-engineer-assessment",
    "title": "Software Engineer Assessment",
    "description": "Research-backed technical assessment covering coding, debugging, system design, testing, communication, product judgment, collaboration, and AI-assisted development discipline.",
    "roleType": "Software Engineer",
    "timeLimitMin": 90,
    "scoringRules": {
      "passScore": 3.6,
      "scale": "1-5",
      "source": "prebuilt-researched-v2",
      "recommendedCandidateQuestionCount": {
        "min": 10,
        "max": 15,
        "practicalTasks": 1
      },
      "researchBasis": [
        "Meta coding/design/behavioral loop",
        "Microsoft engineering lifecycle: problem solving, design, coding, testing",
        "Uber coding plus design plus collaboration",
        "Palantir code quality/open-ended systems",
        "GitLab AI-native engineering judgment",
        "Automattic real-world coding challenge"
      ],
      "notes": "Select a balanced subset plus one practical coding/debugging task. Code execution must stay in the frontend/sandbox lane; backend evaluates submitted code and evidence."
    },
    "modules": [
      {
        "id": "prebuilt-se-ai-interview",
        "type": "ai_interview",
        "title": "Technical AI Interview",
        "description": "Assesses engineering reasoning, ownership, trade-offs, production awareness, and AI-era judgment.",
        "weight": 1.1,
        "orderIndex": 1,
        "settings": {
          "recommendedMinutes": 15,
          "allowFollowUps": true
        },
        "questions": [
          {
            "id": "prebuilt-se-ai-production-incident",
            "questionText": "Tell us about a production incident or difficult technical bug you handled. What did you do and what changed afterward?",
            "questionType": "scenario",
            "rubric": [
              "technical-reasoning",
              "ownership",
              "incident-process",
              "learning",
              "communication"
            ]
          },
          {
            "id": "prebuilt-se-ai-tradeoffs",
            "questionText": "Describe a technical trade-off you made between speed, reliability, maintainability, or cost. How did you choose?",
            "questionType": "short_answer",
            "rubric": [
              "trade-off-reasoning",
              "constraints",
              "impact-awareness",
              "clarity"
            ]
          },
          {
            "id": "prebuilt-se-ai-unfamiliar-codebase",
            "questionText": "How do you approach making a safe change in a codebase you do not know yet?",
            "questionType": "scenario",
            "rubric": [
              "codebase-navigation",
              "risk-reduction",
              "testing",
              "communication"
            ]
          },
          {
            "id": "prebuilt-se-ai-technical-debt",
            "questionText": "A shortcut would help ship this week but adds technical debt. How do you decide whether to accept it?",
            "questionType": "scenario",
            "rubric": [
              "business-context",
              "risk-assessment",
              "debt-framing",
              "stakeholder-alignment"
            ]
          },
          {
            "id": "prebuilt-se-ai-observability",
            "questionText": "What signals would you want before saying a new backend feature is production-ready?",
            "questionType": "short_answer",
            "rubric": [
              "observability",
              "testing",
              "rollback-readiness",
              "performance-awareness"
            ]
          },
          {
            "id": "prebuilt-se-ai-generated-code",
            "questionText": "AI generated a solution that passes sample tests. What else would you check before merging it?",
            "questionType": "scenario",
            "rubric": [
              "ai-limitation-awareness",
              "test-depth",
              "security-review",
              "maintainability",
              "ownership"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-coding",
        "type": "coding",
        "title": "Coding Assessment",
        "description": "Checks practical implementation quality using submitted code, edge cases, and execution evidence.",
        "weight": 1.55,
        "orderIndex": 2,
        "settings": {
          "recommendedMinutes": 25,
          "language": "typescript",
          "executionRequired": true
        },
        "questions": [
          {
            "id": "prebuilt-se-coding-normalize-scores",
            "questionText": "Implement normalizeScores(scores) that accepts an array of numbers and returns values normalized from 0 to 100 while handling empty arrays, equal values, negative numbers, and invalid inputs.",
            "questionType": "coding",
            "options": {
              "language": "typescript",
              "examples": [
                "normalizeScores([10, 20, 30]) -> [0, 50, 100]",
                "normalizeScores([5, 5]) -> [100, 100]"
              ],
              "constraints": [
                "Do not mutate the input array",
                "Return [] for empty input",
                "Throw or clearly handle non-number values"
              ]
            },
            "rubric": [
              "correctness",
              "edge cases",
              "readability",
              "complexity",
              "test coverage"
            ]
          },
          {
            "id": "prebuilt-se-coding-frequency",
            "questionText": "Implement mostFrequentWord(text) that returns the most common normalized word while ignoring punctuation and handling ties deterministically.",
            "questionType": "coding",
            "options": {
              "language": "typescript",
              "constraints": [
                "Case-insensitive",
                "Ignore punctuation",
                "Document tie behavior"
              ]
            },
            "rubric": [
              "string-processing",
              "edge cases",
              "deterministic-behavior",
              "readability",
              "tests"
            ]
          },
          {
            "id": "prebuilt-se-coding-availability",
            "questionText": "Implement hasScheduleConflict(intervals) to detect overlapping time ranges and explain its time complexity.",
            "questionType": "coding",
            "options": {
              "language": "typescript",
              "examples": [
                "[[9,10],[10,11]] -> false",
                "[[9,11],[10,12]] -> true"
              ]
            },
            "rubric": [
              "algorithm-choice",
              "correctness",
              "complexity",
              "edge cases"
            ]
          },
          {
            "id": "prebuilt-se-coding-validation",
            "questionText": "Write a validateAssessmentPayload(payload) function that checks required template, module, and question fields without mutating input.",
            "questionType": "coding",
            "options": {
              "language": "typescript"
            },
            "rubric": [
              "input-validation",
              "error-handling",
              "maintainability",
              "test-coverage"
            ]
          },
          {
            "id": "prebuilt-se-coding-transform",
            "questionText": "Transform a flat list of question rows into modules with ordered questions. Explain how you handle missing modules or duplicate order indexes.",
            "questionType": "coding",
            "rubric": [
              "data-transformation",
              "defensive-programming",
              "ordering",
              "clarity"
            ]
          },
          {
            "id": "prebuilt-se-coding-cache",
            "questionText": "Implement a simple in-memory cache with get, set, and TTL expiration. Describe one limitation of this design.",
            "questionType": "coding",
            "options": {
              "language": "typescript"
            },
            "rubric": [
              "correctness",
              "time-handling",
              "simplicity",
              "limitation-awareness",
              "tests"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-debugging",
        "type": "debugging",
        "title": "Debugging and Testing Task",
        "description": "Assesses structured investigation, safe remediation, test discipline, and prevention under production constraints.",
        "weight": 1.25,
        "orderIndex": 3,
        "settings": {
          "recommendedMinutes": 15
        },
        "questions": [
          {
            "id": "prebuilt-se-debugging-slow-api",
            "questionText": "An API endpoint became five times slower after a deployment. Walk through how you would diagnose, mitigate, and prevent the issue from recurring.",
            "questionType": "scenario",
            "rubric": [
              "hypothesis-building",
              "observability",
              "rollback-safety",
              "root-cause-analysis",
              "prevention"
            ]
          },
          {
            "id": "prebuilt-se-debugging-flaky-test",
            "questionText": "A test fails randomly in CI but passes locally. What steps do you take before disabling it?",
            "questionType": "scenario",
            "rubric": [
              "reproducibility",
              "test-isolation",
              "root-cause-analysis",
              "quality-discipline"
            ]
          },
          {
            "id": "prebuilt-se-debugging-memory",
            "questionText": "A service slowly consumes more memory over several hours. What evidence would you collect and what fixes might you consider?",
            "questionType": "scenario",
            "rubric": [
              "instrumentation",
              "hypothesis-building",
              "resource-awareness",
              "safe-fix-plan"
            ]
          },
          {
            "id": "prebuilt-se-debugging-null",
            "questionText": "Users report occasional crashes from a null value that logs do not fully explain. How would you debug and test the fix?",
            "questionType": "scenario",
            "rubric": [
              "log-analysis",
              "defensive-coding",
              "regression-tests",
              "user-impact"
            ]
          },
          {
            "id": "prebuilt-se-debugging-deployment",
            "questionText": "A deployment fails only in staging because of an environment variable issue. How do you fix it and prevent repeat incidents?",
            "questionType": "scenario",
            "rubric": [
              "configuration-management",
              "validation",
              "documentation",
              "automation"
            ]
          },
          {
            "id": "prebuilt-se-debugging-data",
            "questionText": "A report shows inconsistent totals between two screens. How do you determine whether the issue is frontend, backend, or data-related?",
            "questionType": "scenario",
            "rubric": [
              "systematic-debugging",
              "data-tracing",
              "api-contract-awareness",
              "communication"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-system-design",
        "type": "problem_solving",
        "title": "System Design and Architecture",
        "description": "Tests design clarity, trade-offs, scalability, reliability, and product constraints.",
        "weight": 1.35,
        "orderIndex": 4,
        "settings": {
          "recommendedMinutes": 18
        },
        "questions": [
          {
            "id": "prebuilt-se-design-notifications",
            "questionText": "Design a notification system for interview reminders. Cover data model, delivery reliability, and failure handling.",
            "questionType": "scenario",
            "rubric": [
              "requirements-clarification",
              "data-modeling",
              "reliability",
              "trade-offs",
              "scalability"
            ]
          },
          {
            "id": "prebuilt-se-design-permissions",
            "questionText": "Design a permission model for admin, organization, interviewer, and candidate users in an assessment platform.",
            "questionType": "scenario",
            "rubric": [
              "rbac",
              "data-ownership",
              "security",
              "edge-cases",
              "simplicity"
            ]
          },
          {
            "id": "prebuilt-se-design-file-upload",
            "questionText": "How would you design a secure file upload flow for candidate attachments or portfolios?",
            "questionType": "scenario",
            "rubric": [
              "security",
              "storage-design",
              "validation",
              "privacy",
              "failure-handling"
            ]
          },
          {
            "id": "prebuilt-se-design-migration",
            "questionText": "You need to migrate question data without downtime. What plan would you propose?",
            "questionType": "scenario",
            "rubric": [
              "migration-strategy",
              "backward-compatibility",
              "rollback",
              "validation"
            ]
          },
          {
            "id": "prebuilt-se-design-api-versioning",
            "questionText": "A frontend team needs a new API response shape, but existing clients depend on the old one. What options do you consider?",
            "questionType": "scenario",
            "rubric": [
              "api-contracts",
              "compatibility",
              "stakeholder-coordination",
              "trade-offs"
            ]
          },
          {
            "id": "prebuilt-se-design-prioritization",
            "questionText": "A critical bug, security warning, and product deadline compete for attention. How would you prioritize and communicate the decision?",
            "questionType": "scenario",
            "rubric": [
              "risk-ranking",
              "security-awareness",
              "business-impact",
              "communication"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-communication",
        "type": "communication",
        "title": "Engineering Communication",
        "description": "Checks ability to explain risk, review code constructively, write incident updates, and collaborate with non-technical stakeholders.",
        "weight": 1.0,
        "orderIndex": 5,
        "settings": {
          "recommendedMinutes": 12
        },
        "questions": [
          {
            "id": "prebuilt-se-communication-risk-update",
            "questionText": "Explain a technical delay to a product manager in a way that is honest, concise, and includes recovery options.",
            "questionType": "roleplay",
            "rubric": [
              "clarity",
              "stakeholder-empathy",
              "risk-framing",
              "solution-orientation"
            ]
          },
          {
            "id": "prebuilt-se-communication-pr-review",
            "questionText": "Write a pull request review comment for code that works but is hard to maintain. Be direct and respectful.",
            "questionType": "short_answer",
            "rubric": [
              "specificity",
              "respect",
              "maintainability",
              "actionability"
            ]
          },
          {
            "id": "prebuilt-se-communication-incident",
            "questionText": "Write a short incident update for non-technical stakeholders after a partial outage.",
            "questionType": "short_answer",
            "rubric": [
              "plain-language",
              "impact-framing",
              "next-steps",
              "accountability"
            ]
          },
          {
            "id": "prebuilt-se-communication-disagreement",
            "questionText": "You disagree with a senior engineer's design. How do you raise your concern productively?",
            "questionType": "roleplay",
            "rubric": [
              "evidence",
              "respect",
              "trade-off-framing",
              "collaboration"
            ]
          },
          {
            "id": "prebuilt-se-communication-handoff",
            "questionText": "What information should be included when handing off an unfinished technical task to another engineer?",
            "questionType": "short_answer",
            "rubric": [
              "context",
              "current-state",
              "known-risks",
              "next-steps",
              "test-status"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-work-style",
        "type": "work_style",
        "title": "Engineering Work Style",
        "description": "Explores testing habits, review discipline, AI tool boundaries, ambiguity handling, and team operating style.",
        "weight": 1.0,
        "orderIndex": 6,
        "settings": {
          "recommendedMinutes": 10
        },
        "questions": [
          {
            "id": "prebuilt-se-work-style-testing",
            "questionText": "How do you decide what to test before saying a feature is done?",
            "questionType": "short_answer",
            "rubric": [
              "test-strategy",
              "edge-cases",
              "risk-awareness",
              "definition-of-done"
            ]
          },
          {
            "id": "prebuilt-se-work-style-code-review",
            "questionText": "What do you look for when reviewing someone else's code beyond whether it works?",
            "questionType": "short_answer",
            "rubric": [
              "maintainability",
              "security",
              "readability",
              "test-coverage",
              "architecture-awareness"
            ]
          },
          {
            "id": "prebuilt-se-work-style-ambiguity",
            "questionText": "A ticket is unclear and the deadline is close. What do you do before starting implementation?",
            "questionType": "scenario",
            "rubric": [
              "clarifying-questions",
              "scope-control",
              "communication",
              "execution"
            ]
          },
          {
            "id": "prebuilt-se-work-style-ai-boundaries",
            "questionText": "When is it appropriate to use AI while coding, and what work must remain your responsibility?",
            "questionType": "short_answer",
            "rubric": [
              "ai-judgment",
              "verification",
              "ownership",
              "security-awareness"
            ]
          },
          {
            "id": "prebuilt-se-work-style-pairing",
            "questionText": "Describe your preferred way to pair-program or collaborate on a difficult bug.",
            "questionType": "short_answer",
            "rubric": [
              "collaboration",
              "communication",
              "learning-mindset",
              "focus"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-se-behavioral",
        "type": "behavioral",
        "title": "Engineering Behavioral Interview",
        "description": "Explores ownership, collaboration, failure recovery, learning velocity, and cross-functional product impact.",
        "weight": 1.05,
        "orderIndex": 7,
        "settings": {
          "recommendedMinutes": 12
        },
        "questions": [
          {
            "id": "prebuilt-se-behavioral-conflict",
            "questionText": "Tell us about a time you had a technical disagreement with a teammate. What changed your mind or theirs?",
            "questionType": "short_answer",
            "rubric": [
              "collaboration",
              "evidence",
              "humility",
              "decision-quality"
            ]
          },
          {
            "id": "prebuilt-se-behavioral-ownership",
            "questionText": "Describe a time you owned a problem beyond your assigned ticket. What was the outcome?",
            "questionType": "short_answer",
            "rubric": [
              "ownership",
              "initiative",
              "impact",
              "follow-through"
            ]
          },
          {
            "id": "prebuilt-se-behavioral-failure",
            "questionText": "Tell us about a feature or fix that did not work as expected. What did you learn?",
            "questionType": "short_answer",
            "rubric": [
              "reflection",
              "accountability",
              "technical-learning",
              "prevention"
            ]
          },
          {
            "id": "prebuilt-se-behavioral-product",
            "questionText": "Give an example of when user or customer impact changed your technical approach.",
            "questionType": "short_answer",
            "rubric": [
              "user-focus",
              "trade-offs",
              "product-thinking",
              "impact"
            ]
          },
          {
            "id": "prebuilt-se-behavioral-learning",
            "questionText": "How did you learn a new tool, framework, or codebase under time pressure?",
            "questionType": "short_answer",
            "rubric": [
              "learning-strategy",
              "resourcefulness",
              "execution",
              "communication"
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "prebuilt-team-leader-assessment",
    "title": "Team Leader Assessment",
    "description": "Research-backed leadership assessment covering prioritization, conflict handling, feedback, communication, team operating rhythm, metrics, ethics, and AI-era team guidance.",
    "roleType": "Team Leader",
    "timeLimitMin": 75,
    "scoringRules": {
      "passScore": 3.6,
      "scale": "1-5",
      "source": "prebuilt-researched-v2",
      "recommendedCandidateQuestionCount": {
        "min": 10,
        "max": 14
      },
      "researchBasis": [
        "Amazon behavioral leadership loops",
        "Uber engineering manager leadership interviews",
        "Shopify Life Story interview",
        "Wise product/cross-functional interviews",
        "PwC/Deloitte case and competency interviews"
      ],
      "notes": "Use for team lead, supervisor, project lead, or junior manager screens. Assign a subset so interviews stay focused."
    },
    "modules": [
      {
        "id": "prebuilt-leader-leadership",
        "type": "leadership",
        "title": "Leadership Scenarios",
        "description": "Assesses decision-making, accountability, conflict resolution, delegation, motivation, and team alignment.",
        "weight": 1.4,
        "orderIndex": 1,
        "settings": {
          "recommendedMinutes": 18,
          "allowFollowUps": true
        },
        "questions": [
          {
            "id": "prebuilt-leader-leadership-conflict",
            "questionText": "Two strong team members disagree publicly and progress is blocked. How would you handle the conflict and keep delivery moving?",
            "questionType": "scenario",
            "rubric": [
              "conflict-resolution",
              "decision-making",
              "team-alignment",
              "accountability",
              "communication"
            ]
          },
          {
            "id": "prebuilt-leader-leadership-missed-deadline",
            "questionText": "Your team is likely to miss an important deadline. What do you communicate, what do you change, and how do you protect trust?",
            "questionType": "scenario",
            "rubric": [
              "prioritization",
              "stakeholder-management",
              "risk-management",
              "ownership"
            ]
          },
          {
            "id": "prebuilt-leader-leadership-underperformer",
            "questionText": "A reliable team member starts missing deadlines and says they are overloaded. How do you handle it?",
            "questionType": "scenario",
            "rubric": [
              "empathy",
              "performance-management",
              "workload-analysis",
              "action-plan",
              "follow-up"
            ]
          },
          {
            "id": "prebuilt-leader-leadership-burnout",
            "questionText": "The team is burned out after several urgent releases. What would you change in the next month?",
            "questionType": "scenario",
            "rubric": [
              "team-health",
              "prioritization",
              "sustainable-pace",
              "stakeholder-communication"
            ]
          },
          {
            "id": "prebuilt-leader-leadership-delegation",
            "questionText": "How do you decide what to delegate, what to inspect, and what to own yourself?",
            "questionType": "short_answer",
            "rubric": [
              "delegation",
              "trust",
              "risk-awareness",
              "coaching"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-leader-communication",
        "type": "communication",
        "title": "Leadership Communication Roleplay",
        "description": "Checks feedback, stakeholder updates, escalation, one-on-ones, and clarity under pressure.",
        "weight": 1.15,
        "orderIndex": 2,
        "settings": {
          "recommendedMinutes": 14,
          "roleplay": true
        },
        "questions": [
          {
            "id": "prebuilt-leader-communication-feedback",
            "questionText": "Roleplay giving constructive feedback to a high-performing teammate whose behavior is hurting collaboration.",
            "questionType": "roleplay",
            "rubric": [
              "specificity",
              "empathy",
              "directness",
              "action-plan",
              "psychological-safety"
            ]
          },
          {
            "id": "prebuilt-leader-communication-risk",
            "questionText": "Write a concise stakeholder update when a project is at risk but the recovery plan is not final yet.",
            "questionType": "short_answer",
            "rubric": [
              "transparency",
              "risk-framing",
              "brevity",
              "next-steps"
            ]
          },
          {
            "id": "prebuilt-leader-communication-priority-change",
            "questionText": "How would you explain a sudden priority change to a team that already committed to other work?",
            "questionType": "roleplay",
            "rubric": [
              "context-setting",
              "empathy",
              "alignment",
              "decision-clarity"
            ]
          },
          {
            "id": "prebuilt-leader-communication-one-on-one",
            "questionText": "What questions would you ask in a one-on-one with a team member who seems disengaged?",
            "questionType": "short_answer",
            "rubric": [
              "listening",
              "support",
              "diagnosis",
              "trust-building"
            ]
          },
          {
            "id": "prebuilt-leader-communication-escalation",
            "questionText": "When should a team leader escalate a problem instead of trying to solve it inside the team?",
            "questionType": "short_answer",
            "rubric": [
              "judgment",
              "risk-awareness",
              "ownership",
              "stakeholder-management"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-leader-behavioral",
        "type": "behavioral",
        "title": "Leadership Behavior and Life Story",
        "description": "Explores coaching, hard decisions, accountability, influence, and learning from misses.",
        "weight": 1.0,
        "orderIndex": 3,
        "settings": {
          "recommendedMinutes": 12
        },
        "questions": [
          {
            "id": "prebuilt-leader-behavioral-coaching",
            "questionText": "Tell us about a time you helped someone improve without taking the work away from them.",
            "questionType": "short_answer",
            "rubric": [
              "coaching",
              "delegation",
              "ownership",
              "outcome-evidence"
            ]
          },
          {
            "id": "prebuilt-leader-behavioral-failure",
            "questionText": "Tell us about a leadership mistake you made. What did you change afterward?",
            "questionType": "short_answer",
            "rubric": [
              "accountability",
              "reflection",
              "behavior-change",
              "team-impact"
            ]
          },
          {
            "id": "prebuilt-leader-behavioral-influence",
            "questionText": "Describe a time you influenced people without formal authority.",
            "questionType": "short_answer",
            "rubric": [
              "influence",
              "stakeholder-awareness",
              "communication",
              "outcome"
            ]
          },
          {
            "id": "prebuilt-leader-behavioral-hard-decision",
            "questionText": "Tell us about a difficult decision that disappointed some team members but was necessary.",
            "questionType": "short_answer",
            "rubric": [
              "decision-quality",
              "fairness",
              "communication",
              "resilience"
            ]
          },
          {
            "id": "prebuilt-leader-behavioral-recognition",
            "questionText": "How do you recognize strong work without creating unhealthy competition?",
            "questionType": "short_answer",
            "rubric": [
              "motivation",
              "fairness",
              "team-culture",
              "specificity"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-leader-problem-solving",
        "type": "problem_solving",
        "title": "Team Problem Solving and Execution",
        "description": "Tests diagnosis and decision-making for ambiguous delivery, quality, resource, and customer-impact problems.",
        "weight": 1.25,
        "orderIndex": 4,
        "settings": {
          "recommendedMinutes": 16
        },
        "questions": [
          {
            "id": "prebuilt-leader-problem-solving-quality-drop",
            "questionText": "Quality has dropped for three sprints while the team still reports being busy. How would you find the real problem and fix the operating rhythm?",
            "questionType": "scenario",
            "rubric": [
              "root-cause-analysis",
              "metrics",
              "prioritization",
              "team-process",
              "follow-through"
            ]
          },
          {
            "id": "prebuilt-leader-problem-solving-overloaded",
            "questionText": "Your team has capacity for two of five urgent tasks. How do you decide what to cut, delay, delegate, or escalate?",
            "questionType": "scenario",
            "rubric": [
              "prioritization",
              "trade-off-reasoning",
              "stakeholder-management",
              "execution-plan"
            ]
          },
          {
            "id": "prebuilt-leader-problem-solving-bottleneck",
            "questionText": "One senior teammate has become the bottleneck for every decision. What would you change?",
            "questionType": "scenario",
            "rubric": [
              "process-design",
              "delegation",
              "risk-management",
              "team-growth"
            ]
          },
          {
            "id": "prebuilt-leader-problem-solving-customer",
            "questionText": "A customer complains about repeated mistakes from your team. What do you do in the first 48 hours?",
            "questionType": "scenario",
            "rubric": [
              "customer-focus",
              "containment",
              "root-cause-analysis",
              "communication",
              "prevention"
            ]
          },
          {
            "id": "prebuilt-leader-problem-solving-metrics",
            "questionText": "What metrics would you track to know whether your team is improving?",
            "questionType": "short_answer",
            "rubric": [
              "metric-selection",
              "balance",
              "actionability",
              "team-health"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-leader-work-style",
        "type": "work_style",
        "title": "Team Operating Style",
        "description": "Explores personal leadership rhythm, decision-making, meeting discipline, documentation, and delegation boundaries.",
        "weight": 1.0,
        "orderIndex": 5,
        "settings": {
          "recommendedMinutes": 10
        },
        "questions": [
          {
            "id": "prebuilt-leader-work-style-priorities",
            "questionText": "How do you keep your own priorities clear when your team receives many interruptions?",
            "questionType": "short_answer",
            "rubric": [
              "focus",
              "prioritization",
              "boundary-setting",
              "communication"
            ]
          },
          {
            "id": "prebuilt-leader-work-style-decisions",
            "questionText": "Rate how comfortable you are making decisions with incomplete information and explain your safeguards.",
            "questionType": "scale",
            "options": {
              "min": 1,
              "max": 5,
              "labels": [
                "avoid it",
                "comfortable with safeguards"
              ]
            },
            "rubric": [
              "decision-making",
              "risk-control",
              "self-awareness",
              "communication"
            ]
          },
          {
            "id": "prebuilt-leader-work-style-meetings",
            "questionText": "Which meetings or rituals would you keep for a small delivery team, and which would you avoid?",
            "questionType": "short_answer",
            "rubric": [
              "meeting-discipline",
              "team-rhythm",
              "simplicity",
              "outcome-focus"
            ]
          },
          {
            "id": "prebuilt-leader-work-style-docs",
            "questionText": "How do you use written updates or documentation to reduce confusion on the team?",
            "questionType": "short_answer",
            "rubric": [
              "clarity",
              "async-communication",
              "accountability",
              "context-sharing"
            ]
          },
          {
            "id": "prebuilt-leader-work-style-delegation-limits",
            "questionText": "What signs tell you that delegation is working, and what signs tell you you need to step in?",
            "questionType": "short_answer",
            "rubric": [
              "delegation",
              "inspection",
              "coaching",
              "risk-awareness"
            ]
          }
        ]
      },
      {
        "id": "prebuilt-leader-ai-interview",
        "type": "ai_interview",
        "title": "Modern Leadership Case Interview",
        "description": "Modern leadership case prompts covering team design, AI adoption, hiring fairness, culture-add, and data-informed leadership.",
        "weight": 1.05,
        "orderIndex": 6,
        "settings": {
          "recommendedMinutes": 12,
          "allowFollowUps": true
        },
        "questions": [
          {
            "id": "prebuilt-leader-ai-team-case",
            "questionText": "You inherit a team with low trust, unclear ownership, and missed delivery. What is your 30-day plan?",
            "questionType": "scenario",
            "rubric": [
              "diagnosis",
              "prioritization",
              "trust-building",
              "execution",
              "measurement"
            ]
          },
          {
            "id": "prebuilt-leader-ai-adoption",
            "questionText": "Your team wants to use AI tools to move faster. What rules or review habits would you put in place?",
            "questionType": "scenario",
            "rubric": [
              "ai-risk-awareness",
              "quality-control",
              "security",
              "team-enablement"
            ]
          },
          {
            "id": "prebuilt-leader-ai-hiring",
            "questionText": "How would you interview candidates fairly while still checking whether they can do the real work?",
            "questionType": "scenario",
            "rubric": [
              "structured-interviewing",
              "rubric-use",
              "fairness",
              "job-relevance"
            ]
          },
          {
            "id": "prebuilt-leader-ai-culture-add",
            "questionText": "What does culture-add mean to you, and how would you avoid hiring only people who think like the current team?",
            "questionType": "short_answer",
            "rubric": [
              "inclusion",
              "team-awareness",
              "structured-criteria",
              "self-awareness"
            ]
          },
          {
            "id": "prebuilt-leader-ai-reporting",
            "questionText": "A dashboard shows output is up but quality and morale are down. What would you investigate before celebrating the output metric?",
            "questionType": "scenario",
            "rubric": [
              "metric-interpretation",
              "quality-awareness",
              "team-health",
              "balanced-judgment"
            ]
          }
        ]
      }
    ]
  }
];

export function buildPrebuiltTemplateCreateData(
  template: PrebuiltAssessmentTemplateDefinition,
  context: PrebuiltTemplateSeedContext,
): PrebuiltTemplateCreateData {
  return {
    id: template.id,
    ...buildBaseTemplateData(template, context),
    modules: { create: template.modules.map(toPrismaModuleSeedData) },
  };
}

export function buildPrebuiltTemplateUpdateData(
  template: PrebuiltAssessmentTemplateDefinition,
  context: PrebuiltTemplateSeedContext,
): PrebuiltTemplateUpdateData {
  return {
    ...buildBaseTemplateData(template, context),
    modules: {
      deleteMany: {},
      create: template.modules.map(toPrismaModuleSeedData),
    },
  };
}

function buildBaseTemplateData(template: PrebuiltAssessmentTemplateDefinition, context: PrebuiltTemplateSeedContext) {
  return {
    title: template.title,
    description: template.description,
    roleType: template.roleType,
    timeLimitMin: template.timeLimitMin,
    scoringRules: template.scoringRules,
    createdById: context.createdById,
    organizationId: context.organizationId,
  };
}

function toPrismaModuleSeedData(module: PrebuiltModuleDefinition): PrismaModuleSeedData {
  return {
    id: module.id,
    moduleType: toPrismaEnum(module.type),
    title: module.title,
    description: module.description,
    weight: module.weight,
    orderIndex: module.orderIndex,
    settings: module.settings,
    questions: { create: module.questions.map(toPrismaQuestionSeedData) },
  };
}

function toPrismaQuestionSeedData(question: PrebuiltQuestionDefinition): PrismaQuestionSeedData {
  return {
    id: question.id,
    questionText: question.questionText,
    questionType: toPrismaEnum(question.questionType),
    options: question.options,
    rubric: question.rubric,
  };
}

function toPrismaEnum(value: string): string {
  return value.toUpperCase();
}
