import { onAuthStateChanged, type User } from "firebase/auth";
import { getClientAuth } from "./firebase-client";

export function getCurrentUser(): Promise<User | null> {
  const auth = getClientAuth();
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.uid ?? null;
}
