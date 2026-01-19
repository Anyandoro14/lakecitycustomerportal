import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActivationNotificationRequest {
  customerName: string;
  standNumber: string;
  customerCategory: string;
  activationDateTime: string;
  emailProvided: boolean;
  customerEmail?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      customerName, 
      standNumber, 
      customerCategory, 
      activationDateTime,
      emailProvided,
      customerEmail
    }: ActivationNotificationRequest = await req.json();

    console.log(`Sending activation notification for stand: ${standNumber}`);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Recipients for activation notifications
    const recipients = [
      "alex@michaeltenable.com",
      "accounts@lakecity.co.zw"
    ];

    // Format the activation date/time
    const formattedDateTime = new Date(activationDateTime).toLocaleString('en-ZW', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Africa/Harare'
    });

    // Build email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Customer Activation</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f5;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #0d4a3a; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 New Customer Activation</h1>
          </div>
          
          <div style="background-color: white; padding: 24px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="color: #374151; margin-top: 0;">A new customer has successfully activated their LakeCity Customer Portal account.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 12px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; width: 40%;">Customer Name</td>
                <td style="padding: 12px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; color: #111827;">${customerName || 'Not provided'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Stand Number</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-family: monospace; font-size: 14px;">${standNumber}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Customer Category</td>
                <td style="padding: 12px; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; color: #111827;">${customerCategory || 'Not available'}</td>
              </tr>
              <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151;">Activation Date & Time</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${formattedDateTime}</td>
              </tr>
              <tr>
                <td style="padding: 12px; background-color: #f9fafb; font-weight: 600; color: #374151;">Email Address Provided</td>
                <td style="padding: 12px; background-color: #f9fafb;">
                  ${emailProvided 
                    ? `<span style="color: #059669; font-weight: 600;">✓ Yes</span>${customerEmail ? ` (${customerEmail})` : ''}`
                    : '<span style="color: #dc2626; font-weight: 600;">✗ No</span>'
                  }
                </td>
              </tr>
            </table>
            
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
              This is an automated notification from the LakeCity Customer Portal.
            </p>
          </div>
          
          <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
            LakeCity Customer Portal • Automated Notification
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LakeCity <noreply@lakecity.co.zw>",
        to: recipients,
        subject: `New Customer Activation: ${standNumber} - ${customerName || 'Customer'}`,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error("Resend API error:", errorData);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to send notification email" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendData = await resendResponse.json();
    console.log("Activation notification sent successfully:", resendData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Activation notification sent",
        emailId: resendData.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error sending activation notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
