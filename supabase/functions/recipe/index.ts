// Writes one recipe with Google's Gemini API for a signed-in FatBoy user.
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional). Set them with `supabase secrets set`.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const DAILY_LIMIT = 60; // per account, a safety net on top of the app's own free limit
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The newer Interactions endpoint is tried first, then the long-standing generateContent one.
async function askGemini(prompt: string): Promise<string | null> {
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')! };

  const interaction = await fetch(`${API}/interactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: MODEL, input: prompt }),
  });
  if (interaction.ok) {
    const data = await interaction.json();
    const step = (data.steps ?? []).find((s: { type: string }) => s.type === 'model_output');
    const text = (step?.content ?? []).map((part: { text?: string }) => part.text ?? '').join('');
    if (text) return text;
  }

  const generated = await fetch(`${API}/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!generated.ok) return null;
  const data = await generated.json();
  return (data.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? '').join('') || null;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return reply({ error: 'unauthorized' }, 401);

  const { prompt } = await request.json().catch(() => ({}));
  if (typeof prompt !== 'string' || prompt.length < 10 || prompt.length > 3000) return reply({ error: 'prompt' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const day = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from('ai_usage').select('count').eq('user_id', user.id).eq('day', day).maybeSingle();
  if ((usage?.count ?? 0) >= DAILY_LIMIT) return reply({ error: 'limit' }, 429);
  await admin.from('ai_usage').upsert({ user_id: user.id, day, count: (usage?.count ?? 0) + 1 });

  const text = await askGemini(prompt);
  if (!text) return reply({ error: 'upstream' }, 502);

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  try {
    return reply(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return reply({ error: 'format' }, 502);
  }
});
