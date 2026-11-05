import { useEffect, useState, type ReactNode } from 'react'
import type { Auth, View } from './types'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuth } from './contexts/AuthContext'
import { AdminPage } from './AdminPage'

const hero =
  'https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1800&q=88'

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
  description: 'A curated gaming community built for discovery, friendly competition, and unforgettable shared experiences.',
  primaryCta: 'Join the community',
  primaryUrl: '#signup',
  secondaryCta: 'Explore games',
  secondaryUrl: '#games',
  image: hero,
}

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

// --------------------------------------------------
// ICONS AND SHARED UI
// --------------------------------------------------

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
  <button className="logo" onClick={() => window.location.reload()}>
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

// --------------------------------------------------
// PROFILE AVATAR
// --------------------------------------------------

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
  const photo = profile?.photoURL
  const initial = (profile?.displayName ?? user?.email ?? 'U')[0]
  const name = profile?.displayName ?? user?.email ?? 'Player'
  const role = profile?.role ?? 'member'

  return (
    <div
      className="profileMenu"
      onClick={(e) => {
        e.stopPropagation()
        setOpen((current) => !current)
      }}
    >
      <div className="profileHeader">
        <span>
          {photo && photo.length > 0 && !imageError ? (
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
          <b>{name}</b>
          <small>{role}</small>
        </div>
      </div>

      {open && (
        <div className="profileDropdown">
          <button
            className="dropdownItem"
            onClick={() => {
              setOpen(false)
              go('profile')
            }}
          >
            <Icon name="user" /> My Profile
          </button>
          <button
            className="dropdownItem"
            onClick={() => {
              setOpen(false)
              go('settings')
            }}
          >
            <Icon name="settings" /> Settings
          </button>
          <button
            className="dropdownItem"
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

// --------------------------------------------------
// PUBLIC HOME
// --------------------------------------------------

function Home({
  go,
  auth,
}: {
  go: (v: View) => void
  auth: (v: Auth) => void
}) {
  const { user, profile, signOut } = useAuth()
  const [menu, setMenu] = useState(false)
  const [heroBanner, setHeroBanner] = useState<PublicHeroBanner>(DEFAULT_PUBLIC_HERO)

  // Public visitors only read the currently visible, active homepage banner.
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
          eyebrow: typeof data.eyebrow === 'string' ? data.eyebrow : DEFAULT_PUBLIC_HERO.eyebrow,
          title: typeof data.title === 'string' ? data.title : DEFAULT_PUBLIC_HERO.title,
          accent: typeof data.accent === 'string' ? data.accent : DEFAULT_PUBLIC_HERO.accent,
          description: typeof data.description === 'string' ? data.description : DEFAULT_PUBLIC_HERO.description,
          primaryCta: typeof data.primaryCta === 'string' ? data.primaryCta : DEFAULT_PUBLIC_HERO.primaryCta,
          primaryUrl: typeof data.primaryUrl === 'string' ? data.primaryUrl : DEFAULT_PUBLIC_HERO.primaryUrl,
          secondaryCta: typeof data.secondaryCta === 'string' ? data.secondaryCta : DEFAULT_PUBLIC_HERO.secondaryCta,
          secondaryUrl: typeof data.secondaryUrl === 'string' ? data.secondaryUrl : DEFAULT_PUBLIC_HERO.secondaryUrl,
          image: typeof data.image === 'string' && data.image ? data.image : DEFAULT_PUBLIC_HERO.image,
        })
      },
      (error) => {
        console.error('Could not load active homepage banner:', error)
        setHeroBanner(DEFAULT_PUBLIC_HERO)
      },
    )

    return unsubscribe
  }, [])

  const handleHeroAction = (target: string, fallback: 'games' | 'signup') => {
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
    try {
      const parsed = new URL(destination)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
        return
      }
    } catch {
      // Fall back to the appropriate in-app action below.
    }
    if (fallback === 'signup' && !user) auth('signup')
    else go('games')
  }

  return (
    <div className="public">
      <nav className="topnav">
        <Logo />
        <div className={`navlinks ${menu ? 'open' : ''}`}>
          <button onClick={() => go('home')}>Home</button>
          <button onClick={() => go('games')}>Games</button>
          <button onClick={() => document.querySelector('#about')?.scrollIntoView()}>
            About
          </button>
          <button onClick={() => document.querySelector('#faq')?.scrollIntoView()}>
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
            <button className="textBtn" onClick={() => auth('login')}>
              Log in
            </button>
            <Button onClick={() => auth('signup')}>
              Sign up <Icon name="arrow" size={16} />
            </Button>
          </div>
        )}

        <button className="menuBtn" onClick={() => setMenu((current) => !current)}>
          <Icon name={menu ? 'close' : 'menu'} />
        </button>
      </nav>

      <main>
        <section className="hero">
          <img src={heroBanner.image || hero} alt={heroBanner.title || 'Gaming community hero banner'} />
          <div className="heroShade" />
          <div className="heroContent">
            <div className="eyebrow">
              <span /> {heroBanner.eyebrow}
            </div>
            <h1>
              {heroBanner.title}<br />
              <em>{heroBanner.accent}</em>
            </h1>
            <p>{heroBanner.description}</p>
            <div className="heroCtas">
              {heroBanner.primaryCta && (
                <Button onClick={() => handleHeroAction(heroBanner.primaryUrl, 'signup')}>
                  {heroBanner.primaryCta} <Icon name="arrow" size={17} />
                </Button>
              )}
              {heroBanner.secondaryCta && (
                <Button secondary onClick={() => handleHeroAction(heroBanner.secondaryUrl, 'games')}>
                  {heroBanner.secondaryCta} <Icon name="play" size={16} />
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

        <section className="section">
          <div className="sectionHead">
            <div>
              <span className="kicker">HANDPICKED FOR YOU</span>
              <h2>Featured worlds</h2>
            </div>
            <button className="link" onClick={() => go('games')}>
              View all games <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="gameGrid">
            {['Neon Vanguard', 'Shadow Circuit', 'Astral Frontier'].map((name, i) => (
              <article className={`gameCard g${i}`} key={name}>
                <img src={photos[i]} alt="" />
                <div className="gameOverlay" />
                <div className="tag">
                  {i === 0 ? 'FEATURED' : i === 1 ? 'NEW RELEASE' : 'COMMUNITY PICK'}
                </div>
                <div className="gameInfo">
                  <small>{['ACTION • STRATEGY', 'RACING • ARCADE', 'ADVENTURE • CO-OP'][i]}</small>
                  <h3>{name}</h3>
                  <button onClick={() => go('games')}>
                    Explore game <span>→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="community" id="about">
          <div>
            <span className="kicker">MORE THAN A PLATFORM</span>
            <h2>
              Find your people.<br />
              <em>Build your legacy.</em>
            </h2>
            <p>
              Jump into a space where players trade strategies, celebrate wins,
              and discover what to play next.
            </p>
            <div className="stats">
              <div><b>2.4K</b><span>Active members</span></div>
              <div><b>48</b><span>Curated games</span></div>
              <div><b>24/7</b><span>Community support</span></div>
            </div>
          </div>
          <div className="activityCard">
            <div className="cardTop">
              <b>Community pulse</b>
              <span className="live">LIVE</span>
            </div>
            {[
              ['N', 'NovaRae', 'just joined the community'],
              ['D', 'DuskRider', 'started playing Neon Vanguard'],
              ['M', 'Mika', 'shared a community highlight'],
            ].map((x, i) => (
              <div className="activity" key={x[1]}>
                <span className={`av a${i}`}>{x[0]}</span>
                <div><b>{x[1]}</b><small>{x[2]}</small></div>
                <time>{i === 0 ? '2m' : '12m'}</time>
              </div>
            ))}
            <button className="discord">
              Join the conversation <span>→</span>
            </button>
          </div>
        </section>

        <section className="section homeSocial">
          <div className="center">
            <span className="kicker">JOIN THE CONVERSATION</span>
            <h2>Connect beyond the game</h2>
            <p>
              Follow official playwithnicole channels for community news,
              events, and player stories.
            </p>
          </div>
          <div className="homeSocialGrid">
            {[
              ['f', 'Facebook', 'Community hub', 'https://facebook.com/'],
              ['➤', 'Telegram', 'Live updates', 'https://t.me/'],
              ['◎', 'Instagram', 'Player stories', 'https://instagram.com/'],
              ['◉', 'WhatsApp', 'Group chat', 'https://wa.me/'],
              ['S', 'Signal', 'Private updates', 'https://signal.me/'],
            ].map((x, i) => (
              <a href={x[3]} target="_blank" rel="noreferrer" key={x[1]}>
                <span className={`socialIcon s${i}`}>{x[0]}</span>
                <div><h3>{x[1]}</h3><p>{x[2]}</p></div>
                <Icon name="arrow" size={18} />
              </a>
            ))}
          </div>
          <small className="externalNote">
            <Icon name="shield" size={15} /> Official external community links •
            These do not connect to your player account
          </small>
        </section>

        <section className="section how">
          <div className="center">
            <span className="kicker">GET STARTED IN MINUTES</span>
            <h2>Your adventure begins here</h2>
          </div>
          <div className="steps">
            {[
              ['01', 'Create your profile', 'Choose your player name and make the space yours.'],
              ['02', 'Discover your next game', 'Browse curated worlds and save your favorites.'],
              ['03', 'Connect & play', 'Meet the community and start your next adventure.'],
            ].map((x) => (
              <div className="step" key={x[0]}>
                <span>{x[0]}</span><h3>{x[1]}</h3><p>{x[2]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="promo">
          <div>
            <span className="kicker">NEW MEMBER WELCOME</span>
            <h2>Ready to enter the next level?</h2>
            <p>Create your free profile and discover a better way to play together.</p>
          </div>
          <Button onClick={() => auth('signup')}>
            Create my profile <Icon name="arrow" size={17} />
          </Button>
        </section>

        <section className="section faq" id="faq">
          <div>
            <span className="kicker">QUESTIONS, ANSWERED</span>
            <h2>Everything you need to know</h2>
          </div>
          <div>
            {[
              'What is playwithnicole?',
              'Is it free to join?',
              'How do I contact support?',
              'Where can I find the community?',
            ].map((q, i) => (
              <details key={q} open={i === 0}>
                <summary>{q}<span>+</span></summary>
                <p>
                  {i === 0
                    ? 'playwithnicole is a curated gaming discovery and community platform. Create a profile to save games, get updates, and connect with players.'
                    : 'Open this item to learn more. Full policy and support content can be configured by administrators.'}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <div><Logo /><p>Play something worth remembering.</p></div>
        <div><b>Explore</b><span>Games</span><span>Community</span><span>Updates</span></div>
        <div><b>Support</b><span>Help center</span><span>Privacy</span><span>Terms</span></div>
        <div><b>Connect</b><span>Facebook</span><span>Telegram</span><span>Instagram</span><span>Signal</span><span>WhatsApp</span></div>
        <small>© 2025 playwithnicole. All game and account data shown is illustrative.</small>
      </footer>
    </div>
  )
}

// --------------------------------------------------
// AUTH MODAL
// --------------------------------------------------

function AuthModal({
  mode,
  setMode,
  enter,
}: {
  mode: Exclude<Auth, null>
  setMode: (a: Auth) => void
  enter: () => void
}) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const copy = {
    login: ['Welcome back', 'Sign in to continue your adventure.'],
    signup: ['Create your account', 'Join the community and start exploring.'],
    forgot: ['Reset your password', "We'll send secure reset instructions to your inbox."],
    verify: ['Check your inbox', 'We sent a verification link to player@example.com.'],
  }[mode]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')

  return (
    <div className="modal">
      <div className="modalArt" style={{ backgroundImage: `url(${hero})` }}>
        <Logo />
        <div>
          <span className="kicker">PLAY • CONNECT • DISCOVER</span>
          <h2>Your next favorite game is waiting.</h2>
          <p>One profile. A whole world of play.</p>
        </div>
      </div>
      <div className="formSide">
        <button className="modalClose" onClick={() => setMode(null)}>
          <Icon name="close" />
        </button>
        <div className="formWrap">
          <span className="formLogo">
            <Icon name={mode === 'verify' ? 'shield' : 'game'} size={26} />
          </span>
          <h2>{copy[0]}</h2>
          <p>{copy[1]}</p>

          {mode === 'verify' ? (
            <>
              <div className="verifyArt">✦</div>
              <Button onClick={enter}>Continue to dashboard</Button>
              <button className="formLink">Resend verification email</button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  if (mode === 'login') {
                    await signIn(email, password)
                  } else if (mode === 'signup') {
                    await signUp(email, password, displayName)
                  } else if (mode === 'forgot') {
                    await resetPassword(email)
                    setMode('verify')
                    return
                  }
                  enter()
                } catch (err) {
                  console.error('Auth error:', err)
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
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nicole Player"
                    />
                  </label>
                  <label>
                    Username
                    <input
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="nicoleplays"
                    />
                  </label>
                </div>
              )}

              <label>
                {mode === 'login' ? 'Email or username' : 'Email address'}
                <input
                  required
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'login' ? 'you@example.com or username' : 'you@example.com'}
                />
              </label>

              {mode !== 'forgot' && (
                <label>
                  Password
                  <div className="inputWrap">
                    <input
                      required
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    <button type="button">Show</button>
                  </div>
                </label>
              )}

              {mode === 'signup' && (
                <>
                  <div className="strength"><span /><span /><span /><span /></div>
                  <label className="check">
                    <input type="checkbox" /> I agree to the Terms and Privacy Policy
                  </label>
                </>
              )}

              {mode === 'login' && (
                <div className="formMeta">
                  <label className="check"><input type="checkbox" /> Remember me</label>
                  <button type="button" onClick={() => setMode('forgot')}>
                    Forgot password?
                  </button>
                </div>
              )}

              <Button type="submit">
                {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'}{' '}
                <Icon name="arrow" size={16} />
              </Button>

              {mode === 'login' && (
                <button
                  className="google"
                  type="button"
                  onClick={async () => {
                    try {
                      await signInWithGoogle()
                      enter()
                    } catch (err) {
                      console.error('Google sign-in error:', err)
                    }
                  }}
                >
                  G&nbsp;&nbsp; Continue with Google
                </button>
              )}
            </form>
          )}

          <p className="switch">
            {mode === 'login' ? 'New to playwithnicole? ' : mode === 'signup' ? 'Already have an account? ' : ''}
            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Back to login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

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

  // This must match the role value stored in the authenticated user's profile.
  const isAdmin = profile?.role === 'admin'

  // A normal user cannot render admin-only views, even if the view is set manually.
  const safeView: View =
    !isAdmin && ADMIN_ONLY_VIEWS.includes(view) ? 'dashboard' : view

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
            >
              <Icon name={item[0]} />
              <span>{item[1]}</span>
              {item[2] === 'messages' && <i>3</i>}
            </button>
          ))}
        </nav>
        <div className="sideBottom">
          {/* Admin Preview is intentionally visible only to admins. */}
          {isAdmin && (
            <button onClick={() => safeGo('admin')}>
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
          <button className="dashMenu"><Icon name="menu" /></button>
          <div className="search">
            <Icon name="search" size={18} />
            <input placeholder="Search games, messages, help..." />
          </div>
          <div className="headerBtns">
            <button><Icon name="bell" /><i /></button>
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

// --------------------------------------------------
// USER DASHBOARD CONTENT
// --------------------------------------------------

function UserPage({ view, go }: { view: View; go: (v: View) => void }) {
  if (view === 'messages') return <Messages />
  if (view === 'social') return <Social />
  if (view === 'games') return <Games go={go} />
  if (view === 'profile' || view === 'settings') {
    return <Settings profile={view === 'profile'} />
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
          ].map((x, i) => (
            <div key={i} className="notice">
              <span><Icon name={i === 2 ? 'shield' : 'bell'} /></span>
              <div><b>{x}</b><p>{i < 2 ? 'A few minutes ago' : 'Earlier this week'}</p></div>
              {i < 2 && <i />}
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="welcome">
        <div>
          <span className="kicker">FRIDAY, MAY 24</span>
          <h1>Welcome back, Nicole!</h1>
          <p>Here’s what’s happening in your gaming world.</p>
        </div>
        <Button onClick={() => go('games')}>
          Explore games <Icon name="arrow" size={16} />
        </Button>
      </div>

      <div className="feature">
        <img src={photos[0]} alt="Featured game" />
        <div className="featureShade" />
        <div>
          <span className="tag">THIS WEEK'S FEATURE</span>
          <h2>Neon Vanguard</h2>
          <p>Outsmart the system. Rewrite the rules.</p>
          <Button><Icon name="play" size={15} /> Play now</Button>
        </div>
        <small>Action • Strategy</small>
      </div>

      <div className="dashGrid">
        <section>
          <div className="widgetHead">
            <h3>Continue playing</h3>
            <button onClick={() => go('games')}>View all →</button>
          </div>
          <div className="recent">
            {photos.slice(1).map((p, i) => (
              <article key={i}>
                <img src={p} alt="" />
                <div>
                  <b>{i ? 'Astral Frontier' : 'Shadow Circuit'}</b>
                  <small>{i ? 'Adventure' : 'Racing'} • Played recently</small>
                  <div className="progress">
                    <span style={{ width: i ? '35%' : '72%' }} />
                  </div>
                </div>
                <button><Icon name="play" size={14} /></button>
              </article>
            ))}
          </div>
        </section>
        <section>
          <div className="widgetHead">
            <h3>Latest announcements</h3>
            <button>View all →</button>
          </div>
          <div className="announcement">
            <span>COMMUNITY</span>
            <h4>Friday game night is back</h4>
            <p>Join the community this Friday for a curated co-op session.</p>
            <small>Posted 2 hours ago</small>
          </div>
        </section>
      </div>

      <div className="quick">
        <button onClick={() => go('messages')}>
          <span><Icon name="chat" /></span>
          <div><b>Message support</b><small>We’re here to help</small></div>
          <Icon name="arrow" />
        </button>
        <button onClick={() => go('social')}>
          <span><Icon name="arrow" /></span>
          <div><b>Join the community</b><small>Find us on social</small></div>
          <Icon name="arrow" />
        </button>
        <button onClick={() => go('profile')}>
          <span><Icon name="user" /></span>
          <div><b>Complete your profile</b><small>80% complete</small></div>
          <Icon name="arrow" />
        </button>
      </div>
    </>
  )
}

// --------------------------------------------------
// COMMON PAGE TITLE
// --------------------------------------------------

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

// --------------------------------------------------
// GAMES PAGE
// --------------------------------------------------

function Games({ go }: { go: (v: View) => void }) {
  return (
    <>
      <PageTitle
        kicker="YOUR NEXT ADVENTURE"
        title="Explore games"
        sub="Curated worlds, handpicked for every kind of player."
      />
      <div className="filter">
        <button className="active">All games</button>
        <button>Action</button>
        <button>Adventure</button>
        <button>Strategy</button>
        <button>Co-op</button>
      </div>
      <div className="exploreGrid">
        {[...photos, ...photos].map((p, i) => (
          <article key={i}>
            <div>
              <img src={p} alt="" />
              <button><Icon name="play" /></button>
            </div>
            <span>{i < 2 ? 'FEATURED' : 'POPULAR'}</span>
            <h3>{['Neon Vanguard', 'Shadow Circuit', 'Astral Frontier'][i % 3]}</h3>
            <p>{['Action • Strategy', 'Racing • Arcade', 'Adventure • Co-op'][i % 3]}</p>
            <button onClick={() => go('dashboard')}>View details →</button>
          </article>
        ))}
      </div>
    </>
  )
}

// --------------------------------------------------
// MESSAGES PAGE
// --------------------------------------------------

function Messages() {
  return (
    <>
      <PageTitle
        kicker="WE’RE HERE TO HELP"
        title="Messages & support"
        sub="Chat with the team or track an existing request."
      />
      <div className="messenger">
        <div className="convos">
          <div className="widgetHead"><h3>Conversations</h3><button>＋</button></div>
          <div className="smallSearch"><Icon name="search" size={16} /><input placeholder="Search conversations" /></div>
          {[
            ['S', 'Support Team', 'Thanks! We’re looking into it.', '2m'],
             ].map((x, i) => (
            <button key={i} className={i === 0 ? 'selected' : ''}>
              <span className="av">{x[0]}<i /></span>
              <div><b>{x[1]}</b><p>{x[2]}</p></div>
              <time>{x[3]}</time>
            </button>
          ))}
        </div>
        <div className="chat">
          <div className="chatHead">
            <span className="av">S<i /></span>
            <div><b>Support Team</b><small>Online • Usually replies quickly</small></div>
            <button>•••</button>
          </div>
          <div className="messages">
            <div className="day">TODAY</div>
            <div className="bubble in">Hi Nicole! How can we help you today?<time>10:24 AM</time></div>
            <div className="bubble out">Hi! I’m having trouble finding my saved games after updating my profile.<time>10:26 AM</time></div>
            <div className="bubble in">Thanks for letting us know. We’re looking into your library now and will update you shortly.<time>10:28 AM</time></div>
          </div>
          <div className="compose">
            <button>＋</button>
            <input placeholder="Write a message..." />
            <button>☺</button>
            <button className="send"><Icon name="send" size={17} /></button>
          </div>
        </div>
        <div className="ticket">
          <span><Icon name="shield" /></span>
          <h3>Need more help?</h3>
          <p>Create a support ticket for account or technical issues.</p>
          <Button>Create ticket</Button>
          <div><b>Recent ticket</b><small>#1042 • In progress</small></div>
        </div>
      </div>
    </>
  )
}

// --------------------------------------------------
// SOCIAL PAGE
// --------------------------------------------------

function Social() {
  return (
    <>
      <PageTitle
        kicker="STAY CONNECTED"
        title="Community spaces"
        sub="Follow official playwithnicole channels for news, events, and conversation."
      />
      <div className="socialGrid">
        {[
          ['f', 'Facebook', 'Community news, conversations, and event updates.'],
          ['➤', 'Telegram', 'Real-time announcements and quick community chat.'],
          ['◎', 'Instagram', 'Fresh drops, player highlights, and visual stories.'],
          ['S', 'Signal', 'Private announcements and direct community updates.'],
          ['W', 'WhatsApp', 'Join group conversations and stay up to date.'],
        ].map((x, i) => (
          <article key={x[1]}>
            <span className={`socialIcon s${i}`}>{x[0]}</span>
            <div className="official"><i /> OFFICIAL COMMUNITY</div>
            <h2>{x[1]}</h2>
            <p>{x[2]}</p>
            <small>External community link • Not connected to your account</small>
            <Button secondary>
              {i === 2 ? 'Open profile' : 'Visit community'} <Icon name="arrow" size={16} />
            </Button>
          </article>
        ))}
      </div>
      <div className="safe">
        <Icon name="shield" />
        <div>
          <b>Connect safely</b>
          <p>These buttons open administrator-configured public community pages. We’ll never ask for your password on social platforms.</p>
        </div>
      </div>
    </>
  )
}

// --------------------------------------------------
// PROFILE AND SETTINGS
// --------------------------------------------------

function Settings({ profile }: { profile: boolean }) {
  const [photo, setPhoto] = useState('')
  const [saved, setSaved] = useState('')
  const [toggles, setToggles] = useState([true, true, true, false])

  const save = (message: string) => {
    setSaved(message)
    window.setTimeout(() => setSaved(''), 2200)
  }

  return (
    <>
      <PageTitle
        kicker="YOUR ACCOUNT"
        title={profile ? 'My profile' : 'Account settings'}
        sub={profile ? 'Manage your identity, picture, and game activity.' : 'Control password, notifications, privacy, and account access.'}
      />
      {saved && (
        <div className="toast success">
          <Icon name="shield" size={16} /> {saved}
          <small>Demo changes are stored for this session.</small>
        </div>
      )}

      {profile ? (
        <>
          <div className="settingsLayout">
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault()
                save('Profile updated successfully')
              }}
            >
              <div className="profileTop">
                <span className="bigAvatar">
                  {photo ? <img src={photo} alt="Profile preview" /> : 'NP'}
                  <label className="avatarEdit" title="Upload profile picture">
                    ＋
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setPhoto(URL.createObjectURL(file))
                      }}
                    />
                  </label>
                </span>
                <div>
                  <h3>Nicole Player</h3>
                  <p>@nicoleplays • Verified member</p>
                  <small className="helper">JPG or PNG, up to 5 MB</small>
                </div>
              </div>
              <div className="formGrid">
                <label>Full name<input required defaultValue="Nicole Player" /></label>
                <label>Username<input required minLength={3} defaultValue="nicoleplays" /></label>
                <label>Email address<input required type="email" defaultValue="player@example.com" /></label>
                <label>Bio<input maxLength={120} defaultValue="Co-op player and strategy fan." /></label>
              </div>
              <Button type="submit">Save profile</Button>
            </form>
            <aside className="profileSide">
              <b>Account status</b>
              <div><Icon name="shield" /><span><b>Email verified</b><small>Your account is protected</small></span></div>
              <hr />
              <small>Profile completion</small>
              <strong>90%</strong>
              <div className="progress"><span style={{ width: '90%' }} /></div>
            </aside>
          </div>

          <div className="profileGames">
            <section className="panel">
              <div className="widgetHead"><h3>Favorite games</h3><button>View all →</button></div>
              {photos.slice(0, 2).map((p, i) => (
                <div className="gameMini" key={p}>
                  <img src={p} alt="" />
                  <div><b>{i ? 'Shadow Circuit' : 'Neon Vanguard'}</b><small>{i ? 'Racing • Arcade' : 'Action • Strategy'}</small></div>
                  <button aria-label="Remove favorite">×</button>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="widgetHead"><h3>Recently played</h3><button>History →</button></div>
              {photos.slice(1).map((p, i) => (
                <div className="gameMini" key={p}>
                  <img src={p} alt="" />
                  <div><b>{i ? 'Astral Frontier' : 'Shadow Circuit'}</b><small>Played {i ? 'yesterday' : '2 hours ago'}</small></div>
                  <button><Icon name="play" size={15} /></button>
                </div>
              ))}
            </section>
          </div>
        </>
      ) : (
        <div className="settingsLayout">
          <div className="panel">
            <h3 className="panelTitle">Password &amp; security</h3>
            <form
              className="passwordForm"
              onSubmit={(e) => {
                e.preventDefault()
                save('Password updated')
              }}
            >
              <label>Current password<input required type="password" placeholder="Enter current password" /></label>
              <div className="formGrid">
                <label>New password<input required minLength={8} type="password" placeholder="At least 8 characters" /></label>
                <label>Confirm password<input required minLength={8} type="password" placeholder="Repeat new password" /></label>
              </div>
              <Button type="submit">Update password</Button>
            </form>
            <h3 className="panelTitle sectionTitle">Preferences</h3>
            {['Email notifications', 'Community updates', 'Profile visibility', 'Two-factor authentication'].map((item, i) => (
              <div className="settingRow" key={item}>
                <span><Icon name={i === 3 ? 'shield' : 'bell'} /></span>
                <div>
                  <b>{item}</b>
                  <p>{i === 3 ? 'Add an extra layer of account security.' : 'Choose how this preference behaves.'}</p>
                </div>
                <button
                  className={`toggle ${toggles[i] ? 'active' : ''}`}
                  aria-label={`Toggle ${item}`}
                  onClick={() => setToggles(toggles.map((value, index) => index === i ? !value : value))}
                >
                  <i />
                </button>
              </div>
            ))}
            <button className="danger" onClick={() => confirm('Request account deletion? This is a UI placeholder only.')}>Request account deletion</button>
          </div>
          <aside className="profileSide">
            <b>Active session</b>
            <div><Icon name="shield" /><span><b>Current browser</b><small>Active now</small></span></div>
            <Button secondary onClick={() => save('Other sessions signed out')}>Sign out other sessions</Button>
          </aside>
        </div>
      )}
    </>
  )
}

// --------------------------------------------------
// ROOT APP
// --------------------------------------------------

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
        <Dashboard view={view} go={go} logout={handleLogout} />
      )}
      {auth && <AuthModal mode={auth} setMode={setAuth} enter={enter} />}
    </>
  )
}
