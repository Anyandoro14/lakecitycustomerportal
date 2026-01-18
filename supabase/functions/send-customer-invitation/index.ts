import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

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
    
    // Get the portal URL
    const portalUrl = 'https://lakecitycustomerportal.lovable.app';
    const signupUrl = `${portalUrl}/signup?token=${invitationToken}&stand=${encodeURIComponent(standNumber)}`;

    // Create invitation message templates
    const templates = {
      email: {
        subject: `Welcome to LakeCity Customer Portal - Stand ${standNumber}`,
        body: customMessage || `Dear ${customerName || 'Valued Customer'},

Welcome to the LakeCity Customer Portal! We're excited to have you join our digital platform.

Your stand: ${standNumber}

Click the link below to create your account and access:
✓ Your payment history and statements
✓ Agreement of Sale documents  
✓ Real-time account balance
✓ 24/7 secure access to your information

Create Your Account: ${signupUrl}

This invitation expires in 7 days.

At LakeCity, we believe in Transparency, Integrity, and Honesty. Your portal account gives you complete visibility into your investment.

If you have any questions, please contact our support team.

Warm regards,
The LakeCity Team`
      },
      sms: customMessage || `LakeCity Portal: Welcome ${customerName || 'Customer'}! Create your account to view Stand ${standNumber} payments & documents. Sign up: ${signupUrl} (Expires in 7 days)`,
      whatsapp: customMessage || `🏠 *Welcome to LakeCity Customer Portal!*

Dear ${customerName || 'Valued Customer'},

Your personal portal for *Stand ${standNumber}* is ready!

✅ View payment history
✅ Download statements
✅ Access Agreement of Sale
✅ Track your investment progress

👉 *Create Your Account:*
${signupUrl}

_Link expires in 7 days_

---
🤝 *Transparency • Integrity • Honesty*
LakeCity Development`
    };

    let sendResult = { success: false, messageId: '' };

    // Send based on channel
    if (channel === 'email') {
      // For now, log email content - in production, integrate with email service
      console.log('Email invitation:', templates.email);
      sendResult = { success: true, messageId: `email-${Date.now()}` };
    } else {
      // Send via Twilio
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

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

      const formattedPhone = formatPhoneNumber(customerPhone);
      const message = channel === 'whatsapp' ? templates.whatsapp : templates.sms;

      const twilioParams: Record<string, string> = {
        Body: message,
      };

      if (channel === 'whatsapp') {
        // Use Twilio WhatsApp Sandbox number or configured number
        twilioParams.From = 'whatsapp:+14155238886';
        twilioParams.To = `whatsapp:${formattedPhone}`;
      } else {
        // Use configured Twilio phone number for SMS
        twilioParams.From = twilioPhoneNumber!;
        twilioParams.To = formattedPhone;
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

      const twilioResult = await twilioResponse.json();

      if (!twilioResponse.ok) {
        console.error('Twilio error:', twilioResult);
        return new Response(
          JSON.stringify({ error: twilioResult.message || 'Failed to send message' }),
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
