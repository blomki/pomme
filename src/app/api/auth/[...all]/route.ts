import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/server/auth/auth";

// Point d'entrée HTTP de Better Auth : /api/auth/... (lien magique, passkeys, session).
// L'instance est créée à la première requête, pas au build.
export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
