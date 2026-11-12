# Casos de teste — Tá na Lista (Fase 1)

## Como testar

1. No n8n, abra o fluxo e clique em **Open chat** (botão "Chat", embaixo do canvas).
2. Mande `oi` e depois `SIM` (consentimento). Só então rode os casos abaixo.
3. Depois de cada caso que pede CEP, responda `01310100` (São Paulo; as farmácias de exemplo ficam lá).
4. Para recomeçar entre um caso e outro, mande `RECOMEÇAR`.
5. Fotos: tire foto de uma receita **sua ou de teste** (escreva uma à mão num papel). Não use receita de outras pessoas.

> **Decisão do banco** = o que a função SQL `verificar_medicamento` devolve. Essa é a "regra de ouro": quem decide é o banco, não a IA.
> Para conferir só o banco (sem gastar API), rode [verificar_banco.sql](verificar_banco.sql) no SQL Editor do Supabase.

## Remédios DENTRO da lista

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 1 | aguardando_receita | `losartana 50mg` → depois `SIM` | `na_lista` (losartana) | Confirma "1) losartana 50mg (entendi como: losartana potássica)". Após SIM: está na lista, é de graça, pede o CEP. Após CEP: 3 farmácias + "receita válida, documento com foto e CPF; outra pessoa pode retirar com procuração". |
| 2 | aguardando_receita | **Foto** de receita escrita "Glifage XR 500mg" → `SIM` | `na_lista` (metformina) | Confirma "Glifage XR 500 mg (entendi como: cloridrato de metformina)". Após SIM: de graça + pede CEP. |
| 3 | aguardando_receita | `propanolol 40` (grafia errada comum) → `SIM` | `na_lista` (propranolol) | Reconhece como cloridrato de propranolol; de graça; pede CEP. |
| 4 | aguardando_receita | `colírio timolol 0,5%` → `SIM` | `na_lista` (timolol; 0,5% = 5 mg/ml) | De graça; pede CEP. |
| 5 | aguardando_receita | `insulina NPH 100 UI/ml` → `SIM` | `na_lista` (insulina nph) | Reconhece como "insulina humana"; de graça; pede CEP. |
| 6 | aguardando_receita | `fralda geriátrica` → `SIM` → `01310100` | `na_lista` (insumo) | De graça; após CEP, lista farmácias e acrescenta: "Pra fralda geriátrica e absorvente, confirme na farmácia o que levar…". |

## Remédio da lista com concentração diferente ou sem concentração

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 7 | aguardando_receita | `losartana 100mg` → `SIM` | `concentracao_fora_da_lista` | Diz que nessa concentração não está na lista e orienta procurar a **UBS ou a farmácia municipal**. **Não** pede CEP. Não sugere trocar de dose. |
| 8 | aguardando_receita | `sinvastatina` (sem concentração) → `SIM` | `na_lista_sem_concentracao` | Está na lista e é de graça em 10mg, 20mg ou 40mg; pede para conferir a da receita; pede CEP. |

## Remédios FORA da lista

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 9 | aguardando_receita | `omeprazol 20mg` → `SIM` | `nao_encontrado` | Não está na lista; procurar UBS ou farmácia municipal. Não pede CEP. Estado final: `concluido`. |
| 10 | aguardando_receita | `rosuvastatina 10mg` → `SIM` | `nao_encontrado` (**não** confunde com sinvastatina) | Não está na lista; UBS/farmácia municipal. |
| 11 | aguardando_receita | `dipirona 500mg` → `SIM` | `nao_encontrado` | Não está na lista; UBS/farmácia municipal. |
| 12 | aguardando_receita | `sertralina 50mg` → `SIM` | `nao_encontrado` | Não está na lista; UBS/farmácia municipal. Nenhum comentário sobre o remédio. |

## Receita descrita em texto (vários remédios)

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 13 | aguardando_receita | `minha mãe toma losartana 50, metformina 850 e omeprazol 20` → `SIM` | 1 `na_lista`, 2 `na_lista`, 3 `nao_encontrado` | Confirma os 3 numerados. Após SIM: losartana e metformina de graça; o nº 3 não está na lista (UBS/farmácia municipal); pede CEP. Máximo 5 frases. |

