import { useState } from 'react'
import { doc, setDoc, getDoc, collection, query, onSnapshot, type DocumentData } from 'firebase/firestore'
import { auth, db } from '@/firebase'
import { Icon, Button, PageTitle, Logo } from './App'

type View = 'home' | 'games' | 'dashboard' | 'messages' | 'social' | 'profile' | 'settings' | 'notifications' | 'admin' | 'users' | 'manage-games' | 'manage-hero' | 'admin-messages' | 'social-links'
type DemoUser = { id: number; name: string; email: string; role: string; active: boolean }
type DemoGame = { id: number; title: string; category: string; status: string; visible: boolean; image: string }
type HeroBanner = { eyebrow: string; title: string; accent: string; description: string; primaryCta: string; primaryUrl: string; secondaryCta: string; image: string; visible: boolean }

export function AdminPage({ view, go }: { view: View; go: (v: View) => void }) {
  const [users, setUsers] = useState<DemoUser[]>([
    { id: 1, name: 'Nicole Player', email: 'player1@example.com', role: 'Admin', active: true },
    { id: 2, name: 'Kai Morgan', email: 'player2@example.com', role: 'Moderator', active: true },
    { id: 3, name: 'Mika Chen', email: 'player3@example.com', role: 'Player', active: false },
    { id: 4, name: 'Jordan Ellis', email: 'player4@example.com', role: 'Player', active: true },
  ])
  const [games, setGames] = useState<DemoGame[]>([
    { id: 1, title: 'Neon Vanguard', category: 'Action', status: 'Published', visible: true, image: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=900&q=85' },
    { id: 2, title: 'Shadow Circuit', category: 'Racing', status: 'Published', visible: true, image: 'https://images.unsplash.com/photo-1603481588273-2f908a9a7a1b?auto=format&fit=crop&w=900&q=85' },
    { id: 3, title: 'Astral Frontier', category: 'Adventure', status: 'Draft', visible: false, image: 'https://images.unsplash.com/photo-1696710257827-75e2e5954059?auto=format&fit=crop&w=900&q=85' },
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
  const [userOpen, setUserOpen] = useState<DemoUser | undefined>()
  const [notice, setNotice] = useState('')
  const flash = (x: string) => { setNotice(x); setTimeout(() => setNotice(''), 2200) }

    if (view === 'manage-hero') {
    return (
      <>
        <PageTitle kicker="ADMIN • HOMEPAGE" title="Hero banners" sub="Update the main homepage banner image, message, and actions." />
        <div className="heroEditor">
          <section className="heroAdminPreview">
            <img src={banner.image} alt="Hero banner preview" />
            <div className="heroAdminShade" />
            <div>
              <small>{banner.eyebrow}</small>
              <h2>{banner.title}<br /><em>{banner.accent}</em></h2>
              <p>{banner.description}</p>
              <a href={banner.primaryUrl} target="_blank" rel="noreferrer">{banner.primaryCta}</a>
            </div>
            <i className={`status ${banner.visible ? 'active' : ''}`}>{banner.visible ? 'Live' : 'Hidden'}</i>
          </section>
          <form className="panel heroAdminForm" onSubmit={(e) => { e.preventDefault(); flash('Hero banner updated') }}>
            <div className="formHeading">
              <div><h3>Banner content</h3><p>Changes are previewed instantly.</p></div>
              <button type="button" className={`toggle ${banner.visible ? 'active' : ''}`} aria-label="Toggle banner visibility" onClick={() => setBanner({ ...banner, visible: !banner.visible })}>
                <i />
              </button>
            </div>
            {notice && <div className="toast success">{notice}</div>}
            <label>Background image<div className="bannerUpload"><span>{banner.image.startsWith('blob:') ? 'New image selected' : 'Current homepage image'}</span><label>Choose image<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setBanner({ ...banner, image: URL.createObjectURL(f) }) }} /></label></div></label>
            <label>Eyebrow<input required maxLength={50} value={banner.eyebrow} onChange={(e) => setBanner({ ...banner, eyebrow: e.target.value })} /></label>
            <div className="formGrid"><label>Headline<input required maxLength={40} value={banner.title} onChange={(e) => setBanner({ ...banner, title: e.target.value })} /></label><label>Accent headline<input required maxLength={40} value={banner.accent} onChange={(e) => setBanner({ ...banner, accent: e.target.value })} /></label></div>
            <label>Description<textarea required maxLength={180} value={banner.description} onChange={(e) => setBanner({ ...banner, description: e.target.value })} /></label>
            <div className="formGrid"><label>Primary button<input required value={banner.primaryCta} onChange={(e) => setBanner({ ...banner, primaryCta: e.target.value })} /></label><label>Primary button link<input required type="url" placeholder="https://example.com" value={banner.primaryUrl} onChange={(e) => setBanner({ ...banner, primaryUrl: e.target.value })} /></label><label>Secondary button<input required value={banner.secondaryCta} onChange={(e) => setBanner({ ...banner, secondaryCta: e.target.value })} /></label></div>
            <Button type="submit">Save banner</Button>
          </form>
        </div>
      </>
    )
  }

    if (view === 'manage-games') {
    const shown = games.filter((g) => (filter === 'All' || g.status === filter) && `${g.title} ${g.category}`.toLowerCase().includes(query.toLowerCase()))
    return (
      <>
        <PageTitle kicker="ADMIN • CATALOG" title="Game management" sub="Create, publish, organize, and control the public game catalog." />
        <div className="adminToolbar">
          <div className="smallSearch"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games..." /></div>
          <div className="toolbarActions"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option><option>Published</option><option>Draft</option><option>Archived</option></select><Button secondary onClick={() => prompt('Category name (demo only)') && flash('Category added')}>Manage categories</Button><Button onClick={() => { setEditing(undefined); setGameOpen(true) }}>＋ Add game</Button></div>
        </div>
        {notice && <div className="toast success">{notice}</div>}
        <div className="gameAdminGrid">{shown.length ? shown.map((g) => (
          <article className="gameAdminCard" key={g.id}>
            <div className="gameCover"><img src={g.image} alt={g.title} /><i className={`status ${g.status === 'Published' ? 'active' : ''}`}>{g.status}</i></div>
            <div className="gameAdminBody"><small>{g.category}</small><h3>{g.title}</h3><p>{g.visible ? 'Visible in public catalog' : 'Hidden from public catalog'}</p>
              <div className="cardActions">
                <button onClick={() => { setEditing(g); setGameOpen(true) }}>View / edit</button>
                <button onClick={() => { setGames(games.map((x) => x.id === g.id ? { ...x, status: x.status === 'Published' ? 'Draft' : 'Published' } : x)); flash(g.status === 'Published' ? 'Game unpublished' : 'Game published') }}>{g.status === 'Published' ? 'Unpublish' : 'Publish'}</button>
                <button onClick={() => { setGames(games.map((x) => x.id === g.id ? { ...x, visible: !x.visible } : x)); flash(g.visible ? 'Game hidden' : 'Game shown') }}>{g.visible ? 'Hide' : 'Show'}</button>
                <button className="danger" onClick={() => confirm(`Remove ${g.title}?`) && setGames(games.filter((x) => x.id !== g.id))}>Remove</button>
              </div>
            </div>
          </article>
        )) : <div className="empty panel"><Icon name="game" /><b>No games found</b><p>Create a game or adjust your search and filters.</p></div>}</div>
        {gameOpen && <Modal title={editing ? 'Edit game' : 'Create game'} close={() => setGameOpen(false)}><GameForm game={editing} close={() => setGameOpen(false)} save={(g) => { setGames(editing ? games.map((x) => x.id === g.id ? g : x) : [g, ...games]); setGameOpen(false); flash(editing ? 'Game updated' : 'Game created') }} /></Modal>}
      </>
    )
  }

  if (view === 'admin-messages') return <AdminChats />

  return (
    <>
      <div className="welcome"><div><span className="kicker">ADMINISTRATION</span><h1>Good morning, Nicole</h1><p>Here's a snapshot of platform activity.</p></div><Button>＋ Publish update</Button></div>
      <div className="metricGrid">{[['2,418', 'Registered users', '+8.2%'], ['48', 'Published games', '+3'], ['12', 'Open tickets', '4 urgent'], ['91%', 'Resolved this week', '+6.4%']].map((x, i) => (
        <article key={i}><span><Icon name={['user', 'game', 'chat', 'shield'][i]} /></span><small>{x[1]}</small><b>{x[0]}</b><i>{x[2]}</i></article>
      ))}</div>
      <div className="adminColumns">
        <div className="panel">
          <div className="widgetHead"><h3>Recent users</h3><button onClick={() => go('users')}>View all →</button></div>
          {['Kai Morgan', 'Mika Chen', 'Jordan Ellis'].map((x, i) => (
            <div key={i} className="userline"><span className="av">{x[0]}</span><div><b>{x}</b><small>Joined {i + 1} hour ago</small></div><i>Active</i></div>
          ))}
        </div>
        <div className="panel">
          <div className="widgetHead"><h3>Support queue</h3><button onClick={() => go('admin-messages')}>Open inbox →</button></div>
          {['Missing saved games', 'Update email address', 'Community link issue'].map((x, i) => (
            <div key={i} className="ticketline"><span>#{1042 - i}</span><div><b>{x}</b><small>{i ? 'Normal priority' : 'High priority'}</small></div><i>{i === 2 ? 'Open' : 'In progress'}</i></div>
          ))}
        </div>
      </div>
    </>
  )
}
}

