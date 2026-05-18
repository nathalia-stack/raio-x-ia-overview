// /api/analisar.js — Raio-X v2 — Papa PPG
// Novidades: robots.txt check, prompt corrigido (sem schema), integração RD Station, notificação email

const CRAWLERS_TO_CHECK = [
  'GPTBot',
  'Claude-Web',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'GoogleOther',
  'Bytespider',
  'FacebookBot',
];

// ------------------------------------------------------------
// Checa robots.txt do site informado
// Retorna objeto { GPTBot: 'ok'|'blocked'|'unknown', ... }
// ------------------------------------------------------------
async function checkRobotsTxt(siteRaw) {
  if (!siteRaw) return {};

  // Normaliza a URL
  let domain = siteRaw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const url = `https://${domain}/robots.txt`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RaioXBot/1.0)' }
    });
    clearTimeout(timeout);

    if (!res.ok) return buildUnknownStatus();

    const text = await res.text();
    return parseCrawlerStatus(text);
  } catch {
    return buildUnknownStatus();
  }
}

function buildUnknownStatus() {
  return Object.fromEntries(CRAWLERS_TO_CHECK.map(c => [c, 'unknown']));
}

function parseCrawlerStatus(robotsTxt) {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  const status = {};
  CRAWLERS_TO_CHECK.forEach(c => { status[c] = 'ok'; }); // default: liberado

  let currentAgents = [];
  let inDisallow = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      currentAgents = [line.split(':')[1].trim()];
      inDisallow = false;
    } else if (line.toLowerCase().startsWith('disallow:')) {
      const path = line.split(':').slice(1).join(':').trim();
      if (path === '/' || path === '') {
        // Disallow: / bloqueia tudo
        if (path === '/') {
          currentAgents.forEach(agent => {
            if (agent === '*') {
              CRAWLERS_TO_CHECK.forEach(c => { status[c] = 'blocked'; });
            } else {
              CRAWLERS_TO_CHECK.forEach(c => {
                if (c.toLowerCase() === agent.toLowerCase()) status[c] = 'blocked';
              });
            }
          });
        }
      }
    }
  }

  return status;
}

// ------------------------------------------------------------
// Integração RD Station (via API pública de conversão)
// ------------------------------------------------------------
async function sendToRD(data) {
  // PLACEHOLDER: substitua pelo seu token público do RD Station
  const RD_TOKEN = process.env.RD_STATION_TOKEN;
  if (!RD_TOKEN) return; // silencia se não configurado

  const { nome_contato, email_contato, cargo_contato, empresa, segmento, cidade, estado, score } = data;
  if (!email_contato) return; // não envia sem email

  try {
    await fetch('https://api.rd.services/platform/conversions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'CONVERSION',
        event_family: 'CDP',
        payload: {
          conversion_identifier: 'raio-x-ia-v2',
          name: nome_contato || '',
          email: email_contato,
          job_title: cargo_contato || '',
          cf_empresa: empresa,
          cf_segmento: segmento,
          cf_cidade: `${cidade}${estado ? ', ' + estado : ''}`,
          cf_score_geo: String(score || 0),
          token: RD_TOKEN,
        }
      })
    });
  } catch (e) {
    console.log('RD Station erro (não crítico):', e.message);
    // Erro no RD não derruba a análise
  }
}

