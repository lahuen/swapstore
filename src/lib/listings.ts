import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from './firebase';
import type { Listing, WithId } from './types';

export async function createListing(data: Omit<Listing, 'userId' | 'userName' | 'userPhoto' | 'createdAt' | 'status'>): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const docRef = await addDoc(collection(db, 'listings'), {
    ...data,
    userId: user.uid,
    userName: user.displayName || user.email || 'Anónimo',
    userPhoto: user.photoURL || '',
    status: 'active',
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateListing(id: string, data: Partial<Listing>): Promise<void> {
  await updateDoc(doc(db, 'listings', id), data);
}

export async function getListing(id: string): Promise<WithId<Listing> | null> {
  const snap = await getDoc(doc(db, 'listings', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as WithId<Listing> : null;
}

export async function uploadListingImage(file: File, listingId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `listings/${listingId}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
