import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import type { Auth, View } from './types'

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { db, auth } from './firebase'
import { useAuth } from './contexts/AuthContext'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  updatePassword,
  type TotpSecret,
} from 'firebase/auth'
import QRCode from 'qrcode'
import { AdminPage } from './AdminPage'

// ==========================================
// GENERAL CONFIGURATION
// ==========================================

const hero =
  'https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1800&q=88'

const photos = [
  'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1696710257827-75e2e5954059?auto=format&fit=crop&w=900&q=85',
]

const ADMIN_ONLY_VIEWS: View[] = [
  'admin',
  'users',
  'manage-games',
  'manage-hero',
  'admin-messages',
  'social-links',
]

const SUPPORT_COLLECTION = 'supportConversations'
const SUPPORT_IMAGE_MAX_SIZE = 5 * 1024 * 1024

// ==========================================
// PUBLIC HERO BANNER
// ==========================================

type PublicHeroBanner = {
  eyebrow: string
  title: string
  accent: string
  description: string
  primaryCta: string
  primaryUrl: string
  secondaryCta: string
  secondaryUrl: string
  image: string
}

const DEFAULT_PUBLIC_HERO: PublicHeroBanner = {
  eyebrow: 'YOUR NEXT CHAPTER STARTS HERE',
  title: 'PLAY BOLD.',
  accent: 'CONNECT DEEPER.',
  description:
    'A curated gaming community built for discovery, friendly competition, and unforgettable shared experiences.',
  primaryCta: 'Join the community',
  primaryUrl: '#signup',
  secondaryCta: 'Explore games',
  secondaryUrl: '#games',
  image: hero,
}

// ==========================================
// SOCIAL LINKS — FIRESTORE
// ==========================================

type SocialLinkValue = {
  enabled: boolean
  url: string
}

type SocialLinksData = Record<string, SocialLinkValue>

const SOCIAL_CHANNELS = [
  {
    key: 'facebook',
    name: 'Facebook',
    icon: 'f',
    description:
      'Community news, conversations, and event updates.',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    icon: '➤',
    description:
      'Real-time announcements and community updates.',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    icon: '◎',
    description:
      'Player highlights, gaming updates, and visual stories.',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: '◉',
    description:
      'Join group conversations and stay connected.',
  },
  {
    key: 'signal',
    name: 'Signal',
    icon: 'S',
    description:
      'Private announcements and community updates.',
  },
] as const

type SocialChannel = {
  key: string
  name: string
  icon: string
  description: string
  url: string
}

// Accept URLs with or without https://.
// Only allow HTTP and HTTPS external links.
function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  let input = value.trim()

  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`
  }

  try {
    const parsed = new URL(input)

    if (
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'http:'
    ) {
      return ''
    }

    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return ''
    }

    return parsed.toString()
  } catch {
    return ''
  }
}

function useSocialLinks() {
  const [socialLinks, setSocialLinks] =
    useState<SocialLinksData>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    // Exact Firestore path:
    // siteSettings/socialLinks

    const socialDocument = doc(
      db,
      'siteSettings',
      'socialLinks',
    )

    const unsubscribe = onSnapshot(
      socialDocument,
      (snapshot) => {
        if (!snapshot.exists()) {
          console.warn(
            'Firestore document siteSettings/socialLinks does not exist.',
          )

          setSocialLinks({})
          setError('')
          setLoading(false)
          return
        }

        const data = snapshot.data() as Record<string, any>

        console.log(
          'Social links successfully fetched from Firestore:',
          data,
        )

        // Supports both document layouts:
        //
        // {
        //   facebook: { enabled: true, url: "..." }
        // }
        //
        // or:
        //
        // {
        //   links: {
        //     facebook: { enabled: true, url: "..." }
        //   }
        // }

        const source =
          data.links &&
          typeof data.links === 'object' &&
          !Array.isArray(data.links)
            ? data.links
            : data

        const result: SocialLinksData = {}

        SOCIAL_CHANNELS.forEach((channel) => {
          const key = channel.key

          const entry =
            source[key] ??
            source[key.toLowerCase()] ??
            {}

          let enabled = false
          let rawUrl = ''

          if (
            entry &&
            typeof entry === 'object' &&
            !Array.isArray(entry)
          ) {
            enabled =
              entry.enabled === true ||
              entry.isEnabled === true ||
              entry.active === true

            rawUrl =
              typeof entry.url === 'string'
                ? entry.url
                : typeof entry.link === 'string'
                  ? entry.link
                  : typeof entry.href === 'string'
                    ? entry.href
                    : ''
          } else if (typeof entry === 'string') {
            enabled = true
            rawUrl = entry
          }

          // Also supports separate URL and enabled fields.
          if (!rawUrl) {
            rawUrl =
              typeof source[`${key}Url`] === 'string'
                ? source[`${key}Url`]
                : typeof source[`${key}Link`] === 'string'
                  ? source[`${key}Link`]
                  : ''
          }

          if (
            source[`${key}Enabled`] === true ||
            source[`${key}IsEnabled`] === true
          ) {
            enabled = true
          }

          result[key] = {
            enabled,
            url: normalizeExternalUrl(rawUrl),
          }
        })

        setSocialLinks(result)
        setError('')
        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Unable to fetch social links:',
          firebaseError,
        )

        setSocialLinks({})
        setLoading(false)

        if (firebaseError.code === 'permission-denied') {
          setError(
            'Permission denied. Firestore rules must allow public read access to siteSettings/socialLinks.',
          )
        } else {
          setError(
            `Unable to load social links: ${
              firebaseError.message || 'Unknown Firestore error.'
            }`,
          )
        }
      },
    )

    return () => unsubscribe()
  }, [])

  const activeChannels: SocialChannel[] =
    SOCIAL_CHANNELS.flatMap((channel) => {
      const link = socialLinks[channel.key]

      if (!link?.enabled || !link.url) {
        return []
      }

      return [
        {
          ...channel,
          url: link.url,
        },
      ]
    })

  return {
    socialLinks,
    activeChannels,
    loading,
    error,
  }
}

// ==========================================
// GAME DATA
// ==========================================

type GameRecord = {
  id: string
  title: string
  description: string
  image: string
  categories: string[]
  platforms: string[]
  playUrl: string
  releaseDate: string
  createdAt?: any
  raw: Record<string, any>
}

type UserGameRecord = {
  id: string
  gameId: string
  title: string
  description: string
  image: string
  categories: string[]
  favoritedAt?: any
  openedAt?: any
  playedAt?: any
}

function firstString(
  data: Record<string, any>,
  fields: string[],
): string {
  for (const field of fields) {
    const value = data[field]

    if (
      typeof value === 'string' &&
      value.trim().length > 0
    ) {
      return value.trim()
    }
  }

  return ''
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.trim().length > 0,
      )
      .map((item) => item.trim())
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,|]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeGame(
  id: string,
  data: Record<string, any>,
): GameRecord {
  const categoryValue =
    data.categories ??
    data.genres ??
    data.category ??
    data.genre ??
    data.gameType

  const platformValue =
    data.platforms ??
    data.platform ??
    data.supportedPlatforms

  return {
    id,

    title:
      firstString(data, [
        'title',
        'name',
        'gameName',
        'gameTitle',
      ]) || 'Untitled game',

    description: firstString(data, [
      'description',
      'shortDescription',
      'summary',
      'details',
    ]),

    image: firstString(data, [
      'coverImage',
      'coverUrl',
      'imageUrl',
      'image',
      'thumbnail',
      'thumbnailUrl',
      'bannerImage',
      'poster',
    ]),

    categories: normalizeStringList(categoryValue),

    platforms: normalizeStringList(platformValue),

    playUrl: normalizeExternalUrl(
      firstString(data, [
        'playUrl',
        'gameUrl',
        'playLink',
        'externalUrl',
        'websiteUrl',
        'url',
      ]),
    ),

    releaseDate: firstString(data, [
      'releaseDate',
      'releasedAt',
    ]),

    createdAt: data.createdAt,

    raw: data,
  }
}

function timestampMillis(value: any): number {
  if (!value) return 0

  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (typeof value.toDate === 'function') {
    return value.toDate().getTime()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000
  }

  return 0
}

function formatDate(value: any): string {
  const milliseconds = timestampMillis(value)

  if (!milliseconds) return ''

  return new Date(milliseconds).toLocaleDateString(
    undefined,
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  )
}

function formatRelativeDate(value: any): string {
  const milliseconds = timestampMillis(value)

  if (!milliseconds) return 'Recently'

  const difference = Date.now() - milliseconds
  const minutes = Math.floor(difference / 60000)
  const hours = Math.floor(difference / 3600000)
  const days = Math.floor(difference / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return formatDate(value)
}

function normalizeUserGame(
  id: string,
  data: Record<string, any>,
): UserGameRecord {
  return {
    id,
    gameId: data.gameId || id,
    title: data.title || data.name || 'Untitled game',
    description: data.description || '',
    image:
      data.image ||
      data.imageUrl ||
      data.coverImage ||
      '',
    categories: normalizeStringList(data.categories),
    favoritedAt: data.favoritedAt,
    openedAt: data.openedAt,
    playedAt: data.playedAt,
  }
}

// The query includes both conditions required by the
// published-game Firestore read rule.
function usePublishedGames() {
  const [games, setGames] = useState<GameRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    const gamesQuery = query(
      collection(db, 'games'),
      where('status', '==', 'Published'),
      where('visible', '==', true),
    )

    const unsubscribe = onSnapshot(
      gamesQuery,
      (snapshot) => {
        const records = snapshot.docs.map((gameDoc) =>
          normalizeGame(gameDoc.id, gameDoc.data()),
        )

        records.sort(
          (a, b) =>
            timestampMillis(b.createdAt) -
            timestampMillis(a.createdAt),
        )

        setGames(records)
        setLoading(false)
        setError('')
      },
      (err) => {
        console.error('Games loading error:', err)
        setGames([])
        setLoading(false)
        setError(
          'Unable to load games. Please check your connection and Firestore permissions.',
        )
      },
    )

    return unsubscribe
  }, [])

  return {
    games,
    loading,
    error,
  }
}

// ==========================================
// CLOUDINARY UPLOAD
// ==========================================

async function uploadCloudinaryImage(
  file: File,
  folder: string,
): Promise<string> {
  const cloudName = import.meta.env
    .VITE_CLOUDINARY_CLOUD_NAME as string | undefined

  const uploadPreset = import.meta.env
    .VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.',
    )
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image.')
  }

  if (file.size > SUPPORT_IMAGE_MAX_SIZE) {
    throw new Error('Images must be 5 MB or smaller.')
  }

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)
  body.append('folder', folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      cloudName,
    )}/image/upload`,
    {
      method: 'POST',
      body,
    },
  )

  const result = (await response.json().catch(() => ({}))) as {
    secure_url?: string
    error?: { message?: string }
  }

  if (
    !response.ok ||
    !result.secure_url ||
    !result.secure_url.startsWith(
      'https://res.cloudinary.com/',
    )
  ) {
    throw new Error(
      result.error?.message || 'Image upload failed.',
    )
  }

  return result.secure_url
}

async function uploadSupportImage(
  file: File,
): Promise<string> {
  return uploadCloudinaryImage(
    file,
    'playwithnicole/support-chat',
  )
}

// ==========================================
// SUPPORT MESSAGE TYPES
// ==========================================

type SupportMessage = {
  id: string
  senderId: string
  senderRole: 'user' | 'admin'
  type: 'text' | 'image'
  text: string
  imageUrl: string
  createdAt?: any
}

function formatSupportTime(value: any): string {
  if (!value) return ''

  const date =
    typeof value.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : null

  if (!date || Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ==========================================
// ICONS AND SHARED UI
// ==========================================

export const Icon = ({
  name,
  size = 20,
}: {
  name: string
  size?: number
}) => {
  const paths: Record<string, ReactNode> = {
    play: <path d="M8 5v14l11-7z" />,

    arrow: (
      <>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </>
    ),

    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),

    game: (
      <>
        <path d="M6 9h12a4 4 0 0 1 3.7 5.5l-1.2 3a2 2 0 0 1-3.2.8L15 16H9l-2.3 2.3a2 2 0 0 1-3.2-.8l-1.2-3A4 4 0 0 1 6 9Z" />
        <path d="M7 12v4M5 14h4M17 13h.01M19 15h.01" />
      </>
    ),

    chat: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </>
    ),

    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),

    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1a2 2 0 0 0 .4-2.2A2 2 0 0 0 3 13.4H3V10h.2A2 2 0 0 0 5 8.8a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9.4 4 2 2 0 0 0 10.6 2h3.6v.2A2 2 0 0 0 15.4 4a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1a2 2 0 0 0-.4 2.2 2 2 0 0 0 1.8 1.2h.2V13h-.2a2 2 0 0 0-1.8 1.2Z" />
      </>
    ),

    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),

    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),

    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),

    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),

    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),

    heart: (
      <>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
      </>
    ),

    'check-circle': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),

    'alert-circle': (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5h.01" />
      </>
    ),

    'shield-check': (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m8.5 12 2.2 2.2 4.8-4.8" />
      </>
    ),

    'trash-2': (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),

    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),

    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),

    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? <circle cx="12" cy="12" r="9" />}
    </svg>
  )
}

