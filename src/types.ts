import type { Timestamp } from 'firebase/firestore';
import type { ExpenseCategory, SplitMethod } from './logic/split';

export type Visibility = 'private' | 'followers' | 'crew' | 'public';

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  bio: string;
  homeCity: string;
  homeCountry: string;
  photoURL: string | null;
  visibility: 'public' | 'private';
  followersCount: number;
  followingCount: number;
  appearInLiveWorld: boolean;
  defaultPostVisibility: Visibility;
  notificationPrefs: Record<NotificationType, boolean>;
  onboarded: boolean;
  suspended?: boolean;
  createdAt: Timestamp | null;
}

export interface Journey {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  type: 'solo' | 'group';
  groupId: string | null;
  status: 'active' | 'paused' | 'completed';
  visibility: Visibility;
  startedAt: number;
  endedAt: number | null;
  pausedMs: number;
  pausedAt: number | null;
  distanceKm: number;
  cities: string[];
  cityIds: string[];
  countries: string[];
  continents: string[];
  placesCount: number;
  photos: number;
  videos: number;
  activitiesCount: number;
  lastPoint: { lat: number; lng: number; timestamp: number } | null;
  anchorCityId: string | null;
  coverUrl: string | null;
  route: { lat: number; lng: number }[]; // downsampled, owner-only doc unless shared
}

export type ActivityType = 'start' | 'end' | 'photo' | 'video' | 'place' | 'review' | 'note';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  caption: string;
  mediaUrl: string | null;
  placeName: string | null;
  city: string | null;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  visibility: Visibility;
  createdAt: number;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  placeName: string | null;
  city: string | null;
  cityId: string | null;
  visibility: Visibility;
  groupId: string | null;
  journeyId: string | null;
  kind: 'moment' | 'story' | 'achievement' | 'video' | 'review';
  rating: number | null;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | null;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface Group {
  id: string;
  name: string;
  destination: string;
  destinationCityId: string | null;
  description: string;
  startDate: string; // yyyy-mm-dd
  endDate: string;
  visibility: 'private' | 'public';
  ownerId: string;
  adminIds: string[];
  memberIds: string[];
  memberNames: Record<string, string>;
  budget: number; // minor units, 0 = none
  budgetAlertPct: number;
  currency: 'INR';
  inviteCode: string;
  videoExcludedUids: string[];
  colors: [string, string];
  createdAt: Timestamp | null;
}

export interface Invitation {
  id: string;
  groupId: string;
  groupName: string;
  destination: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp | null;
}

export interface TimelineItem {
  id: string;
  authorId: string;
  authorName: string;
  type: 'photo' | 'video' | 'place' | 'review' | 'note' | 'expense' | 'join';
  text: string;
  mediaUrl: string | null;
  placeName: string | null;
  commentsCount: number;
  createdAt: Timestamp | null;
}

export interface Expense {
  id: string;
  title: string;
  amount: number; // minor units
  payerId: string;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  participants: Record<string, number>;
  personal: boolean;
  notes: string;
  receiptUrl: string | null;
  date: string;
  createdBy: string;
  status: 'active' | 'deleted';
  validation: 'pending' | 'ok' | 'invalid';
  validationErrors?: string[];
  createdAt: Timestamp | null;
}

export interface Settlement {
  id: string;
  fromUid: string;
  toUid: string;
  amount: number;
  status: 'recorded' | 'confirmed' | 'rejected';
  recordedBy: string;
  confirmedBy?: string;
  createdAt: Timestamp | null;
  confirmedAt?: Timestamp | null;
}

export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'invite'
  | 'inviteAccepted'
  | 'groupActivity'
  | 'video'
  | 'expense'
  | 'settlement'
  | 'budget';

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromUid: string;
  fromName: string;
  text: string;
  link: string | null;
  read: boolean;
  createdAt: Timestamp | null;
}

export interface TravelVideo {
  id: string;
  ownerId: string;
  journeyId: string | null;
  groupId: string | null;
  title: string;
  template: 'cinematic' | 'reel' | 'documentary';
  music: string;
  visibility: Visibility;
  createdAt: Timestamp | null;
}

export interface Report {
  id: string;
  targetType: 'post' | 'user' | 'comment' | 'groupActivity';
  targetId: string;
  targetOwnerId: string | null;
  reason: string;
  reporterId: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: Timestamp | null;
}