// ------------------------------------------------------------
// Notificação interna por email via Resend
// ------------------------------------------------------------
async function sendNotification(data) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return; // silencia se não configurado

  const { empresa, segmento, cidade, estado, score, nome_contato, email_contato, cargo_contato } = data;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify({
        // PLACEHOLDER: substitua pelo seu email verificado no Resend
        from: 'raio-x@papappg.com.br',
        to: 'nathalia@papappg.com.br', // PLACEHOLDER: seu email
        subject: `🔍 Novo Raio-X: ${empresa} (score ${score}/100)`,
        html: `
          <h2>Novo diagnóstico realizado</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:6px;font-weight:bold">Empresa</td><td style="padding:6px">${empresa}</td></tr>
            <tr><td style="padding:6px;font-weight:bold">Segmento</td><td style="padding:6px">${segmento}</td></tr>
            <tr><td style="padding:6px;font-weight:bold">Cidade</td><td style="padding:6px">${cidade}${estado ? ', ' + estado : ''}</td></tr>
            <tr><td style="padding:6px;font-weight:bold">Score GEO</td><td style="padding:6px"><strong>${score}/100</strong></td></tr>
            <tr><td style="padding:6px;font-weight:bold">Contato</td><td style="padding:6px">${nome_contato || '—'}</td></tr>
            <tr><td style="padding:6px;font-weight:bold">Email</td><td style="padding:6px">${email_contato || '—'}</td></tr>
            <tr><td style="padding:6px;font-weight:bold">Cargo</td><td style="padding:6px">${cargo_contato || '—'}</td></tr>
          </table>
        `
      })
    });
  } catch (e) {
    console.log('Resend erro (não crítico):', e.message);
  }
}

