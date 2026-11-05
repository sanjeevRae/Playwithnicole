f=open('a:/nicole/src/App.tsx','r'); s=f.read(); f.close()
s=s.replace("'NP'}", "userProfile?.displayName?.charAt(0)||user?.email?.charAt(0)||'U'}")
f=open('a:/nicole/src/App.tsx','w'); f.write(s); f.close()
print('done')