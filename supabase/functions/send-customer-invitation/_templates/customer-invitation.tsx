import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Hr,
} from 'https://esm.sh/@react-email/components@0.0.22?deps=react@18.3.1,react-dom@18.3.1'
import * as React from 'https://esm.sh/react@18.3.1'

interface CustomerInvitationEmailProps {
  firstName: string
  signupUrl: string
}

export const CustomerInvitationEmail = ({
  firstName = 'Valued Customer',
  signupUrl = 'https://lakecity.standledger.io/signup',
}: CustomerInvitationEmailProps) => (
  <Html>
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
    </Head>
    <Preview>Welcome to Your LakeCity Customer Portal - Access your account today</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with Logo */}
        <Section style={header}>
          <Img
            src="https://gumkxjeahojrcaqnosyz.supabase.co/storage/v1/object/public/email-assets/logo-wordmark-white.png?v=1"
            width="180"
            height="36"
            alt="LakeCity"
            style={logo}
          />
          <Hr style={headerAccent} />
        </Section>

        {/* Main Content */}
        <Section style={content}>
          <Heading style={h1}>Welcome to Your Customer Portal</Heading>
          
          <Text style={paragraph}>
            Dear {firstName},
          </Text>
          
          <Text style={paragraph}>
            We are pleased to invite you to the LakeCity Customer Portal, a secure online 
            platform created to give you clear, real-time visibility into your LakeCity account.
          </Text>
          
          <Text style={paragraph}>
            The portal has been built based on customer feedback and reflects our commitment 
            to transparency, integrity, and service excellence.
          </Text>

          <Text style={subheading}>Through the portal, you can:</Text>
          
          <Text style={bulletItem}>• View your payment history and current balance</Text>
          <Text style={bulletItem}>• Access your Agreement of Sale</Text>
          <Text style={bulletItem}>• Track your payment progress securely, at any time</Text>

          <Section style={ctaSection}>
            <Text style={getStartedText}>Get Started</Text>
            <Text style={paragraphCenter}>
              Create your account using the button below:
            </Text>
            <Link style={ctaButton} href={signupUrl}>
              Create My Account
            </Link>
          </Section>

          <Section style={importantSection}>
            <Text style={importantHeading}>Important:</Text>
            <Text style={importantText}>
              • Use your Stand Number as your username
            </Text>
            <Text style={importantText}>
              • Use the same phone number you previously shared with us
            </Text>
            <Text style={importantNote}>
              For security reasons, only registered details will be accepted.
            </Text>
          </Section>

          <Text style={paragraph}>
            If you require any assistance, our team is ready to support you.
          </Text>

          <Text style={signoff}>
            Warm regards,
          </Text>
          <Text style={signoffBold}>
            The LakeCity Team
          </Text>
        </Section>

        {/* Footer */}
        <Hr style={divider} />
        <Section style={footer}>
          <Img
            src="https://standledger.io/logo-monogram-white.svg"
            width="40"
            height="40"
            alt="LakeCity"
            style={footerLogo}
          />
        </Section>
      </Container>
    </Body>
  </Html>
)

export default CustomerInvitationEmail

// ============= Styles =============
// LakeCity Brand Colors
// Primary: #0B3D2E (deep forest green)
// Secondary: #6BAB8F (soft sage)

const main = {
  backgroundColor: '#F5F5F5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
  padding: '20px 0',
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '8px',
  overflow: 'hidden' as const,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
}

const header = {
  backgroundColor: '#0B3D2E',
  padding: '32px 40px 24px',
  textAlign: 'center' as const,
}

const logo = {
  margin: '0 auto',
  display: 'block' as const,
}

const logoText = {
  color: '#FFFFFF',
  fontSize: '20px',
  fontWeight: '700' as const,
  letterSpacing: '3px',
  margin: '12px 0 0',
  textAlign: 'center' as const,
}

const headerAccent = {
  height: '3px',
  width: '60px',
  backgroundColor: '#6BAB8F',
  margin: '20px auto 0',
  borderRadius: '2px',
  border: 'none',
}

const content = {
  padding: '40px 40px 32px',
}

const h1 = {
  color: '#0B3D2E',
  fontSize: '26px',
  fontWeight: '600' as const,
  lineHeight: '1.3',
  margin: '0 0 24px',
  textAlign: 'center' as const,
}

const paragraph = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.7',
  margin: '0 0 16px',
}

const paragraphCenter = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.7',
  margin: '0 0 16px',
  textAlign: 'center' as const,
}

const subheading = {
  color: '#0B3D2E',
  fontSize: '16px',
  fontWeight: '600' as const,
  margin: '24px 0 12px',
}

const bulletItem = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.8',
  margin: '0 0 4px',
  paddingLeft: '8px',
}

const ctaSection = {
  backgroundColor: '#F8FAF9',
  borderRadius: '8px',
  padding: '28px 24px',
  margin: '28px 0',
  textAlign: 'center' as const,
  border: '1px solid #E5EBE8',
}

const getStartedText = {
  color: '#0B3D2E',
  fontSize: '18px',
  fontWeight: '600' as const,
  margin: '0 0 8px',
  textAlign: 'center' as const,
}

const ctaButton = {
  backgroundColor: '#0B3D2E',
  borderRadius: '6px',
  color: '#FFFFFF',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: '600' as const,
  padding: '14px 32px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  marginTop: '8px',
}

const importantSection = {
  backgroundColor: '#FEF9F0',
  borderRadius: '6px',
  padding: '20px 24px',
  margin: '24px 0',
  borderLeft: '4px solid #D4A853',
}

const importantHeading = {
  color: '#92400E',
  fontSize: '15px',
  fontWeight: '600' as const,
  margin: '0 0 10px',
}

const importantText = {
  color: '#78350F',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 6px',
}

const importantNote = {
  color: '#92400E',
  fontSize: '13px',
  fontStyle: 'italic' as const,
  margin: '10px 0 0',
}

const signoff = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.7',
  margin: '28px 0 4px',
}

const signoffBold = {
  color: '#374151',
  fontSize: '15px',
  fontWeight: '600' as const,
  lineHeight: '1.7',
  margin: '0',
}

const divider = {
  borderTop: '1px solid #E5E7EB',
  margin: '0',
  border: 'none',
  borderColor: '#E5E7EB',
}

const footer = {
  backgroundColor: '#0B3D2E',
  padding: '24px 40px',
  textAlign: 'center' as const,
}

const footerLogo = {
  margin: '0 auto',
  opacity: 0.9,
}