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
  Button,
  Hr,
} from 'https://esm.sh/@react-email/components@0.0.22'
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
            src="https://lakecitycustomerportal.lovable.app/lakecity-logo.svg"
            width="160"
            height="48"
            alt="LakeCity"
            style={logo}
          />
          <div style={headerAccent} />
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
          
          <Section style={bulletList}>
            <Text style={bulletItem}>
              <span style={bulletPoint}>•</span> View your payment history and current balance
            </Text>
            <Text style={bulletItem}>
              <span style={bulletPoint}>•</span> Access your Agreement of Sale
            </Text>
            <Text style={bulletItem}>
              <span style={bulletPoint}>•</span> Track your payment progress securely, at any time
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Text style={getStartedText}>Get Started</Text>
            <Text style={paragraph}>
              Create your account using the button below:
            </Text>
            <Button style={ctaButton} href={signupUrl}>
              Create My Account
            </Button>
          </Section>

          <Section style={importantSection}>
            <Text style={importantHeading}>Important:</Text>
            <Text style={importantText}>
              • Use your <strong>Stand Number</strong> as your username
            </Text>
            <Text style={importantText}>
              • Use the same <strong>phone number</strong> you previously shared with us
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
            <br />
            <strong>The LakeCity Team</strong>
          </Text>
        </Section>

        {/* Footer */}
        <Hr style={divider} />
        <Section style={footer}>
          <Img
            src="https://lakecitycustomerportal.lovable.app/logo-monogram-white.svg"
            width="32"
            height="32"
            alt="LakeCity"
            style={footerLogo}
          />
          <Text style={footerText}>
            LakeCity Development
          </Text>
          <Text style={footerSubtext}>
            Building communities with transparency, integrity, and honesty.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default CustomerInvitationEmail

// ============= Styles =============
// LakeCity Brand Colors (HSL to Hex conversions)
// Primary: hsl(160, 70%, 15%) = #0B3D2E (deep forest green)
// Secondary: hsl(160, 30%, 55%) = #6BAB8F (soft sage)
// Background: hsl(0, 0%, 96%) = #F5F5F5

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
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
}

const header = {
  backgroundColor: '#0B3D2E',
  padding: '32px 40px 24px',
  textAlign: 'center' as const,
}

const logo = {
  margin: '0 auto',
  display: 'block',
}

const headerAccent = {
  height: '3px',
  width: '60px',
  backgroundColor: '#6BAB8F',
  margin: '20px auto 0',
  borderRadius: '2px',
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

const subheading = {
  color: '#0B3D2E',
  fontSize: '16px',
  fontWeight: '600' as const,
  margin: '24px 0 12px',
}

const bulletList = {
  margin: '0 0 24px',
  padding: '0 0 0 8px',
}

const bulletItem = {
  color: '#374151',
  fontSize: '15px',
  lineHeight: '1.8',
  margin: '0 0 4px',
}

const bulletPoint = {
  color: '#6BAB8F',
  fontWeight: '600' as const,
  marginRight: '8px',
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
  margin: '28px 0 0',
}

const divider = {
  borderTop: '1px solid #E5E7EB',
  margin: '0',
}

const footer = {
  backgroundColor: '#0B3D2E',
  padding: '24px 40px',
  textAlign: 'center' as const,
}

const footerLogo = {
  margin: '0 auto 12px',
  opacity: 0.9,
}

const footerText = {
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: '500' as const,
  margin: '0 0 4px',
}

const footerSubtext = {
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: '12px',
  margin: '0',
}
