import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc, type DocumentData } from 'firebase/firestore'
import { auth, db } from '@/firebase'

type UserProfile = DocumentData & {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  role: string
  createdAt: any
  updatedAt: any
}

type AuthContextType = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Handle Google redirect result (fixes COOP popup issues)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user)
          saveProfile(result.user, {
            displayName: result.user.displayName,
            photoURL: result.user.photoURL,
            updatedAt: new Date(),
          })
        }
      })
      .catch((err) => {
        console.error('Google redirect result error:', err)
      })

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile)
          } else {
            await saveProfile(firebaseUser, {
              displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Player',
              photoURL: firebaseUser.photoURL ?? null,
              role: 'user',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        } catch (err) {
          console.error('Error loading user profile:', err)
          // Never set profile to null on error - create from Firebase user data
          setProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Player',
            photoURL: firebaseUser.photoURL ?? null,
            role: 'user',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as UserProfile)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const saveProfile = async (firebaseUser: User, additionalData: Partial<UserProfile> = {}) => {
    const userRef = doc(db, 'users', firebaseUser.uid)
    const data: UserProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName ?? additionalData.displayName ?? null,
      photoURL: firebaseUser.photoURL ?? null,
      role: additionalData.role ?? 'user',
      createdAt: additionalData.createdAt ?? new Date(),
      updatedAt: new Date(),
      ...additionalData,
    }
    await setDoc(userRef, data, { merge: true })
    setProfile(data)
  }

  const signUp = async (email: string, password: string, displayName: string) => {
    setLoading(true)
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    setUser(userCredential.user)
    await saveProfile(userCredential.user, {
      displayName,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    setLoading(false)
  }

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    setUser(userCredential.user)
    await saveProfile(userCredential.user, {
      displayName: userCredential.user.displayName ?? userCredential.user.email?.split('@')[0] ?? 'Player',
      photoURL: userCredential.user.photoURL ?? null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)
    setUser(result.user)
    await saveProfile(result.user, {
      displayName: result.user.displayName ?? result.user.email?.split('@')[0] ?? 'Player',
      photoURL: result.user.photoURL ?? null,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    setLoading(false)
  }

  const signOut = async () => {
    setLoading(true)
    await firebaseSignOut(auth)
    setUser(null)
    setProfile(null)
    setLoading(false)
  }

  const resetPassword = async (email: string) => {
    const { sendPasswordResetEmail } = await import('firebase/auth')
    await sendPasswordResetEmail(auth, email)
  }

  const value: AuthContextType = {
    user,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
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
