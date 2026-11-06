import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

type UserProfile = DocumentData & {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  username?: string
  role: string
  createdAt: any
  updatedAt: any
  emailVerified?: boolean
}

type AuthContextType = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  emailVerified: boolean
  pendingMfaLabel: string
  signUp: (
    email: string,
    password: string,
    displayName: string,
    username: string,
  ) => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signInWithGoogle: () => Promise<boolean>
  completeTotpSignIn: (code: string) => Promise<void>
  cancelMfaSignIn: () => void
  refreshProfile: () => Promise<void>
  refreshEmailVerification: () => Promise<boolean>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}
const AuthContext = createContext<AuthContextType | undefined>(undefined)

function isMfaRequiredError(error: unknown): error is MultiFactorError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'auth/multi-factor-auth-required',
  )
}

/**
 * Firebase Authentication is the source of truth for email verification.
 * The Firestore emailVerified field is only a synchronized profile copy.
 * The security rules independently require the email_verified token claim
 * before an owner can change that field to true.
 */
async function syncEmailVerificationToFirestore(
  firebaseUser: User,
): Promise<boolean> {
  await reload(firebaseUser)
  const isEmailVerified = firebaseUser.emailVerified

  // Force-refresh the ID token so Firestore Rules receive the latest
  // email_verified claim after the user completes (or changes) verification.
  await firebaseUser.getIdToken(true)

  const userRef = doc(db, 'users', firebaseUser.uid)
  const userSnapshot = await getDoc(userRef)

  // The profile may not exist yet during the first moments of signup.
  // saveProfile creates it, and the normal auth flow will sync again.
  if (!userSnapshot.exists()) {
    return isEmailVerified
  }

  if (userSnapshot.data().emailVerified !== isEmailVerified) {
    await updateDoc(userRef, {
      emailVerified: isEmailVerified,
      updatedAt: serverTimestamp(),
    })
  }

  return isEmailVerified
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingResolver, setPendingResolver] =
    useState<MultiFactorResolver | null>(null)
  const pendingSignupProfileRef = useRef<Partial<UserProfile> | null>(null)

  const pendingTotpHint =
    pendingResolver?.hints.find(
      (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    ) ?? null

  useEffect(() => {
    let active = true
    let authGeneration = 0
    let unsubscribeAccountState: (() => void) | undefined
    let unsubscribeProfile: (() => void) | undefined

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!active) return
      const generation = ++authGeneration
      const pendingSignupProfile = pendingSignupProfileRef.current
      unsubscribeAccountState?.()
      unsubscribeAccountState = undefined
      unsubscribeProfile?.()
      unsubscribeProfile = undefined
      setUser(firebaseUser)
      setEmailVerified(firebaseUser?.emailVerified ?? false)

      if (!firebaseUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const accountStateRef = doc(db, 'accountStates', firebaseUser.uid)
        const accountStateSnapshot = await getDoc(accountStateRef)
        if (!active || generation !== authGeneration) return
        if (accountStateSnapshot.exists() && ['data_clearing', 'data_cleared'].includes(accountStateSnapshot.data().status)) {
          setProfile(null)
          setUser(null)
          setLoading(false)
          await firebaseSignOut(auth)
          return
        }

        const accountStateUnsubscribe = onSnapshot(accountStateRef, (stateSnapshot) => {
          if (stateSnapshot.exists() && ['data_clearing', 'data_cleared'].includes(stateSnapshot.data().status)) {
            setProfile(null)
            setUser(null)
            void firebaseSignOut(auth)
          }
        })

        unsubscribeAccountState = accountStateUnsubscribe

        const userRef = doc(db, 'users', firebaseUser.uid)
        const userSnapshot = await getDoc(userRef)

        if (!active || generation !== authGeneration) {
          accountStateUnsubscribe()
          return
        }

        if (userSnapshot.exists()) {
          setProfile({
            ...userSnapshot.data(),
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName:
              userSnapshot.data().displayName ??
              firebaseUser.displayName ??
              null,
            photoURL:
              userSnapshot.data().photoURL ??
              firebaseUser.photoURL ??
              null,
          } as UserProfile)
        } else {
          await saveProfile(firebaseUser, {
            ...(pendingSignupProfile ?? {}),
            displayName:
              pendingSignupProfile?.displayName ??
              firebaseUser.displayName ??
              firebaseUser.email?.split('@')[0] ??
              'Player',
            photoURL: pendingSignupProfile?.photoURL ?? firebaseUser.photoURL ?? null,
            role: 'user',
          })
        }

        if (!active || generation !== authGeneration) {
          accountStateUnsubscribe()
          return
        }

        // Keep the Firestore email verification mirror current on sign-in,
        // including Google accounts and users returning after verifying.
        try {
          const isEmailVerified = await syncEmailVerificationToFirestore(firebaseUser)
          if (active && generation === authGeneration) {
            setEmailVerified(isEmailVerified)
          }
        } catch (verificationSyncError) {
          console.warn('Could not synchronize email verification:', verificationSyncError)
        }

        if (!active || generation !== authGeneration) {
          accountStateUnsubscribe()
          return
        }

        unsubscribeProfile = onSnapshot(
          userRef,
          (profileSnapshot) => {
            if (!active) return
            if (!profileSnapshot.exists()) {
              setProfile(null)
              return
            }
            const profileData = profileSnapshot.data()
            setProfile({
              ...profileData,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: profileData.displayName ?? firebaseUser.displayName ?? null,
              photoURL: profileData.photoURL ?? firebaseUser.photoURL ?? null,
            } as UserProfile)
          },
          (profileError) => {
            console.error('Live profile subscription failed:', profileError)
          },
        )
      } catch (error) {
        console.error('Error loading user profile:', error)
        if (active && generation === authGeneration) {
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName:
              firebaseUser.displayName ??
              firebaseUser.email?.split('@')[0] ??
              'Player',
            photoURL: firebaseUser.photoURL ?? null,
            role: 'user',
            createdAt: null,
            updatedAt: null,
          } as UserProfile)
        }
      } finally {
        if (active && generation === authGeneration) setLoading(false)
      }
    })

    return () => {
      active = false
      unsubscribeAccountState?.()
      unsubscribeProfile?.()
      unsubscribe()
    }
  }, [])

  // The verification action usually opens in another browser tab. When the
  // user returns to this tab, reload Firebase Auth and sync the profile.
  useEffect(() => {
    let active = true
    let syncInProgress = false

    const syncOnReturn = async () => {
      if (document.visibilityState !== 'visible' || syncInProgress) return
      const currentUser = auth.currentUser
      if (!currentUser) {
        if (active) setEmailVerified(false)
        return
      }

      syncInProgress = true
      try {
        const isEmailVerified = await syncEmailVerificationToFirestore(currentUser)
        if (active) setEmailVerified(isEmailVerified)
      } catch (error) {
        console.warn('Email verification refresh failed:', error)
      } finally {
        syncInProgress = false
      }
    }

    window.addEventListener('focus', syncOnReturn)
    document.addEventListener('visibilitychange', syncOnReturn)

    return () => {
      active = false
      window.removeEventListener('focus', syncOnReturn)
      document.removeEventListener('visibilitychange', syncOnReturn)
    }
  }, [])

  const saveProfile = async (
    firebaseUser: User,
    additionalData: Partial<UserProfile> = {},
  ) => {
    const accountStateSnapshot = await getDoc(doc(db, 'accountStates', firebaseUser.uid))
    if (accountStateSnapshot.exists() && ['data_clearing', 'data_cleared'].includes(accountStateSnapshot.data().status)) {
      await firebaseSignOut(auth)
      setUser(null)
      setProfile(null)
      throw new Error('This account has been cleared and is blocked from the application. Contact the administrator if you believe this is a mistake.')
    }

    const userRef = doc(db, 'users', firebaseUser.uid)
    const existingSnapshot = await getDoc(userRef)
    const existingData = existingSnapshot.exists()
      ? existingSnapshot.data()
      : {}

    const nextDisplayName =
      additionalData.displayName ??
      existingData.displayName ??
      firebaseUser.displayName ??
      firebaseUser.email?.split('@')[0] ??
      'Player'
    const nextPhotoURL =
      additionalData.photoURL ??
      existingData.photoURL ??
      firebaseUser.photoURL ??
      null
    const nextUsername =
      existingData.username ||
      additionalData.username ||
      ''
    const nextRole = existingData.role ?? additionalData.role ?? 'user'

    const profileForState: UserProfile = {
      ...existingData,
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: nextDisplayName,
      photoURL: nextPhotoURL,
      username: nextUsername,
      role: nextRole,
      createdAt: existingData.createdAt ?? additionalData.createdAt ?? null,
      updatedAt: existingData.updatedAt ?? null,
    } as UserProfile

    if (existingSnapshot.exists()) {
      // Update only fields that Firestore Rules explicitly permit owners to
      // change. In particular, do not write role, verified, uid, or email on
      // every login; doing so could cause rules failures or privilege changes.
      const allowedUpdates: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      }
      if (nextDisplayName !== existingData.displayName) {
        allowedUpdates.displayName = nextDisplayName
      }
      if (nextPhotoURL !== existingData.photoURL) {
        allowedUpdates.photoURL = nextPhotoURL
      }
      if (nextUsername !== existingData.username) {
        allowedUpdates.username = nextUsername
      }
      await setDoc(userRef, allowedUpdates, { merge: true })
      setProfile({ ...profileForState, updatedAt: new Date() })
    } else {
      const initialProfile: Record<string, unknown> = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: nextDisplayName,
        photoURL: nextPhotoURL,
        username: nextUsername,
        role: nextRole,
        emailVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(userRef, initialProfile)
      setProfile({ ...profileForState, createdAt: new Date(), updatedAt: new Date() })
    }
  }

  const saveSignedInUser = async (firebaseUser: User) => {
    setUser(firebaseUser)
    await saveProfile(firebaseUser, {
      displayName:
        firebaseUser.displayName ??
        firebaseUser.email?.split('@')[0] ??
        'Player',
      photoURL: firebaseUser.photoURL ?? null,
    })
  }

  const captureMfaChallenge = (error: MultiFactorError) => {
    const resolver = getMultiFactorResolver(auth, error)
    const totpFactor = resolver.hints.find(
      (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    )

    if (!totpFactor) {
      throw new Error(
        'This account requires a second factor that is not supported by this sign-in screen. Contact support.',
      )
    }

    setPendingResolver(resolver)
  }

  const signUp = async (
    email: string,
    password: string,
    displayName: string,
    username: string,
  ) => {
    const cleanUsername = username.trim().replace(/^@/, '')
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(cleanUsername)) {
      throw new Error('Username must be 3–24 characters and can contain letters, numbers, underscores, and periods.')
    }
    setLoading(true)
    const initialSignupProfile: Partial<UserProfile> = {
      displayName: displayName.trim(),
      username: cleanUsername,
      role: 'user',
    }
    pendingSignupProfileRef.current = initialSignupProfile
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )
      setUser(result.user)
      await saveProfile(result.user, initialSignupProfile)
      try {
        await sendEmailVerification(result.user, {
          url: `${window.location.origin}/?emailVerified=1`,
        })
      } catch (verificationError) {
        // Account creation should still succeed; the user can resend from Settings.
        console.warn('Could not send the initial email verification:', verificationError)
      }
    } finally {
      pendingSignupProfileRef.current = null
      setLoading(false)
    }
  }

  // Returns true when the user must complete the authenticator challenge.
  const signIn = async (
    email: string,
    password: string,
  ): Promise<boolean> => {
    setLoading(true)
    setPendingResolver(null)
    try {
      const result = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )
      await saveSignedInUser(result.user)
      return false
    } catch (error) {
      if (isMfaRequiredError(error)) {
        captureMfaChallenge(error)
        return true
      }
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async (): Promise<boolean> => {
    setLoading(true)
    setPendingResolver(null)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await saveSignedInUser(result.user)
      return false
    } catch (error) {
      if (isMfaRequiredError(error)) {
        captureMfaChallenge(error)
        return true
      }
      throw error
    } finally {
      setLoading(false)
    }
  }

  const completeTotpSignIn = async (code: string) => {
    const resolver = pendingResolver
    if (!resolver) {
      throw new Error('Your sign-in challenge has expired. Please sign in again.')
    }

    const cleanCode = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(cleanCode)) {
      throw new Error('Enter the six-digit code from your authenticator app.')
    }

    const factor = resolver.hints.find(
      (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    )

    if (!factor) {
      throw new Error('No authenticator-app factor was found for this account.')
    }

    setLoading(true)
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        factor.uid,
        cleanCode,
      )
      const result = await resolver.resolveSignIn(assertion)
      setPendingResolver(null)
      await saveSignedInUser(result.user)
    } finally {
      setLoading(false)
    }
  }

  const refreshProfile = async () => {
    if (!auth.currentUser) return
    const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid))
    if (snapshot.exists()) {
      setProfile({
        ...snapshot.data(),
        uid: auth.currentUser.uid,
        email: auth.currentUser.email,
      } as UserProfile)
    }
  }

  const refreshEmailVerification = async (): Promise<boolean> => {
    const currentUser = auth.currentUser
    if (!currentUser) {
      setEmailVerified(false)
      return false
    }

    const isEmailVerified = await syncEmailVerificationToFirestore(currentUser)
    setEmailVerified(isEmailVerified)
    return isEmailVerified
  }

  const cancelMfaSignIn = () => {
    setPendingResolver(null)
  }

  const signOut = async () => {
    setLoading(true)
    try {
      await firebaseSignOut(auth)
      setPendingResolver(null)
      setUser(null)
      setProfile(null)
      setEmailVerified(false)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    const { sendPasswordResetEmail } = await import('firebase/auth')
    await sendPasswordResetEmail(auth, email.trim())
  }

  const value: AuthContextType = {
    user,
    profile,
    loading,
    emailVerified,
    pendingMfaLabel: pendingTotpHint?.displayName || 'Authenticator app',
    signUp,
    signIn,
    signInWithGoogle,
    completeTotpSignIn,
    cancelMfaSignIn,
    refreshProfile,
    refreshEmailVerification,
    signOut,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
