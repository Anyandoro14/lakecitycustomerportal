import { createClient } from 'npm:@supabase/supabase-js@2';
import React from 'https://esm.sh/react@18.3.1';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { render } from 'https://esm.sh/@react-email/render@0.0.12?deps=react@18.3.1,react-dom@18.3.1';
import { CustomerInvitationEmail } from './_templates/customer-invitation.tsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const generateInvitationToken = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

const formatPhoneNumber = (phone: string): string => {
  let formatted = phone.replace(/\s+/g, '');
  if (formatted.startsWith('0')) {
    formatted = '+263' + formatted.substring(1);
  } else if (!formatted.startsWith('+')) {
    formatted = '+' + formatted;
  }
  return formatted;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    const userEmail = user.email || '';
    const tenantId = user.app_metadata?.tenant_id;

    // Verify internal user
    if (!userEmail?.toLowerCase().endsWith('@lakecity.co.zw')) {
      return new Response(
        JSON.stringify({ error: 'Access restricted to LakeCity staff' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { standNumber, customerEmail, customerPhone, customerName, channel, customMessage } = await req.json();

    if (!standNumber || !customerEmail) {
      return new Response(
        JSON.stringify({ error: 'Stand number and customer email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if ((channel === 'sms' || channel === 'whatsapp') && !customerPhone) {
      return new Response(
        JSON.stringify({ error: 'Phone number required for SMS/WhatsApp invitations' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Generate unique invitation token
    const invitationToken = generateInvitationToken();
    
    // Get the portal URL - use the new domain
    const signupUrl = `https://lakecity.standledger.io/signup?token=${invitationToken}&stand=${encodeURIComponent(standNumber)}`;

    // Extract first name from customer name
    const firstName = customerName?.split(' ')[0] || 'Valued Customer';

    // Create SMS/WhatsApp message templates
    const smsTemplate = customMessage || `LakeCity Portal: Welcome ${customerName || 'Customer'}! Create your account to view Stand ${standNumber} payments & documents. Sign up: ${signupUrl} (Expires in 7 days)`;
    
    const whatsappTemplate = customMessage || `🏠 *Welcome to LakeCity Customer Portal!*

Dear ${customerName || 'Valued Customer'},

Your personal portal for *Stand ${standNumber}* is ready!

✅ View payment history
✅ Download statements
✅ Access Agreement of Sale
✅ Track your payment progress

👉 *Create Your Account:*
${signupUrl}

_Link expires in 7 days_

---
🤝 *Transparency • Integrity • Honesty*
LakeCity Development`;

    let sendResult = { success: false, messageId: '' };

    // Send based on channel
    if (channel === 'email') {
      try {
        // Render the React Email template
        const html = render(
          React.createElement(CustomerInvitationEmail, {
            firstName,
            signupUrl,
          })
        );

        // Send email via Resend
        const emailResponse = await resend.emails.send({
          from: 'LakeCity <noreply@noreply.lakecity.co.zw>',
          to: [customerEmail],
          subject: 'Welcome to Your LakeCity Customer Portal',
          html,
        });

        if (emailResponse.error) {
          console.error('Resend error:', emailResponse.error);
          return new Response(
            JSON.stringify({ error: emailResponse.error.message || 'Failed to send email' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Email sent successfully via Resend:', emailResponse);
        sendResult = { success: true, messageId: emailResponse.data?.id || `email-${Date.now()}` };
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        return new Response(
          JSON.stringify({ error: 'Failed to send email invitation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Send via Twilio
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
      const twilioWhatsAppNumber = Deno.env.get('TWILIO_WHATSAPP_NUMBER');

      if (!accountSid || !authToken) {
        return new Response(
          JSON.stringify({ error: 'Messaging service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (channel === 'sms' && !twilioPhoneNumber) {
        return new Response(
          JSON.stringify({ error: 'SMS service not configured - missing Twilio phone number' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (channel === 'whatsapp' && !twilioWhatsAppNumber) {
        return new Response(
          JSON.stringify({ error: 'WhatsApp service not configured - missing Twilio WhatsApp number' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const formattedPhone = formatPhoneNumber(customerPhone);
      const message = channel === 'whatsapp' ? whatsappTemplate : smsTemplate;

      const twilioParams: Record<string, string> = {
        Body: message,
      };

      if (channel === 'whatsapp') {
        // Use configured Twilio WhatsApp number
        twilioParams.From = `whatsapp:${twilioWhatsAppNumber}`;
        twilioParams.To = `whatsapp:${formattedPhone}`;
      } else {
        // SMS
        const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
        twilioParams.To = formattedPhone;

        if (messagingServiceSid) {
          // Prefer Messaging Services when configured (handles sender selection per region)
          twilioParams.MessagingServiceSid = messagingServiceSid;
        } else {
          // TWILIO_PHONE_NUMBER must be a Twilio, SMS-capable number on this same account
          twilioParams.From = formatPhoneNumber(twilioPhoneNumber!);
        }
      }

      const twilioResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(twilioParams),
        }
      );

      let twilioResult: any = {};
      try {
        twilioResult = await twilioResponse.json();
      } catch {
        twilioResult = {};
      }

      if (!twilioResponse.ok) {
        console.error('Twilio error:', twilioResult);

        const code = typeof twilioResult?.code === 'number' ? twilioResult.code : undefined;
        const hint =
          code === 21659
            ? 'Twilio SMS sender is invalid for this account/country. Ensure TWILIO_PHONE_NUMBER is a Twilio SMS-capable number on this account, or set TWILIO_MESSAGING_SERVICE_SID (recommended).'
            : undefined;

        return new Response(
          JSON.stringify({
            error: twilioResult?.message || 'Failed to send message',
            twilio: {
              code,
              status: twilioResult?.status,
              more_info: twilioResult?.more_info,
            },
            ...(hint ? { hint } : {}),
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      sendResult = { success: true, messageId: twilioResult.sid };
    }

    // Store invitation in database
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('customer_invitations')
      .insert({
        stand_number: standNumber,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_name: customerName,
        channel: channel,
        invitation_token: invitationToken,
        custom_message: customMessage,
        sent_by: userId,
        sent_by_email: userEmail,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Failed to store invitation:', inviteError);
    }

    // Log to audit trail
    await supabaseAdmin.from('audit_log').insert({
      action: 'SEND_CUSTOMER_INVITATION',
      entity_type: 'invitation',
      entity_id: invitation?.id || sendResult.messageId,
      performed_by: userId,
      performed_by_email: userEmail,
      ...(tenantId ? { tenant_id: tenantId } : {}),
      details: {
        stand_number: standNumber,
        customer_email: customerEmail,
        channel: channel,
        message_id: sendResult.messageId
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        invitationId: invitation?.id,
        signupUrl: signupUrl,
        channel: channel
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Send invitation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
