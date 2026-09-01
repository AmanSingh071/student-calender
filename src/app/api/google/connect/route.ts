import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This is the single production URL registered in Google Cloud OAuth.
const APP_ORIGIN = "https://student-calendar-beta.vercel.app";
const REDIRECT_URI = `${APP_ORIGIN}/api/auth/callback/google`;

export async function GET(request: NextRequest) {
  const currentOrigin = request.nextUrl.origin;

  // Never start OAuth on a deployment/preview URL. Move to the canonical domain
  // first so the OAuth state cookie and callback always use the same host.
  if (currentOrigin !== APP_ORIGIN) {
    return NextResponse.redirect(new URL("/api/google/connect", APP_ORIGIN));
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/?google=config-error", APP_ORIGIN));
  }

  const state = crypto.randomUUID();
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ],
    state
  });

  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return response;
}