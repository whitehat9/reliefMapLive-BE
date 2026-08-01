import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { ErrorResponse } from "../utils/errorResponse.js";
import logger from "../utils/logger.js";

let app: App | null = null;

const getFirebaseApp = (): App => {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin is not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY",
    );
  }

  app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });

  return app;
};

/**
 * Verify a Firebase phone-auth ID token minted by the client SDK after OTP
 * confirmation. Throws a 401 ErrorResponse on any invalid/expired token.
 */
export const verifyFirebaseIdToken = async (
  idToken: string,
): Promise<DecodedIdToken> => {
  try {
    return await getAuth(getFirebaseApp()).verifyIdToken(idToken);
  } catch (error) {
    logger.warn("Firebase ID token verification failed", { error });
    throw new ErrorResponse("Invalid or expired verification token", 401);
  }
};
