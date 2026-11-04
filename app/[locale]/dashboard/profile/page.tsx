import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireOwnerBusiness } from '@/lib/owner-session';
import { loadProfileForDashboard } from '@/lib/profile';
import { loadPhotosForDashboard } from '@/lib/photos';
import { cloudinaryConfig } from '@/lib/cloudinary';
import { PhotosManager } from '@/components/profile/photos-manager';
import { ProfileForm, type ProfileValues } from '@/components/profile/profile-form';
import { BrandForm } from '@/components/profile/brand-form';
import { FocusHeading } from '@/components/focus-heading';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('title') };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { business } = await requireOwnerBusiness(locale, `/${locale}/dashboard/profile`);
  const t = await getTranslations('profile');
  const [p, photos] = await Promise.all([loadProfileForDashboard(business.id), loadPhotosForDashboard(business.id)]);
  const tr = (l: string) => p.translations.find((x) => x.locale === l);
  const initial: ProfileValues = {
    name: p.name,
    category: p.category,
    city: p.city,
    languages: p.languages,
    tagline: p.tagline ?? '',
    about: p.about ?? '',
    address: p.address ?? '',
    phone: p.phone ?? '',
    whatsapp: p.whatsapp ?? '',
    instagram: p.instagram ?? '',
    website: p.website ?? '',
    lat: p.lat === null ? '' : String(p.lat),
    lng: p.lng === null ? '' : String(p.lng),
    translations: {
      el: { tagline: tr('el')?.tagline ?? '', about: tr('el')?.about ?? '' },
      ru: { tagline: tr('ru')?.tagline ?? '', about: tr('ru')?.about ?? '' },
    },
  };

  return (
    <div className="space-y-8">
      <FocusHeading className="text-[length:var(--text-title1)] font-bold tracking-tight">{t('title')}</FocusHeading>

      <section aria-labelledby="profile-details" className="space-y-3">
        <h2 id="profile-details" className="text-[length:var(--text-title3)] font-semibold">
          {t('details.title')}
        </h2>
        <p className="text-[color:var(--label-secondary)]">{t('details.hint')}</p>
        <ProfileForm initial={initial} />
      </section>

      <section aria-labelledby="profile-brand" className="space-y-3">
        <h2 id="profile-brand" className="text-[length:var(--text-title3)] font-semibold">
          {t('brand.title')}
        </h2>
        <p className="text-[color:var(--label-secondary)]">{t('brand.hint')}</p>
        <BrandForm businessName={p.name} initial={{ brandPrimary: p.brandPrimary, brandAccent: p.brandAccent }} />
      </section>

      <section id="photos" aria-labelledby="profile-photos" className="scroll-mt-6 space-y-3">
        <h2 id="profile-photos" className="text-[length:var(--text-title3)] font-semibold">
          {t('photos.title')}
        </h2>
        <p className="text-[color:var(--label-secondary)]">{t('photos.hint')}</p>
        <PhotosManager photos={photos} uploadsConfigured={cloudinaryConfig() !== null} />
      </section>
    </div>
  );
}
