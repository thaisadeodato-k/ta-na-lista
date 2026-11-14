# Tá na Lista 💊

Bot de WhatsApp (protótipo) que ajuda **idosos e cuidadores** a descobrir se o remédio da receita é **de graça no Programa Farmácia Popular** e onde retirar.

> Projeto voluntário do programa **AI4Good (Brazil Conference)**.
> **Não é canal oficial do governo.** As informações vêm da lista oficial publicada pelo Ministério da Saúde.

## Como funciona

Quem conversa com a pessoa é o **Zé da Farma**, o atendente do Tá na Lista: simpático, direto e com frases curtas.

> "Oi, eu sou o Zé da Farma! Manda a foto da receita que eu vejo se tá na lista."

1. A pessoa aceita o termo de uso (botão **Sim, pode ser** ou responde **SIM**).
2. Manda a receita do jeito que preferir: **foto**, **PDF**, **texto** ou **áudio**. Pode mandar o lugar junto, por exemplo "losartana, moro em Campina Grande".
3. O Zé mostra o que leu e pede confirmação (**Tá certo** / **Tá errado**).
4. Uma **consulta SQL à base oficial** decide se cada remédio está na lista, inclusive pelo nome de marca (ex.: Glifage → metformina). **Quem decide nunca é a IA.**
5. Se algum remédio estiver na lista, o Zé pede o **CEP** ou a **cidade e o bairro** e mostra as **farmácias credenciadas mais próximas**, com o que levar: receita válida, documento com foto e CPF. Outra pessoa pode retirar com procuração.
6. Se o remédio não estiver na lista, o Zé orienta procurar a **UBS** (posto de saúde) ou a **farmácia municipal**.

Hoje **todos os 41 itens da lista são de graça**. Desde 14/02/2025 o programa não tem mais itens com desconto (copagamento).

### O que mais dá pra fazer

O menu **Ver opções** reúne tudo:

| Opção | O que faz |
|---|---|
| 📸 Mandar uma receita | Foto, PDF, texto ou áudio |
| 💊 O que é de graça | Mostra a lista oficial (também por doença: pressão, diabetes…) |
| 💡 Dar uma sugestão | Guarda a sugestão de forma anônima, com o perfil de quem usa e só a sigla do estado |
| 💬 Sobre o projeto | Quem fez o Tá na Lista |
| 🗑️ Apagar meus dados | Pede confirmação e apaga tudo o que está ligado ao número |

O Zé também entende pedidos escritos do jeito da pessoa, como "apaga meus dados" ou "quero corrigir a cidade", sem precisar de comando exato.

### Fluxo de estados

```
novo ──SIM──► aguardando_receita ──foto/PDF/texto/áudio──► aguardando_confirmacao ──SIM──► aguardando_cep ──CEP ou cidade──► concluido
                     ▲                                             │ NÃO                         (se nada estiver na lista: concluido)
                     └─────────────────────────────────────────────┘
```

## O que o Zé **nunca** faz

- Falar de dose, efeito, troca, interação ou indicação de remédio. Ele encaminha para o médico ou o farmacêutico.
- Pedir senha, cartão, Pix, dados bancários ou CPF por mensagem.
- Conversar sobre temas fora do Farmácia Popular (política de IA do WhatsApp).
- Dizer que é canal oficial do governo.

## Arquitetura

| Peça | Papel |
|---|---|
| **WhatsApp Cloud API** (Meta) | Recebe e envia as mensagens, com botões e menus |
| **n8n Cloud** | Orquestra a conversa. Tem também um chat de teste (Fase 1) e um fluxo que atualiza as farmácias a cada 15 dias |
| **Claude API** (Anthropic) | Só duas tarefas: (1) **ler a receita** e devolver JSON, com o **Claude Opus 5.5**; (2) **escrever a resposta do Zé** a partir de fatos já decididos pelo banco, com o **Claude Haiku 5.5**, mais barato. Se a resposta vier fora das regras, entra um texto fixo, sem IA |
| **Groq** (Whisper) | Transforma áudio em texto, só depois que a pessoa aceitou os termos |
| **Supabase (Postgres)** | Lista oficial, marcas e sinônimos, farmácias, regras de busca, estado da conversa, sugestões e métricas anônimas |
| **BrasilAPI** | Descobre a cidade e o bairro a partir do CEP |

