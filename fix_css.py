f=open('a:/nicole/src/index.css','r'); s=f.read(); f.close()
css='\n.miniAvatar,.headerAvatar{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}\n.bigAvatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}\n.avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}\n'
s=s+css
f=open('a:/nicole/src/index.css','w'); f.write(s); f.close()
print('done')