function GameForm({ game, close, save }: { game?: DemoGame; close: () => void; save: (g: DemoGame) => void }) {
  const [preview, setPreview] = useState(game?.image || 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=900&q=85')
  return (
    <form className="gameForm" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); save({ id: game?.id || Date.now(), title: String(d.get('title')), category: String(d.get('category')), status: String(d.get('status')), visible: d.get('visible') === 'on', image: preview }) }}>
      <div className="uploadPreview"><img src={preview} alt="Cover" /><label>Upload cover<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)) }} /></label></div>
      <label>Game title<input name="title" required defaultValue={game?.title} /></label>
      <label>Description<textarea name="description" required defaultValue="A memorable multiplayer experience built for the community." /></label>
      <div className="formGrid"><label>Category<select name="category" defaultValue={game?.category || 'Action'}><option>Action</option><option>Adventure</option><option>Strategy</option><option>Racing</option></select></label><label>Tags<input name="tags" placeholder="co-op, multiplayer, featured" /></label><label>Game URL<input name="url" required type="url" defaultValue="https://example.com/play" /></label><label>Status<select name="status" defaultValue={game?.status || 'Draft'}><option>Draft</option><option>Published</option><option>Archived</option></select></label></div>
      <label className="check"><input name="visible" type="checkbox" defaultChecked={game?.visible ?? true} /> Visible in public catalog</label>
      <label>Configuration<textarea name="config" placeholder='{"mode":"multiplayer"}' /></label>
      <div className="dialogActions"><Button secondary onClick={close}>Cancel</Button><Button>{game ? 'Save changes' : 'Create game'}</Button></div>
    </form>
  )
}

