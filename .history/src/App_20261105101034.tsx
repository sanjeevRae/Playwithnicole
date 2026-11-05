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

import { db } from '@/firebase'
import { useAuth } from './contexts/AuthContext'
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
// SOCIAL LINKS
// ==========================================

type SocialLinkValue = {
  enabled?: boolean
  url?: string
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

function normalizeExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  try {
    const parsed = new URL(value.trim())

    if (
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'http:'
    ) {
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

  useEffect(() => {
    const settingsRef = doc(
      db,
      'siteSettings',
      'socialLinks',
    )

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        setSocialLinks(
          snapshot.exists()
            ? (snapshot.data() as SocialLinksData)
            : {},
        )

        setLoading(false)
      },
      (error) => {
        console.error('Social links loading error:', error)
        setSocialLinks({})
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const activeChannels: SocialChannel[] =
    SOCIAL_CHANNELS.flatMap((channel) => {
      const value = socialLinks[channel.key]

      if (!value || value.enabled !== true) {
        return []
      }

      const url = normalizeExternalUrl(value.url)

      if (!url) {
        return []
      }

      return [
        {
          ...channel,
          url,
        },
      ]
    })

  return {
    socialLinks,
    activeChannels,
    loading,
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
          typeof item === 'string' && item.trim().length > 0,
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
    image: data.image || data.imageUrl || data.coverImage || '',
    categories: normalizeStringList(data.categories),
    favoritedAt: data.favoritedAt,
    openedAt: data.openedAt,
    playedAt: data.playedAt,
  }
}

// The existing Firestore rules require both conditions.
// Keeping these conditions in the query also allows normal
// members to read published games without reading admin drafts.
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
      <Icon name="play" size={15} />
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
}: {
  children: ReactNode
  secondary?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}) => (
  <button
    type={type}
    className={`btn ${secondary ? 'secondary' : ''}`}
    onClick={onClick}
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
  const role = profile?.role ?? 'member'

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
          <small>{role}</small>
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
                Community links coming soon
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
              {activeChannels.map((channel, index) => (
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={channel.key}
                >
                  <span className={`socialIcon s${index}`}>
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
                Community links will appear here when enabled by
                the administrator.
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

          {mode === 'verify' ? (
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
                    await signIn(email, password)
                  } else if (mode === 'signup') {
                    await signUp(
                      email,
                      password,
                      displayName,
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
                      await signInWithGoogle()
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

  if (!user) return null

  const isAdmin = profile?.role === 'admin'

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
            <button type="button">
              <Icon name="bell" />
              <i />
            </button>

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

  if (view === 'notifications') {
    return (
      <>
        <PageTitle
          kicker="STAY IN THE LOOP"
          title="Notifications"
          sub="Your latest game, community, and account updates."
        />

        <div className="panel noticeList">
          {[
            'New community event announced',
            'Astral Frontier added to your favorites',
            'Your profile is now verified',
            'Support replied to your ticket',
          ].map((item, index) => (
            <div key={index} className="notice">
              <span>
                <Icon
                  name={index === 2 ? 'shield' : 'bell'}
                />
              </span>

              <div>
                <b>{item}</b>
                <p>
                  {index < 2
                    ? 'A few minutes ago'
                    : 'Earlier this week'}
                </p>
              </div>

              {index < 2 && <i />}
            </div>
          ))}
        </div>
      </>
    )
  }

  const { profile } = useAuth()

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

  // ----------------------------------------
  // LOAD USER FAVORITES
  // ----------------------------------------

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

  // ----------------------------------------
  // CATEGORY FILTERS FROM FIRESTORE DATA
  // ----------------------------------------

  const categories = Array.from(
    new Set(
      games.flatMap((game) => game.categories),
    ),
  ).sort((a, b) => a.localeCompare(b))

  // ----------------------------------------
  // FILTER AND SEARCH GAMES
  // ----------------------------------------

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

  // ----------------------------------------
  // RECORD OPENED / PLAYED GAME
  // ----------------------------------------

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

  // ----------------------------------------
  // OPEN GAME DETAILS
  // ----------------------------------------

  const openGameDetails = (game: GameRecord) => {
    setSelectedGame(game)
    setPlayNotice('')
    setActionError('')

    void recordRecentGame(game, 'opened')
  }

  // ----------------------------------------
  // PLAY GAME
  // ----------------------------------------

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

  // ----------------------------------------
  // ADD / REMOVE FAVORITE
  // ----------------------------------------

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

      <div
        className="gameExploreControls"
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 22,
          alignItems: 'center',
        }}
      >
        <div
          className="search gameSearch"
          style={{
            flex: '1 1 240px',
            maxWidth: '100%',
          }}
        >
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
          style={{
            minHeight: 44,
            padding: '0 14px',
            border: '1px solid #dedede',
            borderRadius: 10,
            background: '#fff',
            color: '#222',
          }}
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
        <div
          className="panel"
          style={{
            textAlign: 'center',
            padding: '45px 20px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              marginBottom: 15,
            }}
          >
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
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        zIndex: 2,
                        width: 38,
                        height: 38,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        background: favorite
                          ? '#e8dce5'
                          : 'rgba(255,255,255,0.95)',
                        color: favorite ? '#b42c68' : '#333',
                      }}
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
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(12, 14, 20, 0.76)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <div
            className="gameDetailCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-detail-title"
            style={{
              background: '#fff',
              color: '#1b1a17',
              width: 'min(760px, 96vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 18,
              position: 'relative',
              boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedGame(null)}
              aria-label="Close game details"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 3,
                width: 40,
                height: 40,
                border: 0,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)',
                cursor: 'pointer',
              }}
            >
              <Icon name="close" />
            </button>

            <div
              style={{
                height: 270,
                background: '#ececec',
                overflow: 'hidden',
              }}
            >
              <img
                src={selectedGame.image || hero}
                alt={selectedGame.title}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  objectFit: 'cover',
                }}
              />
            </div>

            <div style={{ padding: 26 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {selectedGame.categories.map((category) => (
                  <span
                    key={category}
                    style={{
                      fontSize: 12,
                      padding: '6px 10px',
                      borderRadius: 20,
                      background: '#f0edf7',
                      color: '#5e4d8e',
                    }}
                  >
                    {category}
                  </span>
                ))}
              </div>

              <h2
                id="game-detail-title"
                style={{
                  margin: '0 0 12px',
                  fontSize: 28,
                }}
              >
                {selectedGame.title}
              </h2>

              <p
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.7,
                  color: '#626262',
                }}
              >
                {selectedGame.description ||
                  'No description has been added for this game yet.'}
              </p>

              {selectedGame.platforms.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <b>Available platforms</b>

                  <p style={{ color: '#666' }}>
                    {selectedGame.platforms.join(' • ')}
                  </p>
                </div>
              )}

              {selectedGame.releaseDate && (
                <div style={{ marginTop: 12 }}>
                  <b>Release date</b>

                  <p style={{ color: '#666' }}>
                    {selectedGame.releaseDate}
                  </p>
                </div>
              )}

              {playNotice && (
                <div
                  className="supportChatError"
                  role="status"
                  style={{ marginTop: 18 }}
                >
                  {playNotice}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 24,
                }}
              >
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
// SOCIAL PAGE — FIRESTORE LINKS
// ==========================================

