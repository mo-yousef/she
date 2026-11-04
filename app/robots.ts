import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Locale-prefixed and bare paths: private/app surfaces are not for indexing.
      disallow: [
        '/api/',
        '/*/dashboard',
        '/*/manage',
        '/*/account',
        '/*/admin',
        '/dashboard',
        '/manage',
        '/account',
        '/admin',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
