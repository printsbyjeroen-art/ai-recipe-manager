import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getCredential() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (json) {
    return cert(JSON.parse(json));
  }
  return applicationDefault();
}

if (!getApps().length) {
  initializeApp({
    credential: getCredential(),
    projectId:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      "recepten-a8dfe"
  });
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
