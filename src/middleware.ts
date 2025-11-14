import type { Middleware } from "./router.ts";

function formatLogEntry(
  req: Request,
  status: number,
  responseSize: number,
): string {
  // Common Log Format: host - - [date] "method path protocol" status size
  const url = new URL(req.url);
  const date = new Date();
  // Format: [10/Oct/2000:13:55:36 -0700]
  const day = String(date.getDate()).padStart(2, "0");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(
    2,
    "0",
  );
  const offsetMinutes = String(Math.abs(offset) % 60).padStart(2, "0");
  const offsetSign = offset >= 0 ? "+" : "-";
  const formattedDate =
    `[${day}/${month}/${year}:${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}${offsetMinutes}]`;

  // Get client IP - for Deno Deploy this would be in headers, fallback to "-"
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") || "-";

  return `${clientIp} - - ${formattedDate} "${req.method} ${url.pathname}${url.search} HTTP/1.1" ${status} ${responseSize}`;
}

export const commonLogMiddleware: Middleware = async (req, next) => {
  const response = await next();

  // Calculate response size from body
  const responseClone = response.clone();
  const body = await responseClone.text();
  const responseSize = new TextEncoder().encode(body).length;

  console.log(formatLogEntry(req, response.status, responseSize));

  return response;
};
