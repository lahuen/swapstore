import { collection, doc, addDoc, getDoc, getDocs, updateDoc, query, where, orderBy, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { SupportTicket, TicketCategory, TicketStatus, TicketPriority, TicketMessage, WithId } from './types';

export async function createTicket(opts: {
  subject: string;
  category: TicketCategory;
  body: string;
  relatedId?: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const now = Timestamp.now();
  const firstMessage: TicketMessage = {
    fromUserId: user.uid,
    fromUserName: user.displayName || user.email || 'Anonimo',
    isStaff: false,
    body: opts.body,
    createdAt: now,
  };

  const ticket: Omit<SupportTicket, 'createdAt' | 'updatedAt'> & { createdAt: any; updatedAt: any } = {
    creatorId: user.uid,
    creatorName: user.displayName || user.email || 'Anonimo',
    creatorEmail: user.email || '',
    subject: opts.subject,
    category: opts.category,
    status: 'open',
    priority: 'normal',
    messages: [firstMessage],
    assignedTo: null,
    assignedName: null,
    relatedId: opts.relatedId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'tickets'), ticket);
  return ref.id;
}

export async function addTicketReply(ticketId: string, body: string, isStaff: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const msg: TicketMessage = {
    fromUserId: user.uid,
    fromUserName: user.displayName || user.email || 'Anonimo',
    isStaff,
    body,
    createdAt: Timestamp.now(),
  };

  await updateDoc(doc(db, 'tickets', ticketId), {
    messages: arrayUnion(msg),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  await updateDoc(doc(db, 'tickets', ticketId), { status, updatedAt: serverTimestamp() });
}

export async function updateTicketPriority(ticketId: string, priority: TicketPriority): Promise<void> {
  await updateDoc(doc(db, 'tickets', ticketId), { priority, updatedAt: serverTimestamp() });
}

export async function assignTicket(ticketId: string, agentUid: string, agentName: string): Promise<void> {
  await updateDoc(doc(db, 'tickets', ticketId), {
    assignedTo: agentUid,
    assignedName: agentName,
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  });
}

export async function getTicket(ticketId: string): Promise<WithId<SupportTicket> | null> {
  const snap = await getDoc(doc(db, 'tickets', ticketId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as WithId<SupportTicket>;
}

export async function getMyTickets(): Promise<WithId<SupportTicket>[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(
    query(collection(db, 'tickets'), where('creatorId', '==', user.uid), orderBy('updatedAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<SupportTicket>));
}

export async function getAllTickets(): Promise<WithId<SupportTicket>[]> {
  const snap = await getDocs(
    query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<SupportTicket>));
}
