import { collection, doc, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Listing, Transaction, UserProfile, PlatformConfig, UserRole, WithId } from './types';
import { DEFAULT_CONFIG } from './types';

export type StoreCollection = 'listings' | 'transactions' | 'profile' | 'config';
type Listener = (changed: StoreCollection) => void;

let listings: WithId<Listing>[] = [];
let myTransactions: WithId<Transaction>[] = [];
let profile: WithId<UserProfile> | null = null;
let config: PlatformConfig = { ...DEFAULT_CONFIG };
let initialized = false;
const unsubs: (() => void)[] = [];
const listeners = new Map<Listener, StoreCollection[] | null>();

export function getListings() { return listings; }
export function getMyTransactions() { return myTransactions; }
export function getProfile() { return profile; }
export function getConfig() { return config; }
export function getRole(): UserRole { return profile?.role || 'people'; }
export function isAdmin(): boolean { return getRole() === 'admin'; }
export function isSupport(): boolean { return getRole() === 'support' || getRole() === 'admin'; }
export function isReady() { return initialized; }

export function subscribe(fn: Listener | (() => void), collections?: StoreCollection[]): () => void {
  listeners.set(fn as Listener, collections || null);
  return () => { listeners.delete(fn as Listener); };
}

function notify(changed: StoreCollection) {
  listeners.forEach((filter, fn) => {
    if (!filter || filter.includes(changed)) fn(changed);
  });
}

export function initStore() {
  if (initialized) return;
  initialized = true;
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  // All active listings
  unsubs.push(onSnapshot(
    query(collection(db, 'listings'), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => { listings = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Listing>)); notify('listings'); },
    (err) => console.error('store listings:', err),
  ));

  // My transactions (as buyer or seller)
  unsubs.push(onSnapshot(
    query(collection(db, 'transactions'), where('buyerId', '==', uid), orderBy('updatedAt', 'desc'), limit(100)),
    (snap) => {
      const buyer = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Transaction>));
      mergeTransactions(buyer, 'buyer');
    },
    (err) => console.error('store tx buyer:', err),
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'transactions'), where('sellerId', '==', uid), orderBy('updatedAt', 'desc'), limit(100)),
    (snap) => {
      const seller = snap.docs.map(d => ({ id: d.id, ...d.data() } as WithId<Transaction>));
      mergeTransactions(seller, 'seller');
    },
    (err) => console.error('store tx seller:', err),
  ));

  // My profile
  unsubs.push(onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const d = snap.docs.find(d => d.id === uid);
      profile = d ? { id: d.id, ...d.data() } as WithId<UserProfile> : null;
      notify('profile');
    },
    (err) => console.error('store profile:', err),
  ));

  // Platform config
  unsubs.push(onSnapshot(
    doc(db, 'config', 'platform'),
    (snap) => {
      if (snap.exists()) {
        config = { ...DEFAULT_CONFIG, ...snap.data() } as PlatformConfig;
      } else {
        config = { ...DEFAULT_CONFIG };
      }
      notify('config');
    },
    (err) => console.error('store config:', err),
  ));
}

const txSets = { buyer: [] as WithId<Transaction>[], seller: [] as WithId<Transaction>[] };
function mergeTransactions(txs: WithId<Transaction>[], role: 'buyer' | 'seller') {
  txSets[role] = txs;
  const map = new Map<string, WithId<Transaction>>();
  [...txSets.buyer, ...txSets.seller].forEach(t => map.set(t.id, t));
  myTransactions = [...map.values()].sort((a, b) =>
    (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)
  );
  notify('transactions');
}

export function destroyStore() {
  unsubs.forEach(fn => fn());
  unsubs.length = 0;
  listings = [];
  myTransactions = [];
  profile = null;
  config = { ...DEFAULT_CONFIG };
  initialized = false;
  listeners.clear();
  txSets.buyer = [];
  txSets.seller = [];
}