export const Logo = () => (
  <button
    className="logo"
    onClick={() => window.location.reload()}
    type="button"
  >
    <span className="logoMark">
      <img src="/logo.png" alt="Logo" style={{ width: 24, height: 24, objectFit: "contain" }} />
    </span>
    <span>
      playwith<b>nicole</b>
    </span>
  </button>
)

export const Button = ({
  children,
  secondary = false,
  onClick,
  type = 'button',
  disabled = false,
}: {
  children: ReactNode
  secondary?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}) => (
  <button
    type={type}
    className={`btn ${secondary ? 'secondary' : ''}`}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
)

// ==========================================
// PROFILE AVATAR
// ==========================================

const ProfileAvatar = ({
  user,
  profile,
  go,
  onLogout,
}: {
  user: any
  profile: any
  go: (v: View) => void
  onLogout?: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  const photo = profile?.photoURL || user?.photoURL

  const displayName =
    profile?.displayName ||
    profile?.name ||
    user?.displayName ||
    user?.email ||
    'Player'

  const initial = String(displayName).charAt(0).toUpperCase()
  const verified = profile?.verified === 1 || profile?.verified === true

  return (
    <div
      className="profileMenu"
      onClick={(event) => {
        event.stopPropagation()
        setOpen((current) => !current)
      }}
    >
      <div className="profileHeader">
        <span>
          {photo && !imageError ? (
            <img
              className="miniAvatar"
              src={photo}
              alt="Profile"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="profileBtn">{initial}</span>
          )}
        </span>

        <div className="profileInfo">
          <b>{displayName}</b>
          <small className={`profileVerification ${verified ? 'isVerified' : 'isUnverified'}`}>
            {verified ? 'Verified' : 'Unverified'}
            <span aria-hidden="true">{verified ? '✓' : '!'}</span>
            
          </small>
        </div>
      </div>

      {open && (
        <div className="profileDropdown">
          <button
            className="dropdownItem"
            type="button"
            onClick={() => {
              setOpen(false)
              go('profile')
            }}
          >
            <Icon name="user" /> My Profile
          </button>

          <button
            className="dropdownItem"
            type="button"
            onClick={() => {
              setOpen(false)
              go('settings')
            }}
          >
            <Icon name="settings" /> Settings
          </button>

          <button
            className="dropdownItem"
            type="button"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
          >
            <Icon name="arrow" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

// ==========================================
// PUBLIC HOME
// ==========================================

function Home({
  go,
  auth,
}: {
  go: (v: View) => void
  auth: (v: Auth) => void
}) {
  const { user, profile, signOut } = useAuth()

  const [menu, setMenu] = useState(false)

  const [heroBanner, setHeroBanner] =
    useState<PublicHeroBanner>(DEFAULT_PUBLIC_HERO)

  const {
    activeChannels,
    error: socialError,
  } = useSocialLinks()

  const {
    games: featuredGames,
    loading: featuredGamesLoading,
  } = usePublishedGames()

  useEffect(() => {
    const activeHeroQuery = query(
      collection(db, 'heroBanners'),
      where('visible', '==', true),
      where('isActive', '==', true),
      limit(1),
    )

    const unsubscribe = onSnapshot(
      activeHeroQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setHeroBanner(DEFAULT_PUBLIC_HERO)
          return
        }

        const data = snapshot.docs[0].data()

        setHeroBanner({
          eyebrow:
            typeof data.eyebrow === 'string'
              ? data.eyebrow
              : DEFAULT_PUBLIC_HERO.eyebrow,

          title:
            typeof data.title === 'string'
              ? data.title
              : DEFAULT_PUBLIC_HERO.title,

          accent:
            typeof data.accent === 'string'
              ? data.accent
              : DEFAULT_PUBLIC_HERO.accent,

          description:
            typeof data.description === 'string'
              ? data.description
              : DEFAULT_PUBLIC_HERO.description,

          primaryCta:
            typeof data.primaryCta === 'string'
              ? data.primaryCta
              : DEFAULT_PUBLIC_HERO.primaryCta,

          primaryUrl:
            typeof data.primaryUrl === 'string'
              ? data.primaryUrl
              : DEFAULT_PUBLIC_HERO.primaryUrl,

          secondaryCta:
            typeof data.secondaryCta === 'string'
              ? data.secondaryCta
              : DEFAULT_PUBLIC_HERO.secondaryCta,

          secondaryUrl:
            typeof data.secondaryUrl === 'string'
              ? data.secondaryUrl
              : DEFAULT_PUBLIC_HERO.secondaryUrl,

          image:
            typeof data.image === 'string' && data.image
              ? data.image
              : DEFAULT_PUBLIC_HERO.image,
        })
      },
      (error) => {
        console.error(
          'Could not load active homepage banner:',
          error,
        )

        setHeroBanner(DEFAULT_PUBLIC_HERO)
      },
    )

    return unsubscribe
  }, [])

  const handleHeroAction = (
    target: string,
    fallback: 'games' | 'signup',
  ) => {
    const destination = target.trim()

    if (!destination || destination === '#games') {
      go('games')
      return
    }

    if (destination === '#login') {
      auth('login')
      return
    }

    if (destination === '#signup') {
      if (user) go('games')
      else auth('signup')
      return
    }

    if (destination.startsWith('/')) {
      window.location.assign(destination)
      return
    }

    const externalUrl = normalizeExternalUrl(destination)

    if (externalUrl) {
      window.open(
        externalUrl,
        '_blank',
        'noopener,noreferrer',
      )
      return
    }

    if (fallback === 'signup' && !user) {
      auth('signup')
    } else {
      go('games')
    }
  }

  return (
    <div className="public">
      <nav className="topnav">
        <Logo />

        <div className={`navlinks ${menu ? 'open' : ''}`}>
          <button onClick={() => go('home')} type="button">
            Home
          </button>

          <button onClick={() => go('games')} type="button">
            Games
          </button>

          <button
            type="button"
            onClick={() =>
              document.querySelector('#about')?.scrollIntoView()
            }
          >
            About
          </button>

          <button
            type="button"
            onClick={() =>
              document.querySelector('#faq')?.scrollIntoView()
            }
          >
            FAQ
          </button>
        </div>

        {user ? (
          <div className="navActions">
            <ProfileAvatar
              user={user}
              profile={profile}
              go={go}
              onLogout={signOut}
            />
          </div>
        ) : (
          <div className="navActions">
            <button
              className="textBtn"
              onClick={() => auth('login')}
              type="button"
            >
              Log in
            </button>

            <Button onClick={() => auth('signup')}>
              Sign up <Icon name="arrow" size={16} />
            </Button>
          </div>
        )}

        <button
          className="menuBtn"
          onClick={() => setMenu((current) => !current)}
          type="button"
        >
          <Icon name={menu ? 'close' : 'menu'} />
        </button>
      </nav>

      <main>
        <section className="hero">
          <img
            src={heroBanner.image || hero}
            alt={
              heroBanner.title ||
              'Gaming community hero banner'
            }
          />

          <div className="heroShade" />

          <div className="heroContent">
            <div className="eyebrow">
              <span /> {heroBanner.eyebrow}
            </div>

            <h1>
              {heroBanner.title}
              <br />
              <em>{heroBanner.accent}</em>
            </h1>

            <p>{heroBanner.description}</p>

            <div className="heroCtas">
              {heroBanner.primaryCta && (
                <Button
                  onClick={() =>
                    handleHeroAction(
                      heroBanner.primaryUrl,
                      'signup',
                    )
                  }
                >
                  {heroBanner.primaryCta}
                  <Icon name="arrow" size={17} />
                </Button>
              )}

              {heroBanner.secondaryCta && (
                <Button
                  secondary
                  onClick={() =>
                    handleHeroAction(
                      heroBanner.secondaryUrl,
                      'games',
                    )
                  }
                >
                  {heroBanner.secondaryCta}
                  <Icon name="play" size={16} />
                </Button>
              )}
            </div>

            <div className="heroProof">
              <div className="avatars">
                <span>N</span>
                <span>J</span>
                <span>K</span>
              </div>

              <div>
                <strong>2,400+ active members</strong>
                <small>Growing every day</small>
              </div>
            </div>
          </div>

          <div className="scroll">
            SCROLL TO EXPLORE <span>↓</span>
          </div>
        </section>

        {/* DYNAMIC FEATURED GAMES */}

        <section className="section" id="games">
          <div className="sectionHead">
            <div>
              <span className="kicker">
                HANDPICKED FOR YOU
              </span>
              <h2>Featured worlds</h2>
            </div>

            <button
              className="link"
              onClick={() => go('games')}
              type="button"
            >
              View all games <Icon name="arrow" size={16} />
            </button>
          </div>

          {featuredGamesLoading ? (
            <div className="supportChatEmpty">
              <span className="gameSpinner" />
              <p>Loading featured games...</p>
            </div>
          ) : featuredGames.length === 0 ? (
            <div className="panel">
              <p>No published games are available yet.</p>
            </div>
          ) : (
            <div className="gameGrid">
              {featuredGames.slice(0, 3).map((game, index) => (
                <article
                  className={`gameCard g${index}`}
                  key={game.id}
                >
                  <img
                    src={game.image || hero}
                    alt={game.title}
                  />

                  <div className="gameOverlay" />

                  <div className="tag">
                    {game.categories[0] || 'FEATURED'}
                  </div>

                  <div className="gameInfo">
                    <small>
                      {game.categories.join(' • ') ||
                        'COMMUNITY GAME'}
                    </small>

                    <h3>{game.title}</h3>

                    <button
                      type="button"
                      onClick={() => go('games')}
                    >
                      Explore game <span>→</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="community" id="about">
          <div>
            <span className="kicker">
              MORE THAN A PLATFORM
            </span>

            <h2>
              Find your people.
              <br />
              <em>Build your legacy.</em>
            </h2>

            <p>
              Jump into a space where players trade strategies,
              celebrate wins, and discover what to play next.
            </p>

            <div className="stats">
              <div>
                <b>2.4K</b>
                <span>Active members</span>
              </div>

              <div>
                <b>{featuredGames.length}</b>
                <span>Published games</span>
              </div>

              <div>
                <b>24/7</b>
                <span>Community support</span>
              </div>
            </div>
          </div>

          <div className="activityCard">
            <div className="cardTop">
              <b>Community pulse</b>
              <span className="live">LIVE</span>
            </div>

            {[
              ['N', 'NovaRae', 'just joined the community'],
              [
                'D',
                'DuskRider',
                'started playing a new game',
              ],
              ['M', 'Mika', 'shared a community highlight'],
            ].map((item, index) => (
              <div className="activity" key={item[1]}>
                <span className={`av a${index}`}>
                  {item[0]}
                </span>

                <div>
                  <b>{item[1]}</b>
                  <small>{item[2]}</small>
                </div>

                <time>{index === 0 ? '2m' : '12m'}</time>
              </div>
            ))}

            {activeChannels[0] ? (
              <a
                className="discord"
                href={activeChannels[0].url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Join the conversation <span>→</span>
              </a>
            ) : (
              <button className="discord" type="button">
                {socialError
                  ? 'Community links unavailable'
                  : 'Community links coming soon'}
              </button>
            )}
          </div>
        </section>

        {/* DYNAMIC SOCIAL LINKS */}

        <section className="section homeSocial">
          <div className="center">
            <span className="kicker">
              JOIN THE CONVERSATION
            </span>

            <h2>Connect beyond the game</h2>

            <p>
              Follow official playwithnicole channels for community
              news, events, and player stories.
            </p>
          </div>

          {activeChannels.length > 0 ? (
            <div className="homeSocialGrid">
              {activeChannels.map((channel) => (
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={channel.key}
                >
                  <span
                    className={`socialIcon socialIcon--${channel.key}`}
                  >
                    {channel.icon}
                  </span>

                  <div>
                    <h3>{channel.name}</h3>
                    <p>{channel.description}</p>
                  </div>

                  <Icon name="arrow" size={18} />
                </a>
              ))}
            </div>
          ) : (
            <div className="panel">
              <p>
                {socialError
                  ? 'Community links could not be loaded. Please try again later.'
                  : 'Community links will appear here when enabled by the administrator.'}
              </p>
            </div>
          )}

          <small className="externalNote">
            <Icon name="shield" size={15} />
            Official external community links • These do not
            connect to your player account
          </small>
        </section>

        <section className="section how">
          <div className="center">
            <span className="kicker">
              GET STARTED IN MINUTES
            </span>

            <h2>Your adventure begins here</h2>
          </div>

          <div className="steps">
            {[
              [
                '01',
                'Create your profile',
                'Choose your player name and make the space yours.',
              ],
              [
                '02',
                'Discover your next game',
                'Browse curated worlds and save your favorites.',
              ],
              [
                '03',
                'Connect & play',
                'Meet the community and start your next adventure.',
              ],
            ].map((item) => (
              <div className="step" key={item[0]}>
                <span>{item[0]}</span>
                <h3>{item[1]}</h3>
                <p>{item[2]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="promo">
          <div>
            <span className="kicker">NEW MEMBER WELCOME</span>
            <h2>Ready to enter the next level?</h2>

            <p>
              Create your free profile and discover a better way to
              play together.
            </p>
          </div>

          <Button onClick={() => auth('signup')}>
            Create my profile <Icon name="arrow" size={17} />
          </Button>
        </section>

        <section className="section faq" id="faq">
          <div>
            <span className="kicker">
              QUESTIONS, ANSWERED
            </span>

            <h2>Everything you need to know</h2>
          </div>

          <div>
            {[
              'What is playwithnicole?',
              'Is it free to join?',
              'How do I contact support?',
              'Where can I find the community?',
            ].map((question, index) => (
              <details key={question} open={index === 0}>
                <summary>
                  {question}
                  <span>+</span>
                </summary>

                <p>
                  {index === 0
                    ? 'playwithnicole is a curated gaming discovery and community platform. Create a profile to save games, get updates, and connect with players.'
                    : 'Open this item to learn more. Full policy and support content can be configured by administrators.'}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <div>
          <Logo />
          <p>Play something worth remembering.</p>
        </div>

        <div>
          <b>Explore</b>
          <span>Games</span>
          <span>Community</span>
          <span>Updates</span>
        </div>

        <div>
          <b>Support</b>
          <span>Help center</span>
          <span>Privacy</span>
          <span>Terms</span>
        </div>

        <div>
          <b>Connect</b>
          {activeChannels.map((channel) => (
            <a
              key={channel.key}
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {channel.name}
            </a>
          ))}
        </div>

        <small>
          © {new Date().getFullYear()} playwithnicole.
        </small>
      </footer>
    </div>
  )
}

// ==========================================
// AUTH MODAL
// ==========================================

function AuthModal({
  mode,
  setMode,
  enter,
}: {
  mode: Exclude<Auth, null>
  setMode: (a: Auth) => void
  enter: () => void
}) {
  const {
    signIn,
    signUp,
    signInWithGoogle,
    completeTotpSignIn,
    cancelMfaSignIn,
    pendingMfaLabel,
    resetPassword,
  } = useAuth()

  const copy = {
    login: [
      'Welcome back',
      'Sign in to continue your adventure.',
    ],
    signup: [
      'Create your account',
      'Join the community and start exploring.',
    ],
    forgot: [
      'Reset your password',
      "We'll send secure reset instructions to your inbox.",
    ],
    verify: [
      'Check your inbox',
      'We sent a verification link to your email address.',
    ],
  }[mode]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  return (
    <div className="modal">
      <div
        className="modalArt"
        style={{ backgroundImage: `url(${hero})` }}
      >
        <Logo />

        <div>
          <span className="kicker">
            PLAY • CONNECT • DISCOVER
          </span>

          <h2>Your next favorite game is waiting.</h2>
          <p>One profile. A whole world of play.</p>
        </div>
      </div>

      <div className="formSide">
        <button
          className="modalClose"
          onClick={() => setMode(null)}
          type="button"
        >
          <Icon name="close" />
        </button>

        <div className="formWrap">
          <span className="formLogo">
            <Icon
              name={mode === 'verify' ? 'shield' : 'game'}
              size={26}
            />
          </span>

          <h2>{copy[0]}</h2>
          <p>{copy[1]}</p>

          {authError && (
            <div className="supportChatError" role="alert">
              {authError}
            </div>
          )}

          {mfaChallenge ? (
            <form
              className="mfaChallengeForm"
              onSubmit={async (event) => {
                event.preventDefault()
                setAuthError('')
                setLoading(true)
                try {
                  await completeTotpSignIn(mfaCode)
                  setMfaChallenge(false)
                  setMfaCode('')
                  enter()
                } catch (error) {
                  setAuthError(
                    error instanceof Error
                      ? error.message
                      : 'The authenticator code could not be verified.',
                  )
                } finally {
                  setLoading(false)
                }
              }}
            >
              <div className="verifyArt"><Icon name="shield" size={26} /></div>
              <h3>Two-factor verification</h3>
              <p>Enter the six-digit code from {pendingMfaLabel} to finish signing in.</p>
              <label>
                Authenticator code
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
              </label>
              <Button type="submit" disabled={loading || mfaCode.length !== 6}>
                {loading ? 'Verifying...' : 'Verify and sign in'}
              </Button>
              <button
                type="button"
                className="mfaCancelButton"
                onClick={() => {
                  cancelMfaSignIn()
                  setMfaChallenge(false)
                  setMfaCode('')
                }}
              >
                Cancel and return to login
              </button>
            </form>
          ) : mode === 'verify' ? (
            <>
              <div className="verifyArt">✦</div>

              <Button onClick={enter}>
                Continue to dashboard
              </Button>
            </>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                setAuthError('')
                setLoading(true)

                try {
                  if (mode === 'login') {
                    const needsMfa = await signIn(email, password)
                    if (needsMfa) {
                      setMfaChallenge(true)
                      return
                    }
                  } else if (mode === 'signup') {
                    await signUp(
                      email,
                      password,
                      displayName,
                      username,
                    )
                  } else if (mode === 'forgot') {
                    await resetPassword(email)
                    setMode('verify')
                    return
                  }

                  enter()
                } catch (error) {
                  console.error('Auth error:', error)

                  setAuthError(
                    error instanceof Error
                      ? error.message
                      : 'Authentication failed. Please try again.',
                  )
                } finally {
                  setLoading(false)
                }
              }}
            >
              {mode === 'signup' && (
                <div className="fieldRow">
                  <label>
                    Full name

                    <input
                      required
                      value={displayName}
                      onChange={(event) =>
                        setDisplayName(event.target.value)
                      }
                      placeholder="Your name"
                    />
                  </label>

                  <label>
                    Username

                    <input
                      required
                      minLength={3}
                      maxLength={24}
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value)
                      }
                      placeholder="Choose a username"
                    />
                  </label>
                </div>
              )}

              <label>
                {mode === 'login'
                  ? 'Email or username'
                  : 'Email address'}

                <input
                  required
                  type="text"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder={
                    mode === 'login'
                      ? 'you@example.com or username'
                      : 'you@example.com'
                  }
                />
              </label>

              {mode !== 'forgot' && (
                <label>
                  Password

                  <div className="inputWrap">
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      placeholder="At least 8 characters"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((current) => !current)
                      }
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              )}

              {mode === 'signup' && (
                <>
                  <div className="strength">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>

                  <label className="check">
                    <input type="checkbox" required />
                    I agree to the Terms and Privacy Policy
                  </label>
                </>
              )}

              {mode === 'login' && (
                <div className="formMeta">
                  <label className="check">
                    <input type="checkbox" />
                    Remember me
                  </label>

                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button type="submit">
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Log in'
                    : mode === 'signup'
                      ? 'Create account'
                      : 'Send reset link'}

                <Icon name="arrow" size={16} />
              </Button>

              {mode === 'login' && (
                <button
                  className="google"
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setAuthError('')
                    setLoading(true)

                    try {
                      const needsMfa = await signInWithGoogle()
                      if (needsMfa) {
                        setMfaChallenge(true)
                        return
                      }
                      enter()
                    } catch (error) {
                      console.error(
                        'Google sign-in error:',
                        error,
                      )

                      setAuthError(
                        error instanceof Error
                          ? error.message
                          : 'Google sign-in failed.',
                      )
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  G&nbsp;&nbsp; Continue with Google
                </button>
              )}
            </form>
          )}

          <p className="switch">
            {mode === 'login'
              ? 'New to playwithnicole? '
              : mode === 'signup'
                ? 'Already have an account? '
                : ''}

            <button
              type="button"
              onClick={() =>
                setMode(mode === 'login' ? 'signup' : 'login')
              }
            >
              {mode === 'login'
                ? 'Create an account'
                : 'Back to login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// DASHBOARD
// ==========================================

function Dashboard({
  view,
  go,
  logout,
}: {
  view: View
  go: (v: View) => void
  logout: () => void
}) {
  const { user, profile } = useAuth()
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!user?.uid || isAdmin) {
      setUnreadNotifications(0)
      return
    }

    const unreadQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false),
    )

    return onSnapshot(
      unreadQuery,
      (snapshot) => setUnreadNotifications(snapshot.size),
      (error) => {
        console.error('Unread notification count failed:', error)
        setUnreadNotifications(0)
      },
    )
  }, [user?.uid, isAdmin])

  if (!user) return null

  const safeView: View =
    !isAdmin && ADMIN_ONLY_VIEWS.includes(view)
      ? 'dashboard'
      : view

  const safeGo = (nextView: View) => {
    if (!isAdmin && ADMIN_ONLY_VIEWS.includes(nextView)) {
      go('dashboard')
      return
    }

    go(nextView)
  }

  const items: [string, string, View][] = isAdmin
    ? [
        ['grid', 'Overview', 'admin'],
        ['user', 'User Management', 'users'],
        ['game', 'Game Management', 'manage-games'],
        ['play', 'Hero Banner', 'manage-hero'],
        ['chat', 'Chat Management', 'admin-messages'],
        ['heart', 'Social Links', 'social-links'],
      ]
    : [
        ['grid', 'Overview', 'dashboard'],
        ['game', 'Explore Games', 'games'],
        ['chat', 'Messages & Support', 'messages'],
        ['bell', 'Notifications', 'notifications'],
        ['heart', 'Social Connections', 'social'],
        ['user', 'My Profile', 'profile'],
        ['settings', 'Settings', 'settings'],
      ]

  return (
    <div className="dash">
      <aside>
        <Logo />

        <div className="sideLabel">
          {isAdmin ? 'ADMIN CONSOLE' : 'PLAYER SPACE'}
        </div>

        <nav>
          {items.map((item) => (
            <button
              key={item[2]}
              className={safeView === item[2] ? 'active' : ''}
              onClick={() => safeGo(item[2])}
              type="button"
            >
              <Icon name={item[0]} />
              <span>{item[1]}</span>
            </button>
          ))}
        </nav>

        <div className="sideBottom">
          {isAdmin && (
            <button
              onClick={() => safeGo('admin')}
              type="button"
            >
              <Icon name="shield" /> Admin Preview
            </button>
          )}

          <ProfileAvatar
            user={user}
            profile={profile}
            go={safeGo}
            onLogout={logout}
          />
        </div>
      </aside>

      <div className="dashMain">
        <header>
          <button className="dashMenu" type="button">
            <Icon name="menu" />
          </button>

          <div className="search">
            <Icon name="search" size={18} />

            <input
              placeholder="Search games, messages, help..."
              aria-label="Search"
            />
          </div>

          <div className="headerBtns">
            {!isAdmin && (
              <button
                type="button"
                className="notificationHeaderButton"
                onClick={() => safeGo('notifications')}
                aria-label={`Open notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
                title="Notifications"
              >
                <Icon name="bell" />
                {unreadNotifications > 0 && <i />}
                {unreadNotifications > 0 && (
                  <span className="notificationCount">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>
            )}

            <ProfileAvatar
              user={user}
              profile={profile}
              go={safeGo}
              onLogout={logout}
            />
          </div>
        </header>

        <div className="dashContent">
          {isAdmin ? (
            <AdminPage view={safeView} go={safeGo} />
          ) : (
            <UserPage view={safeView} go={safeGo} />
          )}
        </div>
      </div>
    </div>
  )
}

// ==========================================
// USER DASHBOARD CONTENT
// ==========================================

function UserPage({
  view,
  go,
}: {
  view: View
  go: (v: View) => void
}) {
  const { profile } = useAuth()

  if (view === 'messages') return <Messages />
  if (view === 'social') return <Social />
  if (view === 'games') return <Games go={go} />

  if (view === 'profile' || view === 'settings') {
    return (
      <Settings
        profile={view === 'profile'}
        go={go}
      />
    )
  }

  if (view === 'notifications') return <NotificationsView />

  return (
    <>
      <div className="welcome">
        <div>
          <span className="kicker">
            YOUR PLAYER SPACE
          </span>

          <h1>
            Welcome back,{' '}
            {profile?.displayName ||
              profile?.name ||
              'Player'}
            !
          </h1>

          <p>Here’s what’s happening in your gaming world.</p>
        </div>

        <Button onClick={() => go('games')}>
          Explore games <Icon name="arrow" size={16} />
        </Button>
      </div>

      <div className="feature">
        <img src={hero} alt="Gaming community" />
        <div className="featureShade" />

        <div>
          <span className="tag">EXPLORE THE COMMUNITY</span>
          <h2>Discover your next game</h2>

          <p>
            Find your next favorite world and connect with other
            players.
          </p>

          <Button onClick={() => go('games')}>
            <Icon name="play" size={15} /> Explore games
          </Button>
        </div>

        <small>Games • Community • Discovery</small>
      </div>

      <div className="dashGrid">
        <section>
          <div className="widgetHead">
            <h3>Your gaming library</h3>

            <button
              onClick={() => go('profile')}
              type="button"
            >
              View profile →
            </button>
          </div>

          <div className="announcement">
            <span>YOUR COLLECTION</span>

            <h4>Build your personal game library</h4>

            <p>
              Save your favorite games and find your recently
              opened games inside My Profile.
            </p>

            <button
              type="button"
              onClick={() => go('profile')}
            >
              View my games →
            </button>
          </div>
        </section>

        <section>
          <div className="widgetHead">
            <h3>Discover games</h3>

            <button
              onClick={() => go('games')}
              type="button"
            >
              Browse →
            </button>
          </div>

          <div className="announcement">
            <span>GAME DISCOVERY</span>

            <h4>Find something new to play</h4>

            <p>
              Browse the published games and explore their
              descriptions and supported platforms.
            </p>

            <Button onClick={() => go('games')}>
              Explore games <Icon name="arrow" size={15} />
            </Button>
          </div>
        </section>
      </div>

      <div className="quick">
        <button onClick={() => go('messages')} type="button">
          <span>
            <Icon name="chat" />
          </span>

          <div>
            <b>Message support</b>
            <small>We’re here to help</small>
          </div>

          <Icon name="arrow" />
        </button>

        <button onClick={() => go('social')} type="button">
          <span>
            <Icon name="arrow" />
          </span>

          <div>
            <b>Join the community</b>
            <small>Find us on social</small>
          </div>

          <Icon name="arrow" />
        </button>

        <button onClick={() => go('profile')} type="button">
          <span>
            <Icon name="user" />
          </span>

          <div>
            <b>Complete your profile</b>
            <small>Manage your player information</small>
          </div>

          <Icon name="arrow" />
        </button>
      </div>
    </>
  )
}

// ==========================================
// LIVE USER NOTIFICATIONS
// ==========================================

type UserNotification = {
  id: string
  title: string
  body: string
  type: string
  read: boolean
  createdAt?: any
}

function NotificationsView() {
  const { user } = useAuth()
  const [items, setItems] = useState<UserNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.uid) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    const notificationsQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50),
    )

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setItems(
          snapshot.docs.map((notificationDoc) => {
            const data = notificationDoc.data()
            return {
              id: notificationDoc.id,
              title: typeof data.title === 'string' ? data.title : 'Account update',
              body: typeof data.body === 'string' ? data.body : '',
              type: typeof data.type === 'string' ? data.type : 'general',
              read: data.read === true,
              createdAt: data.createdAt,
            }
          }),
        )
        setLoading(false)
        setError('')
      },
      (snapshotError) => {
        console.error('Notification subscription failed:', snapshotError)
        setError('Notifications could not be loaded. Check your Firestore rules and try again.')
        setLoading(false)
      },
    )
  }, [user?.uid])

  const markRead = async (notificationId: string) => {
    if (!user?.uid) return
    try {
      await updateDoc(
        doc(db, 'users', user.uid, 'notifications', notificationId),
        { read: true, readAt: serverTimestamp() },
      )
    } catch (markError) {
      console.error('Could not mark notification as read:', markError)
      setError('Could not update the notification. Please try again.')
    }
  }

  const markAllRead = async () => {
    if (!user?.uid) return
    const unreadItems = items.filter((item) => !item.read)
    if (!unreadItems.length) return

    try {
      for (let offset = 0; offset < unreadItems.length; offset += 400) {
        const batch = writeBatch(db)
        unreadItems.slice(offset, offset + 400).forEach((item) => {
          batch.update(
            doc(db, 'users', user.uid, 'notifications', item.id),
            { read: true, readAt: serverTimestamp() },
          )
        })
        await batch.commit()
      }
    } catch (markError) {
      console.error('Could not mark all notifications as read:', markError)
      setError('Some notifications could not be marked as read.')
    }
  }

  const unreadCount = items.filter((item) => !item.read).length

  return (
    <>
      <PageTitle
        kicker="STAY IN THE LOOP"
        title="Notifications"
        sub="Your latest account, verification, and support updates."
      />

      {error && <div className="supportChatError" role="alert">{error}</div>}

      <section className="panel noticeList liveNoticeList">
        <div className="liveNoticeHeader">
          <div>
            <h3>Recent activity</h3>
            <p>{unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}</p>
          </div>
          <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0 || loading}>
            Mark all as read
          </button>
        </div>

        {loading ? (
          <div className="notificationState"><span className="gameSpinner" /> Loading your notifications...</div>
        ) : items.length === 0 ? (
          <div className="notificationState">
            <Icon name="bell" size={28} />
            <b>You are all caught up</b>
            <p>New support replies and account updates will appear here.</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              className={`notice liveNotice ${item.read ? 'isRead' : 'isUnread'}`}
              key={item.id}
              type="button"
              onClick={() => !item.read && void markRead(item.id)}
              aria-label={`${item.read ? 'Read' : 'Unread'} notification: ${item.title}`}
            >
              <span><Icon name={item.type === 'verification' ? 'shield' : item.type === 'support' ? 'chat' : 'bell'} /></span>
              <div>
                <b>{item.title}</b>
                <p>{item.body}</p>
                <small>{formatRelativeDate(item.createdAt) || 'Just now'}</small>
              </div>
              {!item.read && <i aria-label="Unread" />}
            </button>
          ))
        )}
      </section>
    </>
  )
}

// ==========================================
// COMMON PAGE TITLE
// ==========================================

export const PageTitle = ({
  kicker,
  title,
  sub,
}: {
  kicker: string
  title: string
  sub: string
}) => (
  <div className="pageTitle">
    <span className="kicker">{kicker}</span>
    <h1>{title}</h1>
    <p>{sub}</p>
  </div>
)

// ==========================================
// EXPLORE GAMES
// ==========================================

function Games({ go }: { go: (v: View) => void }) {
  const { user } = useAuth()

  const {
    games,
    loading,
    error,
  } = usePublishedGames()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] =
    useState('All games')
  const [sortOrder, setSortOrder] = useState('newest')

  const [favorites, setFavorites] =
    useState<UserGameRecord[]>([])

  const [selectedGame, setSelectedGame] =
    useState<GameRecord | null>(null)

  const [favoriteLoading, setFavoriteLoading] =
    useState<string | null>(null)

  const [actionError, setActionError] = useState('')
  const [playNotice, setPlayNotice] = useState('')

  // LOAD USER FAVORITES

  useEffect(() => {
    if (!user?.uid) {
      setFavorites([])
      return
    }

    const favoritesRef = collection(
      db,
      'users',
      user.uid,
      'favorites',
    )

    const unsubscribe = onSnapshot(
      favoritesRef,
      (snapshot) => {
        const records = snapshot.docs.map((favoriteDoc) =>
          normalizeUserGame(
            favoriteDoc.id,
            favoriteDoc.data(),
          ),
        )

        setFavorites(records)
      },
      (err) => {
        console.error('Favorites loading error:', err)
        setActionError(
          'Could not load your favorites. Check your Firestore rules.',
        )
      },
    )

    return unsubscribe
  }, [user?.uid])

  // CATEGORY FILTERS FROM FIRESTORE DATA

  const categories = Array.from(
    new Set(
      games.flatMap((game) => game.categories),
    ),
  ).sort((a, b) => a.localeCompare(b))

  // FILTER AND SEARCH GAMES

  const filteredGames = games
    .filter((game) => {
      const search = searchTerm.trim().toLowerCase()

      const matchesSearch =
        !search ||
        game.title.toLowerCase().includes(search) ||
        game.description.toLowerCase().includes(search) ||
        game.categories.some((category) =>
          category.toLowerCase().includes(search),
        ) ||
        game.platforms.some((platform) =>
          platform.toLowerCase().includes(search),
        )

      const matchesCategory =
        selectedCategory === 'All games' ||
        game.categories.some(
          (category) =>
            category.toLowerCase() ===
            selectedCategory.toLowerCase(),
        )

      return matchesSearch && matchesCategory
    })
    .sort((a, b) => {
      if (sortOrder === 'az') {
        return a.title.localeCompare(b.title)
      }

      if (sortOrder === 'za') {
        return b.title.localeCompare(a.title)
      }

      return (
        timestampMillis(b.createdAt) -
        timestampMillis(a.createdAt)
      )
    })

  const isFavorite = (gameId: string) =>
    favorites.some(
      (favorite) => favorite.gameId === gameId,
    )

  // RECORD OPENED / PLAYED GAME

  const recordRecentGame = async (
    game: GameRecord,
    activity: 'opened' | 'played',
  ) => {
    if (!user?.uid) return

    const recentRef = doc(
      db,
      'users',
      user.uid,
      'recentGames',
      game.id,
    )

    const payload: Record<string, any> = {
      gameId: game.id,
      title: game.title,
      description: game.description,
      image: game.image,
      categories: game.categories,
      openedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (activity === 'played') {
      payload.playedAt = serverTimestamp()
    }

    try {
      await setDoc(recentRef, payload, {
        merge: true,
      })
    } catch (err) {
      console.error(
        'Could not update recently played game:',
        err,
      )

      setActionError(
        'Your game activity could not be saved. Check your Firestore rules.',
      )
    }
  }

  // OPEN GAME DETAILS

  const openGameDetails = (game: GameRecord) => {
    setSelectedGame(game)
    setPlayNotice('')
    setActionError('')

    void recordRecentGame(game, 'opened')
  }

  // PLAY GAME

  const handlePlayGame = (game: GameRecord) => {
    void recordRecentGame(game, 'played')

    if (game.playUrl) {
      window.open(
        game.playUrl,
        '_blank',
        'noopener,noreferrer',
      )

      setSelectedGame(null)
      return
    }

    setPlayNotice(
      'A playable link has not been configured for this game yet.',
    )
  }

  // ADD / REMOVE FAVORITE

  const toggleFavorite = async (game: GameRecord) => {
    if (!user?.uid) {
      setActionError(
        'Please sign in to save favorite games.',
      )
      return
    }

    setFavoriteLoading(game.id)
    setActionError('')

    const favoriteRef = doc(
      db,
      'users',
      user.uid,
      'favorites',
      game.id,
    )

    try {
      if (isFavorite(game.id)) {
        await deleteDoc(favoriteRef)
      } else {
        await setDoc(favoriteRef, {
          gameId: game.id,
          title: game.title,
          description: game.description,
          image: game.image,
          categories: game.categories,
          favoritedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      console.error('Favorite update error:', err)

      setActionError(
        'Could not update your favorites. Check your Firestore rules.',
      )
    } finally {
      setFavoriteLoading(null)
    }
  }

  return (
    <>
      <PageTitle
        kicker="YOUR NEXT ADVENTURE"
        title="Explore games"
        sub="Discover published games, explore details, and build your own favorites library."
      />

      {/* SEARCH AND SORT */}

      <div className="gameExploreControls">
        <div className="search gameSearch">
          <Icon name="search" size={18} />

          <input
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="Search games, genres, platforms..."
            aria-label="Search games"
          />
        </div>

        <select
          value={sortOrder}
          onChange={(event) =>
            setSortOrder(event.target.value)
          }
          aria-label="Sort games"
        >
          <option value="newest">Newest first</option>
          <option value="az">Name: A to Z</option>
          <option value="za">Name: Z to A</option>
        </select>
      </div>

      {/* DYNAMIC CATEGORY FILTER */}

      <div className="filter">
        <button
          className={
            selectedCategory === 'All games' ? 'active' : ''
          }
          type="button"
          onClick={() => setSelectedCategory('All games')}
        >
          All games
        </button>

        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={
              selectedCategory === category ? 'active' : ''
            }
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="supportChatError" role="alert">
          <Icon name="shield" size={16} />

          <span>{actionError}</span>

          <button
            type="button"
            onClick={() => setActionError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="supportChatEmpty">
          <span className="gameSpinner" />
          <p>Loading published games...</p>
        </div>
      ) : error ? (
        <div className="supportChatError" role="alert">
          {error}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="panel gameExploreEmpty">
          <span>
            <Icon name="game" size={32} />
          </span>

          <h3>
            {games.length === 0
              ? 'No published games yet'
              : 'No games found'}
          </h3>

          <p>
            {games.length === 0
              ? 'Games published by the administrator will appear here.'
              : 'Try another search term or select a different category.'}
          </p>

          {games.length > 0 && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSearchTerm('')
                setSelectedCategory('All games')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="gameResultsCount">
            <small>
              Showing {filteredGames.length}{' '}
              {filteredGames.length === 1 ? 'game' : 'games'}
            </small>
          </div>

          <div className="exploreGrid">
            {filteredGames.map((game) => {
              const favorite = isFavorite(game.id)

              return (
                <article key={game.id}>
                  <div className="gameCardImage">
                    <img
                      src={game.image || hero}
                      alt={game.title}
                      loading="lazy"
                    />

                    <button
                      type="button"
                      className="gameCardPlay"
                      onClick={() => openGameDetails(game)}
                      aria-label={`View ${game.title}`}
                    >
                      <Icon name="play" />
                    </button>

                    <button
                      type="button"
                      className="gameFavoriteButton"
                      disabled={
                        favoriteLoading === game.id
                      }
                      onClick={() =>
                        void toggleFavorite(game)
                      }
                      aria-label={
                        favorite
                          ? `Remove ${game.title} from favorites`
                          : `Add ${game.title} to favorites`
                      }
                      aria-pressed={favorite}
                      title={
                        favorite
                          ? 'Remove from favorites'
                          : 'Add to favorites'
                      }
                    >
                      <Icon name="heart" size={18} />
                    </button>
                  </div>

                  <span>
                    {game.categories[0] || 'GAME'}
                  </span>

                  <h3>{game.title}</h3>

                  <p>
                    {game.description ||
                      game.categories.join(' • ') ||
                      'Explore this game and learn more.'}
                  </p>

                  <div className="gameCardActions">
                    <button
                      type="button"
                      onClick={() => openGameDetails(game)}
                    >
                      View details →
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void toggleFavorite(game)
                      }
                      disabled={
                        favoriteLoading === game.id
                      }
                      aria-label={
                        favorite
                          ? 'Remove from favorites'
                          : 'Add to favorites'
                      }
                    >
                      {favorite ? 'Saved ♥' : 'Save ♡'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {/* GAME DETAILS POPUP */}

      {selectedGame && (
        <div
          className="gameDetailOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedGame(null)
            }
          }}
        >
          <div
            className="gameDetailCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-detail-title"
          >
            <button
              type="button"
              className="gameDetailClose"
              onClick={() => setSelectedGame(null)}
              aria-label="Close game details"
            >
              <Icon name="close" />
            </button>

            <div className="gameDetailImage">
              <img
                src={selectedGame.image || hero}
                alt={selectedGame.title}
              />
            </div>

            <div className="gameDetailContent">
              <div className="gameDetailTags">
                {selectedGame.categories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
              </div>

              <h2 id="game-detail-title">
                {selectedGame.title}
              </h2>

              <p className="gameDetailDescription">
                {selectedGame.description ||
                  'No description has been added for this game yet.'}
              </p>

              {selectedGame.platforms.length > 0 && (
                <div className="gameDetailMeta">
                  <b>Available platforms</b>

                  <p>
                    {selectedGame.platforms.join(' • ')}
                  </p>
                </div>
              )}

              {selectedGame.releaseDate && (
                <div className="gameDetailMeta">
                  <b>Release date</b>

                  <p>{selectedGame.releaseDate}</p>
                </div>
              )}

              {playNotice && (
                <div
                  className="supportChatError"
                  role="status"
                >
                  {playNotice}
                </div>
              )}

              <div className="gameDetailActions">
                <Button
                  onClick={() =>
                    handlePlayGame(selectedGame)
                  }
                >
                  <Icon name="play" size={16} />
                  Play game
                </Button>

                <Button
                  secondary
                  onClick={() =>
                    void toggleFavorite(selectedGame)
                  }
                >
                  <Icon name="heart" size={16} />

                  {isFavorite(selectedGame.id)
                    ? 'Remove favorite'
                    : 'Add to favorites'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ==========================================
// MESSAGES & SUPPORT — PRIVATE USER CHAT
// ==========================================

function Messages() {
  const { user } = useAuth()

  const [conversationExists, setConversationExists] =
    useState(false)

  const [conversation, setConversation] =
    useState<Record<string, any> | null>(null)

  const [conversationReady, setConversationReady] =
    useState(false)

  const [messages, setMessages] =
    useState<SupportMessage[]>([])

  const [messagesLoading, setMessagesLoading] =
    useState(true)

  const [draft, setDraft] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')

  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!user?.uid) {
      setConversationReady(true)
      return
    }

    setConversationReady(false)

    const conversationRef = doc(
      db,
      SUPPORT_COLLECTION,
      user.uid,
    )

    const unsubscribe = onSnapshot(
      conversationRef,
      (snapshot) => {
        setConversationExists(snapshot.exists())

        setConversation(
          snapshot.exists() ? snapshot.data() : null,
        )

        setConversationReady(true)
      },
      (error) => {
        console.error(
          'Support conversation error:',
          error,
        )

        setChatError(
          'Could not load your support conversation. Please refresh and try again.',
        )

        setConversationReady(true)
      },
    )

    return unsubscribe
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return

    setMessagesLoading(true)

    const messagesQuery = query(
      collection(
        db,
        SUPPORT_COLLECTION,
        user.uid,
        'messages',
      ),
      orderBy('createdAt', 'desc'),
      limit(100),
    )

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const records: SupportMessage[] =
          snapshot.docs
            .map(
              (messageDoc) =>
                ({
                  id: messageDoc.id,
                  ...messageDoc.data(),
                }) as SupportMessage,
            )
            .reverse()

        setMessages(records)
        setMessagesLoading(false)
      },
      (error) => {
        console.error('Support messages error:', error)

        setChatError(
          'Could not load messages. Please check your connection and Firestore permissions.',
        )

        setMessagesLoading(false)
      },
    )

    return unsubscribe
  }, [user?.uid])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages])

  const sendMessage = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!user?.uid || sending || !conversationReady) return

    const text = draft.trim()

    if (!text && !imageFile) return

    if (text.length > 4000) {
      setChatError(
        'Messages cannot exceed 4,000 characters.',
      )
      return
    }

    setSending(true)
    setChatError('')

    try {
      let imageUrl = ''

      if (imageFile) {
        imageUrl = await uploadSupportImage(imageFile)
      }

      const messageType = imageUrl ? 'image' : 'text'

      const conversationRef = doc(
        db,
        SUPPORT_COLLECTION,
        user.uid,
      )

      const messageRef = doc(
        collection(conversationRef, 'messages'),
      )

      const batch = writeBatch(db)

      batch.set(messageRef, {
        senderId: user.uid,
        senderRole: 'user',
        type: messageType,
        text,
        imageUrl,
        createdAt: serverTimestamp(),
      })

      const preview =
        messageType === 'image'
          ? text
            ? `📷 ${text}`
            : '📷 Image'
          : text

      batch.set(
        conversationRef,
        {
          userId: user.uid,
          status: 'open',
          lastMessage: preview,
          lastMessageType: messageType,
          lastMessageSenderId: user.uid,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          ...(!conversationExists
            ? { createdAt: serverTimestamp() }
            : {}),
        },
        { merge: true },
      )

      await batch.commit()

      setDraft('')
      setImageFile(null)

      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    } catch (error) {
      console.error(
        'Could not send support message:',
        error,
      )

      setChatError(
        error instanceof Error
          ? error.message
          : 'Message could not be sent. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  const handleImageSelect = (file: File | null) => {
    if (!file) return

    setChatError('')

    if (!file.type.startsWith('image/')) {
      setChatError('Please select an image file.')
      return
    }

    if (file.size > SUPPORT_IMAGE_MAX_SIZE) {
      setChatError('Image must be 5 MB or smaller.')
      return
    }

    setImageFile(file)
  }

  const lastMessage =
    messages.length > 0
      ? messages[messages.length - 1]
      : null

  const preview =
    conversation?.lastMessage ||
    lastMessage?.text ||
    'Start a private conversation with our team.'

  return (
    <>
      <PageTitle
        kicker="WE’RE HERE TO HELP"
        title="Messages & support"
        sub="Your private conversation with the playwithnicole Support Team."
      />

      {chatError && (
        <div className="supportChatError" role="alert">
          <Icon name="shield" size={16} />

          <span>{chatError}</span>

          <button
            onClick={() => setChatError('')}
            type="button"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="messenger supportMessenger">
        <div className="convos supportConversationSidebar">
          <div className="widgetHead">
            <h3>Your support</h3>
            <span className="supportPrivateLabel">
              PRIVATE
            </span>
          </div>

          <button
            className="selected supportConversationItem"
            type="button"
          >
            <span className="av supportAvatar">
              S
              <i />
            </span>

            <div>
              <b>Support Team</b>
              <p>{preview}</p>
            </div>

            <span className="supportConversationDot" />
          </button>

          <div className="supportSidebarNote">
            <Icon name="shield" size={15} />

            <span>
              Only you and the Support Team can access this
              conversation.
            </span>
          </div>
        </div>

        <div className="chat supportChat">
          <div className="chatHead supportChatHead">
            <span className="av supportAvatar supportHeaderAvatar">
              S
              <i />
            </span>

            <div>
              <b>Support Team</b>

              <small>
                <span className="supportOnlineDot" />
                Online • Usually replies quickly
              </small>
            </div>

            <span className="supportPrivatePill">
              <Icon name="shield" size={13} />
              Private
            </span>
          </div>

          <div className="messages supportMessages">
            {!conversationReady || messagesLoading ? (
              <div className="supportChatEmpty">
                <span className="gameSpinner" />
                <p>Loading your conversation...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="supportChatEmpty">
                <span className="supportEmptyIcon">
                  <Icon name="chat" size={25} />
                </span>

                <h3>Start a conversation</h3>

                <p>
                  Send us a message and our Support Team will reply
                  here. Your conversation is private.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`bubble ${
                    message.senderRole === 'admin'
                      ? 'in'
                      : 'out'
                  } supportBubble`}
                >
                  <small className="supportSenderLabel">
                    {message.senderRole === 'admin'
                      ? 'Support Team'
                      : 'You'}
                  </small>

                  {message.type === 'image' &&
                    message.imageUrl && (
                      <a
                        href={message.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="supportMessageImageLink"
                      >
                        <img
                          src={message.imageUrl}
                          alt="Attachment sent in support chat"
                          className="supportMessageImage"
                          loading="lazy"
                        />
                      </a>
                    )}

                  {message.text && (
                    <p className="supportMessageText">
                      {message.text}
                    </p>
                  )}

                  <time>
                    {formatSupportTime(message.createdAt)}
                  </time>
                </div>
              ))
            )}

            <div ref={bottomRef} />
          </div>

          {conversation?.status === 'resolved' && (
            <div className="supportResolvedNotice">
              This conversation was marked as resolved. Sending a
              new message will reopen it.
            </div>
          )}

          {imageFile && (
            <div className="supportPendingImage">
              <Icon name="game" size={14} />

              <span>{imageFile.name}</span>

              <button
                type="button"
                onClick={() => {
                  setImageFile(null)

                  if (imageInputRef.current) {
                    imageInputRef.current.value = ''
                  }
                }}
              >
                Remove
              </button>
            </div>
          )}

          <form
            className="compose supportCompose"
            onSubmit={sendMessage}
          >
            <label
              className="supportAttachButton"
              title="Attach an image"
            >
              ＋

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                disabled={sending}
                onChange={(event) => {
                  handleImageSelect(
                    event.target.files?.[0] ?? null,
                  )

                  event.currentTarget.value = ''
                }}
              />
            </label>

            <input
              value={draft}
              maxLength={4000}
              onChange={(event) =>
                setDraft(event.target.value)
              }
              placeholder="Write a message..."
              aria-label="Write a message"
              disabled={sending || !conversationReady}
            />

            <button
              type="submit"
              className="send"
              disabled={
                sending ||
                (!draft.trim() && !imageFile) ||
                !conversationReady
              }
              aria-label="Send message"
            >
              {sending ? (
                <span className="supportSendingDot" />
              ) : (
                <Icon name="send" size={17} />
              )}
            </button>
          </form>
        </div>

        <div className="ticket supportPrivacyCard">
          <span>
            <Icon name="shield" />
          </span>

          <h3>Private support</h3>

          <p>
            This is your personal support channel. Other players
            cannot see your messages or reply to this conversation.
          </p>

          <div className="supportPrivacyStatus">
            <i />
            <b>Secure conversation</b>
          </div>
        </div>
      </div>
    </>
  )
}

// ==========================================
// SOCIAL CONNECTIONS — FIRESTORE
// ==========================================

function Social() {
  const {
    activeChannels,
    loading,
    error,
  } = useSocialLinks()

  return (
    <>
      <PageTitle
        kicker="STAY CONNECTED"
        title="Social connections"
        sub="Follow official playwithnicole channels for news, events, and conversation."
      />

      {loading ? (
        <div className="supportChatEmpty">
          <span className="gameSpinner" />
          <p>Fetching your community links...</p>
        </div>
      ) : error ? (
        <div className="supportChatError" role="alert">
          <Icon name="shield" size={18} />
          <span>{error}</span>
        </div>
      ) : activeChannels.length === 0 ? (
        <div className="socialEmptyState">
          <span className="socialEmptyIcon">
            <Icon name="heart" size={30} />
          </span>

          <h3>No community links available</h3>

          <p>
            There are currently no enabled community links.
            Please check back later.
          </p>
        </div>
      ) : (
        <>
          <div className="socialResultsHeader">
            <div>
              <h2>Our official communities</h2>
              <p>Choose a platform to connect with us.</p>
            </div>

            <span>
              {activeChannels.length} active{' '}
              {activeChannels.length === 1
                ? 'channel'
                : 'channels'}
            </span>
          </div>

          <div className="socialGrid">
            {activeChannels.map((channel) => (
              <article key={channel.key}>
                <span
                  className={`socialIcon socialIcon--${channel.key}`}
                >
                  {channel.icon}
                </span>

                <div className="official">
                  <i />
                  OFFICIAL COMMUNITY
                </div>

                <h2>{channel.name}</h2>

                <p>{channel.description}</p>

                <small>
                  Opens the official {channel.name} community
                  in a new tab.
                </small>

                <a
                  className="btn secondary socialVisitButton"
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {channel.key === 'instagram'
                    ? 'Open profile'
                    : 'Visit community'}

                  <Icon name="arrow" size={16} />
                </a>
              </article>
            ))}
          </div>

          <div className="safe">
            <Icon name="shield" />

            <div>
              <b>Connect safely</b>

              <p>
                These official links are configured by the
                playwithnicole administrator. Never share your
                password with external community pages.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ==========================================
// PROFILE AND SETTINGS
// ==========================================

function Settings({
  profile: isProfile,
  go,
}: {
  profile: boolean
  go: (v: View) => void
}) {
  const {
    user,
    profile,
    emailVerified,
    refreshEmailVerification: syncEmailVerification,
  } = useAuth()

  const [saved, setSaved] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [photoURL, setPhotoURL] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')

  const [favorites, setFavorites] =
    useState<UserGameRecord[]>([])

  const [recentGames, setRecentGames] =
    useState<UserGameRecord[]>([])

  const [libraryError, setLibraryError] = useState('')

  const [emailNotifications, setEmailNotifications] = useState(true)
  const [communityUpdates, setCommunityUpdates] = useState(true)
  const [profileVisible, setProfileVisible] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [securityBusy, setSecurityBusy] = useState(false)
  const [securityMessage, setSecurityMessage] = useState('')
  const [securityError, setSecurityError] = useState('')

  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null)
  const [totpQrCode, setTotpQrCode] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [mfaRevision, setMfaRevision] = useState(0)
  const [stepUpResolver, setStepUpResolver] = useState<any>(null)
  const [stepUpAction, setStepUpAction] = useState<'password' | 'enroll' | 'disable' | null>(null)
  const [stepUpCode, setStepUpCode] = useState('')

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteUsername, setDeleteUsername] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  const hasPasswordProvider = Boolean(
    user?.providerData.some((provider) => provider.providerId === 'password'),
  )
  const hasGoogleProvider = Boolean(
    user?.providerData.some((provider) => provider.providerId === 'google.com'),
  )
  const isGoogleOnlyAccount = hasGoogleProvider && !hasPasswordProvider
  const enrolledTotpFactor = user
    ? multiFactor(user).enrolledFactors.find(
        (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      )
    : undefined
  // Keep this dependency so successful enrollment/unenrollment refreshes this derived value.
  void mfaRevision

  // LOAD REAL PROFILE DATA

  useEffect(() => {
    if (!isProfile) return

    setDisplayName(
      profile?.displayName ||
        profile?.name ||
        user?.displayName ||
        '',
    )

    setUsername(profile?.username || '')
    setBio(profile?.bio || '')

    setPhotoURL(
      profile?.photoURL ||
        user?.photoURL ||
        '',
    )

    setPhotoFile(null)
    setPhotoPreview('')
  }, [
    isProfile,
    user?.uid,
    user?.displayName,
    user?.photoURL,
    profile?.displayName,
    profile?.name,
    profile?.username,
    profile?.bio,
    profile?.photoURL,
  ])

  useEffect(() => {
    const preferences = profile?.preferences || {}
    setEmailNotifications(preferences.emailNotifications !== false)
    setCommunityUpdates(preferences.communityUpdates !== false)
    setProfileVisible(preferences.profileVisible !== false)
  }, [profile?.preferences])

  // LISTEN TO FAVORITES AND RECENT GAMES

  useEffect(() => {
    if (!isProfile || !user?.uid) {
      setFavorites([])
      setRecentGames([])
      return
    }

    setLibraryError('')

    const favoritesRef = collection(
      db,
      'users',
      user.uid,
      'favorites',
    )

    const recentRef = collection(
      db,
      'users',
      user.uid,
      'recentGames',
    )

    const unsubscribeFavorites = onSnapshot(
      favoritesRef,
      (snapshot) => {
        const records = snapshot.docs.map((favoriteDoc) =>
          normalizeUserGame(
            favoriteDoc.id,
            favoriteDoc.data(),
          ),
        )

        records.sort(
          (a, b) =>
            timestampMillis(b.favoritedAt) -
            timestampMillis(a.favoritedAt),
        )

        setFavorites(records)
      },
      (error) => {
        console.error(
          'Profile favorites error:',
          error,
        )

        setLibraryError(
          'Unable to load favorites. Check your Firestore rules.',
        )
      },
    )

    const unsubscribeRecent = onSnapshot(
      recentRef,
      (snapshot) => {
        const records = snapshot.docs.map((recentDoc) =>
          normalizeUserGame(
            recentDoc.id,
            recentDoc.data(),
          ),
        )

        records.sort(
          (a, b) =>
            Math.max(
              timestampMillis(b.playedAt),
              timestampMillis(b.openedAt),
            ) -
            Math.max(
              timestampMillis(a.playedAt),
              timestampMillis(a.openedAt),
            ),
        )

        setRecentGames(records)
      },
      (error) => {
        console.error(
          'Profile recent games error:',
          error,
        )

        setLibraryError(
          'Unable to load recently played games. Check your Firestore rules.',
        )
      },
    )

    return () => {
      unsubscribeFavorites()
      unsubscribeRecent()
    }
  }, [isProfile, user?.uid])

  // PROFILE PHOTO PREVIEW

  useEffect(() => {
    if (!photoPreview.startsWith('blob:')) {
      return
    }

    return () => {
      URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // SAVE PROFILE TO FIRESTORE

  const saveProfile = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!user?.uid || savingProfile) return

    const cleanName = displayName.trim()
    const cleanUsername = username
      .trim()
      .replace(/^@/, '')
    const cleanBio = bio.trim()

    if (!cleanName) {
      setSaveError('Please enter your full name.')
      return
    }

    if (
      cleanUsername &&
      !/^[a-zA-Z0-9_.]{3,24}$/.test(cleanUsername)
    ) {
      setSaveError(
        'Username must be 3–24 characters and can contain letters, numbers, underscores, and periods.',
      )
      return
    }

    setSavingProfile(true)
    setSaveError('')
    setSaved('')

    try {
      let finalPhotoURL = photoURL

      if (photoFile) {
        finalPhotoURL = await uploadCloudinaryImage(
          photoFile,
          'playwithnicole/profiles',
        )
      }

      const profileRef = doc(
        db,
        'users',
        user.uid,
      )

      const profileUpdates: Record<string, any> = {
        displayName: cleanName,
        name: cleanName,
        username: cleanUsername,
        bio: cleanBio,
        photoURL: finalPhotoURL,
        updatedAt: serverTimestamp(),
      }

      const currentProfile = await getDoc(profileRef)

      if (currentProfile.exists()) {
        await updateDoc(
          profileRef,
          profileUpdates,
        )
      } else {
        // Do not assign a role from the client.
        // Firestore rules restrict role assignment to admins.
        await setDoc(profileRef, {
          ...profileUpdates,
          createdAt: serverTimestamp(),
        })
      }

      setPhotoURL(finalPhotoURL)
      setPhotoFile(null)
      setPhotoPreview('')
      setSaved('Profile updated successfully.')
    } catch (error) {
      console.error('Profile save error:', error)

      setSaveError(
        error instanceof Error
          ? error.message
          : 'Could not update your profile. Please try again.',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  // REMOVE FAVORITE

  const removeFavorite = async (gameId: string) => {
    if (!user?.uid) return

    try {
      await deleteDoc(
        doc(
          db,
          'users',
          user.uid,
          'favorites',
          gameId,
        ),
      )

      setSaved('Game removed from favorites.')
    } catch (error) {
      console.error(
        'Could not remove favorite:',
        error,
      )

      setSaveError(
        'Could not remove this favorite. Check your Firestore rules.',
      )
    }
  }

  // SAVE GENERAL SETTINGS MESSAGE

  const save = (message: string) => {
    setSaved(message)
    window.setTimeout(() => setSaved(''), 2200)
  }

  const activePhoto =
    photoPreview ||
    photoURL ||
    ''

  const currentName =
    displayName ||
    user?.displayName ||
    user?.email ||
    'Player'

  const initials = currentName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  const verified =
    profile?.verified === true ||
    profile?.verified === 1

  const profileCompletion = Math.round(
    (
      Number(Boolean(displayName.trim())) +
      Number(Boolean(username.trim())) +
      Number(Boolean(bio.trim())) +
      Number(Boolean(activePhoto))
    ) / 4 * 100,
  )

  const updatePreference = async (
    field: 'emailNotifications' | 'communityUpdates' | 'profileVisible',
    value: boolean,
  ) => {
    if (!user?.uid) return
    const nextPreferences = {
      emailNotifications,
      communityUpdates,
      profileVisible,
      [field]: value,
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        preferences: nextPreferences,
        updatedAt: serverTimestamp(),
      })
      if (field === 'emailNotifications') setEmailNotifications(value)
      if (field === 'communityUpdates') setCommunityUpdates(value)
      if (field === 'profileVisible') setProfileVisible(value)
      setSaved('Preferences saved.')
      setTimeout(() => setSaved(''), 2000)
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not save this preference.')
    }
  }

  const refreshMfaState = async () => {
    if (auth.currentUser) {
      await reload(auth.currentUser)
      setMfaRevision((value) => value + 1)
    }
  }

  const runPostReauthAction = async (
    action: 'password' | 'enroll' | 'disable',
  ) => {
    const currentUser = auth.currentUser
    if (!currentUser) throw new Error('You are no longer signed in. Please sign in again.')

    if (action === 'password') {
      if (newPassword.length < 8) {
        throw new Error('Your new password must contain at least 8 characters.')
      }
      if (newPassword !== confirmNewPassword) {
        throw new Error('The new password and confirmation do not match.')
      }
      await updatePassword(currentUser, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setSecurityMessage('Your password has been updated successfully.')
      return
    }

    if (action === 'enroll') {
      if (!currentUser.emailVerified) {
        throw new Error('Verify your email address before enabling authenticator-based two-factor authentication.')
      }
      const session = await multiFactor(currentUser).getSession()
      const secret = await TotpMultiFactorGenerator.generateSecret(session)
      const uri = secret.generateQrCodeUrl(
        currentUser.email || 'player',
        'PlayWithNicole',
      )
      const qr = await QRCode.toDataURL(uri, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 240,
        color: { dark: '#11111b', light: '#ffffff' },
      })
      setTotpSecret(secret)
      setTotpQrCode(qr)
      setTotpCode('')
      setSecurityMessage('Scan the QR code with your authenticator app, then enter the six-digit code to finish setup.')
      return
    }

    const factor = multiFactor(currentUser).enrolledFactors.find(
      (item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    )
    if (!factor) throw new Error('No authenticator app is currently enrolled.')
    try {
      await multiFactor(currentUser).unenroll(factor)
    } catch (unenrollError) {
      const errorCode =
        unenrollError && typeof unenrollError === 'object' && 'code' in unenrollError
          ? String((unenrollError as { code?: unknown }).code)
          : ''

      // Firebase can expire the current session after the last enrolled
      // second factor is removed. The factor may already be removed; do not
      // attempt a stale reload in that case.
      if (errorCode === 'auth/user-token-expired') {
        setTotpSecret(null)
        setTotpQrCode('')
        setTotpCode('')
        await auth.signOut().catch(() => undefined)
        setSecurityMessage('Two-factor authentication was removed. Firebase signed you out for security; please sign in again.')
        return
      }
      throw unenrollError
    }

    setTotpSecret(null)
    setTotpQrCode('')
    setTotpCode('')
    await refreshMfaState()
    setSecurityMessage('Two-factor authentication has been disabled.')
  }

  const reauthenticateForAction = async (
    action: 'password' | 'enroll' | 'disable',
  ) => {
    const currentUser = auth.currentUser
    if (!currentUser) throw new Error('Please sign in again before changing security settings.')

    setSecurityError('')
    setSecurityMessage('')
    setSecurityBusy(true)

    try {
      if (hasPasswordProvider) {
        if (!currentPassword) {
          throw new Error('Enter your current password to confirm this security change.')
        }
        if (!currentUser.email) throw new Error('Your account does not have an email address.')
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
        await reauthenticateWithCredential(currentUser, credential)
      } else if (hasGoogleProvider) {
        await reauthenticateWithPopup(currentUser, new GoogleAuthProvider())
      } else {
        throw new Error('This account provider does not support this in-app reauthentication flow.')
      }

      await runPostReauthAction(action)
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
      if (code === 'auth/multi-factor-auth-required') {
        try {
          const { getMultiFactorResolver } = await import('firebase/auth')
          const resolver = getMultiFactorResolver(auth, error as any)
          const totpHint = resolver.hints.find(
            (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
          )
          if (!totpHint) throw new Error('No authenticator-app factor was returned for this step-up challenge.')
          setStepUpResolver(resolver)
          setStepUpAction(action)
          setStepUpCode('')
          setSecurityMessage('For your protection, enter a fresh authenticator code to confirm this change.')
        } catch (resolverError) {
          setSecurityError(resolverError instanceof Error ? resolverError.message : 'Could not start the additional verification challenge.')
        }
      } else {
        setSecurityError(error instanceof Error ? error.message : 'The security change could not be completed.')
      }
    } finally {
      setSecurityBusy(false)
    }
  }

  const finishStepUpChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!stepUpResolver || !stepUpAction) return
    if (!/^\d{6}$/.test(stepUpCode)) {
      setSecurityError('Enter the six-digit code from your authenticator app.')
      return
    }

    setSecurityBusy(true)
    setSecurityError('')
    try {
      const factor = stepUpResolver.hints.find(
        (hint: any) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
      )
      if (!factor) throw new Error('The authenticator factor is no longer available.')
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, stepUpCode)
      await stepUpResolver.resolveSignIn(assertion)
      const action = stepUpAction
      setStepUpResolver(null)
      setStepUpAction(null)
      setStepUpCode('')
      await runPostReauthAction(action)
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'The authenticator code could not be verified.')
    } finally {
      setSecurityBusy(false)
    }
  }

  const confirmTotpEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user || !auth.currentUser || !totpSecret) return
    if (!/^\d{6}$/.test(totpCode)) {
      setSecurityError('Enter the six-digit code from your authenticator app.')
      return
    }

    setSecurityBusy(true)
    setSecurityError('')
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode,
      )
      await multiFactor(auth.currentUser).enroll(assertion, 'Authenticator app')
      setTotpSecret(null)
      setTotpQrCode('')
      setTotpCode('')
      await refreshMfaState()
      setSecurityMessage('Two-factor authentication is now enabled for this account.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not verify the authenticator code.')
    } finally {
      setSecurityBusy(false)
    }
  }

  const refreshEmailVerificationStatus = async () => {
    if (!auth.currentUser) return
    setSecurityBusy(true)
    setSecurityError('')
    try {
      const isVerified = await syncEmailVerification()
      setMfaRevision((value) => value + 1)
      setSecurityMessage(isVerified
        ? 'Your email address is verified and your profile has been synchronized. You can now enable authenticator-based MFA.'
        : 'Firebase still reports this email as unverified. Open the latest verification email and try again.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not refresh your email verification status.')
    } finally {
      setSecurityBusy(false)
    }
  }

  const sendVerificationEmail = async () => {
    if (!auth.currentUser) return
    setSecurityBusy(true)
    setSecurityError('')
    try {
      await sendEmailVerification(auth.currentUser, {
        url: `${window.location.origin}/?emailVerified=1`,
      })
      setSecurityMessage('A verification link has been sent to your email address.')
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : 'Could not send the verification email.')
    } finally {
      setSecurityBusy(false)
    }
  }

  const requestAccountDeletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user?.uid || deleteBusy) return

    const expectedUsername = String(profile?.username || '').trim()
    if (!expectedUsername) {
      setSecurityError('Add a username in My Profile before requesting account deletion.')
      setDeleteModalOpen(false)
      return
    }
    if (deleteUsername.trim() !== expectedUsername) {
      setSecurityError('The username does not match your profile. No request was sent.')
      return
    }

    setDeleteBusy(true)
    setSecurityError('')
    try {
      const conversationRef = doc(db, 'supportConversations', user.uid)
      const conversationSnapshot = await getDoc(conversationRef)
      const messageRef = doc(collection(conversationRef, 'messages'))
      const requestRef = doc(collection(db, 'accountDeletionRequests'))
      const messageText = `ACCOUNT DELETION REQUEST\nUsername: ${expectedUsername}\nEmail: ${user.email || 'Not available'}\nRequest: Please review and clear my application data. I understand this action cannot be undone.`
      const batch = writeBatch(db)

      batch.set(messageRef, {
        senderId: user.uid,
        senderRole: 'user',
        type: 'text',
        text: messageText,
        imageUrl: '',
        createdAt: serverTimestamp(),
      })

      batch.set(
        conversationRef,
        {
          userId: user.uid,
          status: 'open',
          lastMessage: 'Account deletion request submitted',
          lastMessageType: 'text',
          lastMessageSenderId: user.uid,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(!conversationSnapshot.exists() ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true },
      )

      batch.set(requestRef, {
        userId: user.uid,
        username: expectedUsername,
        email: user.email || '',
        status: 'pending',
        createdAt: serverTimestamp(),
      })

      await batch.commit()
      setDeleteModalOpen(false)
      setDeleteUsername('')
      setSaved('Your account deletion request has been sent to the Support Team.')
      setTimeout(() => go('messages'), 650)
    } catch (error) {
      console.error('Account deletion request failed:', error)
      setSecurityError(error instanceof Error ? error.message : 'Could not submit the deletion request. Please contact support.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <PageTitle
        kicker="YOUR ACCOUNT"
        title={isProfile ? 'My profile' : 'Account settings'}
        sub={
          isProfile
            ? 'Manage your personal information, profile picture, and game library.'
            : 'Control password, notifications, privacy, and account access.'
        }
      />

      {saved && (
        <div className="toast success" role="status">
          <Icon name="shield" size={16} />
          {saved}
        </div>
      )}

      {saveError && (
        <div className="supportChatError" role="alert">
          <Icon name="shield" size={16} />
          <span>{saveError}</span>

          <button
            type="button"
            onClick={() => setSaveError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {isProfile ? (
        <>
          {libraryError && (
            <div
              className="supportChatError"
              role="alert"
            >
              {libraryError}
            </div>
          )}

          <div className="settingsLayout">
            <form
              className="panel"
              onSubmit={saveProfile}
            >
              <div className="profileTop">
                <span className="bigAvatar">
                  {activePhoto ? (
                    <img
                      src={activePhoto}
                      alt="Profile"
                    />
                  ) : (
                    initials || 'P'
                  )}

                  <label
                    className="avatarEdit"
                    title="Upload profile picture"
                  >
                    ＋

                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        const file =
                          event.target.files?.[0]

                        if (!file) return

                        if (!file.type.startsWith('image/')) {
                          setSaveError(
                            'Please select a valid image.',
                          )
                          return
                        }

                        if (
                          file.size >
                          SUPPORT_IMAGE_MAX_SIZE
                        ) {
                          setSaveError(
                            'Profile pictures must be 5 MB or smaller.',
                          )
                          return
                        }

                        setSaveError('')
                        setPhotoFile(file)

                        setPhotoPreview(
                          URL.createObjectURL(file),
                        )
                      }}
                    />
                  </label>
                </span>

                <div>
                  <h3>{currentName}</h3>

                  <p>
                    {username
                      ? `@${username}`
                      : user?.email || 'Player account'}
                  </p>

                  <small className="helper">
                    JPG, PNG or WebP, up to 5 MB
                  </small>
                </div>
              </div>

              <div className="formGrid">
                <label>
                  Full name

                  <input
                    required
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.target.value)
                    }
                    placeholder="Your full name"
                    maxLength={80}
                  />
                </label>

                <label>
                  Username

                  <input
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value)
                    }
                    placeholder="Choose a username"
                    minLength={3}
                    maxLength={24}
                  />
                </label>

                <label>
                  Email address

                  <input
                    type="email"
                    value={user?.email || ''}
                    readOnly
                    disabled
                  />

                  <small className="helper">
                    Your email is managed by your sign-in
                    provider.
                  </small>
                </label>

                <label>
                  Bio

                  <input
                    value={bio}
                    onChange={(event) =>
                      setBio(event.target.value)
                    }
                    placeholder="Tell the community about yourself"
                    maxLength={160}
                  />
                </label>
              </div>

              <Button type="submit">
                {savingProfile
                  ? 'Saving profile...'
                  : 'Save profile'}
              </Button>
            </form>

            <aside className="profileSide">
              <b>Account status</b>

              <div>
                <Icon name="shield" />

                <span>
                  <b>
                    {verified
                      ? 'Verified'
                      : 'Unverified'}
                  </b>

                  <small>
                    {verified
                      ? 'Your profile has been verified by the Support Team.'
                      : 'Your profile has not been verified yet.'}
                  </small>
                </span>
              </div>

              <hr />

              <small>Profile completion</small>

              <strong>{profileCompletion}%</strong>

              <div className="progress">
                <span
                  style={{
                    width: `${profileCompletion}%`,
                  }}
                />
              </div>

              <hr />

              <small>Verification status</small>
              <strong className={verified ? 'profileStatusText verified' : 'profileStatusText unverified'}>
                {verified ? 'Verified' : 'Unverified'}
              </strong>

              <hr />

              <small>Email address verification</small>
              <strong className={emailVerified ? 'profileStatusText verified' : 'profileStatusText unverified'}>
                {emailVerified ? 'Email verified' : 'Email not verified'}
              </strong>
              <small>
                {emailVerified
                  ? 'Firebase has confirmed ownership of this email address.'
                  : 'Verify your email address to confirm ownership.'}
              </small>

              <small>
                Member since{' '}
                {formatDate(profile?.createdAt) ||
                  'Account date unavailable'}
              </small>
            </aside>
          </div>

          <div className="profileGames">
            <section className="panel">
              <div className="widgetHead">
                <h3>Favorite games</h3>

                <button
                  type="button"
                  onClick={() => go('games')}
                >
                  Explore games →
                </button>
              </div>

              {favorites.length === 0 ? (
                <div className="profileGameEmpty">
                  <Icon name="heart" size={28} />

                  <h4>No favorite games yet</h4>

                  <p>
                    Explore published games and save the ones
                    you love. They will appear here.
                  </p>

                  <Button
                    secondary
                    onClick={() => go('games')}
                  >
                    Explore games
                    <Icon name="arrow" size={15} />
                  </Button>
                </div>
              ) : (
                favorites.map((game) => (
                  <div
                    className="gameMini"
                    key={game.gameId}
                  >
                    <img
                      src={game.image || hero}
                      alt={game.title}
                      loading="lazy"
                    />

                    <div>
                      <b>{game.title}</b>

                      <small>
                        {game.categories.join(' • ') ||
                          'Favorite game'}
                      </small>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${game.title} from favorites`}
                      title="Remove from favorites"
                      onClick={() =>
                        void removeFavorite(game.gameId)
                      }
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="panel">
              <div className="widgetHead">
                <h3>Recently played</h3>

                <button
                  type="button"
                  onClick={() => go('games')}
                >
                  Explore games →
                </button>
              </div>

              {recentGames.length === 0 ? (
                <div className="profileGameEmpty">
                  <Icon name="play" size={28} />

                  <h4>No recent games</h4>

                  <p>
                    Games you open or play will appear here
                    automatically.
                  </p>

                  <Button
                    secondary
                    onClick={() => go('games')}
                  >
                    Find a game
                    <Icon name="arrow" size={15} />
                  </Button>
                </div>
              ) : (
                recentGames.map((game) => (
                  <div
                    className="gameMini"
                    key={game.gameId}
                  >
                    <img
                      src={game.image || hero}
                      alt={game.title}
                      loading="lazy"
                    />

                    <div>
                      <b>{game.title}</b>

                      <small>
                        {game.categories.join(' • ') ||
                          'Recently opened'}
                      </small>

                      <small>
                        {formatRelativeDate(
                          game.playedAt || game.openedAt,
                        )}
                      </small>
                    </div>

                    <button
                      type="button"
                      aria-label={`Explore ${game.title}`}
                      title="Explore games"
                      onClick={() => go('games')}
                    >
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>
                ))
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="settingsLayout">
          <div className="panel settingsSecurityPanel">
            <h3 className="panelTitle">Password &amp; security</h3>

            {isGoogleOnlyAccount ? (
              <div className="googleSecurityNotice">
                <span className="googleSecurityIcon">G</span>
                <div>
                  <b>This account uses Google sign-in</b>
                  <p>Your password is managed securely by Google. There is no separate PlayWithNicole password to change.</p>
                  <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">Manage your Google Account security ↗</a>
                </div>
              </div>
            ) : hasPasswordProvider ? (
              <form
                className="passwordForm"
                onSubmit={(event) => {
                  event.preventDefault()
                  void reauthenticateForAction('password')
                }}
              >
                <label>
                  Current password
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Enter your current password"
                  />
                </label>

                <div className="formGrid">
                  <label>
                    New password
                    <input
                      required
                      minLength={8}
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </label>

                  <label>
                    Confirm new password
                    <input
                      required
                      minLength={8}
                      type="password"
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      placeholder="Repeat your new password"
                    />
                  </label>
                </div>

                <Button type="submit" disabled={securityBusy}>
                  {securityBusy ? 'Updating...' : 'Update password'}
                </Button>
              </form>
            ) : (
              <div className="googleSecurityNotice">
                <span className="googleSecurityIcon"><Icon name="shield" /></span>
                <div>
                  <b>Password change is not available for this provider</b>
                  <p>Your account does not currently have an email/password sign-in method linked.</p>
                </div>
              </div>
            )}

            <div className="securityFeedback" aria-live="polite">
              {securityMessage && <p className="securitySuccess"><Icon name="check-circle" size={15} /> {securityMessage}</p>}
              {securityError && <p className="securityError"><Icon name="alert-circle" size={15} /> {securityError}</p>}
            </div>

            {!emailVerified && (
              <div className="emailVerificationNotice">
                <div>
                  <b>Email verification required for TOTP</b>
                  <p>Firebase requires a verified email address before an authenticator app can be enrolled.</p>
                </div>
                <div className="emailVerificationActions">
                  <button type="button" onClick={() => void sendVerificationEmail()} disabled={securityBusy}>
                    Send verification email
                  </button>
                  <button type="button" onClick={() => void refreshEmailVerificationStatus()} disabled={securityBusy}>
                    I've verified my email
                  </button>
                </div>
              </div>
            )}

            <h3 className="panelTitle sectionTitle">Preferences</h3>

            <div className="settingRow">
              <span><Icon name="mail" /></span>
              <div>
                <b>Email notifications</b>
                <p>Receive account and support updates by email when available.</p>
              </div>
              <button className={`toggle ${emailNotifications ? 'active' : ''}`} aria-label="Toggle email notifications" aria-pressed={emailNotifications} type="button" onClick={() => void updatePreference('emailNotifications', !emailNotifications)}>
                <i />
              </button>
            </div>

            <div className="settingRow">
              <span><Icon name="users" /></span>
              <div>
                <b>Community updates</b>
                <p>Show community-related announcements in your account.</p>
              </div>
              <button className={`toggle ${communityUpdates ? 'active' : ''}`} aria-label="Toggle community updates" aria-pressed={communityUpdates} type="button" onClick={() => void updatePreference('communityUpdates', !communityUpdates)}>
                <i />
              </button>
            </div>

            <div className="settingRow">
              <span><Icon name="eye" /></span>
              <div>
                <b>Profile visibility</b>
                <p>Allow your profile to be visible within the community.</p>
              </div>
              <button className={`toggle ${profileVisible ? 'active' : ''}`} aria-label="Toggle profile visibility" aria-pressed={profileVisible} type="button" onClick={() => void updatePreference('profileVisible', !profileVisible)}>
                <i />
              </button>
            </div>

            <div className="totpSecurityCard">
              <div className="totpSecurityHead">
                <span className="totpSecurityIcon"><Icon name="shield-check" size={20} /></span>
                <div>
                  <b>Authenticator app two-factor authentication</b>
                  <p>Protect sign-in with a time-based one-time password (TOTP).</p>
                </div>
                <span className={`securityStatusPill ${enrolledTotpFactor ? 'enabled' : 'disabled'}`}>
                  {enrolledTotpFactor ? 'Enabled' : 'Not enabled'}
                </span>
              </div>

              {stepUpResolver && stepUpAction ? (
                <form className="stepUpForm" onSubmit={finishStepUpChallenge}>
                  <b>Additional verification required</b>
                  <p>Enter a fresh code from your authenticator app to continue this security change.</p>
                  <label>
                    Six-digit authenticator code
                    <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={stepUpCode} onChange={(event) => setStepUpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
                  </label>
                  <Button type="submit" disabled={securityBusy || stepUpCode.length !== 6}>{securityBusy ? 'Verifying...' : 'Confirm security change'}</Button>
                </form>
              ) : enrolledTotpFactor ? (
                <div className="totpEnabledState">
                  <p><Icon name="check-circle" size={16} /> Your account requires an authenticator code after your password or Google sign-in.</p>
                  <p className="helper">Factor: {enrolledTotpFactor.displayName || 'Authenticator app'}</p>
                  <button type="button" className="danger securityDangerButton" disabled={securityBusy} onClick={() => void reauthenticateForAction('disable')}>
                    {securityBusy ? 'Please wait...' : 'Disable two-factor authentication'}
                  </button>
                </div>
              ) : totpSecret && totpQrCode ? (
                <form className="totpEnrollmentForm" onSubmit={confirmTotpEnrollment}>
                  <div className="totpQrWrap">
                    <img src={totpQrCode} alt="Scan this QR code with your authenticator app" />
                    <div>
                      <b>1. Scan this QR code</b>
                      <p>Use Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP-compatible app.</p>
                      <small>Can't scan? Enter this setup key manually:</small>
                      <code>{totpSecret.secretKey}</code>
                    </div>
                  </div>
                  <label>
                    2. Enter the six-digit authenticator code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      value={totpCode}
                      onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                    />
                  </label>
                  <div className="totpActions">
                    <Button type="submit" disabled={securityBusy || totpCode.length !== 6}>{securityBusy ? 'Verifying...' : 'Verify and enable MFA'}</Button>
                    <button type="button" onClick={() => { setTotpSecret(null); setTotpQrCode(''); setTotpCode('') }}>Cancel setup</button>
                  </div>
                </form>
              ) : (
                <div className="totpNotEnabledState">
                  <p>When enabled, users must enter a current code from their authenticator app at sign-in. Firebase securely validates the code; the TOTP secret is not stored in Firestore.</p>
                  {hasPasswordProvider && (
                    <label className="totpReauthField">
                      Current password
                      <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Confirm your password" />
                    </label>
                  )}
                  <Button type="button" disabled={securityBusy || !emailVerified} onClick={() => void reauthenticateForAction('enroll')}>
                    {securityBusy ? 'Preparing setup...' : 'Set up authenticator app'}
                  </Button>
                  {!emailVerified && <small className="helper">Verify your email address first to enable TOTP.</small>}
                </div>
              )}
            </div>

            <div className="accountDeletionCard">
              <div>
                <b>Request account deletion</b>
                <p>Your request will be sent to the Support Team for admin review. Your Firebase Authentication account will not be deleted automatically.</p>
              </div>
              <button className="danger" type="button" onClick={() => { setDeleteUsername(''); setDeleteModalOpen(true) }}>
                Request account deletion
              </button>
            </div>
          </div>

          <aside className="profileSide">
            <b>Active session</b>

            <div>
              <Icon name="shield" />

              <span>
                <b>Current browser</b>
                <small>Active now</small>
              </span>
            </div>

            <small className="sessionSecurityNote">
              Session revocation for every device requires a trusted Firebase Admin operation. Your current session is managed by Firebase Authentication.
            </small>
          </aside>
        </div>
      )}

      {deleteModalOpen && (
        <div className="confirmationOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteModalOpen(false) }}>
          <form className="confirmationModal" onSubmit={requestAccountDeletion} role="dialog" aria-modal="true" aria-labelledby="deleteAccountTitle">
            <span className="confirmationDangerIcon"><Icon name="trash-2" size={22} /></span>
            <h2 id="deleteAccountTitle">Are you sure?</h2>
            <p>This action cannot be undone. Your request will be sent to the Support Team, who will review and clear your application data.</p>
            {!profile?.username ? (
              <div className="supportChatError">No username is saved on your profile. Add a username in My Profile before submitting this request.</div>
            ) : (
              <label>
                Type <b>{profile.username}</b> to confirm
                <input autoFocus value={deleteUsername} onChange={(event) => setDeleteUsername(event.target.value)} placeholder="Enter your username" autoComplete="off" />
              </label>
            )}
            <div className="confirmationActions">
              <button type="button" className="confirmationCancel" onClick={() => setDeleteModalOpen(false)} disabled={deleteBusy}>Cancel</button>
              <button type="submit" className="confirmationSubmit" disabled={deleteBusy || !profile?.username || deleteUsername.trim() !== String(profile.username).trim()}>
                {deleteBusy ? 'Sending request...' : 'Confirm request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ==========================================
// ROOT APP
// ==========================================

export default function App() {
  const { user, signOut } = useAuth()

  const [view, setView] = useState<View>('home')
  const [auth, setAuth] = useState<Auth>(null)

  const go = (nextView: View) => {
    setView(nextView)
    window.scrollTo(0, 0)
  }

  const enter = () => {
    setAuth(null)
    go('dashboard')
  }

  const handleLogout = async () => {
    await signOut()
    setAuth(null)
    setView('home')
  }

  useEffect(() => {
    if (!user && view !== 'home') {
      setView('home')
    } else if (user && view === 'home') {
      setView('dashboard')
    }
  }, [user, view])

  return (
    <>
      {view === 'home' ? (
        <Home go={go} auth={setAuth} />
      ) : (
        <Dashboard
          view={view}
          go={go}
          logout={handleLogout}
        />
      )}

      {auth && (
        <AuthModal
          mode={auth}
          setMode={setAuth}
          enter={enter}
        />
      )}
    </>
  )
}

