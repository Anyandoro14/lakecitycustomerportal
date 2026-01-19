import { useMemo } from "react";

interface EmailPreviewProps {
  firstName: string;
  signupUrl?: string;
}

const EmailPreview = ({ firstName, signupUrl = "https://lakecity.standledger.io/signup" }: EmailPreviewProps) => {
  // Generate the email HTML matching the template in the edge function
  const emailHtml = useMemo(() => {
    const displayName = firstName || 'Valued Customer';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      </head>
      <body style="background-color: #F5F5F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; padding: 20px 0; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);">
          <!-- Header with Logo -->
          <div style="background-color: #0B3D2E; padding: 32px 40px 24px; text-align: center;">
            <img src="/logo-wordmark-white.svg" width="180" height="40" alt="LakeCity" style="margin: 0 auto; display: block;" />
            <hr style="height: 3px; width: 60px; background-color: #6BAB8F; margin: 20px auto 0; border-radius: 2px; border: none;" />
          </div>

          <!-- Main Content -->
          <div style="padding: 40px 40px 32px;">
            <h1 style="color: #0B3D2E; font-size: 26px; font-weight: 600; line-height: 1.3; margin: 0 0 24px; text-align: center;">Welcome to Your Customer Portal</h1>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
              Dear ${displayName},
            </p>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
              We are pleased to invite you to the LakeCity Customer Portal, a secure online platform created to give you clear, real-time visibility into your LakeCity account.
            </p>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
              The portal has been built based on customer feedback and reflects our commitment to transparency, integrity, and service excellence.
            </p>

            <p style="color: #0B3D2E; font-size: 16px; font-weight: 600; margin: 24px 0 12px;">Through the portal, you can:</p>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.8; margin: 0 0 4px; padding-left: 8px;">• View your payment history and current balance</p>
            <p style="color: #374151; font-size: 15px; line-height: 1.8; margin: 0 0 4px; padding-left: 8px;">• Access your Agreement of Sale</p>
            <p style="color: #374151; font-size: 15px; line-height: 1.8; margin: 0 0 4px; padding-left: 8px;">• Track your payment progress securely, at any time</p>

            <!-- CTA Section -->
            <div style="background-color: #F8FAF9; border-radius: 8px; padding: 28px 24px; margin: 28px 0; text-align: center; border: 1px solid #E5EBE8;">
              <p style="color: #0B3D2E; font-size: 18px; font-weight: 600; margin: 0 0 8px; text-align: center;">Get Started</p>
              <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px; text-align: center;">
                Create your account using the button below:
              </p>
              <a href="${signupUrl}" style="background-color: #0B3D2E; border-radius: 6px; color: #FFFFFF; display: inline-block; font-size: 16px; font-weight: 600; padding: 14px 32px; text-decoration: none; text-align: center; margin-top: 8px;">
                Create My Account
              </a>
            </div>

            <!-- Important Section -->
            <div style="background-color: #FEF9F0; border-radius: 6px; padding: 20px 24px; margin: 24px 0; border-left: 4px solid #D4A853;">
              <p style="color: #92400E; font-size: 15px; font-weight: 600; margin: 0 0 10px;">Important:</p>
              <p style="color: #78350F; font-size: 14px; line-height: 1.6; margin: 0 0 6px;">
                • Use your <strong>Stand Number</strong> as your username
              </p>
              <p style="color: #78350F; font-size: 14px; line-height: 1.6; margin: 0 0 6px;">
                • Use the same <strong>phone number</strong> you previously shared with us
              </p>
              <p style="color: #92400E; font-size: 13px; font-style: italic; margin: 10px 0 0;">
                For security reasons, only registered details will be accepted.
              </p>
            </div>

            <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
              If you require any assistance, our team is ready to support you.
            </p>

            <p style="color: #374151; font-size: 15px; line-height: 1.7; margin: 28px 0 4px;">
              Warm regards,
            </p>
            <p style="color: #374151; font-size: 15px; font-weight: 600; line-height: 1.7; margin: 0;">
              The LakeCity Team
            </p>
          </div>

          <!-- Footer -->
          <hr style="border-top: 1px solid #E5E7EB; margin: 0; border: none; border-color: #E5E7EB;" />
          <div style="background-color: #0B3D2E; padding: 24px 40px; text-align: center;">
            <img src="/logo-monogram-white.svg" width="40" height="40" alt="LakeCity" style="margin: 0 auto; opacity: 0.9;" />
          </div>
        </div>
      </body>
      </html>
    `;
  }, [firstName, signupUrl]);

  return (
    <div className="w-full border rounded-lg overflow-hidden bg-muted/30">
      <div className="bg-muted px-4 py-2 border-b flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-muted-foreground ml-2">Email Preview</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <iframe
          srcDoc={emailHtml}
          title="Email Preview"
          className="w-full h-[400px] border-0"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
};

export default EmailPreview;