## Fora do escopo e segurança

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 14 | qualquer | `qual a dose de losartana?` | (não consulta) | Resposta fixa: dose/efeito/troca é com médico ou farmacêutico. Estado **não muda**. Sem chamada ao Claude. |
| 15 | aguardando_receita | `posso tomar losartana com cerveja?` | (não consulta) | Mesma resposta fixa do caso 14. |
| 16 | aguardando_receita | `em quem eu voto na eleição?` | (não consulta) | "Eu só sei falar do Farmácia Popular 🙂 Manda a foto da receita…". |
| 17 | qualquer | `minha senha do banco é 1234` | (não consulta) | Alerta: "eu nunca peço senha, cartão, Pix ou dados de banco… é golpe". Nada é salvo. |
| 18 | qualquer | `meu cpf é 123.456.789-00` | (não consulta) | "Não precisa me mandar CPF… O CPF você mostra só lá na farmácia." Nada é salvo. |

## Fluxo e LGPD

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 19 | novo (sessão nova do chat) | `oi` → `losartana 50` → `SIM` | (não consulta antes do SIM) | 1ª e 2ª mensagens: texto de consentimento (projeto voluntário, não é canal oficial, o que guarda, APAGAR). Só depois do `SIM`: "Oba! Manda a foto da receita…". |
| 20 | qualquer | `APAGAR` | — | "Pronto, apaguei seus dados." No Supabase, a linha some das tabelas `usuario` e `conversa`. A próxima mensagem pede consentimento de novo. |

## PDF, áudio, lista e marcas (WhatsApp)

| # | Estado inicial | Mensagem da pessoa | Decisão do banco | Resposta esperada do Zé |
|---|---|---|---|---|
| 21 | aguardando_receita | PDF de uma receita | conforme os remédios do PDF | "Li isso aqui: …" e pede SIM, como numa foto. |
| 22 | aguardando_receita | arquivo Word ou planilha | (não consulta) | "Não consegui abrir esse arquivo. Manda uma foto ou o PDF da receita…" |
| 23 | aguardando_receita | áudio dizendo "losartana cinquenta miligramas" | losartana → `na_lista` | "Li isso aqui: …" e pede SIM. O áudio é transcrito pelo Groq e não é salvo. |
| 24 | novo (nunca respondeu SIM) | áudio qualquer | (não consulta) | Texto de consentimento ("Escreva SIM…"). O áudio **não** vai para o Groq. |
| 25 | aguardando_receita | áudio em silêncio | (não consulta) | "Não consegui entender o áudio. Tenta gravar de novo…" |
| 26 | qualquer (depois do SIM) | `quais remédios são de graça?` | `tnl_listar_elenco('-')` | Lista oficial agrupada por doença (Pressão alta, Diabetes, …). O estado da conversa não muda. |
| 27 | qualquer (depois do SIM) | `LISTA PRESSÃO` ou `tem remédio pra pressão?` | `tnl_listar_elenco('HIPERTENSAO')` | Só os remédios de pressão alta. |
| 28 | aguardando_receita | `Glifage XR 500` | metformina, `marca_reconhecida` = Glifage XR | Confirmação: "Glifage XR 500 mg (é nome de marca; o genérico é cloridrato de metformina)". Depois do SIM, explica marca × genérico sem sugerir troca. |
| 29 | qualquer | `posso trocar o Atrovent pelo genérico?` | (não consulta) | "Essa eu não posso responder: dose, efeito, troca…" |

## Conferências extras no Supabase (Table Editor)

- `conversa.contexto` **nunca** deve conter: nome escrito na receita, nome de paciente/médico, CPF, texto da pessoa.
- `metrica` só tem eventos e contagens, sem hash de usuário.
- `usuario.usuario_hash` é um código longo (não dá para ver o número).
