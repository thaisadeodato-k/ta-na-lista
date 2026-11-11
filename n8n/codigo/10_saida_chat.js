// SAÍDA (FASE 1): devolve a resposta para o chat de teste do n8n.
// Na Fase 2, este nó é trocado por um envio para a WhatsApp Cloud API.
const resposta = $('Juntar resposta').first().json.resposta;
return [{ json: { output: resposta, text: resposta } }];
