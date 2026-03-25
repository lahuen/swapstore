import { collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Listing, WithId } from './types';

const GCS_BUCKET = 'lahuen-swap-store';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

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
  if (!auth.currentUser) throw new Error('Not authenticated');
  if (!file.type.startsWith('image/')) throw new Error('Solo se permiten imágenes');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('La imagen no puede superar 5MB');

  const ext = file.name.split('.').pop() || 'jpg';
  const objectName = `listings/${listingId}/${Date.now()}.${ext}`;

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al subir imagen: ${err}`);
  }

  return `https://storage.googleapis.com/${GCS_BUCKET}/${objectName}`;
}
