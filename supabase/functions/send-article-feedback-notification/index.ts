import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { articleId, comment, customerName, standNumber } = await req.json();

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resend = new Resend(resendApiKey);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get article title
    const { data: article } = await supabaseAdmin
      .from('articles')
      .select('title')
      .eq('id', articleId)
      .single();

    const articleTitle = article?.title || 'Unknown Article';

    // Send notification email to info@lakecity.co.zw
    await resend.emails.send({
      from: 'LakeCity Portal <noreply@noreply.lakecity.co.zw>',
      to: ['info@lakecity.co.zw'],
      subject: `New Feedback: ${articleTitle}`,
      html: `
        <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#0B3D2E;margin-bottom:16px;">New Customer Feedback</h2>
          <div style="background:#f8faf9;border-radius:8px;padding:20px;border-left:4px solid #6BAB8F;">
            <p style="margin:0 0 8px;font-size:14px;"><strong>Article:</strong> ${articleTitle}</p>
            <p style="margin:0 0 8px;font-size:14px;"><strong>Customer:</strong> ${customerName || 'Anonymous'}</p>
            <p style="margin:0 0 8px;font-size:14px;"><strong>Stand:</strong> ${standNumber || 'N/A'}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />
            <p style="margin:0;font-size:14px;line-height:1.6;">${comment}</p>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-top:16px;">This feedback was submitted via the LakeCity Customer Portal.</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('Feedback notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
