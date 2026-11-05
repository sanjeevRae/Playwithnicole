import { useState } from 'react'
import type { ReactNode } from 'react'
import type { View } from './types'
import { Icon, Button, PageTitle } from './App'

// --------------------------------------------------
// TYPES AND DEFAULT DATA
// --------------------------------------------------

type DemoUser = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
}

type DemoGame = {
  id: number
  title: string
  category: string
  status: string
  visible: boolean
  image: string
}

type HeroBanner = {
  eyebrow: string
  title: string
  accent: string
  description: string
  primaryCta: string
  primaryUrl: string
  secondaryCta: string
  image: string
  visible: boolean
}

const photos = [
  'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1696710257827-75e2e5954059?auto=format&fit=crop&w=900&q=85',
]

// --------------------------------------------------
// MODAL
// --------------------------------------------------

function Modal({
  title,
  children,
  close,
}: {
  title: string
  children: ReactNode
  close: () => void
}) {
  return (
    <div
      className="modalOverlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section className="modalContent" role="dialog" aria-modal="true" aria-label={title}>
        <button className="modalClose" onClick={close} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
        <h3>{title}</h3>
        <div className="modalBody">{children}</div>
      </section>
    </div>
  )
}

// --------------------------------------------------
// GAME FORM
// --------------------------------------------------

function GameForm({
  game,
  close,
  save,
}: {
  game?: DemoGame
  close: () => void
  save: (game: DemoGame) => void
}) {
  const [preview, setPreview] = useState(game?.image || photos[0])

  return (
    <form
      className="gameForm"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        save({
          id: game?.id || Date.now(),
          title: String(data.get('title') || ''),
          category: String(data.get('category') || 'Action'),
          status: String(data.get('status') || 'Draft'),
          visible: data.get('visible') === 'on',
          image: preview,
        })
      }}
    >
      <div className="uploadPreview">
        <img src={preview} alt="Game cover preview" />
        <label>
          Upload cover
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) setPreview(URL.createObjectURL(file))
            }}
          />
        </label>
      </div>

      <label>
        Game title
        <input name="title" required defaultValue={game?.title} />
      </label>

      <label>
        Description
        <textarea
          name="description"
          required
          defaultValue="A memorable multiplayer experience built for the community."
        />
      </label>

      <div className="formGrid">
        <label>
          Category
          <select name="category" defaultValue={game?.category || 'Action'}>
            <option>Action</option>
            <option>Adventure</option>
            <option>Strategy</option>
            <option>Racing</option>
          </select>
        </label>
        <label>
          Tags
          <input name="tags" placeholder="co-op, multiplayer, featured" />
        </label>
        <label>
          Game URL
          <input
            name="url"
            required
            type="url"
            defaultValue="https://example.com/play"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={game?.status || 'Draft'}>
            <option>Draft</option>
            <option>Published</option>
            <option>Archived</option>
          </select>
        </label>
      </div>

      <label className="check">
        <input
          name="visible"
          type="checkbox"
          defaultChecked={game?.visible ?? true}
        />
        Visible in public catalog
      </label>

      <label>
        Configuration
        <textarea name="config" placeholder='{"mode":"multiplayer"}' />
      </label>

      <div className="dialogActions">
        <Button type="button" secondary onClick={close}>Cancel</Button>
        <Button type="submit">{game ? 'Save changes' : 'Create game'}</Button>
      </div>
    </form>
  )
}

// --------------------------------------------------
// ADMIN CHAT MANAGEMENT
// --------------------------------------------------

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
              <div><b>{chat[0]}</b><small>{chat[1]}</small></div>
              <i className={chat[2] === 'Reported' ? 'reported' : ''}>{chat[2]}</i>
            </button>
          ))}
        </div>

        <section className="panel messageReview">
          <div className="chatHead">
            <span className="av">{chats[selected][0][0]}</span>
            <div><b>{chats[selected][0]}</b><small>{chats[selected][1]}</small></div>
            <i className={chats[selected][2] === 'Reported' ? 'status reported' : 'status active'}>
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
                onClick={() => {
                  if (confirm('Delete the reported message?')) {
                    setNotice('Demo: reported message deletion requested')
                  }
                }}
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

// --------------------------------------------------
// MAIN ADMIN PAGE
// --------------------------------------------------

