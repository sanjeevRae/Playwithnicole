import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { Icon, Button, PageTitle } from './App'
import type { View } from './types'

// Keep this collection name aligned with the collection used by your public game catalogue.
const GAMES_COLLECTION = 'games'
const HERO_BANNERS_COLLECTION = 'heroBanners'
const HERO_BANNER_DOCUMENT_ID = 'main'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const CLOUDINARY_FOLDER = 'playwithnicole/games'
const HERO_CLOUDINARY_FOLDER = 'playwithnicole/hero-banners'

type GameStatus = 'Draft' | 'Published' | 'Archived'

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

type GameFormValues = Omit<GameRecord, 'id' | 'createdAt' | 'updatedAt'>

type DemoUser = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
}

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

// Used as the initial preview until the administrator saves the first Firestore banner.
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

type CloudinaryUploadResponse = {
  secure_url?: string
  public_id?: string
  error?: { message?: string }
}

async function uploadImageToCloudinary(
  file: File,
  folder: string = CLOUDINARY_FOLDER,
): Promise<{ url: string; publicId: string }> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

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
    { method: 'POST', body },
  )

  const result = (await response.json()) as CloudinaryUploadResponse

  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(
      result.error?.message || `Cloudinary upload failed (${response.status}).`,
    )
  }

  return { url: result.secure_url, publicId: result.public_id }
}

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
        if (event.target === event.currentTarget) close()
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
          <button type="button" onClick={close} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function GameForm({
  game,
  close,
  save,
}: {
  game?: GameRecord
  close: () => void
  save: (values: GameFormValues, imageFile: File | null) => Promise<void>
}) {
  const [values, setValues] = useState<GameFormValues>(() =>
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState(game?.image ?? '')
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
    setValues((current) => ({ ...current, [field]: value }))
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')

    if (!values.title.trim()) {
      setFormError('Game title is required.')
      return
    }

    if (values.url.trim()) {
      try {
        const parsedUrl = new URL(values.url)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          setFormError('Game URL must start with http:// or https://.')
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
        setFormError('Configuration must contain valid JSON, or be left empty.')
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
    <form className="gameForm firestoreGameForm" onSubmit={handleSubmit}>
      <div className="gameImageField">
        <div className="gameImagePreview">
          {preview ? (
            <img src={preview} alt="Game cover preview" />
          ) : (
            <div className="gameImageEmpty">
              <Icon name="game" size={30} />
              <span>Game cover preview</span>
            </div>
          )}
        </div>

        <div className="gameImageControls">
          <label className="gameUploadButton">
            <Icon name="game" size={15} /> Upload cover image
            <input
              type="file"
              accept="image/*"
              onChange={(event) =>
                handleImageChange(event.target.files?.[0] ?? null)
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
            onChange={(event) => update('title', event.target.value)}
            placeholder="e.g. Neon Vanguard"
          />
        </label>

        <label>
          Category <span className="requiredMark">*</span>
          <select
            required
            value={values.category}
            onChange={(event) => update('category', event.target.value)}
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
            onChange={(event) => update('description', event.target.value)}
            placeholder="Describe the game for your community..."
          />
        </label>

        <label>
          Tags
          <input
            value={values.tags}
            onChange={(event) => update('tags', event.target.value)}
            placeholder="co-op, multiplayer, featured"
          />
          <small className="fieldHint">Separate tags with commas.</small>
        </label>

        <label>
          Game URL
          <input
            type="url"
            value={values.url}
            onChange={(event) => update('url', event.target.value)}
            placeholder="https://example.com/play"
          />
        </label>

        <label>
          Status
          <select
            value={values.status}
            onChange={(event) =>
              update('status', event.target.value as GameStatus)
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
            onChange={(event) => update('config', event.target.value)}
            placeholder={'{\n  "mode": "multiplayer"\n}'}
          />
        </label>

        <label className="gameVisibilityField gameFormFull">
          <input
            type="checkbox"
            checked={values.visible}
            onChange={(event) => update('visible', event.target.checked)}
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
          <Icon name="shield" size={15} /> {formError}
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
        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Saving...' : game ? 'Save changes' : 'Create game'}
        </button>
      </div>
    </form>
  )
}

function AdminChats() {
  const [selected, setSelected] = useState(0)
  const [notice, setNotice] = useState('')
  const chats = [
    ['Nicole Player', 'Missing saved games', 'Open'],
    ['Kai Morgan', 'Reported message', 'Reported'],
    ['Mika Chen', 'Account help', 'Resolved'],
  ]

  return (
    <>
      <PageTitle
        kicker="ADMIN • INBOX"
        title="Chat management"
        sub="Review and resolve member conversations."
      />
      <div className="adminToolbar chatToolbar">
        <div className="smallSearch">
          <Icon name="search" />
          <input placeholder="Search conversations..." />
        </div>
        <span className="queueCount">3 conversations</span>
      </div>
      {notice && <div className="toast success">{notice}</div>}
      <div className="moderation compactModeration">
        <div className="panel conversationList">
          {chats.map((chat, index) => (
            <button
              className={selected === index ? 'selected' : ''}
              onClick={() => setSelected(index)}
              key={chat[0]}
            >
              <span className="av">{chat[0][0]}</span>
              <div>
                <b>{chat[0]}</b>
                <small>{chat[1]}</small>
              </div>
              <i className={chat[2] === 'Reported' ? 'reported' : ''}>
                {chat[2]}
              </i>
            </button>
          ))}
        </div>
        <section className="panel messageReview">
          <div className="chatHead">
            <span className="av">{chats[selected][0][0]}</span>
            <div>
              <b>{chats[selected][0]}</b>
              <small>{chats[selected][1]}</small>
            </div>
            <i
              className={
                chats[selected][2] === 'Reported'
                  ? 'status reported'
                  : 'status active'
              }
            >
              {chats[selected][2]}
            </i>
          </div>
          <div className="messages">
            <div className="day">TODAY</div>
            <div className="bubble in">
              Hi, I need help with my account and saved games.
              <time>10:24 AM</time>
            </div>
            <div className="bubble out">
              Thanks for reaching out. We're reviewing this now.
              <time>10:26 AM</time>
            </div>
            {selected === 1 && (
              <div className="reportBox">
                <b>Reported message</b>
                <p>Reason: inappropriate language</p>
              </div>
            )}
          </div>
          <div className="moderationActions">
            <Button onClick={() => setNotice('Conversation resolved')}>
              Resolve conversation
            </Button>
            {selected === 1 && (
              <button
                className="danger"
                onClick={() => confirm('Delete the reported message?')}
              >
                Delete reported message
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

export function AdminPage({
  view,
  go,
}: {
  view: View
  go: (v: View) => void
}) {
  const [users] = useState<DemoUser[]>([
    { id: 1, name: 'Nicole Player', email: 'player1@example.com', role: 'Admin', active: true },
    { id: 2, name: 'Kai Morgan', email: 'player2@example.com', role: 'Moderator', active: true },
    { id: 3, name: 'Mika Chen', email: 'player3@example.com', role: 'Player', active: false },
    { id: 4, name: 'Jordan Ellis', email: 'player4@example.com', role: 'Player', active: true },
  ])

  const [games, setGames] = useState<GameRecord[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState('')
  const [queryText, setQueryText] = useState('')
  const [filter, setFilter] = useState('All')
  const [editing, setEditing] = useState<GameRecord | undefined>()
  const [gameOpen, setGameOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const [banner, setBanner] = useState<HeroBanner>({ ...defaultHeroBanner })
  const [bannerImageFile, setBannerImageFile] = useState<File | null>(null)
  const [bannerImagePreview, setBannerImagePreview] = useState('')
  const [bannerLoading, setBannerLoading] = useState(false)
  const [bannerSaving, setBannerSaving] = useState(false)
  const [bannerError, setBannerError] = useState('')
  const [bannerDirty, setBannerDirty] = useState(false)
  const [bannerExists, setBannerExists] = useState(false)
  const bannerDirtyRef = useRef(false)

  // Live Firestore subscription: cards update automatically after create/edit/delete.
  useEffect(() => {
    if (view !== 'manage-games') return

    setGamesLoading(true)
    setGamesError('')

    const gamesRef = collection(db, GAMES_COLLECTION)
    const unsubscribe = onSnapshot(
      gamesRef,
      (snapshot) => {
        const records: GameRecord[] = snapshot.docs.map((gameDoc) => {
          const data = gameDoc.data() as Partial<GameRecord>
          const status: GameStatus =
            data.status === 'Published' || data.status === 'Archived'
              ? data.status
              : 'Draft'

          return {
            id: gameDoc.id,
            title: typeof data.title === 'string' ? data.title : '',
            description:
              typeof data.description === 'string' ? data.description : '',
            category: typeof data.category === 'string' ? data.category : 'Other',
            tags: typeof data.tags === 'string' ? data.tags : '',
            url: typeof data.url === 'string' ? data.url : '',
            status,
            visible: typeof data.visible === 'boolean' ? data.visible : true,
            config: typeof data.config === 'string' ? data.config : '',
            image: typeof data.image === 'string' ? data.image : '',
            imagePublicId:
              typeof data.imagePublicId === 'string' ? data.imagePublicId : '',
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          }
        })

        records.sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        )

        setGames(records)
        setGamesLoading(false)
        setGamesError('')
      },
      (error) => {
        console.error('Could not subscribe to Firestore games:', error)
        setGamesError(
          'Could not load games. Check your Firestore rules and the "games" collection.',
        )
        setGamesLoading(false)
      },
    )

    return unsubscribe
  }, [view])

  // Load the single homepage hero document. The same existing preview/form UI is
  // populated from Firestore; if no document exists, the original design remains
  // as an editable first-time placeholder.
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

        // Do not replace unsaved text/image edits if another snapshot arrives.
        if (!bannerDirtyRef.current) {
          if (snapshot.exists()) {
            const data = snapshot.data()
            setBanner({
              eyebrow: typeof data.eyebrow === 'string' ? data.eyebrow : defaultHeroBanner.eyebrow,
              title: typeof data.title === 'string' ? data.title : defaultHeroBanner.title,
              accent: typeof data.accent === 'string' ? data.accent : defaultHeroBanner.accent,
              description: typeof data.description === 'string' ? data.description : defaultHeroBanner.description,
              primaryCta: typeof data.primaryCta === 'string' ? data.primaryCta : defaultHeroBanner.primaryCta,
              primaryUrl: typeof data.primaryUrl === 'string' ? data.primaryUrl : defaultHeroBanner.primaryUrl,
              secondaryCta: typeof data.secondaryCta === 'string' ? data.secondaryCta : defaultHeroBanner.secondaryCta,
              secondaryUrl: typeof data.secondaryUrl === 'string' ? data.secondaryUrl : defaultHeroBanner.secondaryUrl,
              image: typeof data.image === 'string' ? data.image : defaultHeroBanner.image,
              imagePublicId: typeof data.imagePublicId === 'string' ? data.imagePublicId : '',
              visible: typeof data.visible === 'boolean' ? data.visible : true,
            })
          } else {
            setBanner({ ...defaultHeroBanner })
          }
          setBannerDirty(false)
        }

        setBannerLoading(false)
      },
      (error) => {
        console.error('Could not load homepage hero banner:', error)
        setBannerError(
          'Could not load the hero banner from Firestore. Check the heroBanners/main document and your Firestore rules.',
        )
        setBannerLoading(false)
      },
    )

    return unsubscribe
  }, [view])

  // Generate a local preview for a newly selected image and release it on change.
  useEffect(() => {
    if (!bannerImageFile) {
      setBannerImagePreview('')
      return
    }

    const objectUrl = URL.createObjectURL(bannerImageFile)
    setBannerImagePreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [bannerImageFile])

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2500)
  }

  const updateBannerField = <K extends keyof HeroBanner>(
    field: K,
    value: HeroBanner[K],
  ) => {
    bannerDirtyRef.current = true
    setBannerDirty(true)
    setBanner((current) => ({ ...current, [field]: value }))
  }

  const handleBannerImageChange = (file: File | null) => {
    setBannerError('')
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setBannerError('Please choose an image file.')
      return
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setBannerError('Hero image must be 5 MB or smaller.')
      return
    }

    bannerDirtyRef.current = true
    setBannerDirty(true)
    setBannerImageFile(file)
  }

  const saveHeroBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBannerError('')

    if (!banner.title.trim() || !banner.eyebrow.trim()) {
      setBannerError('Please enter both the eyebrow and headline.')
      return
    }

    const validateOptionalUrl = (value: string, label: string): string | null => {
      if (!value.trim()) return null
      try {
        const parsed = new URL(value)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return `${label} must use http:// or https://.`
        }
        return null
      } catch {
        return `${label} must be a valid URL.`
      }
    }

    const primaryUrlError = validateOptionalUrl(banner.primaryUrl, 'Primary button URL')
    const secondaryUrlError = validateOptionalUrl(banner.secondaryUrl, 'Secondary button URL')
    if (primaryUrlError || secondaryUrlError) {
      setBannerError(primaryUrlError || secondaryUrlError || 'Invalid button URL.')
      return
    }

    setBannerSaving(true)

    try {
      let image = banner.image.trim()
      let imagePublicId = banner.imagePublicId.trim()

      if (bannerImageFile) {
        const uploaded = await uploadImageToCloudinary(
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
        ...(!bannerExists ? { createdAt: serverTimestamp() } : {}),
      }

      await setDoc(bannerRef, payload, { merge: true })

      setBanner((current) => ({ ...current, image, imagePublicId }))
      setBannerImageFile(null)
      bannerDirtyRef.current = false
      setBannerDirty(false)
      setBannerExists(true)
      flash('Hero banner saved to Firestore successfully.')
    } catch (error) {
      console.error('Could not save homepage hero banner:', error)
      setBannerError(
        `Could not save the hero banner. ${getErrorMessage(error)} If the image upload completed, its Cloudinary asset may remain until manually cleaned up.`,
      )
    } finally {
      setBannerSaving(false)
    }
  }

  const openCreateGame = () => {
    setEditing(undefined)
    setGameOpen(true)
  }

  const openEditGame = (game: GameRecord) => {
    setEditing(game)
    setGameOpen(true)
  }

  // Upload cover image to Cloudinary, then save its secure URL and public ID in Firestore.
  const saveGame = async (
    values: GameFormValues,
    imageFile: File | null,
  ): Promise<void> => {
    const gameRef = editing
      ? doc(db, GAMES_COLLECTION, editing.id)
      : doc(collection(db, GAMES_COLLECTION))

    let imageUrl = values.image.trim()
    let imagePublicId = values.imagePublicId.trim()

    try {
      if (imageFile) {
        const uploaded = await uploadImageToCloudinary(imageFile)
        imageUrl = uploaded.url
        imagePublicId = uploaded.publicId
      }

      const payload = {
        ...values,
        image: imageUrl,
        imagePublicId,
        updatedAt: serverTimestamp(),
        ...(editing ? {} : { createdAt: serverTimestamp() }),
      }

      await setDoc(gameRef, payload, { merge: true })

      setGameOpen(false)
      setEditing(undefined)
      flash(editing ? 'Game updated successfully.' : 'Game created successfully.')
    } catch (error) {
      console.error('Could not save game:', error)
      throw new Error(
        `Could not save the game. ${getErrorMessage(error)} If the image uploaded successfully, it may remain in Cloudinary until cleaned up. Check Firestore permissions.`,
      )
    }
  }

  const deleteGame = async (game: GameRecord) => {
    const confirmed = confirm(
      `Delete \"${game.title}\" permanently from the game catalogue? The Cloudinary image is not automatically deleted from the browser.`,
    )
    if (!confirmed) return

    try {
      await deleteDoc(doc(db, GAMES_COLLECTION, game.id))
      flash(`\"${game.title}\" deleted from the catalogue.`)
    } catch (error) {
      console.error('Could not delete game:', error)
      setGamesError(`Could not delete game. ${getErrorMessage(error)}`)
    }
  }

  const updateGame = async (
    game: GameRecord,
    changes: Partial<Pick<GameRecord, 'visible' | 'status'>>,
    successMessage: string,
  ) => {
    try {
      await setDoc(
        doc(db, GAMES_COLLECTION, game.id),
        { ...changes, updatedAt: serverTimestamp() },
        { merge: true },
      )
      flash(successMessage)
    } catch (error) {
      console.error('Could not update game:', error)
      setGamesError(`Could not update game. ${getErrorMessage(error)}`)
    }
  }

  // ------------------------------------------------
  // HERO BANNER MANAGEMENT (Firestore + Cloudinary)
  // ------------------------------------------------
  if (view === 'manage-hero') {
    const previewImage = bannerImagePreview || banner.image || defaultHeroBanner.image

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
            <button type="button" onClick={() => setBannerError('')}>
              Dismiss
            </button>
          </div>
        )}

        {notice && <div className="toast success">{notice}</div>}

        {bannerLoading && (
          <div className="heroBannerLoading" role="status">
            <span className="gameSpinner" />
            Loading saved hero banner...
          </div>
        )}

        <div className="heroEditor">
          {/* Keep the existing heroAdminPreview design as the live preview. */}
          <section className="heroAdminPreview">
            <img src={previewImage} alt="Hero banner preview" />
            <div className="heroAdminShade" />
            <div>
              <small>{banner.eyebrow || 'YOUR EYEBROW'}</small>
              <h2>
                {banner.title || 'YOUR HEADLINE'}
                <br />
                <em>{banner.accent || 'YOUR ACCENT'}</em>
              </h2>
              <p>{banner.description || 'Your hero description will appear here.'}</p>
              <div className="heroPreviewActions">
                {banner.primaryCta && (
                  <a
                    href={banner.primaryUrl || '#'}
                    target={banner.primaryUrl ? '_blank' : undefined}
                    rel={banner.primaryUrl ? 'noreferrer' : undefined}
                    onClick={(event) => {
                      if (!banner.primaryUrl) event.preventDefault()
                    }}
                  >
                    {banner.primaryCta}
                  </a>
                )}
                {banner.secondaryCta && (
                  <a
                    className="heroSecondaryCta"
                    href={banner.secondaryUrl || '#'}
                    target={banner.secondaryUrl ? '_blank' : undefined}
                    rel={banner.secondaryUrl ? 'noreferrer' : undefined}
                    onClick={(event) => {
                      if (!banner.secondaryUrl) event.preventDefault()
                    }}
                  >
                    {banner.secondaryCta}
                  </a>
                )}
              </div>
            </div>
            <i className={`status ${banner.visible ? 'active' : ''}`}>
              {banner.visible ? 'Visible on homepage' : 'Hidden from homepage'}
            </i>
          </section>

          {/* Keep the existing panel heroAdminForm and its field layout. */}
          <form className="panel heroAdminForm" onSubmit={saveHeroBanner}>
            <div className="formHeading">
              <div>
                <h3>Banner content</h3>
                <p>Changes are previewed instantly.</p>
                <small className="heroSaveState">
                  {bannerDirty ? 'Unsaved changes' : bannerExists ? 'Saved in Firestore' : 'Not saved yet'}
                </small>
              </div>
              <button
                type="button"
                className={`toggle ${banner.visible ? 'active' : ''}`}
                aria-label={banner.visible ? 'Hide hero banner' : 'Show hero banner'}
                aria-pressed={banner.visible}
                onClick={() => updateBannerField('visible', !banner.visible)}
              >
                <i />
              </button>
            </div>

            <div className="heroVisibilityLabel">
              <small>Background image</small>
            </div>

            <div className="heroImageField">
              <label className="heroFieldLabel">Background image</label>
              <div className="bannerUpload">
                <span>
                  {bannerImageFile
                    ? bannerImageFile.name
                    : banner.image
                      ? 'Current image is saved'
                      : 'No background image selected'}
                </span>
                <label className="heroChooseImage">
                  Choose image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) => {
                      handleBannerImageChange(event.target.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
              <small className="fieldHint">PNG, JPG, WEBP or GIF • Maximum 5 MB • Uploaded to Cloudinary when you save.</small>
            </div>

            <label>
              Eyebrow
              <input
                required
                maxLength={50}
                value={banner.eyebrow}
                onChange={(event) => updateBannerField('eyebrow', event.target.value)}
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
                  onChange={(event) => updateBannerField('title', event.target.value)}
                  placeholder="PLAY BOLD."
                />
              </label>
              <label>
                Accent headline
                <input
                  maxLength={50}
                  value={banner.accent}
                  onChange={(event) => updateBannerField('accent', event.target.value)}
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
                onChange={(event) => updateBannerField('description', event.target.value)}
                placeholder="Describe your community..."
              />
            </label>

            <div className="formGrid">
              <label>
                Primary button
                <input
                  maxLength={40}
                  value={banner.primaryCta}
                  onChange={(event) => updateBannerField('primaryCta', event.target.value)}
                  placeholder="Join the community"
                />
              </label>
              <label>
                Primary button link
                <input
                  type="url"
                  value={banner.primaryUrl}
                  onChange={(event) => updateBannerField('primaryUrl', event.target.value)}
                  placeholder="https://example.com/join"
                />
              </label>
              <label>
                Secondary button
                <input
                  maxLength={40}
                  value={banner.secondaryCta}
                  onChange={(event) => updateBannerField('secondaryCta', event.target.value)}
                  placeholder="Explore games"
                />
              </label>
              <label>
                Secondary button link
                <input
                  type="url"
                  value={banner.secondaryUrl}
                  onChange={(event) => updateBannerField('secondaryUrl', event.target.value)}
                  placeholder="https://example.com/games"
                />
              </label>
            </div>

            <div className="heroFormActions">
              <small>
                {bannerDirty ? 'You have unsaved changes.' : 'Your saved banner is stored in Firestore.'}
              </small>
              <button type="submit" className="btn" disabled={bannerSaving || bannerLoading}>
                {bannerSaving ? 'Saving banner...' : 'Save banner'}
              </button>
            </div>
          </form>
        </div>
      </>
    )
  }

  // ------------------------------------------------
  // FIRESTORE GAME MANAGEMENT
  // ------------------------------------------------
  if (view === 'manage-games') {
    const shown = games.filter((game) => {
      const matchesFilter =
        filter === 'All' ||
        (filter === 'Hidden' ? !game.visible : game.status === filter)
      const searchable = `${game.title} ${game.category} ${game.description} ${game.tags}`
      return matchesFilter && searchable.toLowerCase().includes(queryText.toLowerCase())
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
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Search games, categories, tags..."
            />
          </div>

          <div className="gameManagementActions">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter games"
            >
              <option value="All">All games</option>
              <option value="Published">Published</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
              <option value="Hidden">Hidden</option>
            </select>

            <Button onClick={openCreateGame}>＋ Add game</Button>
          </div>
        </div>

        <div className="gameManagementMeta">
          <span>
            <b>{games.length}</b> {games.length === 1 ? 'game' : 'games'} in Firestore
          </span>
          <span>Changes sync automatically</span>
        </div>

        {notice && <div className="toast success">{notice}</div>}

        {gamesError && (
          <div className="gameLoadError" role="alert">
            <Icon name="shield" />
            <span>{gamesError}</span>
            <button type="button" onClick={() => setGamesError('')}>
              Dismiss
            </button>
          </div>
        )}

        {gamesLoading ? (
          <div className="gameManagementLoading panel">
            <span className="gameSpinner" />
            <b>Loading games from Firestore...</b>
            <p>Your saved game catalogue will appear here.</p>
          </div>
        ) : shown.length > 0 ? (
          <div className="gameAdminGrid">
            {shown.map((game) => (
              <article className="gameAdminCard" key={game.id}>
                <div className="gameCover">
                  {game.image ? (
                    <img src={game.image} alt={`${game.title} cover`} />
                  ) : (
                    <div className="gameCoverPlaceholder">
                      <Icon name="game" size={32} />
                      <span>No cover image</span>
                    </div>
                  )}
                  <i
                    className={`status ${game.status === 'Published' ? 'active' : ''}`}
                  >
                    {game.status}
                  </i>
                  {!game.visible && <span className="gameHiddenBadge">Hidden</span>}
                </div>

                <div className="gameAdminBody">
                  <div className="gameCardTitleRow">
                    <small>{game.category || 'Uncategorized'}</small>
                    <span className={game.visible ? 'visibilityOn' : 'visibilityOff'}>
                      {game.visible ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                  <h3>{game.title}</h3>
                  {game.description && <p>{game.description}</p>}

                  {game.tags && (
                    <div className="gameTagList">
                      {game.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 5).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="gameAdminDetails">
                    {game.url && (
                      <a href={game.url} target="_blank" rel="noreferrer">
                        Open game URL ↗
                      </a>
                    )}
                    {game.config && <span>Configuration saved</span>}
                  </div>

                  <div className="cardActions gameCardActions">
                    <button type="button" onClick={() => openEditGame(game)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateGame(
                          game,
                          { status: game.status === 'Published' ? 'Draft' : 'Published' },
                          game.status === 'Published' ? 'Game moved to draft.' : 'Game published.',
                        )
                      }
                    >
                      {game.status === 'Published' ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateGame(
                          game,
                          { visible: !game.visible },
                          game.visible ? 'Game hidden from players.' : 'Game is visible to players.',
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
            <b>{games.length === 0 ? 'Your game catalogue is empty' : 'No games found'}</b>
            <p>
              {games.length === 0
                ? 'Create your first game. It will be saved to Firestore and appear here automatically.'
                : 'Try another search or filter, or create a new game.'}
            </p>
            {games.length === 0 && <Button onClick={openCreateGame}>＋ Create first game</Button>}
          </div>
        )}

        {/* Fixed-position modal is rendered after the grid, above it, with a blurred backdrop. */}
        {gameOpen && (
          <Modal
            title={editing ? `Edit ${editing.title}` : 'Create a new game'}
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

  if (view === 'admin-messages') return <AdminChats />

  // ------------------------------------------------
  // USER MANAGEMENT (existing demo UI retained)
  // ------------------------------------------------
  if (view === 'users') {
    return (
      <>
        <PageTitle
          kicker="ADMIN • MEMBERS"
          title="User management"
          sub="Review registered members and their account status."
        />
        <div className="panel conversationList">
          {users.map((user) => (
            <div className="userline" key={user.id}>
              <span className="av">{user.name[0]}</span>
              <div>
                <b>{user.name}</b>
                <small>{user.email}</small>
              </div>
              <i>{user.role}</i>
              <span>{user.active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>
      </>
    )
  }

  if (view === 'social-links') {
    return (
      <>
        <PageTitle
          kicker="ADMIN • COMMUNITY"
          title="Social links"
          sub="Manage the links displayed across your community pages."
        />
        <div className="panel">
          {['Facebook', 'Telegram', 'Instagram', 'WhatsApp', 'Signal'].map((name) => (
            <div className="settingRow" key={name}>
              <span><Icon name="arrow" /></span>
              <div>
                <b>{name}</b>
                <p>Configure the official {name} community URL.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const url = prompt(`Enter ${name} URL`)
                  if (url) flash(`${name} link updated in this demo.`)
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ------------------------------------------------
  // ADMIN OVERVIEW (existing UI retained)
  // ------------------------------------------------
  return (
    <>
      <div className="welcome">
        <div>
          <span className="kicker">ADMINISTRATION</span>
          <h1>Good morning, Nicole</h1>
          <p>Here's a snapshot of platform activity.</p>
        </div>
        <Button>＋ Publish update</Button>
      </div>

      <div className="metricGrid">
        {[
          ['2,418', 'Registered users', '+8.2%'],
          ['48', 'Published games', '+3'],
          ['12', 'Open tickets', '4 urgent'],
          ['91%', 'Resolved this week', '+6.4%'],
        ].map((item, index) => (
          <article key={index}>
            <span>
              <Icon name={['user', 'game', 'chat', 'shield'][index]} />
            </span>
            <small>{item[1]}</small>
            <b>{item[0]}</b>
            <i>{item[2]}</i>
          </article>
        ))}
      </div>

      <div className="adminColumns">
        <div className="panel">
          <div className="widgetHead">
            <h3>Recent users</h3>
            <button onClick={() => go('users')}>View all →</button>
          </div>
          {['Kai Morgan', 'Mika Chen', 'Jordan Ellis'].map((name, index) => (
            <div key={name} className="userline">
              <span className="av">{name[0]}</span>
              <div>
                <b>{name}</b>
                <small>Joined {index + 1} hour ago</small>
              </div>
              <i>Active</i>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="widgetHead">
            <h3>Support queue</h3>
            <button onClick={() => go('admin-messages')}>Open inbox →</button>
          </div>
          {['Missing saved games', 'Update email address', 'Community link issue'].map((item, index) => (
            <div key={item} className="ticketline">
              <span>#{1042 - index}</span>
              <div>
                <b>{item}</b>
                <small>{index ? 'Normal priority' : 'High priority'}</small>
              </div>
              <i>{index === 2 ? 'Open' : 'In progress'}</i>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
