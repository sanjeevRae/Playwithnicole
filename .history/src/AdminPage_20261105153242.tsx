import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'

import { db } from './firebase'
import { useAuth } from './contexts/AuthContext'
import { Icon, Button, PageTitle } from './App'
import type { View } from './types'

// ==========================================
// COLLECTION CONFIGURATION
// ==========================================

const GAMES_COLLECTION = 'games'
const HERO_BANNERS_COLLECTION = 'heroBanners'
const HERO_BANNER_DOCUMENT_ID = 'main'

const SOCIAL_SETTINGS_COLLECTION = 'siteSettings'
const SOCIAL_SETTINGS_DOCUMENT_ID = 'socialLinks'
const USERS_COLLECTION = 'users'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const CLOUDINARY_FOLDER = 'playwithnicole/games'
const HERO_CLOUDINARY_FOLDER = 'playwithnicole/hero-banners'

// ==========================================
// USER MANAGEMENT
// ==========================================

const USER_ROLE_OPTIONS = [
  { value: 'player', label: 'Player' },
  { value: 'user', label: 'User' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
] as const

type AdminUser = {
  id: string
  name: string
  username: string
  email: string
  photoURL: string
  role: string
  verified: 0 | 1
  createdAt: Timestamp | null
}

function getUserName(
  data: Record<string, unknown>,
  userId: string,
): string {
  const possibleNames = [
    data.displayName,
    data.name,
    data.fullName,
    data.username,
  ]

  const name = possibleNames.find(
    (value) =>
      typeof value === 'string' &&
      value.trim().length > 0,
  )

  if (typeof name === 'string') {
    return name.trim()
  }

  if (
    typeof data.email === 'string' &&
    data.email.trim()
  ) {
    return data.email.trim()
  }

  return `User ${userId.slice(0, 7)}`
}

function getUserPhoto(
  data: Record<string, unknown>,
): string {
  const possiblePhotos = [
    data.photoURL,
    data.photoUrl,
    data.avatarUrl,
    data.profileImage,
    data.photo,
  ]

  const photo = possiblePhotos.find(
    (value) =>
      typeof value === 'string' &&
      value.trim().length > 0,
  )

  return typeof photo === 'string'
    ? photo.trim()
    : ''
}

function getUserRole(
  data: Record<string, unknown>,
): string {
  if (
    typeof data.role === 'string' &&
    data.role.trim()
  ) {
    return data.role.trim().toLowerCase()
  }

  return 'player'
}

function getUserVerified(
  data: Record<string, unknown>,
): 0 | 1 {
  return data.verified === 1 ||
    data.verified === true
    ? 1
    : 0
}

function formatUserRole(role: string): string {
  if (!role) return 'Player'

  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatUserJoinedDate(
  value: Timestamp | null,
): string {
  if (!value) return 'Not available'

  try {
    return value.toDate().toLocaleDateString(
      undefined,
      {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      },
    )
  } catch {
    return 'Not available'
  }
}

// ==========================================
// ADMIN OVERVIEW HELPERS
// ==========================================

function getAdminTimestampMillis(value: any): number {
  if (value && typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  return 0
}

function getCurrentWeekStartMillis(): number {
  const date = new Date()
  const daysSinceMonday = (date.getDay() + 6) % 7

  date.setDate(date.getDate() - daysSinceMonday)
  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

// ==========================================
// SOCIAL LINKS CONFIGURATION
// ==========================================

type SocialPlatformId =
  | 'facebook'
  | 'telegram'
  | 'instagram'
  | 'whatsapp'
  | 'signal'

type SocialLinkValue = {
  url: string
  enabled: boolean
}

type SocialLinksState = Record<
  SocialPlatformId,
  SocialLinkValue
>

const SOCIAL_PLATFORMS: {
  id: SocialPlatformId
  name: string
  description: string
  placeholder: string
  initials: string
}[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    description:
      'Share announcements and connect with your community.',
    placeholder: 'https://facebook.com/your-page',
    initials: 'f',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description:
      'Publish quick updates and community announcements.',
    placeholder: 'https://t.me/your-community',
    initials: 'TG',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description:
      'Show highlights, stories and moments from the community.',
    placeholder: 'https://instagram.com/your-profile',
    initials: 'ig',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description:
      'Give members a direct way to reach your community.',
    placeholder: 'https://wa.me/977XXXXXXXXXX',
    initials: 'WA',
  },
  {
    id: 'signal',
    name: 'Signal',
    description:
      'Share a private Signal group or community invite.',
    placeholder: 'https://signal.group/#your-invite',
    initials: 'S',
  },
]

const DEFAULT_SOCIAL_LINKS: SocialLinksState = {
  facebook: { url: '', enabled: false },
  telegram: { url: '', enabled: false },
  instagram: { url: '', enabled: false },
  whatsapp: { url: '', enabled: false },
  signal: { url: '', enabled: false },
}

function isValidSocialUrl(value: string): boolean {
  if (!value.trim()) return false

  try {
    const parsed = new URL(value.trim())

    return (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:'
    )
  } catch {
    return false
  }
}

// ==========================================
// GAME TYPES
// ==========================================

type GameStatus =
  | 'Draft'
  | 'Published'
  | 'Archived'

type GameRecord = {
  id: string
  title: string
  description: string
  category: string
  tags: string
  url: string
  status: GameStatus
  visible: boolean
  config: string
  image: string
  imagePublicId: string
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

type GameFormValues = Omit<
  GameRecord,
  'id' | 'createdAt' | 'updatedAt'
>

// ==========================================
// HERO BANNER TYPES
// ==========================================

type HeroBanner = {
  eyebrow: string
  title: string
  accent: string
  description: string
  primaryCta: string
  primaryUrl: string
  secondaryCta: string
  secondaryUrl: string
  image: string
  imagePublicId: string
  visible: boolean
}

// ==========================================
// SUPPORT CHAT TYPES
// ==========================================

type SupportConversation = {
  id: string
  userId: string
  status: 'open' | 'resolved'
  lastMessage?: string
  lastMessageType?: string
  lastMessageSenderId?: string
  lastMessageAt?: any
  updatedAt?: any
  createdAt?: any
}

type SupportChatMessage = {
  id: string
  senderId: string
  senderRole: 'admin' | 'user'
  type: 'text' | 'image'
  text: string
  imageUrl: string
  createdAt?: any
}

type ChatUserProfile = {
  displayName?: string
  name?: string
  email?: string
  photoURL?: string
}

// ==========================================
// DEFAULT GAME
// ==========================================

const emptyGame: GameFormValues = {
  title: '',
  description: '',
  category: 'Action',
  tags: '',
  url: '',
  status: 'Draft',
  visible: true,
  config: '',
  image: '',
  imagePublicId: '',
}

// ==========================================
// DEFAULT HERO BANNER
// ==========================================

const defaultHeroBanner: HeroBanner = {
  eyebrow: 'YOUR NEXT CHAPTER STARTS HERE',
  title: 'PLAY BOLD.',
  accent: 'CONNECT DEEPER.',
  description:
    'A curated gaming community built for discovery, friendly competition, and unforgettable shared experiences.',
  primaryCta: 'Join the community',
  primaryUrl: 'https://example.com/join',
  secondaryCta: 'Explore games',
  secondaryUrl: 'https://example.com/games',
  image:
    'https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1800&q=88',
  imagePublicId: '',
  visible: true,
}

// ==========================================
// ERROR HANDLING
// ==========================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

function formatAdminChatTime(value: any): string {
  if (!value) return ''

  const date =
    typeof value.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : null

  if (!date || Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ==========================================
// CLOUDINARY
// ==========================================

type CloudinaryUploadResponse = {
  secure_url?: string
  public_id?: string
  error?: {
    message?: string
  }
}

async function uploadImageToCloudinary(
  file: File,
  folder: string = CLOUDINARY_FOLDER,
): Promise<{
  url: string
  publicId: string
}> {
  const cloudName = import.meta.env
    .VITE_CLOUDINARY_CLOUD_NAME as
    | string
    | undefined

  const uploadPreset = import.meta.env
    .VITE_CLOUDINARY_UPLOAD_PRESET as
    | string
    | undefined

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env file, then restart the dev server.',
    )
  }

  const body = new FormData()
  body.append('file', file)
  body.append('upload_preset', uploadPreset)
  body.append('folder', folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: 'POST',
      body,
    },
  )

  const result =
    (await response.json()) as CloudinaryUploadResponse

  if (
    !response.ok ||
    !result.secure_url ||
    !result.public_id
  ) {
    throw new Error(
      result.error?.message ||
        `Cloudinary upload failed (${response.status}).`,
    )
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  }
}

// ==========================================
// MODAL
// ==========================================

function Modal({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: ReactNode
}) {
  return (
    <div
      className="dialogShade gameDialogShade"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <section
        className="dialog gameDialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialogHead">
          <h2>{title}</h2>

          <button
            type="button"
            onClick={close}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>

        {children}
      </section>
    </div>
  )
}

// ==========================================
// GAME FORM
// ==========================================

function GameForm({
  game,
  close,
  save,
}: {
  game?: GameRecord
  close: () => void
  save: (
    values: GameFormValues,
    imageFile: File | null,
  ) => Promise<void>
}) {
  const [values, setValues] =
    useState<GameFormValues>(() =>
      game
        ? {
            title: game.title,
            description: game.description,
            category: game.category,
            tags: game.tags,
            url: game.url,
            status: game.status,
            visible: game.visible,
            config: game.config,
            image: game.image,
            imagePublicId: game.imagePublicId || '',
          }
        : { ...emptyGame },
    )

  const [imageFile, setImageFile] =
    useState<File | null>(null)

  const [preview, setPreview] =
    useState(game?.image ?? '')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!imageFile) {
      setPreview(values.image)
      return
    }

    const objectUrl = URL.createObjectURL(imageFile)

    setPreview(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile, values.image])

  const update = <K extends keyof GameFormValues>(
    field: K,
    value: GameFormValues[K],
  ) => {
    setValues((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleImageChange = (file: File | null) => {
    setFormError('')

    if (!file) {
      setImageFile(null)
      return
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please select an image file.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setFormError('Image must be 5 MB or smaller.')
      return
    }

    setImageFile(file)
  }

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setFormError('')

    if (!values.title.trim()) {
      setFormError('Game title is required.')
      return
    }

    if (values.url.trim()) {
      try {
        const parsedUrl = new URL(values.url)

        if (
          !['http:', 'https:'].includes(
            parsedUrl.protocol,
          )
        ) {
          setFormError(
            'Game URL must start with http:// or https://.',
          )
          return
        }
      } catch {
        setFormError('Please enter a valid game URL.')
        return
      }
    }

    if (values.config.trim()) {
      try {
        JSON.parse(values.config)
      } catch {
        setFormError(
          'Configuration must contain valid JSON, or be left empty.',
        )
        return
      }
    }

    setSaving(true)

    try {
      await save(
        {
          ...values,
          title: values.title.trim(),
          description: values.description.trim(),
          category: values.category.trim(),
          tags: values.tags.trim(),
          url: values.url.trim(),
          config: values.config.trim(),
        },
        imageFile,
      )
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="gameForm firestoreGameForm"
      onSubmit={handleSubmit}
    >
      <div className="gameImageField">
        <div className="gameImagePreview">
          {preview ? (
            <img
              src={preview}
              alt="Game cover preview"
            />
          ) : (
            <div className="gameImageEmpty">
              <Icon name="game" size={30} />
              <span>Game cover preview</span>
            </div>
          )}
        </div>

        <div className="gameImageControls">
          <label className="gameUploadButton">
            <Icon name="game" size={15} />
            Upload cover image

            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                handleImageChange(
                  event.target.files?.[0] ?? null,
                )
              }
            />
          </label>

          <small>PNG, JPG, WEBP • Maximum 5 MB</small>

          {imageFile && (
            <button
              type="button"
              className="gameTextButton"
              onClick={() => setImageFile(null)}
            >
              Remove selected upload
            </button>
          )}
        </div>
      </div>

      <div className="gameFormFields">
        <label>
          Game title <span className="requiredMark">*</span>

          <input
            required
            maxLength={100}
            value={values.title}
            onChange={(event) =>
              update('title', event.target.value)
            }
            placeholder="e.g. Neon Vanguard"
          />
        </label>

        <label>
          Category <span className="requiredMark">*</span>

          <select
            required
            value={values.category}
            onChange={(event) =>
              update('category', event.target.value)
            }
          >
            <option>Action</option>
            <option>Adventure</option>
            <option>Strategy</option>
            <option>Racing</option>
            <option>Arcade</option>
            <option>Co-op</option>
            <option>Simulation</option>
            <option>Sports</option>
            <option>Other</option>
          </select>
        </label>

        <label className="gameFormFull">
          Description

          <textarea
            rows={3}
            maxLength={1000}
            value={values.description}
            onChange={(event) =>
              update('description', event.target.value)
            }
            placeholder="Describe the game for your community..."
          />
        </label>

        <label>
          Tags

          <input
            value={values.tags}
            onChange={(event) =>
              update('tags', event.target.value)
            }
            placeholder="co-op, multiplayer, featured"
          />

          <small className="fieldHint">
            Separate tags with commas.
          </small>
        </label>

        <label>
          Game URL

          <input
            type="url"
            value={values.url}
            onChange={(event) =>
              update('url', event.target.value)
            }
            placeholder="https://example.com/play"
          />
        </label>

        <label>
          Status

          <select
            value={values.status}
            onChange={(event) =>
              update(
                'status',
                event.target.value as GameStatus,
              )
            }
          >
            <option value="Draft">Draft</option>
            <option value="Published">Published</option>
            <option value="Archived">Archived</option>
          </select>
        </label>

        <label>
          Cover image URL

          <input
            type="url"
            value={values.image}
            onChange={(event) => {
              update('image', event.target.value)
              update('imagePublicId', '')
              setImageFile(null)
            }}
            placeholder="https://example.com/game-cover.jpg"
          />

          <small className="fieldHint">
            Optional. Upload a file above or provide a hosted image URL.
          </small>
        </label>

        <label className="gameFormFull">
          Configuration (JSON)

          <textarea
            rows={4}
            spellCheck={false}
            value={values.config}
            onChange={(event) =>
              update('config', event.target.value)
            }
            placeholder={'{\n  "mode": "multiplayer"\n}'}
          />
        </label>

        <label className="gameVisibilityField gameFormFull">
          <input
            type="checkbox"
            checked={values.visible}
            onChange={(event) =>
              update('visible', event.target.checked)
            }
          />

          <span>
            <b>Visible in public catalogue</b>
            <small>
              Turn this off to hide the game from players without deleting it.
            </small>
          </span>
        </label>
      </div>

      {formError && (
        <div className="gameFormError" role="alert">
          <Icon name="shield" size={15} />
          {formError}
        </div>
      )}

      <div className="dialogActions gameDialogActions">
        <button
          type="button"
          className="btn secondary"
          onClick={close}
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="btn"
          disabled={saving}
        >
          {saving
            ? 'Saving...'
            : game
              ? 'Save changes'
              : 'Create game'}
        </button>
      </div>
    </form>
  )
}

// ==========================================
// ADMIN CHATS — REAL-TIME FIRESTORE INBOX
// ==========================================

function AdminChats() {
  const { user: adminUser } = useAuth()

  const [conversations, setConversations] =
    useState<SupportConversation[]>([])

  const [selectedId, setSelectedId] =
    useState<string | null>(null)

  const [userProfiles, setUserProfiles] =
    useState<Record<string, ChatUserProfile>>({})

  const [messages, setMessages] =
    useState<SupportChatMessage[]>([])

  const [messagesLoading, setMessagesLoading] =
    useState(false)

  const [conversationsLoading, setConversationsLoading] =
    useState(true)

  const [draft, setDraft] = useState('')
  const [imageFile, setImageFile] =
    useState<File | null>(null)

  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [chatError, setChatError] = useState('')
  const [notice, setNotice] = useState('')

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  // ------------------------------------------
  // CONVERSATION SUBSCRIPTION
  // ------------------------------------------

  useEffect(() => {
    setConversationsLoading(true)

    const conversationsQuery = query(
      collection(db, 'supportConversations'),
      orderBy('updatedAt', 'desc'),
      limit(100),
    )

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const records: SupportConversation[] =
          snapshot.docs.map((conversationDoc) => {
            const data = conversationDoc.data()

            return {
              id: conversationDoc.id,
              userId:
                typeof data.userId === 'string'
                  ? data.userId
                  : conversationDoc.id,

              status:
                data.status === 'resolved'
                  ? 'resolved'
                  : 'open',

              lastMessage:
                typeof data.lastMessage === 'string'
                  ? data.lastMessage
                  : '',

              lastMessageType: data.lastMessageType,

              lastMessageSenderId:
                typeof data.lastMessageSenderId === 'string'
                  ? data.lastMessageSenderId
                  : '',

              lastMessageAt: data.lastMessageAt,
              updatedAt: data.updatedAt,
              createdAt: data.createdAt,
            }
          })

        setConversations(records)
        setConversationsLoading(false)
        setChatError('')
      },
      (error) => {
        console.error(
          'Could not load support conversations:',
          error,
        )

        setChatError(
          'Could not load support conversations. Check your Firestore rules and confirm that your account has role: "admin".',
        )

        setConversationsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  // ------------------------------------------
  // AUTOMATIC CONVERSATION SELECTION
  // ------------------------------------------

  useEffect(() => {
    if (conversations.length === 0) {
      setSelectedId(null)
      return
    }

    if (
      !selectedId ||
      !conversations.some(
        (conversation) => conversation.id === selectedId,
      )
    ) {
      setSelectedId(conversations[0].id)
    }
  }, [conversations, selectedId])

  // ------------------------------------------
  // USER PROFILE SUBSCRIPTIONS
  // ------------------------------------------

  const profileSubscriptionKey = conversations
    .map((conversation) => conversation.userId)
    .filter(Boolean)
    .sort()
    .join('|')

  useEffect(() => {
    if (!profileSubscriptionKey) {
      setUserProfiles({})
      return
    }

    const userIds = profileSubscriptionKey.split('|')

    const unsubscribers = userIds.map((userId) =>
      onSnapshot(
        doc(db, USERS_COLLECTION, userId),

        (snapshot) => {
          if (!snapshot.exists()) {
            setUserProfiles((current) => {
              const next = { ...current }
              delete next[userId]
              return next
            })

            return
          }

          const data = snapshot.data()

          setUserProfiles((current) => ({
            ...current,
            [userId]: {
              displayName:
                typeof data.displayName === 'string'
                  ? data.displayName
                  : '',

              name:
                typeof data.name === 'string'
                  ? data.name
                  : '',

              email:
                typeof data.email === 'string'
                  ? data.email
                  : '',

              photoURL:
                getUserPhoto(data),
            },
          }))
        },

        (error) => {
          console.error(
            `Could not load profile for ${userId}:`,
            error,
          )
        },
      ),
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [profileSubscriptionKey])

  // ------------------------------------------
  // MESSAGE SUBSCRIPTION
  // ------------------------------------------

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    setMessages([])
    setMessagesLoading(true)

    const messagesQuery = query(
      collection(
        db,
        'supportConversations',
        selectedId,
        'messages',
      ),
      orderBy('createdAt', 'desc'),
      limit(100),
    )

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const records: SupportChatMessage[] =
          snapshot.docs
            .map(
              (messageDoc) =>
                ({
                  id: messageDoc.id,
                  ...messageDoc.data(),
                }) as SupportChatMessage,
            )
            .reverse()

        setMessages(records)
        setMessagesLoading(false)
        setChatError('')
      },
      (error) => {
        console.error(
          'Could not load chat messages:',
          error,
        )

        setChatError(
          'Could not load this conversation. Check the Firestore message permissions.',
        )

        setMessagesLoading(false)
      },
    )

    return unsubscribe
  }, [selectedId])

  // ------------------------------------------
  // AUTO SCROLL
  // ------------------------------------------

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages])

  // ------------------------------------------
  // SELECTED USER
  // ------------------------------------------

  const selectedConversation =
    conversations.find(
      (conversation) => conversation.id === selectedId,
    ) ?? null

  const selectedProfile = selectedConversation
    ? userProfiles[selectedConversation.userId]
    : undefined

  const selectedUserName =
    selectedProfile?.displayName ||
    selectedProfile?.name ||
    selectedProfile?.email ||
    (selectedConversation
      ? `Member ${selectedConversation.userId.slice(0, 7)}`
      : 'Member')

  const selectedUserEmail =
    selectedProfile?.email || ''

  // ------------------------------------------
  // SEND ADMIN REPLY
  // ------------------------------------------

  const sendReply = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (
      !adminUser?.uid ||
      !selectedConversation ||
      sending
    ) {
      return
    }

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
        if (!imageFile.type.startsWith('image/')) {
          throw new Error('Please select a valid image.')
        }

        if (imageFile.size > MAX_IMAGE_SIZE) {
          throw new Error('Image must be 5 MB or smaller.')
        }

        const upload = await uploadImageToCloudinary(
          imageFile,
          'playwithnicole/support-chat',
        )

        imageUrl = upload.url
      }

      const messageType = imageUrl
        ? 'image'
        : 'text'

      const conversationRef = doc(
        db,
        'supportConversations',
        selectedConversation.id,
      )

      const messageRef = doc(
        collection(conversationRef, 'messages'),
      )

      const batch = writeBatch(db)

      batch.set(messageRef, {
        senderId: adminUser.uid,
        senderRole: 'admin',
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
          lastMessage: preview,
          lastMessageType: messageType,
          lastMessageSenderId: adminUser.uid,
          updatedAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          status: 'open',
        },
        { merge: true },
      )

      const notificationRef = doc(
        collection(db, 'users', selectedConversation.userId, 'notifications'),
      )
      batch.set(notificationRef, {
        title: 'New reply from Support Team',
        body: (preview || 'The Support Team sent you a message.').slice(0, 950),
        type: 'support',
        read: false,
        createdAt: serverTimestamp(),
      })

      await batch.commit()

      setDraft('')
      setImageFile(null)

      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
    } catch (error) {
      console.error(
        'Could not send admin reply:',
        error,
      )

      setChatError(
        error instanceof Error
          ? error.message
          : 'Reply could not be sent. Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  // ------------------------------------------
  // IMAGE SELECTION
  // ------------------------------------------

  const handleImageSelect = (file: File | null) => {
    if (!file) return

    setChatError('')

    if (!file.type.startsWith('image/')) {
      setChatError('Please select a valid image.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setChatError('Image must be 5 MB or smaller.')
      return
    }

    setImageFile(file)
  }

  // ------------------------------------------
  // CONVERSATION STATUS
  // ------------------------------------------

  const changeConversationStatus = async (
    status: 'open' | 'resolved',
  ) => {
    if (!selectedConversation) return

    setChatError('')

    try {
      await updateDoc(
        doc(
          db,
          'supportConversations',
          selectedConversation.id,
        ),
        {
          status,
          updatedAt: serverTimestamp(),
        },
      )

      setNotice(
        status === 'resolved'
          ? 'Conversation marked as resolved.'
          : 'Conversation reopened.',
      )

      window.setTimeout(() => setNotice(''), 2500)
    } catch (error) {
      console.error(
        'Could not update conversation status:',
        error,
      )

      setChatError(
        error instanceof Error
          ? error.message
          : 'Could not update conversation status.',
      )
    }
  }

  // ------------------------------------------
  // SEARCH
  // ------------------------------------------

  const filteredConversations =
    conversations.filter((conversation) => {
      const profile = userProfiles[conversation.userId]

      const name =
        profile?.displayName ||
        profile?.name ||
        profile?.email ||
        ''

      const searchText = [
        name,
        profile?.email || '',
        conversation.lastMessage || '',
        conversation.userId,
      ]
        .join(' ')
        .toLowerCase()

      return searchText.includes(
        search.trim().toLowerCase(),
      )
    })

  const openCount = conversations.filter(
    (conversation) =>
      conversation.status === 'open',
  ).length

  return (
    <>
      <PageTitle
        kicker="ADMIN • INBOX"
        title="Chat management"
        sub="Privately manage and reply to individual member conversations."
      />

      {notice && (
        <div className="toast success">
          <Icon name="shield" size={15} />
          {notice}
        </div>
      )}

      {chatError && (
        <div className="supportChatError" role="alert">
          <Icon name="shield" size={16} />
          <span>{chatError}</span>

          <button onClick={() => setChatError('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="adminToolbar chatToolbar adminSupportToolbar">
        <div className="smallSearch">
          <Icon name="search" />

          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search users or conversations..."
          />
        </div>

        <div className="supportQueueStats">
          <span>
            {conversations.length} conversations
          </span>
          <span>{openCount} open</span>
        </div>
      </div>

      <div className="moderation compactModeration adminSupportLayout">
        <div className="panel conversationList adminConversationList">
          {conversationsLoading ? (
            <div className="supportListLoading">
              <span className="gameSpinner" />
              <small>Loading conversations...</small>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="supportListEmpty">
              <Icon name="chat" size={25} />
              <b>No conversations found</b>
              <small>
                Conversations will appear here when members contact support.
              </small>
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const profile =
                userProfiles[conversation.userId]

              const name =
                profile?.displayName ||
                profile?.name ||
                profile?.email ||
                `Member ${conversation.userId.slice(0, 7)}`

              return (
                <button
                  type="button"
                  className={
                    selectedId === conversation.id
                      ? 'selected'
                      : ''
                  }
                  onClick={() => {
                    setSelectedId(conversation.id)
                    setChatError('')
                  }}
                  key={conversation.id}
                >
                  <span className="av adminSupportAvatar">
                    {profile?.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt={name}
                      />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </span>

                  <div className="adminConversationInfo">
                    <b>{name}</b>
                    <small>
                      {conversation.lastMessage ||
                        'No messages yet'}
                    </small>
                  </div>

                  <i
                    className={
                      conversation.status === 'resolved'
                        ? 'supportResolvedStatus'
                        : 'supportOpenStatus'
                    }
                  >
                    {conversation.status === 'resolved'
                      ? 'Resolved'
                      : 'Open'}
                  </i>
                </button>
              )
            })
          )}
        </div>

        <section className="panel messageReview adminSupportReview">
          {!selectedConversation ? (
            <div className="supportAdminNoSelection">
              <span>
                <Icon name="chat" size={28} />
              </span>
              <h3>Select a conversation</h3>
              <p>
                Choose a member from the conversation list to view
                messages and send a reply.
              </p>
            </div>
          ) : (
            <>
              <div className="chatHead adminSupportChatHead">
                <span className="av adminSupportAvatar adminSupportLargeAvatar">
                  {selectedProfile?.photoURL ? (
                    <img
                      src={selectedProfile.photoURL}
                      alt={selectedUserName}
                    />
                  ) : (
                    selectedUserName.charAt(0).toUpperCase()
                  )}
                </span>

                <div className="adminSupportUserIdentity">
                  <b>{selectedUserName}</b>
                  <small>
                    {selectedUserEmail || 'Member'}
                  </small>
                </div>

                <span
                  className={`status ${
                    selectedConversation.status === 'resolved'
                      ? ''
                      : 'active'
                  }`}
                >
                  {selectedConversation.status === 'resolved'
                    ? 'Resolved'
                    : 'Open'}
                </span>
              </div>

              <div className="messages supportMessages adminSupportMessages">
                {messagesLoading ? (
                  <div className="supportChatEmpty">
                    <span className="gameSpinner" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="supportChatEmpty">
                    <Icon name="chat" size={27} />
                    <p>
                      No messages in this conversation yet.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`bubble ${
                        message.senderRole === 'admin'
                          ? 'out'
                          : 'in'
                      } supportBubble`}
                    >
                      <small className="supportSenderLabel">
                        {message.senderRole === 'admin'
                          ? 'Support Team'
                          : selectedUserName}
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
                              alt="Member support attachment"
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
                        {formatAdminChatTime(
                          message.createdAt,
                        )}
                      </time>
                    </div>
                  ))
                )}

                <div ref={bottomRef} />
              </div>

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
                className="compose supportCompose adminSupportCompose"
                onSubmit={sendReply}
              >
                <label
                  className="supportAttachButton"
                  title="Attach image"
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
                  placeholder={`Reply to ${selectedUserName}...`}
                  aria-label="Write support reply"
                  disabled={sending}
                />

                <button
                  type="submit"
                  className="send"
                  disabled={
                    sending ||
                    (!draft.trim() && !imageFile)
                  }
                  aria-label="Send reply"
                >
                  {sending ? (
                    <span className="supportSendingDot" />
                  ) : (
                    <Icon name="send" size={17} />
                  )}
                </button>
              </form>

              <div className="moderationActions adminSupportActions">
                <small>
                  Only this member and administrators can access this chat.
                </small>

                <Button
                  secondary
                  onClick={() =>
                    changeConversationStatus(
                      selectedConversation.status === 'resolved'
                        ? 'open'
                        : 'resolved',
                    )
                  }
                >
                  {selectedConversation.status === 'resolved'
                    ? 'Reopen conversation'
                    : 'Resolve conversation'}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================

function AdminUserManagement() {
  const { user: currentAdmin } = useAuth()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [busyUserIds, setBusyUserIds] = useState<string[]>([])

  // ------------------------------------------
  // FIRESTORE USERS SUBSCRIPTION
  // ------------------------------------------

  useEffect(() => {
    setLoading(true)
    setError('')

    const usersQuery = query(
      collection(db, USERS_COLLECTION),
    )

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const records: AdminUser[] =
          snapshot.docs.map((userDoc) => {
            const data = userDoc.data() as Record<
              string,
              unknown
            >

            const createdAt =
              data.createdAt &&
              typeof (
                data.createdAt as Timestamp
              ).toDate === 'function'
                ? (data.createdAt as Timestamp)
                : null

            return {
              id: userDoc.id,
              name: getUserName(data, userDoc.id),
              username: typeof data.username === 'string' ? data.username.trim() : '',
              email:
                typeof data.email === 'string'
                  ? data.email
                  : '',
              photoURL: getUserPhoto(data),
              role: getUserRole(data),
              verified: getUserVerified(data),
              createdAt,
            }
          })

        records.sort(
          (a, b) =>
            getAdminTimestampMillis(b.createdAt) -
            getAdminTimestampMillis(a.createdAt),
        )

        setUsers(records)
        setLoading(false)
        setError('')
      },
      (snapshotError) => {
        console.error(
          'Could not load registered users:',
          snapshotError,
        )

        setError(
          `Could not load users from Firestore. ${getErrorMessage(snapshotError)} Check your admin role and Firestore rules.`,
        )

        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  // ------------------------------------------
  // NOTICE
  // ------------------------------------------

  const flashNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }

  // ------------------------------------------
  // BUSY STATE
  // ------------------------------------------

  const setUserBusy = (
    userId: string,
    busy: boolean,
  ) => {
    setBusyUserIds((current) =>
      busy
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId),
    )
  }

  // ------------------------------------------
  // CHANGE USER ROLE
  // ------------------------------------------

  const changeUserRole = async (
    user: AdminUser,
    nextRole: string,
  ) => {
    if (user.role === nextRole) return
    if (busyUserIds.includes(user.id)) return

    if (user.id === currentAdmin?.uid) {
      setError(
        'You cannot change your own administrator role.',
      )
      return
    }

    const allowedRole = USER_ROLE_OPTIONS.some(
      (option) => option.value === nextRole,
    )

    if (!allowedRole) {
      setError('That role is not supported.')
      return
    }

    setError('')
    setUserBusy(user.id, true)

    try {
      await updateDoc(
        doc(db, USERS_COLLECTION, user.id),
        {
          role: nextRole,
          updatedAt: serverTimestamp(),
        },
      )

      flashNotice(
        `${user.name}'s role changed to ${formatUserRole(nextRole)}.`,
      )
    } catch (updateError) {
      console.error(
        'Could not update user role:',
        updateError,
      )

      setError(
        `Could not update ${user.name}'s role. ${getErrorMessage(updateError)}`,
      )
    } finally {
      setUserBusy(user.id, false)
    }
  }

  // ------------------------------------------
  // VERIFY / UNVERIFY USER
  // ------------------------------------------

  const toggleUserVerification = async (
    user: AdminUser,
  ) => {
    if (busyUserIds.includes(user.id)) return

    const nextValue: 0 | 1 =
      user.verified === 1 ? 0 : 1

    setError('')
    setUserBusy(user.id, true)

    try {
      const batch = writeBatch(db)
      batch.update(doc(db, USERS_COLLECTION, user.id), {
        verified: nextValue,
        updatedAt: serverTimestamp(),
      })
      const notificationRef = doc(
        collection(db, USERS_COLLECTION, user.id, 'notifications'),
      )
      batch.set(notificationRef, {
        title: nextValue === 1 ? 'Your profile is verified' : 'Your verification status changed',
        body: nextValue === 1
          ? 'The Support Team has verified your community profile.'
          : 'Your profile is currently marked as unverified. Contact support if you think this is a mistake.',
        type: 'verification',
        read: false,
        createdAt: serverTimestamp(),
      })
      await batch.commit()

      flashNotice(
        nextValue === 1
          ? `${user.name} has been verified.`
          : `${user.name} is now unverified.`,
      )
    } catch (updateError) {
      console.error(
        'Could not update user verification:',
        updateError,
      )

      setError(
        `Could not update verification for ${user.name}. ${getErrorMessage(updateError)}`,
      )
    } finally {
      setUserBusy(user.id, false)
    }
  }

  // ------------------------------------------
  // CLEAR USER APPLICATION DATA (SPARK-SAFE)
  // ------------------------------------------

  const clearUserData = async (user: AdminUser) => {
    if (busyUserIds.includes(user.id)) return

    if (user.id === currentAdmin?.uid || user.role === 'admin') {
      setError('For safety, administrator accounts cannot be cleared from this screen.')
      return
    }

    const confirmationName = user.username || user.name
    const confirmation = window.prompt(
      `This clears ${user.name}'s Firestore profile, saved games, notifications, and support chat, then blocks this account from using the app. It does not delete the Firebase Authentication account or Cloudinary files.\n\nType ${confirmationName} exactly to continue:`,
    )
    if (confirmation?.trim() !== confirmationName) return

    setError('')
    setUserBusy(user.id, true)

    try {
      // Block the user's account before enumerating/deleting documents. This
      // closes the race where an active client could create new data mid-clear.
      await setDoc(doc(db, 'accountStates', user.id), {
        status: 'data_clearing',
        clearStartedAt: serverTimestamp(),
        clearStartedBy: currentAdmin?.uid || '',
      }, { merge: true })

      // Read and delete only the user-scoped collections this app creates.
      const userSubcollections = ['favorites', 'recentGames', 'notifications'] as const
      for (const subcollectionName of userSubcollections) {
        const childSnapshot = await getDocs(
          collection(db, USERS_COLLECTION, user.id, subcollectionName),
        )
        for (let offset = 0; offset < childSnapshot.docs.length; offset += 400) {
          const batch = writeBatch(db)
          childSnapshot.docs.slice(offset, offset + 400).forEach((child) => {
            batch.delete(child.ref)
          })
          await batch.commit()
        }
      }

      // Delete the user's support chat as part of their app data.
      const messagesSnapshot = await getDocs(
        collection(db, 'supportConversations', user.id, 'messages'),
      )
      for (let offset = 0; offset < messagesSnapshot.docs.length; offset += 400) {
        const batch = writeBatch(db)
        messagesSnapshot.docs.slice(offset, offset + 400).forEach((message) => {
          batch.delete(message.ref)
        })
        await batch.commit()
      }

      // Mark deletion requests as processed while removing their identifying fields.
      const deletionRequests = await getDocs(
        query(
          collection(db, 'accountDeletionRequests'),
          where('userId', '==', user.id),
        ),
      )
      for (let offset = 0; offset < deletionRequests.docs.length; offset += 400) {
        const batch = writeBatch(db)
        deletionRequests.docs.slice(offset, offset + 400).forEach((requestDoc) => {
          batch.update(requestDoc.ref, {
            userId: null,
            username: null,
            email: null,
            status: 'data_cleared',
            processedAt: serverTimestamp(),
            processedBy: currentAdmin?.uid || '',
          })
        })
        await batch.commit()
      }

      // The marker prevents the still-existing Auth identity from recreating
      // a profile or reading the app after its Firestore data is cleared.
      const finalBatch = writeBatch(db)
      finalBatch.update(doc(db, 'accountStates', user.id), {
        status: 'data_cleared',
        clearedAt: serverTimestamp(),
        clearedBy: currentAdmin?.uid || '',
      })
      finalBatch.delete(doc(db, 'supportConversations', user.id))
      finalBatch.delete(doc(db, USERS_COLLECTION, user.id))
      await finalBatch.commit()

      flashNotice(`${user.name}'s Firestore application data was cleared and app access was blocked.`)
    } catch (clearError) {
      console.error('Could not clear user data:', clearError)
      setError(
        `Could not clear ${user.name}'s data completely. ${getErrorMessage(clearError)} Some earlier batches may already have been deleted, so review the user's Firestore records before retrying.`,
      )
    } finally {
      setUserBusy(user.id, false)
    }
  }


  // ------------------------------------------
  // SEARCH
  // ------------------------------------------

  const normalizedSearch =
    search.trim().toLowerCase()

  const filteredUsers = users.filter((user) => {
    if (!normalizedSearch) return true

    return [
      user.name,
      user.email,
      user.id,
      user.role,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch)
  })

  // ------------------------------------------
  // USER STATISTICS
  // ------------------------------------------

  const verifiedCount = users.filter(
    (user) => user.verified === 1,
  ).length

  const adminCount = users.filter(
    (user) => user.role === 'admin',
  ).length

  const unverifiedCount =
    users.length - verifiedCount

  return (
    <>
      <PageTitle
        kicker="ADMIN • MEMBERS"
        title="User management"
        sub="Manage registered accounts, assign roles, and verify community members."
      />

      {notice && (
        <div className="toast success adminUsersToast">
          <Icon name="shield" size={15} />
          {notice}
        </div>
      )}

      {error && (
        <div
          className="gameLoadError adminUsersError"
          role="alert"
        >
          <Icon name="shield" size={16} />
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="adminUsersStats">
        <article className="adminUsersStatCard">
          <span className="adminUsersStatIcon">
            <Icon name="user" size={17} />
          </span>

          <div>
            <small>Total users</small>
            <b>{users.length}</b>
          </div>
        </article>

        <article className="adminUsersStatCard">
          <span className="adminUsersStatIcon verified">
            ✓
          </span>

          <div>
            <small>Verified members</small>
            <b>{verifiedCount}</b>
          </div>
        </article>

        <article className="adminUsersStatCard">
          <span className="adminUsersStatIcon unverified">
            !
          </span>

          <div>
            <small>Not verified</small>
            <b>{unverifiedCount}</b>
          </div>
        </article>

        <article className="adminUsersStatCard">
          <span className="adminUsersStatIcon admins">
            <Icon name="shield" size={17} />
          </span>

          <div>
            <small>Administrators</small>
            <b>{adminCount}</b>
          </div>
        </article>
      </div>

      <section className="panel adminUsersPanel">
        <div className="adminUsersToolbar">
          <div className="adminUsersToolbarCopy">
            <h2>Registered members</h2>
            <p>
              Changes are saved to Firestore and synced in real time.
            </p>
          </div>

          <div className="smallSearch adminUsersSearch">
            <Icon name="search" size={16} />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search by name or email..."
              aria-label="Search users by name or email"
            />

            {search && (
              <button
                type="button"
                className="adminUsersClearSearch"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="adminUsersResultsInfo">
          <span>
            Showing <b>{filteredUsers.length}</b> of{' '}
            <b>{users.length}</b> users
          </span>

          <span className="adminUsersRealtime">
            <i />
            Live Firestore sync
          </span>
        </div>

        {loading ? (
          <div className="adminUsersState">
            <span className="gameSpinner" />
            <b>Loading registered users...</b>
            <p>
              Connecting to your Firestore users collection.
            </p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="adminUsersState">
            <span className="adminUsersEmptyIcon">
              <Icon name="user" size={25} />
            </span>

            <b>
              {users.length === 0
                ? 'No registered users found'
                : 'No matching users'}
            </b>

            <p>
              {users.length === 0
                ? 'User profiles will appear here after they are created in the users collection.'
                : 'Try searching with another name or email address.'}
            </p>

            {search && (
              <button
                type="button"
                className="adminUsersResetSearch"
                onClick={() => setSearch('')}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="adminUsersTableWrap">
            <div className="adminUsersTable">
              <div className="adminUsersTableHead">
                <span>Member</span>
                <span>Role</span>
                <span>Verification</span>
                <span>Joined</span>
                <span>Data</span>
              </div>

              {filteredUsers.map((user) => {
                const busy =
                  busyUserIds.includes(user.id)

                const isCurrentAdmin =
                  user.id === currentAdmin?.uid

                const hasCurrentRole =
                  USER_ROLE_OPTIONS.some(
                    (option) =>
                      option.value === user.role,
                  )

                return (
                  <article
                    className={`adminUsersTableRow ${
                      busy ? 'isUpdating' : ''
                    }`}
                    key={user.id}
                  >
                    <div className="adminUserIdentity">
                      <span className="adminUserAvatar">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt={user.name}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          user.name
                            .trim()
                            .charAt(0)
                            .toUpperCase() || 'U'
                        )}
                      </span>

                      <div className="adminUserNameBlock">
                        <b>{user.name}</b>

                        <small>
                          {user.email ||
                            'No email available'}
                        </small>

                        <span className="adminUserId">
                          ID: {user.id}
                        </span>
                      </div>
                    </div>

                    <div className="adminUserRoleCell">
                      <label
                        className="adminUsersMobileLabel"
                        htmlFor={`user-role-${user.id}`}
                      >
                        Role
                      </label>

                      <select
                        id={`user-role-${user.id}`}
                        value={user.role}
                        disabled={
                          busy || isCurrentAdmin
                        }
                        onChange={(event) =>
                          changeUserRole(
                            user,
                            event.target.value,
                          )
                        }
                        aria-label={`Change role for ${user.name}`}
                        title={
                          isCurrentAdmin
                            ? 'You cannot change your own administrator role.'
                            : 'Change user role'
                        }
                      >
                        {!hasCurrentRole && (
                          <option value={user.role}>
                            {formatUserRole(user.role)}
                          </option>
                        )}

                        {USER_ROLE_OPTIONS.map(
                          (option) => (
                            <option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ),
                        )}
                      </select>

                      {isCurrentAdmin && (
                        <small className="adminUserRoleHint">
                          Your account
                        </small>
                      )}
                    </div>

                    <div className="adminUserVerificationCell">
                      <label className="adminUsersMobileLabel">
                        Verification
                      </label>

                      <button
                        type="button"
                        className={`adminVerificationButton ${
                          user.verified === 1
                            ? 'isVerified'
                            : 'isUnverified'
                        }`}
                        onClick={() =>
                          toggleUserVerification(user)
                        }
                        disabled={busy}
                        aria-pressed={user.verified === 1}
                        aria-label={
                          user.verified === 1
                            ? `Remove verification from ${user.name}`
                            : `Verify ${user.name}`
                        }
                      >
                        <span className="adminVerificationMark">
                          {user.verified === 1
                            ? '✓'
                            : '×'}
                        </span>

                        <span>
                          {user.verified === 1
                            ? 'Verified'
                            : 'Not verified'}
                        </span>
                      </button>

                      <small className="adminUserVerifiedValue">
                        Firestore: {user.verified}
                      </small>
                    </div>

                    <div className="adminUserJoinedCell">
                      <label className="adminUsersMobileLabel">
                        Joined
                      </label>

                      <span>
                        {formatUserJoinedDate(
                          user.createdAt,
                        )}
                      </span>
                    </div>

                    <div className="adminUserDataCell">
                      <label className="adminUsersMobileLabel">Data</label>
                      <button
                        type="button"
                        className="adminClearUserDataButton"
                        disabled={busy || isCurrentAdmin || user.role === 'admin'}
                        title={user.role === 'admin' ? 'Administrator accounts are protected' : 'Clear this user’s Firestore application data'}
                        onClick={() => void clearUserData(user)}
                      >
                        {busy ? 'Working...' : 'Clear data'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <div className="adminUsersFooterNote">
        <Icon name="shield" size={16} />

        <p>
          <b>Administrator permissions</b>
          <span>
            Only administrators can change member roles and verification status.
            Clear data removes this app's Firestore records and blocks app access;
            it does not remove the Firebase Authentication account or Cloudinary files.
          </span>
        </p>
      </div>
    </>
  )
}

// ==========================================
// ADMIN PAGE
// ==========================================

export function AdminPage({
  view,
  go,
}: {
  view: View
  go: (v: View) => void
}) {
  const { user: currentAdmin } = useAuth()

  // ==========================================
  // DYNAMIC OVERVIEW STATE
  // ==========================================

  const [overviewUsers, setOverviewUsers] =
    useState<AdminUser[]>([])

  const [
    overviewPublishedGames,
    setOverviewPublishedGames,
  ] = useState(0)

  const [
    overviewConversations,
    setOverviewConversations,
  ] = useState<SupportConversation[]>([])

  const [overviewLoading, setOverviewLoading] =
    useState(true)

  const [overviewError, setOverviewError] =
    useState('')

  const isOverviewView =
    view !== 'manage-hero' &&
    view !== 'manage-games' &&
    view !== 'admin-messages' &&
    view !== 'users' &&
    view !== 'social-links'

  // ==========================================
  // GAME MANAGEMENT STATE
  // ==========================================

  const [games, setGames] = useState<GameRecord[]>([])
  const [gamesLoading, setGamesLoading] =
    useState(true)

  const [gamesError, setGamesError] = useState('')

  const [queryText, setQueryText] = useState('')
  const [filter, setFilter] = useState('All')

  const [editing, setEditing] =
    useState<GameRecord | undefined>()

  const [gameOpen, setGameOpen] =
    useState(false)

  const [notice, setNotice] = useState('')

  // ==========================================
  // HERO BANNER STATE
  // ==========================================

  const [banner, setBanner] =
    useState<HeroBanner>({
      ...defaultHeroBanner,
    })

  const [bannerImageFile, setBannerImageFile] =
    useState<File | null>(null)

  const [bannerImagePreview, setBannerImagePreview] =
    useState('')

  const [bannerLoading, setBannerLoading] =
    useState(false)

  const [bannerSaving, setBannerSaving] =
    useState(false)

  const [bannerError, setBannerError] =
    useState('')

  const [bannerDirty, setBannerDirty] =
    useState(false)

  const [bannerExists, setBannerExists] =
    useState(false)

  const bannerDirtyRef = useRef(false)

  // ==========================================
  // SOCIAL LINKS STATE
  // ==========================================

  const [socialLinks, setSocialLinks] =
    useState<SocialLinksState>(() => ({
      ...DEFAULT_SOCIAL_LINKS,
    }))

  const [socialLinksLoading, setSocialLinksLoading] =
    useState(false)

  const [socialLinksSaving, setSocialLinksSaving] =
    useState(false)

  const [socialLinksError, setSocialLinksError] =
    useState('')

  const [socialLinksDirty, setSocialLinksDirty] =
    useState(false)

  const [socialLinksExists, setSocialLinksExists] =
    useState(false)

  const socialLinksDirtyRef = useRef(false)

  // ==========================================
  // OVERVIEW: FIRESTORE REAL-TIME SUBSCRIPTIONS
  // ==========================================

  useEffect(() => {
    if (!isOverviewView) return

    setOverviewLoading(true)
    setOverviewError('')

    const ready = {
      users: false,
      games: false,
      conversations: false,
    }

    const markReady = (
      key: keyof typeof ready,
    ) => {
      ready[key] = true

      if (Object.values(ready).every(Boolean)) {
        setOverviewLoading(false)
      }
    }

    const handleSubscriptionError = (
      key: keyof typeof ready,
      section: string,
      error: Error,
    ) => {
      console.error(
        `Admin overview ${section} subscription failed:`,
        error,
      )

      setOverviewError((current) => {
        const message = `${section}: ${error.message}`

        return current
          ? `${current} | ${message}`
          : message
      })

      markReady(key)
    }

    // ------------------------------------------
    // USERS
    // ------------------------------------------

    const unsubscribeUsers = onSnapshot(
      collection(db, USERS_COLLECTION),

      (snapshot) => {
        const records: AdminUser[] =
          snapshot.docs.map((userDoc) => {
            const data = userDoc.data() as Record<
              string,
              unknown
            >

            const createdAt =
              data.createdAt &&
              typeof (
                data.createdAt as Timestamp
              ).toMillis === 'function'
                ? (data.createdAt as Timestamp)
                : null

            return {
              id: userDoc.id,
              name: getUserName(data, userDoc.id),
              username: typeof data.username === 'string' ? data.username.trim() : '',

              email:
                typeof data.email === 'string'
                  ? data.email
                  : '',

              photoURL: getUserPhoto(data),
              role: getUserRole(data),
              verified: getUserVerified(data),
              createdAt,
            }
          })

        records.sort(
          (a, b) =>
            getAdminTimestampMillis(b.createdAt) -
            getAdminTimestampMillis(a.createdAt),
        )

        setOverviewUsers(records)

        markReady('users')
      },

      (error) => {
        handleSubscriptionError(
          'users',
          'Registered users',
          error,
        )
      },
    )

    // ------------------------------------------
    // PUBLISHED GAMES
    // ------------------------------------------

    const publishedGamesQuery = query(
      collection(db, GAMES_COLLECTION),
      where('status', '==', 'Published'),
    )

    const unsubscribeGames = onSnapshot(
      publishedGamesQuery,

      (snapshot) => {
        setOverviewPublishedGames(snapshot.size)

        markReady('games')
      },

      (error) => {
        handleSubscriptionError(
          'games',
          'Published games',
          error,
        )
      },
    )

    // ------------------------------------------
    // SUPPORT CONVERSATIONS
    // ------------------------------------------

    const unsubscribeConversations = onSnapshot(
      collection(db, 'supportConversations'),

      (snapshot) => {
        const records: SupportConversation[] =
          snapshot.docs.map((conversationDoc) => {
            const data = conversationDoc.data()

            return {
              id: conversationDoc.id,

              userId:
                typeof data.userId === 'string'
                  ? data.userId
                  : conversationDoc.id,

              status:
                data.status === 'resolved'
                  ? 'resolved'
                  : 'open',

              lastMessage:
                typeof data.lastMessage === 'string'
                  ? data.lastMessage
                  : '',

              lastMessageType:
                typeof data.lastMessageType === 'string'
                  ? data.lastMessageType
                  : '',

              lastMessageSenderId:
                typeof data.lastMessageSenderId === 'string'
                  ? data.lastMessageSenderId
                  : '',

              lastMessageAt: data.lastMessageAt,
              updatedAt: data.updatedAt,
              createdAt: data.createdAt,
            }
          })

        setOverviewConversations(records)

        markReady('conversations')
      },

      (error) => {
        handleSubscriptionError(
          'conversations',
          'Support conversations',
          error,
        )
      },
    )

    return () => {
      unsubscribeUsers()
      unsubscribeGames()
      unsubscribeConversations()
    }
  }, [isOverviewView])

  // ==========================================
  // FIRESTORE: GAME SUBSCRIPTION
  // ==========================================

  useEffect(() => {
    if (view !== 'manage-games') return

    setGamesLoading(true)
    setGamesError('')

    const gamesRef = collection(db, GAMES_COLLECTION)

    const unsubscribe = onSnapshot(
      gamesRef,
      (snapshot) => {
        const records: GameRecord[] =
          snapshot.docs.map((gameDoc) => {
            const data =
              gameDoc.data() as Partial<GameRecord>

            const status: GameStatus =
              data.status === 'Published' ||
              data.status === 'Archived'
                ? data.status
                : 'Draft'

            return {
              id: gameDoc.id,
              title:
                typeof data.title === 'string'
                  ? data.title
                  : '',

              description:
                typeof data.description === 'string'
                  ? data.description
                  : '',

              category:
                typeof data.category === 'string'
                  ? data.category
                  : 'Other',

              tags:
                typeof data.tags === 'string'
                  ? data.tags
                  : '',

              url:
                typeof data.url === 'string'
                  ? data.url
                  : '',

              status,

              visible:
                typeof data.visible === 'boolean'
                  ? data.visible
                  : true,

              config:
                typeof data.config === 'string'
                  ? data.config
                  : '',

              image:
                typeof data.image === 'string'
                  ? data.image
                  : '',

              imagePublicId:
                typeof data.imagePublicId === 'string'
                  ? data.imagePublicId
                  : '',

              createdAt: data.createdAt ?? null,
              updatedAt: data.updatedAt ?? null,
            }
          })

        records.sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) -
            (a.createdAt?.toMillis() ?? 0),
        )

        setGames(records)
        setGamesLoading(false)
        setGamesError('')
      },

      (error) => {
        console.error(
          'Could not subscribe to Firestore games:',
          error,
        )

        setGamesError(
          'Could not load games. Check your Firestore rules and the "games" collection.',
        )

        setGamesLoading(false)
      },
    )

    return unsubscribe
  }, [view])

  // ==========================================
  // FIRESTORE: SOCIAL LINKS SUBSCRIPTION
  // ==========================================

  useEffect(() => {
    if (view !== 'social-links') return

    setSocialLinksLoading(true)
    setSocialLinksError('')

    const socialLinksRef = doc(
      db,
      SOCIAL_SETTINGS_COLLECTION,
      SOCIAL_SETTINGS_DOCUMENT_ID,
    )

    const unsubscribe = onSnapshot(
      socialLinksRef,

      (snapshot) => {
        setSocialLinksExists(snapshot.exists())

        if (!socialLinksDirtyRef.current) {
          const savedLinks = snapshot.exists()
            ? (snapshot.data().links as Partial<
                Record<
                  SocialPlatformId,
                  Partial<SocialLinkValue>
                >
              >)
            : undefined

          const nextLinks: SocialLinksState = {
            ...DEFAULT_SOCIAL_LINKS,
          }

          for (const platform of SOCIAL_PLATFORMS) {
            const saved = savedLinks?.[platform.id]

            nextLinks[platform.id] = {
              url:
                typeof saved?.url === 'string'
                  ? saved.url
                  : '',

              enabled:
                typeof saved?.enabled === 'boolean'
                  ? saved.enabled
                  : false,
            }
          }

          setSocialLinks(nextLinks)
          setSocialLinksDirty(false)
        }

        setSocialLinksLoading(false)
        setSocialLinksError('')
      },

      (error) => {
        console.error(
          'Could not load social links from Firestore:',
          error,
        )

        setSocialLinksError(
          `Could not load social links. ${getErrorMessage(error)} Check that the siteSettings/socialLinks document is readable.`,
        )

        setSocialLinksLoading(false)
      },
    )

    return unsubscribe
  }, [view])

  // ==========================================
  // FIRESTORE: HERO BANNER SUBSCRIPTION
  // ==========================================

  useEffect(() => {
    if (view !== 'manage-hero') return

    setBannerLoading(true)
    setBannerError('')

    const bannerRef = doc(
      db,
      HERO_BANNERS_COLLECTION,
      HERO_BANNER_DOCUMENT_ID,
    )

    const unsubscribe = onSnapshot(
      bannerRef,

      (snapshot) => {
        setBannerExists(snapshot.exists())

        if (!bannerDirtyRef.current) {
          if (snapshot.exists()) {
            const data = snapshot.data()

            setBanner({
              eyebrow:
                typeof data.eyebrow === 'string'
                  ? data.eyebrow
                  : defaultHeroBanner.eyebrow,

              title:
                typeof data.title === 'string'
                  ? data.title
                  : defaultHeroBanner.title,

              accent:
                typeof data.accent === 'string'
                  ? data.accent
                  : defaultHeroBanner.accent,

              description:
                typeof data.description === 'string'
                  ? data.description
                  : defaultHeroBanner.description,

              primaryCta:
                typeof data.primaryCta === 'string'
                  ? data.primaryCta
                  : defaultHeroBanner.primaryCta,

              primaryUrl:
                typeof data.primaryUrl === 'string'
                  ? data.primaryUrl
                  : defaultHeroBanner.primaryUrl,

              secondaryCta:
                typeof data.secondaryCta === 'string'
                  ? data.secondaryCta
                  : defaultHeroBanner.secondaryCta,

              secondaryUrl:
                typeof data.secondaryUrl === 'string'
                  ? data.secondaryUrl
                  : defaultHeroBanner.secondaryUrl,

              image:
                typeof data.image === 'string'
                  ? data.image
                  : defaultHeroBanner.image,

              imagePublicId:
                typeof data.imagePublicId === 'string'
                  ? data.imagePublicId
                  : '',

              visible:
                typeof data.visible === 'boolean'
                  ? data.visible
                  : true,
            })
          } else {
            setBanner({ ...defaultHeroBanner })
          }

          setBannerDirty(false)
        }

        setBannerLoading(false)
      },

      (error) => {
        console.error(
          'Could not load homepage hero banner:',
          error,
        )

        setBannerError(
          'Could not load the hero banner from Firestore. Check the heroBanners/main document and your Firestore rules.',
        )

        setBannerLoading(false)
      },
    )

    return unsubscribe
  }, [view])

  // ==========================================
  // HERO IMAGE PREVIEW
  // ==========================================

  useEffect(() => {
    if (!bannerImageFile) {
      setBannerImagePreview('')
      return
    }

    const objectUrl =
      URL.createObjectURL(bannerImageFile)

    setBannerImagePreview(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [bannerImageFile])

  // ==========================================
  // NOTIFICATION
  // ==========================================

  const flash = (message: string) => {
    setNotice(message)

    window.setTimeout(() => {
      setNotice('')
    }, 2500)
  }

  // ==========================================
  // SOCIAL LINKS: UPDATE FIELD
  // ==========================================

  const updateSocialLink = (
    platformId: SocialPlatformId,
    changes: Partial<SocialLinkValue>,
  ) => {
    socialLinksDirtyRef.current = true
    setSocialLinksDirty(true)

    setSocialLinks((current) => ({
      ...current,
      [platformId]: {
        ...current[platformId],
        ...changes,
      },
    }))
  }

  // ==========================================
  // SOCIAL LINKS: SAVE TO FIRESTORE
  // ==========================================

  const saveSocialLinks = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setSocialLinksError('')

    for (const platform of SOCIAL_PLATFORMS) {
      const value = socialLinks[platform.id]

      if (!value.enabled) continue

      if (!value.url.trim()) {
        setSocialLinksError(
          `${platform.name} is enabled. Add its profile URL or turn it off.`,
        )
        return
      }

      if (!isValidSocialUrl(value.url)) {
        setSocialLinksError(
          `${platform.name} URL must be a valid http:// or https:// link.`,
        )
        return
      }
    }

    const normalizedLinks: SocialLinksState = {
      ...DEFAULT_SOCIAL_LINKS,
    }

    for (const platform of SOCIAL_PLATFORMS) {
      normalizedLinks[platform.id] = {
        url: socialLinks[platform.id].url.trim(),
        enabled: socialLinks[platform.id].enabled,
      }
    }

    setSocialLinksSaving(true)

    try {
      const socialLinksRef = doc(
        db,
        SOCIAL_SETTINGS_COLLECTION,
        SOCIAL_SETTINGS_DOCUMENT_ID,
      )

      await setDoc(
        socialLinksRef,
        {
          links: normalizedLinks,
          updatedAt: serverTimestamp(),

          ...(!socialLinksExists
            ? { createdAt: serverTimestamp() }
            : {}),
        },
        { merge: true },
      )

      setSocialLinks(normalizedLinks)
      socialLinksDirtyRef.current = false
      setSocialLinksDirty(false)
      setSocialLinksExists(true)

      flash(
        'Social links saved. Your homepage will update automatically.',
      )
    } catch (error) {
      console.error(
        'Could not save social links:',
        error,
      )

      setSocialLinksError(
        `Could not save social links. ${getErrorMessage(error)} Make sure you are signed in with an administrator account and have published the Firestore rules.`,
      )
    } finally {
      setSocialLinksSaving(false)
    }
  }

  // ==========================================
  // HERO BANNER: UPDATE FIELD
  // ==========================================

  const updateBannerField = <
    K extends keyof HeroBanner,
  >(
    field: K,
    value: HeroBanner[K],
  ) => {
    bannerDirtyRef.current = true
    setBannerDirty(true)

    setBanner((current) => ({
      ...current,
      [field]: value,
    }))
  }

  // ==========================================
  // HERO BANNER: IMAGE UPLOAD
  // ==========================================

  const handleBannerImageChange = (
    file: File | null,
  ) => {
    setBannerError('')

    if (!file) return

    if (!file.type.startsWith('image/')) {
      setBannerError('Please choose an image file.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setBannerError(
        'Hero image must be 5 MB or smaller.',
      )
      return
    }

    bannerDirtyRef.current = true
    setBannerDirty(true)
    setBannerImageFile(file)
  }

  // ==========================================
  // HERO BANNER: SAVE TO FIRESTORE
  // ==========================================

  const saveHeroBanner = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setBannerError('')

    if (
      !banner.title.trim() ||
      !banner.eyebrow.trim()
    ) {
      setBannerError(
        'Please enter both the eyebrow and headline.',
      )
      return
    }

    const validateOptionalUrl = (
      value: string,
      label: string,
    ): string | null => {
      if (!value.trim()) return null

      try {
        const parsed = new URL(value)

        if (
          parsed.protocol !== 'http:' &&
          parsed.protocol !== 'https:'
        ) {
          return `${label} must use http:// or https://.`
        }

        return null
      } catch {
        return `${label} must be a valid URL.`
      }
    }

    const primaryUrlError =
      validateOptionalUrl(
        banner.primaryUrl,
        'Primary button URL',
      )

    const secondaryUrlError =
      validateOptionalUrl(
        banner.secondaryUrl,
        'Secondary button URL',
      )

    if (primaryUrlError || secondaryUrlError) {
      setBannerError(
        primaryUrlError ||
          secondaryUrlError ||
          'Invalid button URL.',
      )

      return
    }

    setBannerSaving(true)

    try {
      let image = banner.image.trim()
      let imagePublicId =
        banner.imagePublicId.trim()

      if (bannerImageFile) {
        const uploaded =
          await uploadImageToCloudinary(
            bannerImageFile,
            HERO_CLOUDINARY_FOLDER,
          )

        image = uploaded.url
        imagePublicId = uploaded.publicId
      }

      const bannerRef = doc(
        db,
        HERO_BANNERS_COLLECTION,
        HERO_BANNER_DOCUMENT_ID,
      )

      const payload = {
        ...banner,
        eyebrow: banner.eyebrow.trim(),
        title: banner.title.trim(),
        accent: banner.accent.trim(),
        description: banner.description.trim(),
        primaryCta: banner.primaryCta.trim(),
        primaryUrl: banner.primaryUrl.trim(),
        secondaryCta: banner.secondaryCta.trim(),
        secondaryUrl: banner.secondaryUrl.trim(),
        image,
        imagePublicId,
        updatedAt: serverTimestamp(),

        ...(!bannerExists
          ? { createdAt: serverTimestamp() }
          : {}),
      }

      await setDoc(
        bannerRef,
        payload,
        { merge: true },
      )

      setBanner((current) => ({
        ...current,
        image,
        imagePublicId,
      }))

      setBannerImageFile(null)
      bannerDirtyRef.current = false
      setBannerDirty(false)
      setBannerExists(true)

      flash(
        'Hero banner saved to Firestore successfully.',
      )
    } catch (error) {
      console.error(
        'Could not save homepage hero banner:',
        error,
      )

      setBannerError(
        `Could not save the hero banner. ${getErrorMessage(error)} If the image upload completed, its Cloudinary asset may remain until manually cleaned up.`,
      )
    } finally {
      setBannerSaving(false)
    }
  }

  // ==========================================
  // GAME: CREATE / EDIT
  // ==========================================

  const openCreateGame = () => {
    setEditing(undefined)
    setGameOpen(true)
  }

  const openEditGame = (game: GameRecord) => {
    setEditing(game)
    setGameOpen(true)
  }

  // ==========================================
  // GAME: SAVE TO FIRESTORE
  // ==========================================

  const saveGame = async (
    values: GameFormValues,
    imageFile: File | null,
  ): Promise<void> => {
    const gameRef = editing
      ? doc(db, GAMES_COLLECTION, editing.id)
      : doc(collection(db, GAMES_COLLECTION))

    let imageUrl = values.image.trim()
    let imagePublicId =
      values.imagePublicId.trim()

    try {
      if (imageFile) {
        const uploaded =
          await uploadImageToCloudinary(imageFile)

        imageUrl = uploaded.url
        imagePublicId = uploaded.publicId
      }

      const payload = {
        ...values,
        image: imageUrl,
        imagePublicId,
        updatedAt: serverTimestamp(),

        ...(editing
          ? {}
          : { createdAt: serverTimestamp() }),
      }

      await setDoc(
        gameRef,
        payload,
        { merge: true },
      )

      setGameOpen(false)
      setEditing(undefined)

      flash(
        editing
          ? 'Game updated successfully.'
          : 'Game created successfully.',
      )
    } catch (error) {
      console.error(
        'Could not save game:',
        error,
      )

      throw new Error(
        `Could not save the game. ${getErrorMessage(error)} If the image uploaded successfully, it may remain in Cloudinary until cleaned up. Check Firestore permissions.`,
      )
    }
  }

  // ==========================================
  // GAME: DELETE
  // ==========================================

  const deleteGame = async (
    game: GameRecord,
  ) => {
    const confirmed = confirm(
      `Delete "${game.title}" permanently from the game catalogue? The Cloudinary image is not automatically deleted from the browser.`,
    )

    if (!confirmed) return

    try {
      await deleteDoc(
        doc(db, GAMES_COLLECTION, game.id),
      )

      flash(
        `"${game.title}" deleted from the catalogue.`,
      )
    } catch (error) {
      console.error(
        'Could not delete game:',
        error,
      )

      setGamesError(
        `Could not delete game. ${getErrorMessage(error)}`,
      )
    }
  }

  // ==========================================
  // GAME: UPDATE STATUS / VISIBILITY
  // ==========================================

  const updateGame = async (
    game: GameRecord,
    changes: Partial<
      Pick<GameRecord, 'visible' | 'status'>
    >,
    successMessage: string,
  ) => {
    try {
      await setDoc(
        doc(db, GAMES_COLLECTION, game.id),
        {
          ...changes,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      flash(successMessage)
    } catch (error) {
      console.error(
        'Could not update game:',
        error,
      )

      setGamesError(
        `Could not update game. ${getErrorMessage(error)}`,
      )
    }
  }

  // ==========================================
  // HERO BANNER ADMIN VIEW
  // ==========================================

  if (view === 'manage-hero') {
    const previewImage =
      bannerImagePreview ||
      banner.image ||
      defaultHeroBanner.image

    return (
      <>
        <PageTitle
          kicker="ADMIN • HOMEPAGE"
          title="Hero banners"
          sub="Edit the homepage hero content and background image. Saved changes are stored in Firestore."
        />

        {bannerError && (
          <div className="gameLoadError" role="alert">
            <Icon name="shield" />
            <span>{bannerError}</span>

            <button
              type="button"
              onClick={() => setBannerError('')}
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="toast success">
            {notice}
          </div>
        )}

        {bannerLoading && (
          <div
            className="heroBannerLoading"
            role="status"
          >
            <span className="gameSpinner" />
            Loading saved hero banner...
          </div>
        )}

        <div className="heroEditor">
          <section className="heroAdminPreview">
            <img
              src={previewImage}
              alt="Hero banner preview"
            />

            <div className="heroAdminShade" />

            <div>
              <small>
                {banner.eyebrow || 'YOUR EYEBROW'}
              </small>

              <h2>
                {banner.title || 'YOUR HEADLINE'}
                <br />
                <em>
                  {banner.accent || 'YOUR ACCENT'}
                </em>
              </h2>

              <p>
                {banner.description ||
                  'Your hero description will appear here.'}
              </p>

              <div className="heroPreviewActions">
                {banner.primaryCta && (
                  <a
                    href={banner.primaryUrl || '#'}
                    target={
                      banner.primaryUrl
                        ? '_blank'
                        : undefined
                    }
                    rel={
                      banner.primaryUrl
                        ? 'noreferrer'
                        : undefined
                    }
                    onClick={(event) => {
                      if (!banner.primaryUrl) {
                        event.preventDefault()
                      }
                    }}
                  >
                    {banner.primaryCta}
                  </a>
                )}

                {banner.secondaryCta && (
                  <a
                    className="heroSecondaryCta"
                    href={banner.secondaryUrl || '#'}
                    target={
                      banner.secondaryUrl
                        ? '_blank'
                        : undefined
                    }
                    rel={
                      banner.secondaryUrl
                        ? 'noreferrer'
                        : undefined
                    }
                    onClick={(event) => {
                      if (!banner.secondaryUrl) {
                        event.preventDefault()
                      }
                    }}
                  >
                    {banner.secondaryCta}
                  </a>
                )}
              </div>
            </div>

            <i
              className={`status ${
                banner.visible ? 'active' : ''
              }`}
            >
              {banner.visible
                ? 'Visible on homepage'
                : 'Hidden from homepage'}
            </i>
          </section>

          <form
            className="panel heroAdminForm"
            onSubmit={saveHeroBanner}
          >
            <div className="formHeading">
              <div>
                <h3>Banner content</h3>
                <p>Changes are previewed instantly.</p>

                <small className="heroSaveState">
                  {bannerDirty
                    ? 'Unsaved changes'
                    : bannerExists
                      ? 'Saved in Firestore'
                      : 'Not saved yet'}
                </small>
              </div>

              <button
                type="button"
                className={`toggle ${
                  banner.visible ? 'active' : ''
                }`}
                aria-label={
                  banner.visible
                    ? 'Hide hero banner'
                    : 'Show hero banner'
                }
                aria-pressed={banner.visible}
                onClick={() =>
                  updateBannerField(
                    'visible',
                    !banner.visible,
                  )
                }
              >
                <i />
              </button>
            </div>

            <div className="heroVisibilityLabel">
              <small>Background image</small>
            </div>

            <div className="heroImageField">
              <div className="bannerUpload">
                <span>
                  {bannerImageFile
                    ? bannerImageFile.name
                    : banner.image
                      ? 'Current image is saved'
                      : 'No background image selected'}
                </span>

                <label className="heroChooseImage">
                  <small>Choose image</small>

                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      handleBannerImageChange(
                        event.target.files?.[0] ?? null,
                      )

                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>

              <small className="fieldHint">
                PNG, JPG, WEBP or GIF • Maximum 5 MB • Uploaded to Cloudinary when you save.
              </small>
            </div>

            <br />

            <label>
              Eyebrow

              <input
                required
                maxLength={50}
                value={banner.eyebrow}
                onChange={(event) =>
                  updateBannerField(
                    'eyebrow',
                    event.target.value,
                  )
                }
                placeholder="YOUR NEXT CHAPTER STARTS HERE"
              />
            </label>

            <div className="formGrid">
              <label>
                Headline

                <input
                  required
                  maxLength={40}
                  value={banner.title}
                  onChange={(event) =>
                    updateBannerField(
                      'title',
                      event.target.value,
                    )
                  }
                  placeholder="PLAY BOLD."
                />
              </label>

              <label>
                Accent headline

                <input
                  maxLength={50}
                  value={banner.accent}
                  onChange={(event) =>
                    updateBannerField(
                      'accent',
                      event.target.value,
                    )
                  }
                  placeholder="CONNECT DEEPER."
                />
              </label>
            </div>

            <label>
              Description

              <textarea
                required
                maxLength={300}
                rows={4}
                value={banner.description}
                onChange={(event) =>
                  updateBannerField(
                    'description',
                    event.target.value,
                  )
                }
                placeholder="Describe your community..."
              />
            </label>

            <div className="formGrid">
              <label>
                Primary button

                <input
                  maxLength={40}
                  value={banner.primaryCta}
                  onChange={(event) =>
                    updateBannerField(
                      'primaryCta',
                      event.target.value,
                    )
                  }
                  placeholder="Join the community"
                />
              </label>

              <label>
                Primary button link

                <input
                  type="url"
                  value={banner.primaryUrl}
                  onChange={(event) =>
                    updateBannerField(
                      'primaryUrl',
                      event.target.value,
                    )
                  }
                  placeholder="https://example.com/join"
                />
              </label>

              <label>
                Secondary button

                <input
                  maxLength={40}
                  value={banner.secondaryCta}
                  onChange={(event) =>
                    updateBannerField(
                      'secondaryCta',
                      event.target.value,
                    )
                  }
                  placeholder="Explore games"
                />
              </label>

              <label>
                Secondary button link

                <input
                  type="url"
                  value={banner.secondaryUrl}
                  onChange={(event) =>
                    updateBannerField(
                      'secondaryUrl',
                      event.target.value,
                    )
                  }
                  placeholder="https://example.com/games"
                />
              </label>
            </div>

            <div className="heroFormActions">
              <small>
                {bannerDirty
                  ? 'You have unsaved changes.'
                  : 'Your saved banner is stored in Firestore.'}
              </small>

              <button
                type="submit"
                className="btn"
                disabled={
                  bannerSaving || bannerLoading
                }
              >
                {bannerSaving
                  ? 'Saving banner...'
                  : 'Save banner'}
              </button>
            </div>
          </form>
        </div>
      </>
    )
  }

  // ==========================================
  // GAME MANAGEMENT VIEW
  // ==========================================

  if (view === 'manage-games') {
    const shown = games.filter((game) => {
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Hidden'
          ? !game.visible
          : game.status === filter)

      const searchable =
        `${game.title} ${game.category} ${game.description} ${game.tags}`

      return (
        matchesFilter &&
        searchable
          .toLowerCase()
          .includes(queryText.toLowerCase())
      )
    })

    return (
      <>
        <PageTitle
          kicker="ADMIN • CATALOG"
          title="Game management"
          sub="Create, publish, organize, hide, and manage the games stored in Firestore."
        />

        <div className="gameManagementToolbar">
          <div className="smallSearch gameManagementSearch">
            <Icon name="search" />

            <input
              value={queryText}
              onChange={(event) =>
                setQueryText(event.target.value)
              }
              placeholder="Search games, categories, tags..."
            />
          </div>

          <div className="gameManagementActions">
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value)
              }
              aria-label="Filter games"
            >
              <option value="All">All games</option>
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
              <option value="Hidden">Hidden</option>
            </select>

            <Button onClick={openCreateGame}>
              ＋ Add game
            </Button>
          </div>
        </div>

        <div className="gameManagementMeta">
          <span>
            <b>{games.length}</b>{' '}
            {games.length === 1 ? 'game' : 'games'} in Firestore
          </span>

          <span>Changes sync automatically</span>
        </div>

        {notice && (
          <div className="toast success">
            {notice}
          </div>
        )}

        {gamesError && (
          <div className="gameLoadError" role="alert">
            <Icon name="shield" />
            <span>{gamesError}</span>

            <button
              type="button"
              onClick={() => setGamesError('')}
            >
              Dismiss
            </button>
          </div>
        )}

        {gamesLoading ? (
          <div className="gameManagementLoading panel">
            <span className="gameSpinner" />
            <b>Loading games from Firestore...</b>
            <p>
              Your saved game catalogue will appear here.
            </p>
          </div>
        ) : shown.length > 0 ? (
          <div className="gameAdminGrid">
            {shown.map((game) => (
              <article
                className="gameAdminCard"
                key={game.id}
              >
                <div className="gameCover">
                  {game.image ? (
                    <img
                      src={game.image}
                      alt={`${game.title} cover`}
                    />
                  ) : (
                    <div className="gameCoverPlaceholder">
                      <Icon name="game" size={32} />
                      <span>No cover image</span>
                    </div>
                  )}

                  <i
                    className={`status ${
                      game.status === 'Published'
                        ? 'active'
                        : ''
                    }`}
                  >
                    {game.status}
                  </i>

                  {!game.visible && (
                    <span className="gameHiddenBadge">
                      Hidden
                    </span>
                  )}
                </div>

                <div className="gameAdminBody">
                  <div className="gameCardTitleRow">
                    <small>
                      {game.category || 'Uncategorized'}
                    </small>

                    <span
                      className={
                        game.visible
                          ? 'visibilityOn'
                          : 'visibilityOff'
                      }
                    >
                      {game.visible ? 'Visible' : 'Hidden'}
                    </span>
                  </div>

                  <h3>{game.title}</h3>

                  {game.description && (
                    <p>{game.description}</p>
                  )}

                  {game.tags && (
                    <div className="gameTagList">
                      {game.tags
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 5)
                        .map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                    </div>
                  )}

                  <div className="gameAdminDetails">
                    {game.url && (
                      <a
                        href={game.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open game URL ↗
                      </a>
                    )}

                    {game.config && (
                      <span>Configuration saved</span>
                    )}
                  </div>

                  <div className="cardActions gameCardActions">
                    <button
                      type="button"
                      onClick={() =>
                        openEditGame(game)
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateGame(
                          game,
                          {
                            status:
                              game.status === 'Published'
                                ? 'Draft'
                                : 'Published',
                          },
                          game.status === 'Published'
                            ? 'Game moved to draft.'
                            : 'Game published.',
                        )
                      }
                    >
                      {game.status === 'Published'
                        ? 'Unpublish'
                        : 'Publish'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateGame(
                          game,
                          {
                            visible: !game.visible,
                          },
                          game.visible
                            ? 'Game hidden from players.'
                            : 'Game is visible to players.',
                        )
                      }
                    >
                      {game.visible ? 'Hide' : 'Show'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateGame(
                          game,
                          { status: 'Archived' },
                          'Game archived.',
                        )
                      }
                    >
                      Archive
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteGame(game)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty panel gameEmptyState">
            <Icon name="game" size={30} />

            <b>
              {games.length === 0
                ? 'Your game catalogue is empty'
                : 'No games found'}
            </b>

            <p>
              {games.length === 0
                ? 'Create your first game. It will be saved to Firestore and appear here automatically.'
                : 'Try another search or filter, or create a new game.'}
            </p>

            {games.length === 0 && (
              <Button onClick={openCreateGame}>
                ＋ Create first game
              </Button>
            )}
          </div>
        )}

        {gameOpen && (
          <Modal
            title={
              editing
                ? `Edit ${editing.title}`
                : 'Create a new game'
            }
            close={() => {
              if (!gamesLoading) {
                setGameOpen(false)
                setEditing(undefined)
              }
            }}
          >
            <GameForm
              game={editing}
              close={() => {
                setGameOpen(false)
                setEditing(undefined)
              }}
              save={saveGame}
            />
          </Modal>
        )}
      </>
    )
  }

  // ==========================================
  // ADMIN MESSAGES
  // ==========================================

  if (view === 'admin-messages') {
    return <AdminChats />
  }

  // ==========================================
  // USER MANAGEMENT
  // ==========================================

  if (view === 'users') {
    return <AdminUserManagement />
  }

  // ==========================================
  // SOCIAL LINKS MANAGEMENT
  // ==========================================

  if (view === 'social-links') {
    const activeCount = SOCIAL_PLATFORMS.filter(
      ({ id }) => {
        const value = socialLinks[id]

        return (
          value.enabled &&
          isValidSocialUrl(value.url)
        )
      },
    ).length

    return (
      <>
        <PageTitle
          kicker="ADMIN • COMMUNITY"
          title="Social links"
          sub="Control which community channels appear on your homepage. Changes sync to visitors automatically."
        />

        {socialLinksError && (
          <div
            className="gameLoadError socialAdminError"
            role="alert"
          >
            <Icon name="shield" />
            <span>{socialLinksError}</span>

            <button
              type="button"
              onClick={() => setSocialLinksError('')}
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="toast success">
            {notice}
          </div>
        )}

        <div className="socialAdminPage">
          <section className="panel socialAdminIntro">
            <div className="socialAdminIntroCopy">
              <span className="kicker">
                COMMUNITY CONNECTIONS
              </span>

              <h2>Bring your community together.</h2>

              <p>
                Add your official social profiles, choose which ones
                are public, and manage every link from one place.
              </p>
            </div>

            <div
              className="socialAdminActiveCount"
              aria-live="polite"
            >
              <b>
                {activeCount}
                <span>/5</span>
              </b>

              <small>Active channels</small>
            </div>
          </section>

          {socialLinksLoading ? (
            <div
              className="panel socialAdminLoading"
              role="status"
            >
              <span className="gameSpinner" />

              <div>
                <b>Loading your social links</b>
                <p>Connecting to Firestore...</p>
              </div>
            </div>
          ) : (
            <form
              className="socialAdminForm"
              onSubmit={saveSocialLinks}
            >
              <div className="socialAdminSectionHead">
                <div>
                  <h2>Social platforms</h2>

                  <p>
                    Paste a profile or invite URL, then switch on the
                    channels you want visitors to see.
                  </p>
                </div>

                <span className="socialAdminLiveHint">
                  <i />
                  Live sync enabled
                </span>
              </div>

              <div className="socialAdminGrid">
                {SOCIAL_PLATFORMS.map((platform) => {
                  const value = socialLinks[platform.id]

                  const connected =
                    Boolean(value.url.trim()) &&
                    isValidSocialUrl(value.url)

                  const published =
                    value.enabled && connected

                  return (
                    <article
                      className={`socialAdminCard ${
                        published ? 'isPublished' : ''
                      }`}
                      key={platform.id}
                    >
                      <div className="socialAdminCardTop">
                        <span
                          className={`socialAdminIcon socialAdminIcon--${platform.id}`}
                        >
                          {platform.initials}
                        </span>

                        <div className="socialAdminPlatformInfo">
                          <h3>{platform.name}</h3>
                          <p>{platform.description}</p>
                        </div>

                        <button
                          type="button"
                          className={`socialAdminSwitch ${
                            value.enabled ? 'active' : ''
                          }`}
                          role="switch"
                          aria-checked={value.enabled}
                          aria-label={`${
                            value.enabled ? 'Disable' : 'Enable'
                          } ${platform.name}`}
                          disabled={socialLinksSaving}
                          onClick={() =>
                            updateSocialLink(
                              platform.id,
                              {
                                enabled: !value.enabled,
                              },
                            )
                          }
                        >
                          <span />
                        </button>
                      </div>

                      <label className="socialAdminField">
                        <span>Profile URL</span>

                        <input
                          type="text"
                          inputMode="url"
                          value={value.url}
                          onChange={(event) =>
                            updateSocialLink(
                              platform.id,
                              {
                                url: event.target.value,
                              },
                            )
                          }
                          placeholder={platform.placeholder}
                          autoComplete="url"
                          disabled={socialLinksSaving}
                        />
                      </label>

                      <div className="socialAdminCardBottom">
                        <span
                          className={`socialAdminStatus ${
                            published ? 'online' : ''
                          }`}
                        >
                          <i />

                          {published
                            ? 'Visible on homepage'
                            : value.enabled
                              ? connected
                                ? 'Ready to publish'
                                : 'Add a valid URL'
                              : 'Hidden from homepage'}
                        </span>

                        {connected && (
                          <a
                            href={value.url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Preview link ↗
                          </a>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="socialAdminSaveBar">
                <div className="socialAdminSaveMessage">
                  <span
                    className={
                      socialLinksDirty
                        ? 'unsaved'
                        : 'saved'
                    }
                  >
                    <i />

                    {socialLinksDirty
                      ? 'You have unsaved changes'
                      : socialLinksExists
                        ? 'All changes are saved'
                        : 'No social links have been saved yet'}
                  </span>

                  <small>
                    Only administrators can change these settings.
                  </small>
                </div>

                <button
                  type="submit"
                  className="btn socialAdminSaveButton"
                  disabled={
                    socialLinksSaving ||
                    !socialLinksDirty
                  }
                >
                  {socialLinksSaving
                    ? 'Saving links...'
                    : 'Save changes'}
                </button>
              </div>
            </form>
          )}

          <div className="socialAdminSecurityNote">
            <Icon name="shield" size={16} />

            <p>
              <b>Protected settings</b>

              <span>
                Social URLs are public so visitors can open them.
                Creating or changing the settings requires an
                administrator account.
              </span>
            </p>
          </div>
        </div>
      </>
    )
  }

  // ==========================================
  // DYNAMIC ADMIN OVERVIEW
  // ==========================================

  // One entry per user with an open conversation.
  const openTicketCount = new Set(
    overviewConversations
      .filter(
        (conversation) =>
          conversation.status === 'open',
      )
      .map((conversation) => conversation.userId),
  ).size

  // Unique conversations resolved since Monday.
  // Uses updatedAt as the resolution timestamp.
  const overviewWeekStart =
    getCurrentWeekStartMillis()

  const resolvedThisWeek = new Set(
    overviewConversations
      .filter(
        (conversation) =>
          conversation.status === 'resolved' &&
          getAdminTimestampMillis(
            conversation.updatedAt,
          ) >= overviewWeekStart,
      )
      .map((conversation) => conversation.userId),
  ).size

  // Latest users, sorted by createdAt.
  const recentUsers =
    overviewUsers.slice(0, 4)

  // Profile lookup for support queue.
  const overviewUserMap = new Map<string, AdminUser>(
    overviewUsers.map((user) => [user.id, user]),
  )

  // Latest open member messages.
  // One item per member, not one item per message.
  const queueSeenUsers = new Set<string>()

  const supportQueue = [...overviewConversations]
    .filter((conversation) => {
      const hasMessage =
        Boolean(conversation.lastMessage?.trim())

      const isOpen =
        conversation.status === 'open'

      // Admin replies use their UID in lastMessageSenderId.
      // Messages without this field are included for
      // compatibility with older support conversation data.
      const isMemberMessage =
        !conversation.lastMessageSenderId ||
        conversation.lastMessageSenderId !==
          currentAdmin?.uid

      return (
        isOpen &&
        hasMessage &&
        isMemberMessage
      )
    })
    .sort((a, b) => {
      const aTime =
        getAdminTimestampMillis(a.lastMessageAt) ||
        getAdminTimestampMillis(a.updatedAt)

      const bTime =
        getAdminTimestampMillis(b.lastMessageAt) ||
        getAdminTimestampMillis(b.updatedAt)

      return bTime - aTime
    })
    .filter((conversation) => {
      if (queueSeenUsers.has(conversation.userId)) {
        return false
      }

      queueSeenUsers.add(conversation.userId)

      return true
    })
    .slice(0, 4)

  // Dashboard metric data.
  const metricItems = [
    {
      value: overviewUsers.length.toLocaleString(),
      label: 'Registered users',
      detail: 'Total member accounts',
      icon: 'user',
    },
    {
      value: overviewPublishedGames.toLocaleString(),
      label: 'Published games',
      detail: 'Games with published status',
      icon: 'game',
    },
    {
      value: openTicketCount.toLocaleString(),
      label: 'Open tickets',
      detail: 'Unique open conversations',
      icon: 'chat',
    },
    {
      value: resolvedThisWeek.toLocaleString(),
      label: 'Resolved this week',
      detail: 'Unique conversations resolved',
      icon: 'shield',
    },
  ]

  return (
    <>
      {/* ======================================
          OVERVIEW HEADER
          ====================================== */}

      <div className="welcome">
        <div>
          <span className="kicker">
            ADMINISTRATION
          </span>

          <h1>Good morning, Nicole</h1>

          <p>
            Here's a live snapshot of your community activity.
          </p>
        </div>

        <Button
          onClick={() => go('manage-games')}
        >
          ＋ Publish update
        </Button>
      </div>

      {/* ======================================
          OVERVIEW ERROR
          ====================================== */}

      {overviewError && (
        <div
          className="gameLoadError"
          role="alert"
        >
          <Icon name="shield" />

          <span>
            Some dashboard information could not be loaded:
            {' '}
            {overviewError}
            {' '}
            Check your Firestore permissions.
          </span>

          <button
            type="button"
            onClick={() => setOverviewError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ======================================
          LIVE METRICS
          ====================================== */}

      <div className="metricGrid">
        {metricItems.map((item) => (
          <article key={item.label}>
            <span>
              <Icon name={item.icon} />
            </span>

            <small>{item.label}</small>

            <b>
              {overviewLoading
                ? '—'
                : item.value}
            </b>

            <i className="overviewMetricDetail">
              {item.detail}
            </i>
          </article>
        ))}
      </div>

      {/* ======================================
          RECENT USERS + SUPPORT QUEUE
          ====================================== */}

      <div className="adminColumns">

        {/* ------------------------------------
            RECENT USERS
            ------------------------------------ */}

        <div className="panel adminOverviewPanel">
          <div className="widgetHead">
            <div>
              <h3>Recent users</h3>

              <small className="overviewSectionHint">
                Latest registered community members
              </small>
            </div>

            <button
              type="button"
              onClick={() => go('users')}
            >
              View all →
            </button>
          </div>

          {overviewLoading &&
          overviewUsers.length === 0 ? (
            <div className="overviewLoading">
              <span className="gameSpinner" />
              <small>Loading recent users...</small>
            </div>
          ) : recentUsers.length > 0 ? (
            recentUsers.map((user) => (
              <div
                key={user.id}
                className="userline adminOverviewUser"
              >
                <span className="av adminOverviewAvatar">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    user.name
                      .charAt(0)
                      .toUpperCase() || 'U'
                  )}
                </span>

                <div>
                  <b>{user.name}</b>

                  <small>
                    {user.email ||
                      `Joined ${formatUserJoinedDate(user.createdAt)}`}
                  </small>
                </div>

                <i
                  className={
                    user.verified === 1
                      ? 'overviewUserVerified'
                      : 'overviewUserRole'
                  }
                >
                  {user.verified === 1
                    ? 'Verified'
                    : formatUserRole(user.role)}
                </i>
              </div>
            ))
          ) : (
            <div className="overviewEmpty">
              <Icon name="user" size={23} />

              <b>No users found</b>

              <small>
                Registered user accounts will appear here.
              </small>
            </div>
          )}
        </div>

        {/* ------------------------------------
            SUPPORT QUEUE
            ------------------------------------ */}

        <div className="panel adminOverviewPanel">
          <div className="widgetHead">
            <div>
              <h3>Support queue</h3>

              <small className="overviewSectionHint">
                Latest unanswered member messages
              </small>
            </div>

            <button
              type="button"
              onClick={() => go('admin-messages')}
            >
              Open inbox →
            </button>
          </div>

          {overviewLoading &&
          overviewConversations.length === 0 ? (
            <div className="overviewLoading">
              <span className="gameSpinner" />
              <small>Loading support messages...</small>
            </div>
          ) : supportQueue.length > 0 ? (
            supportQueue.map((conversation) => {
              const profile =
                overviewUserMap.get(
                  conversation.userId,
                )

              const name =
                profile?.name ||
                `Member ${conversation.userId.slice(0, 7)}`

              const time =
                formatAdminChatTime(
                  conversation.lastMessageAt ||
                    conversation.updatedAt,
                ) || 'Recently'

              const preview =
                conversation.lastMessageType === 'image'
                  ? conversation.lastMessage ||
                    '📷 Sent an image'
                  : conversation.lastMessage

              return (
                <div
                  className="ticketline adminOverviewQueueLine"
                  key={conversation.id}
                >
                  <span className="adminOverviewQueueAvatar">
                    {profile?.photoURL ? (
                      <img
                        src={profile.photoURL}
                        alt={name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </span>

                  <div className="adminOverviewQueueInfo">
                    <b>{name}</b>

                    <small className="adminOverviewQueueMessage">
                      {preview}
                    </small>
                  </div>

                  <i className="adminOverviewQueueTime">
                    {time}
                  </i>
                </div>
              )
            })
          ) : (
            <div className="overviewEmpty">
              No pending messages
              <small>
                New unanswered member messages will appear here.
              </small>
            </div>
          )}
        </div>
      </div>
    </>
  )
}