"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

/** Client Better Auth du navigateur : passkeys (création, connexion, liste). */
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
