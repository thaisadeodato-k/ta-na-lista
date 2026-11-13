// FASE 2 — nó "Montar envio WhatsApp" (antes de "Saída → WhatsApp").
// Transforma a resposta do Zé no corpo que a WhatsApp Cloud API espera.
// - Sem botões: uma mensagem de texto.
// - Com botões (até 3) ou menu em lista: mensagem interativa. Mensagem interativa aceita
//   no máximo 1024 letras; se a resposta for maior (ou se vier "menu_texto"), vai o texto
//   normal primeiro e depois uma mensagem curta só com os botões.
// Cada item que sai daqui vira um envio, na ordem.
const r = $('Juntar resposta').first().json;
const para = $('Entrada → formato padrão').first().json.para; // só na memória; nunca é salvo
const LIMITE = 1024;
const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: para };
const corta = (s, n) => { const c = [...String(s || '')]; return c.length > n ? c.slice(0, n - 1).join('') + '…' : c.join(''); };

const texto = (body) => ({ ...base, type: 'text', text: { preview_url: false, body: corta(body, 4096) } });
function interativo(body) {
  if (r.lista) {
    return { ...base, type: 'interactive', interactive: {
      type: 'list',
      body: { text: corta(body, LIMITE) },
      action: {
        button: corta(r.lista.botao, 20),
        sections: r.lista.secoes.map((s) => ({
          title: corta(s.title, 24),
          rows: s.rows.slice(0, 10).map((x) => ({ id: x.id, title: corta(x.title, 24), ...(x.description ? { description: corta(x.description, 72) } : {}) })),
        })),
      },
    } };
  }
  return { ...base, type: 'interactive', interactive: {
    type: 'button',
    body: { text: corta(body, LIMITE) },
    action: { buttons: r.botoes.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: corta(b.title, 20) } })) },
  } };
}

const temBotoes = (Array.isArray(r.botoes) && r.botoes.length > 0) || !!r.lista;
const resposta = r.resposta || '';
const envios = [];
if (!temBotoes) envios.push(texto(resposta));
else if (!r.menu_texto && [...resposta].length <= LIMITE) envios.push(interativo(resposta));
else { envios.push(texto(resposta)); envios.push(interativo(r.menu_texto || '👇 Escolha uma opção:')); }

return envios.map((corpo) => ({ json: { corpo } }));
