// SAÍDA (FASE 1): devolve a resposta para o chat de teste do n8n.
// Na Fase 2, este nó é trocado por um envio para a WhatsApp Cloud API.
// O chat de teste não tem botões: eles aparecem como texto, só para conferir.
const r = $('Juntar resposta').first().json;
const opcoes = r.lista ? r.lista.secoes.flatMap((s) => s.rows) : (r.botoes || []);
const resposta = r.resposta + (opcoes.length
  ? '\n\n' + (r.menu_texto ? r.menu_texto + '\n' : '') + '🔘 ' + opcoes.map((o) => `${o.title} (= ${o.id})`).join(' | ')
  : '');
return [{ json: { output: resposta, text: resposta } }];
