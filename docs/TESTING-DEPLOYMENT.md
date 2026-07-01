# Testing and Deployment Guide

## Local verification

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm prisma:validate
```

## Functional testing checklist

- User registration.
- User login.
- Role-based access.
- Template creation.
- Session creation.
- Candidate assessment submission.
- AI chat response/fallback.
- Code execution response/fallback.
- AI evaluation.
- Report generation.
- Dashboard data display.

## Edge cases

| Case | Expected result |
| --- | --- |
| Invalid login | Show error message. |
| Unauthorized page access | Redirect or block access. |
| AI API failure | Show fallback message and preserve progress. |
| Empty candidate answer | Prevent submission or request input. |
| Code execution timeout | Stop execution and show timeout message. |
| Page refresh | Preserve progress where possible. |
| Lost connection | Allow reconnect where possible. |
| Invalid session link | Show invalid session message. |
| Expired session | Prevent access and show status. |
| Large answer submission | Limit or handle safely. |

## Performance testing targets

- Dashboard loads within 3 seconds under normal demo data.
- Multiple candidates can access sessions at the same time.
- AI loading states appear immediately.
- Code execution has a timeout and clear output state.

## Deployment checklist

- Frontend environment has `NEXT_PUBLIC_API_URL`.
- Backend environment has `DATABASE_URL`, `JWT_SECRET`, and AI/sandbox keys as needed.
- Database migrations are applied.
- Public URLs are documented in the final report.
- Demo video uses deployed URLs, not localhost.
- Repository is public and includes meaningful commits from all team members.
