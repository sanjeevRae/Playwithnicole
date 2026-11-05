import re
f=open('a:/nicole/src/App.tsx','r'); s=f.read(); f.close()

# Fix .map((x,i)=><div className="notice"> - add key={i}
s=s.replace('.map((x,i)=><div className="notice"', '.map((x,i)=><div key={i} className="notice"')

# Fix .map((p,i)=><article> (photos - featured games) - add key={i} 
s=s.replace('.map((p,i)=><article><div><img src={p}/><button><Icon name="play"/></button></div>', '.map((p,i)=><article key={i}><div><img src={p}/><button><Icon name="play"/></button></div>')

# Fix .map((p,i)=><article><img src={p}/> (photos grid) - add key={i}
s=s.replace('.map((p,i)=><article><img src={p}/><div><b>', '.map((p,i)=><article key={i}><img src={p}/><div><b>')

# Fix .map((x,i)=><button className= (side nav items) - add key={x[2]}
s=s.replace('.map((x,i)=><button className={view===x[2]?', '.map((x,i)=><button key={x[2]} className={view===x[2]?')

# Fix .map((x,i)=><article> (metricGrid admin) - add key={i}
s=s.replace('.map((x,i)=><article><span><Icon name={[', '.map((x,i)=><article key={i}><span><Icon name=[')

# Fix .map((x,i)=><div className="userline"> - add key={i}
s=s.replace('.map((x,i)=><div className="userline"', '.map((x,i)=><div key={i} className="userline"')

# Fix .map((x,i)=><div className="ticketline"> - add key={i}
s=s.replace('.map((x,i)=><div className="ticketline"', '.map((x,i)=><div key={i} className="ticketline"')

f=open('a:/nicole/src/App.tsx','w'); f.write(s); f.close()
print('Keys fixed')