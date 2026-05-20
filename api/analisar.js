export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const {
    empresa, site, segmento, cidade, estado, abrangencia,
    concorrentes, obs, nome_contato, email_contato
  } = req.body;

  if (!empresa || !segmento || !cidade) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' });
  }

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

  // Notificação via Formspree — não bloqueia a análise
  async function notificarFormspree() {
    try {
      await fetch('https://formspree.io/f/mwvzlbeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          nome: nome_contato || '—',
          email: email_contato || '—',
          empresa,
          segmento,
          cidade: `${cidade}${estado ? ', ' + estado : ''}`,
          _subject: `Novo Raio-X: ${empresa} (${geo})`
        })
      });
    } catch (e) {
      console.log('Formspree erro (não crítico):', e.message);
    }
  }

  notificarFormspree();

  const prompt = `Você é um especialista em GEO (Generative Engine Optimization) e visibilidade de marcas em IAs generativas.

Sua tarefa é fazer uma análise REAL e BASEADA EM EVIDÊNCIAS da presença digital da empresa abaixo.

DADOS DA EMPRESA:
- Nome: ${empresa}
- Site: ${site || 'não informado'}
- Segmento: ${segmento}
- Área de atuação: ${abrangenciaTexto}
- Concorrentes: ${concorrentes || 'não informados'}
- Observações: ${obs || 'nenhuma'}

INSTRUÇÕES:
1. Use web search para buscar informações REAIS sobre esta empresa. Faça as seguintes buscas:
   - "${empresa} ${cidade}" — presença geral
   - "${empresa} avaliação OR review OR reclamação" — reputação pública
   - "melhores empresas ${segmento} ${geo}" — quem aparece no lugar dela
   - "${empresa} ${segmento}" — autoridade no segmento
   - "${segmento} ${geo}" — panorama geral da categoria

2. Com base no que ENCONTROU de verdade (não simule), avalie:
   - A empresa tem site ativo e bem estruturado?
   - Aparece em diretórios, portais, notícias locais?
   - Tem avaliações em plataformas públicas?
   - Produz conteúdo relevante para o segmento?
   - Concorrentes aparecem mais do que ela nas buscas?

3. Avalie nas 3 dimensões (0-100) com critério realista:

   Autoridade (peso 40%):
   - 0-20 = nunca citada, sem presença digital verificável
   - 21-40 = raramente citada, presença mínima
   - 41-60 = às vezes aparece em buscas, site ativo com algum conteúdo
   - 61-80 = citada frequentemente, boa presença em múltiplos canais
   - 81-100 = referência clara do segmento, citada amplamente

   Cobertura (peso 30%):
   - 0-20 = ausente em todas as buscas do segmento
   - 21-50 = aparece em 1 tipo de busca
   - 51-75 = aparece em 2-3 tipos de busca
   - 76-100 = presente em todos os tipos de busca relevantes

   Posicionamento (peso 30%):
   - 0-30 = não identificável como referência no segmento
   - 31-60 = existe mas não se diferencia
   - 61-80 = alguma diferenciação percebida
   - 81-100 = posicionamento claro e diferenciado

4. Score = (autoridade * 0.4) + (cobertura * 0.3) + (posicionamento * 0.3)

REFERÊNCIA DE SCORES — use para calibrar:
- 0-25: empresa invisível, sem presença digital relevante para IAs
- 26-45: presença mínima, aparece em poucos contextos
- 46-65: presença moderada, reconhecida em algumas buscas — empresa com site ativo, Google Meu Negócio e algum conteúdo deve ficar nessa faixa
- 66-80: boa presença, aparece consistentemente em buscas do segmento
- 81-100: referência do segmento nas IAs

Responda APENAS com JSON válido, sem texto antes ou depois, sem blocos de código:
{
  "score": 35,
  "scoreLabel": "frase curta descrevendo o nível real de presença encontrado",
  "scoreSub": "frase de impacto baseada no que foi encontrado nas buscas",
  "dimensoes": { "autoridade": 30, "cobertura": 35, "posicionamento": 40 },
  "diagnostico": "2-3 frases baseadas no que foi encontrado de verdade nas buscas. Mencione evidências reais. Mencione a empresa pelo nome e o recorte de ${geo}.",
  "perguntasSimuladas": "Com base nas buscas realizadas, descreva em texto corrido o que uma IA generativa responderia sobre ${segmento} em ${geo} e se ${empresa} apareceria ou não. Máximo 4 parágrafos.",
  "quemDomina": "Com base nas buscas, quem realmente aparece quando se busca ${segmento} em ${geo}. Seja específico sobre o que foi encontrado.",
  "gaps": "3-4 lacunas concretas identificadas nas buscas — o que está faltando na presença digital de ${empresa}.",
  "proximosPassos": [
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"},
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"},
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"}
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
    return res.status(200).json({ ...result, geo });
  } catch (e) {
    console.log('Erro:', e.message);
    return res.status(500).json({ error: 'Erro na análise. Tente novamente.' });
  }
}
