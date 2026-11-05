f=open('a:/nicole/src/App.tsx','r'); s=f.read(); f.close()

# Fix miniProfile span to show image
s=s.replace(
    '<div className="miniProfile"><span>{userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||\'U\'}</span>',
    '<div className="miniProfile">{userProfile?.photoURL?<img src={userProfile.photoURL} alt="Profile" className="miniAvatar"/>:<span>{userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||\'U\'}</span>}'
)

# Fix header avatar
s=s.replace(
    '<span className="avatar">{userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||\'U\'}</span>',
    '<span className="avatar">{userProfile?.photoURL?<img src={userProfile.photoURL} alt="Avatar" className="headerAvatar"/>:userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||\'U\'}</span>'
)

f=open('a:/nicole/src/App.tsx','w'); f.write(s); f.close()
print('done')