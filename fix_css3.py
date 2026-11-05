f=open('a:/nicole/src/index.css','r'); s=f.read(); f.close()
css='.profileName{color:var(--text);font-size:14px;font-weight:600;margin-left:8px;white-space:nowrap}\n'
s=s+css
f=open('a:/nicole/src/index.css','w'); f.write(s); f.close()
print('done')