// ------------------------------------------------------------
// Handler principal
// ------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const {
    empresa, site, segmento, cidade, estado, abrangencia,
    concorrentes, obs, nome_contato, email_contato, cargo_contato
  } = req.body;

  if (!empresa || !segmento || !cidade) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

  // --- Geo label ---
  const geo = abrangencia === 'cidade' ? `${cidade}${estado ? ', ' + estado : ''}`
    : abrangencia === 'regiao' ? `Região de ${cidade}${estado ? ', ' + estado : ''}`
    : abrangencia === 'estado' ? (estado || cidade)
    : 'Nacional';

  const abrangenciaTexto = {
    cidade: `somente a cidade de ${cidade}`,
    regiao: `a região de ${cidade} e cidades próximas`,
    estado: `o estado de ${estado || cidade} inteiro`,
    nacional: 'todo o Brasil'
  }[abrangencia] || `a cidade de ${cidade}`;

  // --- robots.txt (não bloqueia o fluxo se falhar) ---
  const crawlerStatus = await checkRobotsTxt(site);

  // --- Prompt corrigido (sem schema como fator, com frescor e citações) ---
  const prompt = `Você é um especialista em GEO (Generative Engine Optimization) — visibilidade de marcas em IAs generativas como ChatGPT, Gemini, Perplexity e Claude.

Sua tarefa é fazer uma análise REAL e BASEADA EM EVIDÊNCIAS da presença digital da empresa abaixo nas IAs generativas.

DADOS DA EMPRESA:
- Nome: ${empresa}
- Site: ${site || 'não informado'}
- Segmento: ${segmento}
- Área de atuação: ${abrangenciaTexto}
- Concorrentes: ${concorrentes || 'não informados'}
- Observações: ${obs || 'nenhuma'}

CONTEXTO TÉCNICO IMPORTANTE (baseado em pesquisa recente):
- Schema markup (JSON-LD) NÃO aumenta citações nas IAs — estudo Ahrefs com 1.885 URLs mostrou variação estatisticamente nula. NÃO mencione schema como recomendação.
- As IAs leem apenas o HTML visível da página. Conteúdo denso, claro e bem estruturado em texto corrido é o que importa.
- O fator técnico mais relevante é o robots.txt: se bots como GPTBot, ClaudeBot, PerplexityBot estiverem bloqueados, a IA não indexa o site.
- Conteúdo fresco (publicado com frequência) é valorizado pelas IAs — sites desatualizados perdem relevância.
- Citações de terceiros (outros sites, portais, diretórios falando da marca com a URL referenciada) aumentam autoridade nas IAs.
- Share of voice importa: quantas vezes a marca aparece em respostas sobre a categoria, não apenas se aparece.

INSTRUÇÕES:
1. Use web search para buscar informações REAIS sobre esta empresa. Faça buscas como:
   - "${empresa} ${cidade}" — presença geral
   - "${empresa} avaliação OR review OR reclamação" — reputação pública
   - "melhores empresas ${segmento} ${geo}" — quem aparece no lugar dela
   - "${empresa} ${segmento}" — autoridade no segmento
   - "${segmento} ${geo}" — panorama geral da categoria

2. Com base no que ENCONTROU de verdade (não simule), avalie:
   - A empresa tem site ativo com conteúdo denso e atualizado regularmente?
   - Aparece em diretórios, portais, notícias, blogs do segmento?
   - Tem avaliações e menções em plataformas públicas?
   - Produz conteúdo relevante com frequência semanal ou maior?
   - Outras fontes citam a empresa com links ou referências?
   - Concorrentes aparecem mais em buscas sobre a categoria?

3. Avalie nas 4 dimensões (0-100):

   AUTORIDADE (peso 35%) — o quanto terceiros falam da marca:
   - 0-20: sem menções verificáveis fora do próprio site
   - 21-40: poucas menções, principalmente diretórios básicos
   - 41-60: menções moderadas em portais e avaliações
   - 61-80: mencionada frequentemente por fontes externas relevantes
   - 81-100: referência clara do segmento, citada amplamente

   COBERTURA (peso 25%) — em quantos tipos de busca aparece:
   - 0-20: ausente em buscas do segmento
   - 21-50: aparece em 1 tipo de busca
   - 51-75: aparece em 2-3 tipos
   - 76-100: presente em todos os tipos relevantes

   POSICIONAMENTO (peso 25%) — diferenciação percebida:
   - 0-30: não identificável como referência
   - 31-60: existe mas não se diferencia
   - 61-80: alguma diferenciação percebida
   - 81-100: posicionamento claro e distinto

   FRESCOR (peso 15%) — atualidade do conteúdo:
   - 0-20: site/conteúdo desatualizado ou sem publicações recentes
   - 21-50: conteúdo eventual, sem frequência clara
   - 51-75: publicações regulares mas não semanais
   - 76-100: conteúdo fresco publicado com alta frequência

4. Score = (autoridade * 0.35) + (cobertura * 0.25) + (posicionamento * 0.25) + (frescor * 0.15)

Responda APENAS com JSON válido, sem texto antes ou depois, sem blocos de código:
{
  "score": 35,
  "scoreLabel": "frase curta descrevendo o nível real de presença encontrado",
  "scoreSub": "frase de impacto baseada no que foi encontrado nas buscas",
  "dimensoes": { "autoridade": 30, "cobertura": 35, "posicionamento": 40, "frescor": 20 },
  "diagnostico": "2-3 frases baseadas no que foi encontrado de verdade nas buscas. Mencione evidências reais. Mencione a empresa pelo nome e o recorte de ${geo}.",
  "perguntasSimuladas": "Com base nas buscas realizadas, descreva em texto corrido o que uma IA generativa responderia sobre ${segmento} em ${geo} e se ${empresa} apareceria ou não. Máximo 4 parágrafos.",
  "quemDomina": "Com base nas buscas, quem realmente aparece quando se busca ${segmento} em ${geo}. Seja específico sobre o que foi encontrado.",
  "gaps": "3-4 lacunas concretas identificadas nas buscas — o que está faltando na presença digital de ${empresa}. NÃO mencione schema markup como lacuna.",
  "proximosPassos": [
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas. Foco em: conteúdo HTML visível e denso, frequência de publicação, citações de terceiros, robots.txt, presença em diretórios e portais."},
    {"titulo": "título da ação", "descricao": "ação concreta"},
    {"titulo": "título da ação", "descricao": "ação concreta"}
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 3000,
        temperature: 0,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    console.log('Status API:', response.status);

    const textBlocks = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    const clean = textBlocks.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON inválido');

    const result = JSON.parse(jsonMatch[0]);
    const finalResult = { ...result, geo, crawlerStatus };

    // Notificações em paralelo — não bloqueiam a resposta
    Promise.all([
      sendToRD({ ...req.body, score: result.score }),
      sendNotification({ ...req.body, score: result.score })
    ]).catch(e => console.log('Notificação erro:', e.message));

    return res.status(200).json(finalResult);

  } catch (e) {
    console.log('Erro:', e.message);
    return res.status(500).json({ error: 'Erro na análise. Tente novamente.' });
  }
}
