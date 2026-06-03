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

  const hoje = new Date().toLocaleDateString('pt-BR');

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
   - "${empresa} site:reclameaqui.com.br" — reputação
   - "${empresa} avaliação OR review OR reclamação" — o que clientes dizem
   - "melhores empresas ${segmento} ${geo}" — quem aparece no lugar dela
   - "${empresa} ${segmento}" — autoridade no segmento

2. Com base no que ENCONTROU de verdade (não simule), avalie:
   - A empresa tem site ativo e bem estruturado?
   - Aparece em diretórios, portais, notícias locais?
   - Tem avaliações em plataformas públicas indexadas?
   - Produz conteúdo relevante para o segmento?
   - Concorrentes aparecem mais do que ela nas buscas?

3. IMPORTANTE sobre o diagnóstico e gaps:
   - Baseie-se apenas no que foi encontrado nas buscas textuais realizadas
   - NÃO faça afirmações sobre ausência de Google Meu Negócio, LinkedIn ou outros perfis que não são indexados em buscas textuais — esses canais existem mas não aparecem nos resultados de busca que você acessa
   - Foque nos gaps de visibilidade que são verificáveis: ausência em rankings, diretórios de texto, portais, notícias, conteúdo indexado
   - Use linguagem de evidência: "não foram encontradas menções em...", "nos resultados analisados, não aparece em..."

4. Avalie nas 3 dimensões (0-100) com critério realista:
   - Autoridade (peso 40%): 0-20 = nunca citada; 21-40 = raramente; 41-60 = às vezes em buscas genéricas; 61-80 = frequente; 81-100 = referência do segmento
   - Cobertura (peso 30%): 0-20 = ausente em todas as perguntas; 21-50 = aparece em 1 pergunta; 51-75 = aparece em 2-3; 76-100 = presente em todas
   - Posicionamento (peso 30%): 0-30 = mercado não reconhecido pela IA; 31-60 = mercado existe mas empresa não está posicionada; 61-80 = posicionada mas genérica; 81-100 = posicionamento claro e diferenciado

5. Score = (autoridade * 0.4) + (cobertura * 0.3) + (posicionamento * 0.3)

Referência de scores:
- 0-25: empresa invisível, sem presença digital indexada relevante
- 26-45: presença mínima, aparece em poucos contextos indexados
- 46-65: presença moderada, reconhecida em algumas buscas — empresa com site ativo e conteúdo deve ficar nessa faixa
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
  "gaps": "3-4 lacunas de visibilidade identificadas nas buscas — use linguagem de evidência baseada no que foi encontrado, sem afirmar ausência de canais não verificáveis via busca textual.",
  "proximosPassos": [
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"},
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"},
    {"titulo": "título da ação", "descricao": "ação concreta baseada nas lacunas encontradas"}
  ],
  "notaMetodologica": "Diagnóstico baseado em evidências de indexação pública coletadas em ${hoje}. Canais como Google Meu Negócio, LinkedIn e redes sociais existem mas podem não aparecer em buscas textuais — o score reflete visibilidade em conteúdo indexado publicamente."
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
        model: 'model: 'claude-haiku-4-5-20251001',
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
