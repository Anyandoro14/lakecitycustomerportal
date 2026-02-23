import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = user.email || '';
    if (!userEmail.toLowerCase().endsWith('@lakecity.co.zw')) {
      return new Response(JSON.stringify({ error: 'Access restricted to LakeCity staff' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'generate') {
      return await handleGenerate(body);
    } else if (action === 'send') {
      return await handleSend(body, user.id, userEmail);
    } else if (action === 'add_note') {
      return await handleAddNote(body, user.id, userEmail);
    } else if (action === 'get_timeline') {
      return await handleGetTimeline(body);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Collections AI outreach error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleGenerate(body: any) {
  const { outreachType, clientName, standNumber, amountDue, dueDate, daysOverdue, extensionStatus, tone } = body;

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const toneMap: Record<string, string> = {
    gentle: 'Gentle and empathetic. Polite, understanding, non-threatening.',
    professional: 'Professional and firm but respectful. Clear about obligations.',
    formal: 'Formal and serious. Reference the Agreement of Sale. Warn of consequences.',
  };

  const toneInstruction = toneMap[tone] || toneMap.professional;

  const systemPrompt = `You are a professional collections communication writer for LakeCity, a property development company in Zimbabwe. 
Write messages that are concise (under 200 words), culturally appropriate, and legally sound.
Always address the client by name. Include the stand number and amount due.
Do NOT include placeholders like [Company Name] - use "LakeCity" directly.
Do NOT include subject lines unless asked for email format.
Sign off as "LakeCity Collections Department".`;

  const userPrompt = `Generate a ${outreachType} message for:
- Client: ${clientName || 'Valued Client'}
- Stand Number: ${standNumber}
- Amount Due: ${amountDue}
- Due Date: ${dueDate || 'the 5th of this month'}
- Days Overdue: ${daysOverdue || 0}
- Extension Status: ${extensionStatus || 'Standard'}
- Tone: ${toneInstruction}

${outreachType === 'reminder' ? 'This is a friendly payment reminder.' : ''}
${outreachType === 'follow_up' ? 'This is a firm follow-up for an overdue payment.' : ''}
${outreachType === 'escalation' ? 'This is a formal escalation notice referencing the Agreement of Sale terms. Mention potential consequences.' : ''}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'AI rate limit reached. Please try again shortly.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted. Please top up.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const t = await response.text();
    console.error('AI error:', response.status, t);
    return new Response(JSON.stringify({ error: 'Failed to generate message' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const result = await response.json();
  const generatedMessage = result.choices?.[0]?.message?.content || '';

  return new Response(JSON.stringify({ message: generatedMessage }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleSend(body: any, userId: string, userEmail: string) {
  const { standNumber, customerName, channel, message, outreachType, tone, recipient } = body;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let providerMessageId: string | null = null;
  let deliveryStatus = 'sent';

  if (channel === 'sms' || channel === 'whatsapp') {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioWhatsApp = Deno.env.get('TWILIO_WHATSAPP_NUMBER');
    const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let formattedPhone = (recipient || '').replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) formattedPhone = '+263' + formattedPhone.substring(1);
    else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

    const to = channel === 'whatsapp' ? `whatsapp:${formattedPhone}` : formattedPhone;

    // Build request params: use MessagingServiceSid for SMS, direct From for WhatsApp
    const params: Record<string, string> = { To: to, Body: message };
    if (channel === 'whatsapp') {
      params.From = `whatsapp:${twilioWhatsApp}`;
    } else if (messagingServiceSid) {
      params.MessagingServiceSid = messagingServiceSid;
    } else {
      // Fallback to phone number if no messaging service
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      if (!twilioPhone) {
        return new Response(JSON.stringify({ error: 'SMS sender not configured. Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      params.From = twilioPhone;
    }

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params),
      }
    );

    const twilioResult = await twilioResp.json();
    if (!twilioResp.ok) {
      console.error('Twilio error:', twilioResult);
      return new Response(JSON.stringify({ error: twilioResult.message || 'Failed to send' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    providerMessageId = twilioResult.sid;
  } else if (channel === 'email') {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY || !recipient) {
      return new Response(JSON.stringify({ error: 'Email not configured or no recipient email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'LakeCity Collections <noreply@lakecity.co.zw>',
        to: [recipient],
        subject: outreachType === 'escalation' ? 'Important: Payment Escalation Notice' :
                 outreachType === 'follow_up' ? 'Payment Follow-Up' : 'Payment Reminder',
        text: message,
      }),
    });

    if (!emailResp.ok) {
      const err = await emailResp.text();
      console.error('Resend error:', err);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const emailResult = await emailResp.json();
    providerMessageId = emailResult.id;
  }

  // Log outreach
  await supabaseAdmin.from('collections_outreach').insert({
    stand_number: standNumber,
    customer_name: customerName,
    outreach_type: outreachType || 'reminder',
    channel,
    message_body: message,
    tone,
    sent_by: userId,
    sent_by_email: userEmail,
    delivery_status: deliveryStatus,
    provider_message_id: providerMessageId,
  });

  // Also log to audit
  await supabaseAdmin.from('audit_log').insert({
    action: `COLLECTIONS_${(outreachType || 'reminder').toUpperCase()}`,
    entity_type: 'collections_outreach',
    entity_id: standNumber,
    performed_by: userId,
    performed_by_email: userEmail,
    details: { channel, standNumber, customerName, tone },
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleAddNote(body: any, userId: string, userEmail: string) {
  const { standNumber, noteType, content, followUpDate } = body;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  await supabaseAdmin.from('collections_notes').insert({
    stand_number: standNumber,
    note_type: noteType || 'note',
    content,
    follow_up_date: followUpDate || null,
    created_by: userId,
    created_by_email: userEmail,
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetTimeline(body: any) {
  const { standNumber } = body;

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const [outreachRes, notesRes] = await Promise.all([
    supabaseAdmin
      .from('collections_outreach')
      .select('*')
      .eq('stand_number', standNumber)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('collections_notes')
      .select('*')
      .eq('stand_number', standNumber)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return new Response(JSON.stringify({
    outreach: outreachRes.data || [],
    notes: notesRes.data || [],
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