function AdminChats() {
  const [selected, setSelected] = useState(0)
  const [notice, setNotice] = useState('')
  const chats = [['Nicole Player', 'Missing saved games', 'Open'], ['Kai Morgan', 'Reported message', 'Reported'], ['Mika Chen', 'Account help', 'Resolved']]
  return (
    <>
      <PageTitle kicker="ADMIN • INBOX" title="Chat management" sub="Review and resolve member conversations." />
      <div className="adminToolbar chatToolbar"><div className="smallSearch"><Icon name="search" /><input placeholder="Search conversations..." /></div><span className="queueCount">3 conversations</span></div>
      {notice && <div className="toast success">{notice}</div>}
      <div className="moderation compactModeration">
        <div className="panel conversationList">{chats.map((c, i) => (
          <button className={selected === i ? 'selected' : ''} onClick={() => setSelected(i)} key={c[0]}><span className="av">{c[0][0]}</span><div><b>{c[0]}</b><small>{c[1]}</small></div><i className={c[2] === 'Reported' ? 'reported' : ''}>{c[2]}</i></button>
        ))}
        </div>
        <section className="panel messageReview">
          <div className="chatHead"><span className="av">{chats[selected][0][0]}</span><div><b>{chats[selected][0]}</b><small>{chats[selected][1]}</small></div><i className={chats[selected][2] === 'Reported' ? 'status reported' : 'status active'}>{chats[selected][2]}</i></div>
          <div className="messages"><div className="day">TODAY</div><div className="bubble in">Hi, I need help with my account and saved games.<time>10:24 AM</time></div><div className="bubble out">Thanks for reaching out. We're reviewing this now.<time>10:26 AM</time></div>{selected === 1 && <div className="reportBox"><b>Reported message</b><p>Reason: inappropriate language</p></div>}</div>
          <div className="moderationActions"><Button onClick={() => setNotice('Conversation resolved')}>Resolve conversation</Button>{selected === 1 && <button className="danger" onClick={() => confirm('Delete the reported message?')}>Delete reported message</button>}</div>
        </section>
      </div>
    </>
  )
}