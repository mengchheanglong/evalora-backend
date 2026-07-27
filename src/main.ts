import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const allowedOrigins = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Only honor X-Forwarded-For (used for rate limiting / req.ip) when explicitly
  // told which proxy chain to trust. Default off, so a direct client cannot spoof
  // its source address. Set TRUST_PROXY to a hop count ("1") or "true"/a subnet.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set("trust proxy", Number.isInteger(hops) && hops > 0 ? hops : trustProxy === "true" ? true : trustProxy);
  }

  app.setGlobalPrefix("api");
  app.enableCors(
    allowedOrigins.length > 0
      ? { origin: allowedOrigins, credentials: true }
      : // No allow-list configured: reflect any origin but WITHOUT credentials, so a
        // misconfigured deployment cannot leak authenticated responses cross-site.
        { origin: true, credentials: false },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Drain Prisma connections / in-flight work on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST?.trim() || "0.0.0.0";
  await app.listen(port, host);
}

void bootstrap();
