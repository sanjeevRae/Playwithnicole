import re
f=open('a:/nicole/src/App.tsx','r'); s=f.read(); f.close()
s=s.replace(":'NP'}",":userProfile?.displayName?.charAt(0)?.toUpperCase()||user?.email?.charAt(0)?.toUpperCase()||'U'}")
s=s.replace('Verified member',"{userProfile?.role?.charAt(0)?.toUpperCase()+userProfile?.role?.slice(1)||'User'}")
f=open('a:/nicole/src/App.tsx','w'); f.write(s); f.close()
print('done')