f=open('a:/nicole/src/App.tsx','r'); s=f.read(); f.close()

# Add useAuth() to Dashboard function
s=s.replace(
  "function Dashboard({ view, go, logout }: { view: View; go:(v:View)=>void; logout:()=>void }) {\n  const admin =",
  "function Dashboard({ view, go, logout }: { view: View; go:(v:View)=>void; logout:()=>void }) {\n  const { user, profile: userProfile } = useAuth()\n  const admin ="
)

# Fix displayName reference in miniProfile - it was referencing Settings' displayName
s=s.replace(
  "{displayName||userProfile?.displayName||'Player'}",
  "{userProfile?.displayName||user?.email?.split('@')[0]||'Player'}"
)

# Fix NP in avatar span
s=s.replace(
  '<span className="avatar">NP</span>',
  '<span className="avatar">{userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||"U"}</span>'
)

f=open('a:/nicole/src/App.tsx','w'); f.write(s); f.close()
print('Dashboard fixed')