O fluxo tem **uma entrada** ("Entrada → formato padrão") e **uma saída**. O "meio" é o mesmo no chat de teste e no WhatsApp. Passo a passo em [docs/configuracao.md](docs/configuracao.md).

## LGPD: privacidade desde o início

- **Não guardamos**: foto, PDF ou áudio da receita, nome do paciente, nome do médico, CPF nem o texto que a pessoa escreveu.
- O número de telefone vira um **hash HMAC-SHA256**, com chave secreta guardada no banco. O número em si nunca é salvo.
- A conversa guarda só o **estado** e referências à lista oficial, e **expira em 24 horas**.
- **Apagar meus dados** (botão ou pedido escrito) apaga tudo na hora, depois de confirmar.
- Sem uso por **6 meses**, o código e o consentimento são apagados automaticamente (limpeza a cada hora, com `pg_cron`).
- As **sugestões** são anônimas: sem número, sem código, com a data só do dia e só a sigla do estado. CPF, telefone e e-mail escritos no texto são trocados por "[removido]".
- O n8n **não guarda** execuções que deram certo, e as com erro somem sozinhas em até 7 dias.
- As métricas são anônimas e não ligam a nenhuma pessoa.

Detalhes em [docs/privacidade.md](docs/privacidade.md) e [docs/termos.md](docs/termos.md).

## Estrutura do repositório

```
data/      CSVs: lista oficial (41 itens), marcas, sinônimos e farmácias credenciadas
db/        schema.sql (tabelas e funções), seed.sql (dados prontos) e migracoes/ (mudanças em bancos já criados)
prompts/   prompt de leitura da receita (+ schema JSON) e prompt de redação do Zé
n8n/       fluxos importáveis (chat de teste, WhatsApp, atualização das farmácias) + código de cada nó em codigo/
scripts/   geradores do seed.sql e dos fluxos, importador de farmácias e comparação de modelos do Claude
tests/     casos de teste com a resposta esperada e conferências do banco
docs/      configuração passo a passo, política de privacidade e termos de uso
```

## Fonte dos dados

- **Lista oficial**: "Elenco de Medicamentos e Insumos – Farmácia Popular", Ministério da Saúde, atualizada em 31/08/2026:
  <https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/arquivos/elenco-de-medicamentos-e-insumos-pfpb.pdf>
  - O PDF traz princípio ativo, concentração e indicação. **A coluna `forma` não está no PDF**: foi preenchida com a apresentação usual e precisa ser **conferida por farmacêutico**.
- **Marcas comerciais** (`marca_principio.csv`): lista inicial, **a revisar por farmacêutico**.
- **Farmácias** (`farmacias_pfpb.csv`): lista oficial "Farmácias participantes do PFPB", do Ministério da Saúde (lista de 02/10/2026, com 27.538 farmácias).
  - O banco é **atualizado sozinho a cada 15 dias** pelo fluxo `n8n/ta_na_lista_atualizar_farmacias.json`, que faz conferências de segurança e manda e-mail de aviso se algo falhar.
  - O CSV do repositório é só uma foto da lista de 02/10/2026.
  - Para atualizar à mão, rode `node scripts/importar_farmacias.mjs planilha.xlsx` (ver [docs/configuracao.md](docs/configuracao.md#parte-4--farmácias-do-programa-lista-oficial)).

Quando o Ministério atualizar a lista:
1. atualize `data/elenco_pfp.csv`;
2. rode `node scripts/gerar_seed.mjs`;
3. cole o novo `db/seed.sql` no Supabase.

## Licença

[MIT](LICENSE). Use, adapte e compartilhe.
