import type { ModuleType } from "../../../domain/evalora.types";

/**
 * Tuning knobs for AI-assisted template drafts. Everything a reviewer could argue
 * about — how small a module may get, how much text we accept from an upload — is
 * declared here rather than buried in the generator, so policy changes are one edit.
 */

/** No module may fall below this share, or it is not worth a candidate's time. */
export const MIN_MODULE_WEIGHT = 5;

/** Modules the model marked essential get a higher floor than optional ones. */
export const MIN_REQUIRED_MODULE_WEIGHT = 10;

/**
 * Module types that must appear in every draft and always receive the required
 * floor, regardless of what the model proposed. Empty for MVP; populate to make
 * (for example) an AI interview mandatory for the whole workspace.
 */
export const REQUIRED_MODULE_TYPES: ModuleType[] = [];

/** Drafts total exactly this. Not a percentage sign anywhere — plain integers. */
export const TOTAL_WEIGHT = 100;

export const MAX_MODULES = 8;
export const MAX_QUESTIONS_PER_MODULE = 15;

export const MAX_TITLE_LENGTH = 160;
export const MAX_DESCRIPTION_LENGTH = 600;
export const MAX_QUESTION_LENGTH = 1_200;
export const MAX_RUBRIC_CRITERIA = 8;
export const MAX_RUBRIC_CRITERION_LENGTH = 120;
export const MAX_OPTIONS = 8;
export const MAX_OPTION_LENGTH = 200;
export const MAX_RATIONALE_LENGTH = 400;
export const MAX_WARNINGS = 20;

export const MIN_TIME_LIMIT_MIN = 5;
export const MAX_TIME_LIMIT_MIN = 480;
export const DEFAULT_TIME_LIMIT_MIN = 60;

/** Free-text idea prompt, when the user types instead of uploading. */
export const MAX_IDEA_LENGTH = 8_000;

/** One chat instruction sent to the refinement assistant. */
export const MAX_CHAT_MESSAGE_LENGTH = 2_000;

/** Prior conversation turns replayed to the model for context. The client keeps
 *  the transcript; the server stores none of it. */
export const MAX_CHAT_HISTORY_TURNS = 12;

/** The assistant's conversational reply, separate from the draft JSON. */
export const MAX_CHAT_REPLY_LENGTH = 1_200;

/** Upload ceiling enforced by multer before a single byte is parsed. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Extracted text is capped before it ever reaches the model or the database. */
export const MAX_SOURCE_CHARS = 60_000;

/** PDFs beyond this many pages are truncated; a job description is never this long. */
export const MAX_PDF_PAGES = 40;
