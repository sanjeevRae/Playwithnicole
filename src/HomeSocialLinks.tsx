import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase'

type SocialPlatformId = 'facebook' | 'telegram' | 'instagram' | 'whatsapp' | 'signal'
type SocialLinkValue = { url: string; enabled: boolean }
type SocialLinksState = Record<SocialPlatformId, SocialLinkValue>

const SOCIAL_SETTINGS_COLLECTION = 'siteSettings'
const SOCIAL_SETTINGS_DOCUMENT_ID = 'socialLinks'

const SOCIAL_PLATFORMS: {
  id: SocialPlatformId
  name: string
  description: string
  initials: string
}[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Follow announcements and community highlights.',
    initials: 'f',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Get quick updates and community announcements.',
    initials: 'TG',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'See stories, highlights and moments from the community.',
    initials: 'ig',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Connect with the community directly on WhatsApp.',
    initials: 'WA',
  },
  {
    id: 'signal',
    name: 'Signal',
    description: 'Join private conversations with the community.',
    initials: 'S',
  },
]

const EMPTY_LINKS: SocialLinksState = {
  facebook: { url: '', enabled: false },
  telegram: { url: '', enabled: false },
  instagram: { url: '', enabled: false },
  whatsapp: { url: '', enabled: false },
  signal: { url: '', enabled: false },
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Homepage social section.
 * Reads siteSettings/socialLinks in real time. Links that are disabled or invalid
 * are not rendered. Firestore rules must allow public reads of this one document.
 */
export function HomeSocialLinks() {
  const [links, setLinks] = useState<SocialLinksState>(() => ({ ...EMPTY_LINKS }))

  useEffect(() => {
    const settingsRef = doc(
      db,
      SOCIAL_SETTINGS_COLLECTION,
      SOCIAL_SETTINGS_DOCUMENT_ID,
    )

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        const savedLinks = snapshot.exists()
          ? snapshot.data().links as Partial<Record<SocialPlatformId, Partial<SocialLinkValue>>>
          : undefined

        const nextLinks: SocialLinksState = { ...EMPTY_LINKS }
        for (const platform of SOCIAL_PLATFORMS) {
          const saved = savedLinks?.[platform.id]
          nextLinks[platform.id] = {
            url: typeof saved?.url === 'string' ? saved.url : '',
            enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : false,
          }
        }
        setLinks(nextLinks)
      },
      (error) => {
        console.error('Could not load homepage social links:', error)
        setLinks({ ...EMPTY_LINKS })
      },
    )

    return unsubscribe
  }, [])

  const visiblePlatforms = SOCIAL_PLATFORMS.filter(({ id }) => {
    const value = links[id]
    return value.enabled && isHttpUrl(value.url)
  })

  if (visiblePlatforms.length === 0) return null

  return (
    <section className="section homeSocial" aria-labelledby="home-social-title">
      <div className="center">
        <span className="kicker">STAY CONNECTED</span>
        <h2 id="home-social-title">Find your community.</h2>
        <p>Follow us on your favourite platforms and stay connected with everything happening in the community.</p>
      </div>

      <div className="homeSocialGrid">
        {visiblePlatforms.map((platform) => (
          <a
            href={links[platform.id].url.trim()}
            key={platform.id}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Visit our ${platform.name} page (opens in a new tab)`}
          >
            <span className={`socialIcon socialIcon--${platform.id}`} aria-hidden="true">
              {platform.initials}
            </span>
            <div>
              <h3>{platform.name}</h3>
              <p>{platform.description}</p>
            </div>
            <span className="homeSocialArrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </div>

      <p className="externalNote">
        <span aria-hidden="true">↗</span>
        External links open in a new tab.
      </p>
    </section>
  )
}
