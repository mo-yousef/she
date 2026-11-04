/**
 * The one shared email layout. Neutral header with a small brand-coloured accent bar:
 * no text is ever set on the brand colour, so contrast does not depend on it (brand
 * contrast validation is a phase-6 task). The action button uses the platform tint
 * (#4a2c6d on white, about 10:1). Light background, no remote images or tracking.
 */
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import type { NotifyLocale } from '../types';
import type { EmailContent } from './content';

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif';
const INK = '#1c1c1e';
const MUTED = '#6b6b70'; // 5.3:1 on white
const TINT = '#4a2c6d';

export function BookingLayout(props: {
  locale: NotifyLocale;
  accent: string;
  content: EmailContent;
  linkFallback: string | null;
  children?: ReactNode;
}) {
  const { locale, accent, content: c } = props;
  return (
    <Html lang={locale} dir="ltr">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{c.preheader}</Preview>
      <Body style={{ margin: 0, padding: '24px 12px', backgroundColor: '#f2f2f7', fontFamily: FONT, color: INK }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }}>
          <Section style={{ height: 4, lineHeight: '4px', fontSize: '4px', backgroundColor: accent }} />
          <Section style={{ padding: '24px 24px 8px' }}>
            <Text style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>she.cy</Text>
          </Section>
          <Section style={{ padding: '8px 24px 24px' }}>
            <Heading as="h1" style={{ margin: '0 0 12px', fontSize: 28, lineHeight: '34px', fontWeight: 700, color: INK }}>
              {c.heading}
            </Heading>
            {c.greeting ? <Text style={{ margin: '0 0 8px', fontSize: 17, lineHeight: '22px' }}>{c.greeting}</Text> : null}
            <Text style={{ margin: '0 0 20px', fontSize: 17, lineHeight: '22px' }}>{c.intro}</Text>

            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.label}>
                    <td style={{ padding: '10px 0', borderTop: '1px solid #e5e5ea', width: '38%', verticalAlign: 'top', fontSize: 13, lineHeight: '18px', color: MUTED }}>
                      {r.label}
                    </td>
                    <td style={{ padding: '10px 0', borderTop: '1px solid #e5e5ea', verticalAlign: 'top', fontSize: 16, lineHeight: '21px', color: INK }}>
                      {r.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {c.cta ? (
              <Section style={{ paddingTop: 24 }}>
                <Button
                  href={c.cta.url}
                  style={{ display: 'inline-block', backgroundColor: TINT, color: '#ffffff', fontSize: 17, fontWeight: 600, lineHeight: '20px', padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}
                >
                  {c.cta.label}
                </Button>
                {props.linkFallback ? (
                  <Text style={{ margin: '16px 0 0', fontSize: 13, lineHeight: '18px', color: MUTED, wordBreak: 'break-all' }}>
                    {props.linkFallback}
                  </Text>
                ) : null}
              </Section>
            ) : null}
          </Section>
        </Container>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '16px 24px' }}>
          <Text style={{ margin: 0, fontSize: 12, lineHeight: '16px', color: MUTED }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
