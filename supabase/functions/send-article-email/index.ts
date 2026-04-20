import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { listCollectionScheduleDataTabTitles } from "../_shared/collection-schedule-sheets.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userEmail = user.email || '';

    // Only internal users can send
    if (!userEmail?.toLowerCase().endsWith('@lakecity.co.zw')) {
      return new Response(JSON.stringify({ error: 'Access restricted to LakeCity staff' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { articleId, subject, preheader, customIntro, recipientEmail, broadcastToAll, isTest, testEmail } = await req.json();

    if (!articleId || !subject) {
      return new Response(JSON.stringify({ error: 'Article ID and subject are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resend = new Resend(resendApiKey);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch article
    const { data: article, error: articleError } = await supabaseAdmin
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .single();

    if (articleError || !article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const renderInline = (value: string) => {
      let html = escapeHtml(value);

      html = html.replace(
        /\*\*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\*\*/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#0B5ED7;text-decoration:underline;font-weight:700;">$1</a>'
      );
      html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#0B5ED7;text-decoration:underline;font-weight:600;">$1</a>'
      );
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;color:#111827;">$1</strong>');

      return html.replace(/\n/g, '<br />');
    };

    // Build email HTML
    const paragraphs = article.content.split('\n\n');
    const signOffIndex = paragraphs.findIndex((paragraph: string) => /^(kind regards|regards|warm regards),?$/i.test(paragraph.trim()));
    const contentHtml = paragraphs.map((p: string, index: number) => {
      const trimmed = p.trim();
      if (trimmed.startsWith('## ')) return `<h2 style="color:#0B3D2E;font-size:18px;font-weight:600;margin:24px 0 12px;">${renderInline(trimmed.replace('## ', ''))}</h2>`;
      if (trimmed.startsWith('### ')) return `<h3 style="color:#0B3D2E;font-size:16px;font-weight:600;margin:20px 0 8px;">${renderInline(trimmed.replace('### ', ''))}</h3>`;
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        const items = trimmed.split('\n').filter(Boolean).map(i => `<li style="margin:4px 0;">${renderInline(i.replace(/^[-•]\s*/, ''))}</li>`).join('');
        return `<ul style="color:#374151;font-size:14px;line-height:1.7;padding-left:20px;">${items}</ul>`;
      }
      if (trimmed.startsWith('> ')) return `<blockquote style="border-left:3px solid #6BAB8F;padding-left:16px;color:#6B7280;font-style:italic;margin:16px 0;">${renderInline(trimmed.replace(/^>\s*/, ''))}</blockquote>`;

      const isSignatureLine = signOffIndex !== -1 && index > signOffIndex;
      const margin = isSignatureLine ? '4px 0' : '12px 0';
      return `<p style="color:#374151;font-size:14px;line-height:1.7;margin:${margin};">${renderInline(trimmed)}</p>`;
    }).join('');

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:20px 0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
        <div style="background:#0B3D2E;padding:32px 40px;text-align:center;">
          <img src="https://gumkxjeahojrcaqnosyz.supabase.co/storage/v1/object/public/email-assets/logo-wordmark-white.png?v=1" height="36" alt="LakeCity" style="margin:0 auto;display:block;" />
          <hr style="height:3px;width:60px;background:#6BAB8F;margin:20px auto 0;border:none;border-radius:2px;" />
        </div>
        <div style="padding:36px 32px;">
          ${preheader ? `<!--[if !mso]><!--><div style="display:none;max-height:0;overflow:hidden;">${preheader}</div><!--<![endif]-->` : ''}
          <h1 style="color:#0B3D2E;font-size:22px;font-weight:600;margin:0 0 20px;text-align:center;">${subject}</h1>
          ${customIntro ? `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px;">${customIntro}</p><hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0;" />` : ''}
          ${contentHtml}
          <div style="text-align:center;margin:20px 0 8px;">
            <img src="https://lakecity.standledger.io/lakecity-logo.svg" alt="LakeCity" width="180" style="display:block;margin:0 auto;height:auto;" />
          </div>
          <div style="text-align:center;margin:32px 0 16px;">
            <a href="https://lakecity.standledger.io/updates" style="background:#0B3D2E;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">Read on Portal</a>
          </div>
        </div>
        <div style="background:#0B3D2E;padding:20px 32px;text-align:center;">
          <p style="color:rgba(255,255,255,0.6);font-size:11px;margin:0;">LakeCity Residential Estates &bull; Transparency &bull; Integrity &bull; Honesty</p>
        </div>
      </div>
    </body></html>`;

    // Determine recipients
    let recipients: string[] = [];

    if (isTest && testEmail) {
      recipients = [testEmail];
    } else if (broadcastToAll) {
      // Fetch all customer emails from Google Sheet (Column E)
      const spreadsheetId = Deno.env.get('SPREADSHEET_ID');
      const serviceAccountKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');

      if (!spreadsheetId || !serviceAccountKey || !clientEmail) {
        return new Response(JSON.stringify({ error: 'Google Sheets not configured for broadcast' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Parse the service account key - handle both JSON and raw PEM formats
      let privateKeyPem: string;
      try {
        const key = JSON.parse(serviceAccountKey.replace(/\\n/g, '\n'));
        privateKeyPem = key.private_key;
      } catch {
        privateKeyPem = serviceAccountKey;
      }
      
      if (!privateKeyPem) {
        return new Response(JSON.stringify({ error: 'Invalid service account key configuration' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Create JWT for Google API
      const toBase64Url = (str: string) => btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const now = Math.floor(Date.now() / 1000);
      const claimSet = toBase64Url(JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      }));

      // Extract and normalize PEM base64 content
      const extractPemBase64 = (pem: string) => {
        const normalized = (pem || '').toString().replace(/\r/g, '').replace(/\\n/g, '\n');
        const match = normalized.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]*?)-----END (?:RSA )?PRIVATE KEY-----/);
        const body = match ? match[1] : normalized;
        let base64 = body.replace(/[^A-Za-z0-9+/=\n]/g, '').replace(/\n/g, '');
        const pad = base64.length % 4;
        if (pad === 2) base64 += '==';
        else if (pad === 3) base64 += '=';
        else if (pad === 1) throw new Error('Invalid base64 length');
        return base64;
      };

      const base64Key = extractPemBase64(privateKeyPem);
      const raw = atob(base64Key);
      const buffer = new ArrayBuffer(raw.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const toSign = new TextEncoder().encode(`${header}.${claimSet}`);
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, toSign);
      const sigBase64Url = toBase64Url(String.fromCharCode(...new Uint8Array(signature)));
      const jwt = `${header}.${claimSet}.${sigBase64Url}`;

      // Exchange JWT for access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });
      const tokenData = await tokenRes.json();
      console.log('Google token response status:', tokenRes.status);
      if (!tokenData.access_token) {
        console.error('Google token error:', JSON.stringify(tokenData));
        return new Response(JSON.stringify({ error: 'Failed to authenticate with Google Sheets' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const accessToken = tokenData.access_token;

      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const metaJson = await metaRes.json();
      const tabTitles = listCollectionScheduleDataTabTitles(metaJson.sheets || []);
      const titles = tabTitles.length > 0 ? tabTitles : ["Collection Schedule - 36mo"];

      const emailSet = new Set<string>();
      for (const sheetTitle of titles) {
        const sheetsRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetTitle}!E:E`)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const sheetsData = await sheetsRes.json();
        if (!sheetsRes.ok) {
          console.warn(`Skipping emails from tab ${sheetTitle}:`, sheetsRes.status);
          continue;
        }
        const rows = sheetsData.values || [];
        for (let i = 1; i < rows.length; i++) {
          const email = rows[i]?.[0]?.trim()?.toLowerCase();
          if (email && email.includes("@") && email.length > 3) {
            emailSet.add(email);
          }
        }
      }
      console.log("Sheets: merged unique emails from collection tabs:", emailSet.size);
      console.log('Unique recipient emails found:', emailSet.size);
      recipients = Array.from(emailSet);
    } else if (recipientEmail) {
      recipients = [recipientEmail.trim().toLowerCase()];
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'No recipients found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Deduplicate: remove recipients who already received this article
    if (!isTest) {
      const { data: alreadySent } = await supabaseAdmin
        .from('article_email_sends')
        .select('recipient_email')
        .eq('article_id', articleId);
      
      if (alreadySent && alreadySent.length > 0) {
        const sentSet = new Set(alreadySent.map((r: any) => r.recipient_email));
        const before = recipients.length;
        recipients = recipients.filter(e => !sentSet.has(e));
        console.log(`Dedup: ${before} total, ${before - recipients.length} already sent, ${recipients.length} remaining`);
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ success: true, recipientCount: 0, message: 'All recipients already received this article' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Send emails one at a time with 600ms delay to respect Resend's 2 req/sec limit
    let sentCount = 0;
    let failCount = 0;
    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i];
      try {
        const { data: sendData, error: sendError } = await resend.emails.send({
          from: 'LakeCity <noreply@noreply.lakecity.co.zw>',
          to: [email],
          subject,
          html: emailHtml,
        });
        if (sendError) {
          console.error(`Send error for ${email}:`, JSON.stringify(sendError));
          failCount++;
        } else {
          sentCount++;
          // Record successful send for dedup
          await supabaseAdmin.from('article_email_sends').upsert(
            { article_id: articleId, recipient_email: email },
            { onConflict: 'article_id,recipient_email' }
          );
        }
      } catch (err) {
        console.error(`Exception sending to ${email}:`, (err as Error).message);
        failCount++;
      }
      // Wait 600ms between each send (max ~1.6 req/sec, under 2 req/sec limit)
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
    console.log(`Broadcast complete: ${sentCount} sent, ${failCount} failed out of ${recipients.length} remaining`);

    // Log broadcast
    if (!isTest) {
      await supabaseAdmin.from('article_broadcasts').insert({
        article_id: articleId,
        sent_by: user.id,
        sent_by_email: userEmail,
        recipient_count: sentCount,
        broadcast_type: broadcastToAll ? 'all_customers' : 'individual',
      });

      await supabaseAdmin.from('audit_log').insert({
        action: 'SEND_ARTICLE_EMAIL',
        entity_type: 'article',
        entity_id: articleId,
        performed_by: user.id,
        performed_by_email: userEmail,
        details: {
          subject,
          recipient_count: sentCount,
          broadcast_type: broadcastToAll ? 'all_customers' : 'individual',
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, recipientCount: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Send article email error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