export function AdminPage({
  view,
  go,
}: {
  view: View
  go: (view: View) => void
}) {
  const [users] = useState<DemoUser[]>([
    { id: 1, name: 'Nicole Player', email: 'player1@example.com', role: 'Admin', active: true },
    { id: 2, name: 'Kai Morgan', email: 'player2@example.com', role: 'Moderator', active: true },
    { id: 3, name: 'Mika Chen', email: 'player3@example.com', role: 'Player', active: false },
    { id: 4, name: 'Jordan Ellis', email: 'player4@example.com', role: 'Player', active: true },
  ])

  const [games, setGames] = useState<DemoGame[]>([
    { id: 1, title: 'Neon Vanguard', category: 'Action', status: 'Published', visible: true, image: photos[0] },
    { id: 2, title: 'Shadow Circuit', category: 'Racing', status: 'Published', visible: true, image: photos[1] },
    { id: 3, title: 'Astral Frontier', category: 'Adventure', status: 'Draft', visible: false, image: photos[2] },
  ])

  const [banner, setBanner] = useState<HeroBanner>({
    eyebrow: 'YOUR NEXT CHAPTER STARTS HERE',
    title: 'PLAY BOLD.',
    accent: 'CONNECT DEEPER.',
    description: 'A curated gaming community built for discovery, friendly competition, and unforgettable shared experiences.',
    primaryCta: 'Join the community',
    primaryUrl: 'https://example.com/join',
    secondaryCta: 'Explore games',
    image: 'https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=1800&q=88',
    visible: true,
  })

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [editing, setEditing] = useState<DemoGame | undefined>()
  const [gameOpen, setGameOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2200)
  }

  // ------------------------------------------------
  // HERO BANNER MANAGEMENT
  // ------------------------------------------------

  if (view === 'manage-hero') {
    return (
      <>
        <PageTitle
          kicker="ADMIN • HOMEPAGE"
          title="Hero banners"
          sub="Update the main homepage banner image, message, and actions."
        />

        <div className="heroEditor">
          <section className="heroAdminPreview">
            <img src={banner.image} alt="Hero banner preview" />
            <div className="heroAdminShade" />
            <div>
              <small>{banner.eyebrow}</small>
              <h2>{banner.title}<br /><em>{banner.accent}</em></h2>
              <p>{banner.description}</p>
              <a href={banner.primaryUrl} target="_blank" rel="noreferrer">
                {banner.primaryCta}
              </a>
            </div>
            <i className={`status ${banner.visible ? 'active' : ''}`}>
              {banner.visible ? 'Live' : 'Hidden'}
            </i>
          </section>

          <form
            className="panel heroAdminForm"
            onSubmit={(event) => {
              event.preventDefault()
              flash('Hero banner updated')
            }}
          >
            <div className="formHeading">
              <div><h3>Banner content</h3><p>Changes are previewed instantly.</p></div>
              <button
                type="button"
                className={`toggle ${banner.visible ? 'active' : ''}`}
                aria-label="Toggle banner visibility"
                onClick={() => setBanner({ ...banner, visible: !banner.visible })}
              >
                <i />
              </button>
            </div>

            {notice && <div className="toast success">{notice}</div>}

            <label>
              Background image
              <div className="bannerUpload">
                <span>{banner.image.startsWith('blob:') ? 'New image selected' : 'Current homepage image'}</span>
                <label>
                  Choose image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) setBanner({ ...banner, image: URL.createObjectURL(file) })
                    }}
                  />
                </label>
              </div>
            </label>

            <label>
              Eyebrow
              <input required maxLength={50} value={banner.eyebrow} onChange={(event) => setBanner({ ...banner, eyebrow: event.target.value })} />
            </label>

            <div className="formGrid">
              <label>
                Headline
                <input required maxLength={40} value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })} />
              </label>
              <label>
                Accent headline
                <input required maxLength={40} value={banner.accent} onChange={(event) => setBanner({ ...banner, accent: event.target.value })} />
              </label>
            </div>

            <label>
              Description
              <textarea required maxLength={180} value={banner.description} onChange={(event) => setBanner({ ...banner, description: event.target.value })} />
            </label>

            <div className="formGrid">
              <label>
                Primary button
                <input required value={banner.primaryCta} onChange={(event) => setBanner({ ...banner, primaryCta: event.target.value })} />
              </label>
              <label>
                Primary button link
                <input required type="url" placeholder="https://example.com" value={banner.primaryUrl} onChange={(event) => setBanner({ ...banner, primaryUrl: event.target.value })} />
              </label>
              <label>
                Secondary button
                <input required value={banner.secondaryCta} onChange={(event) => setBanner({ ...banner, secondaryCta: event.target.value })} />
              </label>
            </div>

            <Button type="submit">Save banner</Button>
          </form>
        </div>
      </>
    )
  }

  // ------------------------------------------------
  // GAME MANAGEMENT
  // ------------------------------------------------

  if (view === 'manage-games') {
    const shown = games.filter((game) =>
      (filter === 'All' || game.status === filter) &&
      `${game.title} ${game.category}`.toLowerCase().includes(query.toLowerCase()),
    )

    return (
      <>
        <PageTitle
          kicker="ADMIN • CATALOG"
          title="Game management"
          sub="Create, publish, organize, and control the public game catalog."
        />

        <div className="adminToolbar">
          <div className="smallSearch">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games..." />
          </div>
          <div className="toolbarActions">
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option>All</option><option>Published</option><option>Draft</option><option>Archived</option>
            </select>
            <Button
              secondary
              onClick={() => {
                const category = prompt('Category name (demo only)')
                if (category) flash('Category added')
              }}
            >
              Manage categories
            </Button>
            <Button onClick={() => { setEditing(undefined); setGameOpen(true) }}>＋ Add game</Button>
          </div>
        </div>

        {notice && <div className="toast success">{notice}</div>}

        <div className="gameAdminGrid">
          {shown.length ? shown.map((game) => (
            <article className="gameAdminCard" key={game.id}>
              <div className="gameCover">
                <img src={game.image} alt={game.title} />
                <i className={`status ${game.status === 'Published' ? 'active' : ''}`}>{game.status}</i>
              </div>
              <div className="gameAdminBody">
                <small>{game.category}</small>
                <h3>{game.title}</h3>
                <p>{game.visible ? 'Visible in public catalog' : 'Hidden from public catalog'}</p>
                <div className="cardActions">
                  <button onClick={() => { setEditing(game); setGameOpen(true) }}>View / edit</button>
                  <button
                    onClick={() => {
                      setGames(games.map((item) => item.id === game.id ? { ...item, status: item.status === 'Published' ? 'Draft' : 'Published' } : item))
                      flash(game.status === 'Published' ? 'Game unpublished' : 'Game published')
                    }}
                  >
                    {game.status === 'Published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => {
                      setGames(games.map((item) => item.id === game.id ? { ...item, visible: !item.visible } : item))
                      flash(game.visible ? 'Game hidden' : 'Game shown')
                    }}
                  >
                    {game.visible ? 'Hide' : 'Show'}
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (confirm(`Remove ${game.title}?`)) {
                        setGames(games.filter((item) => item.id !== game.id))
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          )) : (
            <div className="empty panel">
              <Icon name="game" />
              <b>No games found</b>
              <p>Create a game or adjust your search and filters.</p>
            </div>
          )}
        </div>

        {gameOpen && (
          <Modal title={editing ? 'Edit game' : 'Create game'} close={() => setGameOpen(false)}>
            <GameForm
              game={editing}
              close={() => setGameOpen(false)}
              save={(savedGame) => {
                setGames(editing ? games.map((item) => item.id === savedGame.id ? savedGame : item) : [savedGame, ...games])
                setGameOpen(false)
                flash(editing ? 'Game updated' : 'Game created')
              }}
            />
          </Modal>
        )}
      </>
    )
  }

  // ------------------------------------------------
  // ADMIN MESSAGES
  // ------------------------------------------------

  if (view === 'admin-messages') return <AdminChats />

  // ------------------------------------------------
  // USER MANAGEMENT
  // ------------------------------------------------

  if (view === 'users') {
    return (
      <>
        <PageTitle
          kicker="ADMIN • MEMBERS"
          title="User management"
          sub="Review registered members and their account status."
        />
        <div className="adminToolbar">
          <div className="smallSearch"><Icon name="search" /><input placeholder="Search users..." /></div>
          <span className="queueCount">{users.length} registered users</span>
        </div>
        <div className="panel conversationList">
          {users.map((user) => (
            <div className="userline" key={user.id}>
              <span className="av">{user.name[0]}</span>
              <div><b>{user.name}</b><small>{user.email}</small></div>
              <i>{user.role}</i>
              <span>{user.active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ------------------------------------------------
  // SOCIAL LINKS
  // ------------------------------------------------

  if (view === 'social-links') {
    return (
      <>
        <PageTitle
          kicker="ADMIN • COMMUNITY"
          title="Social links"
          sub="Manage official community and social media destinations."
        />
        <div className="panel">
          {['Facebook', 'Telegram', 'Instagram', 'WhatsApp', 'Signal'].map((name) => (
            <div className="settingRow" key={name}>
              <span><Icon name="arrow" /></span>
              <div><b>{name}</b><p>Configure the official {name} community URL.</p></div>
              <button
                onClick={() => {
                  const url = prompt(`Enter ${name} URL`)
                  if (url) flash(`${name} link updated in this demo`)
                }}
              >
                Edit
              </button>
            </div>
          ))}
          {notice && <div className="toast success">{notice}</div>}
        </div>
      </>
    )
  }

  // ------------------------------------------------
  // ADMIN OVERVIEW (DEFAULT FOR ADMIN AND ADMIN VIEW)
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
            <span><Icon name={['user', 'game', 'chat', 'shield'][index]} /></span>
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
            <div key={index} className="userline">
              <span className="av">{name[0]}</span>
              <div><b>{name}</b><small>Joined {index + 1} hour ago</small></div>
              <i>Active</i>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="widgetHead">
            <h3>Support queue</h3>
            <button onClick={() => go('admin-messages')}>Open inbox →</button>
          </div>
          {['Missing saved games', 'Update email address', 'Community link issue'].map((title, index) => (
            <div key={index} className="ticketline">
              <span>#{1042 - index}</span>
              <div><b>{title}</b><small>{index ? 'Normal priority' : 'High priority'}</small></div>
              <i>{index === 2 ? 'Open' : 'In progress'}</i>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
