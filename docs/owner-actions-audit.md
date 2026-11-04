# Owner actions: audit + revalidation coverage (task 6.9, req 5.1)

Checked by reading the code. All owner cores authorise with `assertOwnsBusiness` (review-reply uses its own
owner-of-review's-business check in `authorise`), and every wrapper derives the business from the session.
Audit rows are written with the transaction client `tx`, so change and row commit together. Meta holds ids,
field names, counts and fixed codes only. Wrappers revalidate after the core returned ok, via
`revalidateAfterOwnerEdit` (lib/owner-effects.ts) or `revalidateBusinessPublic`.

"public" = public page + OG image + home + search for en/el/ru + `availabilityTag`. "avail" = tag only.

| Action (wrapper) | Core | Audit action(s) | Revalidates | Gap |
|---|---|---|---|---|
| onboarding basics/location/hours/services/submit | lib/onboarding.ts | business.create, user.role.owner, business.basics, business.location, business.hours, business.firstService, business.submit | public | none |
| createManualBooking | manual-booking.ts | booking.manual-create | avail, calendar, bookings | revalidated whole public page before; now tag only |
| createBlock | block.ts | block.create (counts, recurrence) | avail, calendar, bookings | same |
| deleteBlock | block.ts | block.delete | avail, calendar, bookings | **delete and audit were separate statements**; now one transaction |
| changeBookingStatus | booking-status-change.ts | booking.status (from/to) | avail, calendar, bookings | **update and audit were separate statements**; now one transaction |
| create/update/hide/move/delete service | services.ts | service.create/update/show/hide/move/archive/delete | public, services, calendar, bookings | none |
| create/update/activate/move/delete staff, day off add/remove | team.ts | staff.create/update/activate/deactivate/move/archive/delete, staff.dayoff.add/remove | public, team, calendar, bookings, services | none |
| save hours, add/remove closure | business-hours.ts | business.hours, staff.hours.clamp, closure.add/remove | public, hours, calendar, team, overview | none |
| saveProfile, saveBrand | profile.ts | business.profile, business.brand | public, profile, overview | OG image route was not revalidated; now is |
| add/alt/move/cover/delete photo | photos.ts | photo.add/alt/move/cover/delete | public, profile, overview | same OG gap; upload signature writes nothing (no state change) |
| saveSettings, unpublishListing | settings-save.ts | business.settings, business.unpublish | public, settings, overview | none (sitemap is force-dynamic) |
| reportReview | review-manage.ts | review.flag (reviewId + reason code) | reviews | none (FLAGGED stays public) |
| replyToReview, removeReviewReply | review-reply.ts | review.reply, review.reply.remove (reviewId) | public, reviews | dashboard reviews page was not revalidated; now is |

Counts: 10 owner action files, 36 state-changing exported actions (plus the no-op upload signature), 4 gaps fixed (2 atomicity, 1 OG image, 1 dashboard reviews).

## Notes

- Sitemap (`app/sitemap.ts`) is `force-dynamic`: nothing to revalidate. Home has no `dynamic` export; revalidated by path. Search is
  `force-dynamic`; its path revalidation is harmless.
- OG image is its own route; page revalidation does not cover it, so `/{locale}/b/{slug}/opengraph-image` is revalidated too.
- Customer-facing (out of owner scope): `createBooking` and `manage-booking` cancel/reschedule revalidate `availabilityTag` only;
  `review` submit revalidates the business page, home and search; favourites revalidate `/favourites`. None write AuditLog rows.
- AuditLog has no PII by construction (ids/field names). Retention is task 7.2. Index `@@index([businessId, createdAt])` exists in
  the baseline schema and serves reads by business. There is no audit viewer and none is required.
- Guard: `lib/owner-actions-coverage.test.ts` (string heuristics) + `lib/owner-effects.test.ts` + `e2e/owner-effects.spec.ts`.
