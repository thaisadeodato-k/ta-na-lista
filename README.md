# Tá na Lista 💊

Bot de WhatsApp (protótipo) que ajuda **idosos e cuidadores** a descobrir se o remédio da receita é **de graça no Programa Farmácia Popular** e onde retirar.

> Projeto voluntário do programa **AI4Good (Brazil Conference)**.
> **Não é canal oficial do governo.** As informações vêm da lista oficial publicada pelo Ministério da Saúde.

## Como funciona

Quem fala com a pessoa é o **Zé da Farma**, simpático e direto:

> "Oi, eu sou o Zé! Manda a foto da receita que eu vejo se tá na lista."

1. A pessoa aceita o termo de uso (responde **SIM**).
2. Manda a **foto da receita** ou escreve o nome do remédio.
3. O Zé mostra o que leu e pede confirmação.
4. Uma **consulta SQL à base oficial** decide se o remédio está na lista. **Quem decide nunca é a IA.**
5. Se estiver na lista, o Zé pede o **CEP** e mostra as **3 farmácias credenciadas mais próximas** e o que levar (receita válida, documento com foto e CPF; outra pessoa pode retirar com procuração).
6. Se não estiver na lista, orienta procurar a **UBS** ou a **farmácia municipal**.

### Fluxo de estados

```
novo ──SIM──► aguardando_receita ──foto/texto──► aguardando_confirmacao ──SIM──► aguardando_cep ──CEP──► concluido
                     ▲                                   │ NÃO                       (se nada estiver na lista: concluido)
                     └───────────────────────────────────┘
```

## O que o Zé **nunca** faz

- Falar de dose, efeito, troca, interação ou indicação de remédio (encaminha para médico/farmacêutico).
- Pedir senha, cartão, Pix ou dados bancários.
- Conversar sobre temas fora do Farmácia Popular (política de IA do WhatsApp).
- Dizer que é canal oficial do governo.

## Arquitetura

| Peça | Papel |
|---|---|
| **n8n Cloud** | Orquestra a conversa (Fase 1: chat de teste do n8n; Fase 2: WhatsApp Cloud API) |
| **Claude API** (modelo `claude-opus-5-5`, com visão) | Só duas tarefas: (1) ler a receita e devolver JSON; (2) redigir a resposta do Zé a partir de fatos já consultados |
| **Supabase (Postgres)** | Base oficial, regras de busca, farmácias, estado da conversa e métricas |

O fluxo do n8n tem **uma entrada** ("Entrada → formato padrão") e **uma saída** ("Saída → chat"). Na Fase 2, basta trocar essas duas pontas pelas do WhatsApp. Veja [docs/configuracao.md](docs/configuracao.md).

## LGPD: privacidade desde o início

- **Não guardamos**: foto da receita, nome do paciente, nome do médico, CPF, texto livre.
- O identificador da pessoa (telefone/sessão) vira um **hash HMAC-SHA256** com chave secreta guardada no banco.
- A conversa guarda só o **estado** e referências à lista oficial, e **expira em 24 horas**.
- O comando **APAGAR** remove os dados da pessoa na hora.
- Sem uso por **6 meses**, o código e o consentimento são apagados automaticamente (limpeza a cada hora, `pg_cron`).
- O n8n **não guarda** execuções que deram certo; as com erro somem sozinhas em até 7 dias.
- As métricas são anônimas (não ligam a nenhuma pessoa).
- A foto é enviada à API do Claude apenas para leitura. Ela não fica salva no projeto.

## Estrutura do repositório

```
data/      CSVs: lista oficial (41 itens), marcas, sinônimos, farmácias de exemplo
db/        schema.sql (tabelas e funções) e seed.sql (dados prontos)
prompts/   prompt de extração da receita e prompt de redação do Zé
n8n/       fluxo importável da Fase 1 + código de cada nó (para leitura)
scripts/   geradores do seed.sql e do fluxo n8n
tests/     20 casos de teste com a resposta esperada
docs/      passo a passo de configuração (Fase 1 e Fase 2)
```

## Fonte dos dados

- **Lista oficial**: "Elenco de Medicamentos e Insumos – Farmácia Popular", Ministério da Saúde, atualizada em 31/08/2026:
  <https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/arquivos/elenco-de-medicamentos-e-insumos-pfpb.pdf>
  - O PDF traz princípio ativo, concentração e indicação. **A coluna `forma` não está no PDF**: foi preenchida com a apresentação usual e precisa ser **conferida por farmacêutico**.
- **Marcas comerciais** (`marca_principio.csv`): lista inicial, **a revisar por farmacêutico**.
- **Farmácias** (`farmacias_pfpb.csv`): lista oficial "Farmácias participantes do PFPB", Ministério da Saúde (lista de 02/10/2026, 27.538 farmácias). O banco é **atualizado sozinho a cada 15 dias** pelo fluxo `n8n/ta_na_lista_atualizar_farmacias.json` (com conferências de segurança e e-mail de aviso se falhar); o CSV do repositório é só uma foto da lista de 02/10/2026. Para atualizar à mão: `node scripts/importar_farmacias.mjs planilha.xlsx` (ver [docs/configuracao.md](docs/configuracao.md#parte-4--farmácias-do-programa-lista-oficial)).

Quando o Ministério atualizar a lista, atualize `data/elenco_pfp.csv`, rode `node scripts/gerar_seed.mjs` e cole o novo `db/seed.sql` no Supabase.

## Licença

[MIT](LICENSE). Use, adapte e compartilhe.
