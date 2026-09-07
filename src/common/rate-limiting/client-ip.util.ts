import type { Request } from "express";

/**
 * Normalizes an IP address:
 * - Trims surrounding whitespace
 * - Handles comma-separated lists (e.g. from proxy chains: takes the first client address)
 * - Handles bracketed IPv6 addresses with or without port (e.g. `[::1]:8080` -> `127.0.0.1`, `[2001:db8::1]` -> `2001:db8::1`)
 * - Strips IPv4-mapped IPv6 prefixes (e.g. `::ffff:192.168.1.1` -> `192.168.1.1`)
 * - Normalizes IPv6 loopback (`::1` -> `127.0.0.1`)
 * - Strips remote client port suffix if present
 */
export function normalizeIp(rawIp: string | undefined): string {
  if (!rawIp) {
    return "127.0.0.1";
  }

  let ip = rawIp.trim();
  if (!ip) {
    return "127.0.0.1";
  }

  // If a comma-separated list is received, take the leftmost client address
  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  // Strip bracketed IPv6 notation and port (e.g. [::1]:8080 -> ::1, [2001:db8::1] -> 2001:db8::1)
  if (ip.startsWith("[") && ip.includes("]")) {
    const closeBracketIdx = ip.indexOf("]");
    ip = ip.substring(1, closeBracketIdx);
  }

  // Strip IPv4-mapped IPv6 prefix: ::ffff:192.168.1.1 -> 192.168.1.1
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  // Normalize IPv6 loopback
  if (ip === "::1") {
    return "127.0.0.1";
  }

  // If port is present in IPv4 (e.g. 192.168.1.1:54321), strip the port
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }

  return ip;
}

/**
 * Resolves the client IP from the incoming request.
 * Uses Express's resolved `req.ip`, which safely honors `trust proxy`
 * configuration set in main.ts without blindly trusting raw client headers.
 */
export function resolveClientIp(request: Request): string {
  if (request.ip) {
    return normalizeIp(request.ip);
  }

  const socketAddress = request.socket?.remoteAddress;
  if (socketAddress) {
    return normalizeIp(socketAddress);
  }

  return "127.0.0.1";
}

