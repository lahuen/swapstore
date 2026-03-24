import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile, WithId } from './types';

export async function ensureUserProfile(user: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): Promise<WithId<UserProfile>> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    const updates: Record<string, any> = {
      displayName: user.displayName || data.displayName,
      photoURL: user.photoURL || data.photoURL,
    };
    // Backfill for legacy profiles missing these fields
    if (data.walletBalance == null) updates.walletBalance = 10;
    if (!data.role) updates.role = 'people';
    await setDoc(ref, updates, { merge: true });
    return { id: snap.id, ...data, ...updates } as WithId<UserProfile>;
  }

  const profile: Omit<UserProfile, 'createdAt'> & { createdAt: any } = {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Anónimo',
    email: user.email || '',
    photoURL: user.photoURL || '',
    firstName: '',
    lastName: '',
    cuit: '',
    verified: false,
    suspended: false,
    role: 'people' as const,
    location: '',
    bio: '',
    rating: 0,
    ratingCount: 0,
    walletBalance: 10, // Welcome bonus: 10 Gestos ✦
    createdAt: serverTimestamp(),
  };

  await setDoc(ref, profile);
  return { id: user.uid, ...profile } as WithId<UserProfile>;
}
