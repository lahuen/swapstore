import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function submitReport(opts: {
  targetType: 'listing' | 'user' | 'general';
  targetId: string;
  targetLabel: string;
  reason: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  await addDoc(collection(db, 'reports'), {
    fromUserId: user.uid,
    fromUserName: user.displayName || user.email || 'Anónimo',
    targetType: opts.targetType,
    targetId: opts.targetId,
    targetLabel: opts.targetLabel,
    reason: opts.reason,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}
