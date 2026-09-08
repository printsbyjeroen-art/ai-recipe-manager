import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase-client";

export function getCurrentUser(): Promise<User | null> {
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
