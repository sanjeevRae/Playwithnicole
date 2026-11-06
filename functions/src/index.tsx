
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

import {
  onCall,
  HttpsError,
} from 'firebase-functions/v2/https'

if (getApps().length === 0) {
  initializeApp()
}

const adminAuth = getAuth()
const adminDb = getFirestore()

type DeleteUserRequest = {
  uid?: unknown
  confirmation?: unknown
}

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : ''
}

export const deleteUserAccount = onCall(
  {
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (request) => {
    // ------------------------------------------
    // 1. AUTHENTICATION
    // ------------------------------------------

    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'You must sign in before deleting an account.',
      )
    }

    const adminUid = request.auth.uid

    // ------------------------------------------
    // 2. VERIFY ADMIN ROLE FROM FIRESTORE
    // ------------------------------------------

    const adminRef = adminDb
      .collection('users')
      .doc(adminUid)

    const adminSnapshot = await adminRef.get()

    if (!adminSnapshot.exists) {
      throw new HttpsError(
        'permission-denied',
        'Administrator profile not found.',
      )
    }

    const adminProfile = adminSnapshot.data()

    if (adminProfile?.role !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Only administrators can delete user accounts.',
      )
    }

    // ------------------------------------------
    // 3. VALIDATE REQUEST DATA
    // ------------------------------------------

    const data = request.data as DeleteUserRequest

    const targetUid =
      typeof data.uid === 'string'
        ? data.uid.trim()
        : ''

    const confirmation = normalize(data.confirmation)

    if (
      !targetUid ||
      targetUid.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(targetUid)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'A valid target user ID is required.',
      )
    }

    if (
      !confirmation ||
      confirmation.length > 200
    ) {
      throw new HttpsError(
        'invalid-argument',
        'The account confirmation text is required.',
      )
    }

    // ------------------------------------------
    // 4. PREVENT SELF-DELETION
    // ------------------------------------------

    if (targetUid === adminUid) {
      throw new HttpsError(
        'failed-precondition',
        'You cannot delete your own administrator account.',
      )
    }

    // ------------------------------------------
    // 5. VERIFY TARGET PROFILE
    // ------------------------------------------

    const targetRef = adminDb
      .collection('users')
      .doc(targetUid)

    const targetSnapshot = await targetRef.get()

    if (!targetSnapshot.exists) {
      throw new HttpsError(
        'not-found',
        'The target user profile could not be found.',
      )
    }

    const targetProfile = targetSnapshot.data()!

    // Prevent deletion of another administrator.
    // Admin-to-admin account removal should use a separate
    // higher-privilege administrative process.
    if (targetProfile.role === 'admin') {
      throw new HttpsError(
        'failed-precondition',
        'Administrator accounts cannot be deleted through this function.',
      )
    }

    // ------------------------------------------
    // 6. VERIFY TYPED ACCOUNT CONFIRMATION
    // ------------------------------------------

    const email =
      typeof targetProfile.email === 'string'
        ? targetProfile.email.trim()
        : ''

    const username =
      typeof targetProfile.username === 'string'
        ? targetProfile.username.trim().replace(/^@/, '')
        : ''

    const displayName =
      typeof targetProfile.displayName === 'string'
        ? targetProfile.displayName.trim()
        : ''

    const fallbackName =
      typeof targetProfile.name === 'string'
        ? targetProfile.name.trim()
        : ''

    const emailUsername = email
      ? email.split('@')[0]
      : ''

    const acceptableConfirmations = [
      username,
      email,
      emailUsername,
      displayName,
      fallbackName,
    ]
      .filter(Boolean)
      .map((value) => value.toLowerCase())

    if (!acceptableConfirmations.includes(confirmation)) {
      throw new HttpsError(
        'invalid-argument',
        'The confirmation text does not match the target account.',
      )
    }

    // ------------------------------------------
    // 7. DELETE FIREBASE AUTH ACCOUNT
    // ------------------------------------------

    try {
      await adminAuth.deleteUser(targetUid)
    } catch (error: any) {
      // Allow a retry after the Auth account has already
      // been deleted but Firestore cleanup needs retrying.
      if (error?.code !== 'auth/user-not-found') {
        console.error(
          'Firebase Authentication deletion failed:',
          error,
        )

        throw new HttpsError(
          'internal',
          'Could not delete the Firebase Authentication account.',
        )
      }
    }

    // ------------------------------------------
    // 8. RECURSIVELY DELETE USER FIRESTORE DATA
    // ------------------------------------------

    try {
      // Includes:
      // users/{uid}
      // users/{uid}/favorites/*
      // users/{uid}/recentGames/*
      // users/{uid}/notifications/*

      await adminDb.recursiveDelete(targetRef)

      // Includes:
      // supportConversations/{uid}
      // supportConversations/{uid}/messages/*

      const supportRef = adminDb
        .collection('supportConversations')
        .doc(targetUid)

      await adminDb.recursiveDelete(supportRef)
    } catch (error) {
      console.error(
        'Firestore user-data cleanup failed:',
        error,
      )

      throw new HttpsError(
        'internal',
        'The Auth account was deleted, but some Firestore cleanup failed. An administrator must review and retry the cleanup.',
      )
    }

    // ------------------------------------------
    // 9. SUCCESS
    // ------------------------------------------

    console.info(
      `Admin ${adminUid} deleted user ${targetUid}.`,
    )

    return {
      success: true,
      deletedUid: targetUid,
    }
  },
)
