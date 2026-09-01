import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/timetable": ["./node_modules/@sparticuz/chromium/**"],
    "/api/cron/sync": ["./node_modules/@sparticuz/chromium/**"]
  }
};

export default nextConfig;
