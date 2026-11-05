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
