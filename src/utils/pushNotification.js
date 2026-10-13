import { prisma } from '../lib/prisma.js';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Initialize Firebase Admin SDK singleton
let firebaseApp = null;
try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && rawKey) {
    const privateKey = rawKey.replace(/\\n/g, '\n');
    const existingApps = getApps();
    firebaseApp = existingApps.length > 0
      ? existingApps[0]
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    console.log('[PUSH] Firebase Admin SDK initialized successfully for project:', projectId);
  } else {
    console.warn('[PUSH] Missing Firebase credentials in env. Direct FCM will be skipped.');
  }
} catch (err) {
  console.error('[PUSH] Failed to initialize Firebase Admin SDK:', err?.message || err);
}

// In-memory cache for user push tokens (userId -> { expoPushToken, deviceToken })
export const userTokensCache = new Map();

/**
 * Register or update push tokens for a user
 */
export function registerUserPushToken(userId, tokens) {
  if (!userId) return;
  const cleanId = String(userId);
  const existing = userTokensCache.get(cleanId) || {};

  if (typeof tokens === 'string') {
    if (tokens.startsWith('ExponentPushToken')) {
      existing.expoPushToken = tokens;
    } else {
      existing.deviceToken = tokens;
    }
  } else if (typeof tokens === 'object' && tokens !== null) {
    if (tokens.expoPushToken) existing.expoPushToken = tokens.expoPushToken;
    if (tokens.deviceToken) existing.deviceToken = tokens.deviceToken;
  }

  userTokensCache.set(cleanId, existing);
  console.log(`[PUSH] Cached tokens for user ${cleanId}: FCM=${!!existing.deviceToken}, Expo=${!!existing.expoPushToken}`);
}

/**
 * Send incoming call push notification (Direct FCM to Android device + Expo Push fallback)
 */
export async function sendCallPushNotification({ calleeId, callerName, callerAvatar, callType, roomId, callerId }) {
  if (!calleeId) return;
  const cleanCalleeId = String(calleeId);

  let cached = userTokensCache.get(cleanCalleeId);

  // If missing tokens, fetch fresh from PostgreSQL / Prisma DB
  if (!cached?.deviceToken && !cached?.expoPushToken) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: cleanCalleeId },
        select: { deviceToken: true, expoPushToken: true, displayName: true }
      });
      if (user) {
        cached = {
          deviceToken: user.deviceToken || null,
          expoPushToken: user.expoPushToken || null
        };
        userTokensCache.set(cleanCalleeId, cached);
      }
    } catch (err) {
      console.warn('[PUSH_DB_WARN] Could not retrieve tokens for user:', cleanCalleeId, err?.message);
    }
  }

  const isVideo = callType === 'video';
  const callTitle = `📞 Incoming ${isVideo ? 'Video' : 'Voice'} Call`;
  const callBody = `${callerName || 'Sales Representative'} is calling you on Devlomatix CRM`;

  let fcmSent = false;

  // 1. Send Direct FCM Push Notification (Primary - works even when app is killed/background on Android)
  if (firebaseApp && cached?.deviceToken) {
    try {
      const messaging = getMessaging(firebaseApp);
      const fcmResponse = await messaging.send({
        token: cached.deviceToken,
        notification: {
          title: callTitle,
          body: callBody
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'calls',
            sound: 'default',
            priority: 'max',
            visibility: 'public',
            defaultVibrateTimings: true,
            clickAction: 'OPEN_CALL'
          }
        },
        data: {
          type: 'incoming_call',
          roomId: String(roomId || ''),
          callerId: String(callerId || ''),
          callerName: String(callerName || 'Sales Representative'),
          callerAvatar: String(callerAvatar || ''),
          callType: String(callType || 'audio'),
          timestamp: new Date().toISOString()
        }
      });
      console.log(`[PUSH_FCM] Successfully delivered incoming call FCM to ${cleanCalleeId}:`, fcmResponse);
      fcmSent = true;
    } catch (fcmErr) {
      console.error('[PUSH_FCM_ERROR] Failed sending FCM message:', fcmErr?.message || fcmErr);
    }
  }

  // 2. Send Expo Push Notification (Secondary / iOS / Expo Go fallback)
  if (cached?.expoPushToken) {
    try {
      const payload = {
        to: cached.expoPushToken,
        sound: 'default',
        priority: 'high',
        channelId: 'calls',
        title: callTitle,
        body: callBody,
        data: {
          type: 'incoming_call',
          roomId: String(roomId || ''),
          callerId: String(callerId || ''),
          callerName: String(callerName || 'Sales Representative'),
          callerAvatar: String(callerAvatar || ''),
          callType: String(callType || 'audio'),
          timestamp: new Date().toISOString()
        }
      };

      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      console.log(`[PUSH_EXPO] Expo Push sent to ${cleanCalleeId}:`, result?.data?.status || 'dispatched');
    } catch (expoErr) {
      console.warn('[PUSH_EXPO_WARN] Expo push send warning:', expoErr?.message || expoErr);
    }
  }

  if (!cached?.deviceToken && !cached?.expoPushToken) {
    console.log(`[PUSH] No device token or Expo push token found for user ${cleanCalleeId}. Push skipped.`);
  }
}