function Social() {
  const {
    activeChannels,
    loading,
  } = useSocialLinks()

  return (
    <>
      <PageTitle
        kicker="STAY CONNECTED"
        title="Community spaces"
        sub="Follow official playwithnicole channels for news, events, and conversation."
      />

      {loading ? (
        <div className="supportChatEmpty">
          <span className="gameSpinner" />
          <p>Loading community links...</p>
        </div>
      ) : activeChannels.length === 0 ? (
        <div
          className="panel"
          style={{
            textAlign: 'center',
            padding: '45px 20px',
          }}
        >
          <Icon name="heart" size={30} />

          <h3>No community links available</h3>

          <p>
            The administrator has not enabled any social
            community links yet.
          </p>
        </div>
      ) : (
        <div className="socialGrid">
          {activeChannels.map((channel, index) => (
            <article key={channel.key}>
              <span className={`socialIcon s${index}`}>
                {channel.icon}
              </span>

              <div className="official">
                <i /> OFFICIAL COMMUNITY
              </div>

              <h2>{channel.name}</h2>

              <p>{channel.description}</p>

              <small>
                Opens the official {channel.name} community in a
                new tab.
              </small>

              <a
                className="btn secondary"
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
      )}

      <div className="safe">
        <Icon name="shield" />

        <div>
          <b>Connect safely</b>

          <p>
            These links are configured by the administrator.
            playwithnicole will never ask for your password on
            external social platforms.
          </p>
        </div>
      </div>
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
  const { user, profile } = useAuth()

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

  const [toggles, setToggles] = useState([
    true,
    true,
    true,
    false,
  ])

  // ----------------------------------------
  // LOAD REAL PROFILE DATA
  // ----------------------------------------

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

  // ----------------------------------------
  // LISTEN TO FAVORITES AND RECENT GAMES
  // ----------------------------------------

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

  // ----------------------------------------
  // PROFILE PHOTO PREVIEW
  // ----------------------------------------

  useEffect(() => {
    if (!photoPreview.startsWith('blob:')) {
      return
    }

    return () => {
      URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // ----------------------------------------
  // SAVE PROFILE TO FIRESTORE
  // ----------------------------------------

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
        // The Firestore rules only allow admins to assign roles.
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

  // ----------------------------------------
  // REMOVE FAVORITE
  // ----------------------------------------

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

  // ----------------------------------------
  // SAVE GENERAL SETTINGS MESSAGE
  // ----------------------------------------

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

      {/* ==================================
          MY PROFILE
      ================================== */}

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
                      ? 'Email verified'
                      : 'Verification status'}
                  </b>

                  <small>
                    {verified
                      ? 'Your account is verified.'
                      : 'Your verification status is not confirmed.'}
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

              <small>Account role</small>
              <strong>
                {profile?.role || 'player'}
              </strong>

              <small>
                Member since{' '}
                {formatDate(profile?.createdAt) ||
                  'Account date unavailable'}
              </small>
            </aside>
          </div>

          {/* FAVORITES AND RECENT GAMES */}

          <div className="profileGames">
            {/* FAVORITES */}

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
                <div
                  className="profileGameEmpty"
                  style={{
                    padding: '22px 0',
                    textAlign: 'center',
                  }}
                >
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

            {/* RECENTLY PLAYED */}

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
                <div
                  className="profileGameEmpty"
                  style={{
                    padding: '22px 0',
                    textAlign: 'center',
                  }}
                >
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
        /* ==================================
           ACCOUNT SETTINGS
        ================================== */

        <div className="settingsLayout">
          <div className="panel">
            <h3 className="panelTitle">
              Password &amp; security
            </h3>

            <form
              className="passwordForm"
              onSubmit={(event) => {
                event.preventDefault()
                save(
                  'Password changes must be completed through your authentication provider.',
                )
              }}
            >
              <label>
                Current password

                <input
                  required
                  type="password"
                  placeholder="Enter current password"
                />
              </label>

              <div className="formGrid">
                <label>
                  New password

                  <input
                    required
                    minLength={8}
                    type="password"
                    placeholder="At least 8 characters"
                  />
                </label>

                <label>
                  Confirm password

                  <input
                    required
                    minLength={8}
                    type="password"
                    placeholder="Repeat new password"
                  />
                </label>
              </div>

              <Button type="submit">
                Update password
              </Button>
            </form>

            <h3 className="panelTitle sectionTitle">
              Preferences
            </h3>

            {[
              'Email notifications',
              'Community updates',
              'Profile visibility',
              'Two-factor authentication',
            ].map((item, index) => (
              <div className="settingRow" key={item}>
                <span>
                  <Icon
                    name={index === 3 ? 'shield' : 'bell'}
                  />
                </span>

                <div>
                  <b>{item}</b>

                  <p>
                    {index === 3
                      ? 'Add an extra layer of account security.'
                      : 'Choose how this preference behaves.'}
                  </p>
                </div>

                <button
                  className={`toggle ${
                    toggles[index] ? 'active' : ''
                  }`}
                  aria-label={`Toggle ${item}`}
                  type="button"
                  onClick={() =>
                    setToggles((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index
                          ? !value
                          : value,
                      ),
                    )
                  }
                >
                  <i />
                </button>
              </div>
            ))}

            <button
              className="danger"
              type="button"
              onClick={() =>
                confirm(
                  'Request account deletion? This is a UI placeholder only.',
                )
              }
            >
              Request account deletion
            </button>
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

            <Button
              secondary
              onClick={() =>
                save('Other sessions signed out')
              }
            >
              Sign out other sessions
            </Button>
          </aside>
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