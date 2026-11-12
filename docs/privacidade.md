# Política de Privacidade — Tá na Lista

*Última atualização: 12 de novembro de 2026*

O **Tá na Lista** é um projeto voluntário, sem fins lucrativos, criado no programa AI4Good da Brazil Conference. Pelo WhatsApp, o assistente "Zé da Farma" informa se um medicamento está na lista de gratuidade do Programa Farmácia Popular e onde ficam as farmácias credenciadas mais próximas.

**O Tá na Lista não é um canal oficial do governo** e não tem vínculo com o Ministério da Saúde. As informações sobre a lista vêm da relação oficial publicada pelo Ministério.

Esta política explica, em linguagem simples, quais dados tratamos, por quê, com quem e por quanto tempo, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).

## 1. Antes de começar: o seu consentimento

Na primeira mensagem, o Zé explica o que acontece com os seus dados e só continua se você responder **SIM**. Se você responder NÃO, nada é guardado.

Como a foto de uma receita e o nome de um remédio podem revelar informações sobre a sua saúde (dado pessoal sensível, art. 11 da LGPD), a base legal é o seu **consentimento específico**, dado nessa primeira mensagem. Você pode retirar o consentimento a qualquer momento escrevendo **APAGAR**.

## 2. Quais dados tratamos

| Dado | Para quê | Fica guardado? |
|---|---|---|
| Seu número de WhatsApp | Saber em que passo a conversa está e responder você | **Não em formato legível.** Guardamos só um código (hash criptográfico com chave secreta) gerado a partir do número. O número em si só passa pela memória do sistema no momento de responder. |
| Data do seu consentimento | Não pedir o consentimento de novo a cada conversa | Sim, junto com o código acima, até você pedir para apagar. |
| Foto ou PDF da receita, ou nome do remédio que você escreve | Identificar o medicamento | **Não.** A foto, o PDF e o texto são lidos e descartados. |
| Medicamentos reconhecidos na lista oficial e a data da receita | Responder se o remédio é gratuito | Por no máximo **24 horas**, só como referência aos itens da lista oficial. Não guardamos o texto que você escreveu nem o nome do paciente ou do médico. |
| Mensagem de voz (áudio) | Transformar a fala em texto, como se você tivesse escrito | **Não.** O áudio é transcrito e descartado. Só é transcrito depois que você respondeu SIM ao consentimento. |
| CEP, cidade ou bairro que você informar | Encontrar as farmácias mais próximas | **Só enquanto a conversa precisa.** Se você disser o lugar antes da hora (por exemplo, junto com o nome do remédio), guardamos o CEP ou a cidade e o bairro **reconhecidos na lista oficial** até mostrar as farmácias — no máximo **24 horas**. Não guardamos o texto que você escreveu nem o seu endereço. |
| Estatísticas de uso | Saber se o projeto está ajudando (ex.: quantas consultas tiveram remédio na lista) | Sim, de forma **anônima**, sem ligação com nenhuma pessoa. |

**Nunca pedimos** senha, dados de cartão, Pix, dados bancários ou documentos. Se alguém pedir isso em nome do Tá na Lista ou do Farmácia Popular, é golpe.

Não lemos nem pedimos o seu CPF. Se você mandar por engano, ele não é guardado.

## 3. Com quem os dados são compartilhados

Para funcionar, o Tá na Lista usa serviços de terceiros, que tratam os dados apenas para executar a tarefa:

- **WhatsApp / Meta**: entrega as mensagens entre você e o Zé.
- **Anthropic (Claude)**: inteligência artificial que lê a foto ou o PDF da receita, ou o texto para identificar o nome do remédio, e que redige a resposta do Zé. Ela não decide se o remédio é gratuito: quem decide é a consulta à lista oficial.
- **Groq**: transforma as mensagens de voz em texto (transcrição). Recebe só o áudio, sem o seu número.
- **Supabase**: banco de dados onde ficam a lista oficial e os dados descritos acima, em servidores em São Paulo.
- **n8n**: plataforma que organiza a conversa.
- **BrasilAPI**: transforma o CEP em localização.

Alguns desses serviços ficam fora do Brasil, o que caracteriza transferência internacional de dados (art. 33 da LGPD). Escolhemos serviços com compromissos públicos de segurança e privacidade.

Não vendemos, alugamos nem usamos seus dados para publicidade.

## 4. Por quanto tempo

- A conversa expira em **24 horas** e é apagada automaticamente.
- O código do seu número e a data do consentimento ficam até você escrever APAGAR.
- Registros técnicos de erro da plataforma, quando existem, servem só para corrigir falhas e são apagados periodicamente.
- As estatísticas anônimas podem ser mantidas para avaliar o projeto.

## 5. Como apagar seus dados

Você pode pedir a exclusão a qualquer momento, de dois jeitos:

1. **Pelo WhatsApp:** escreva **APAGAR** para o Zé. Os seus dados são apagados na hora e você recebe a confirmação.
2. **Pela equipe do projeto:** abra uma solicitação em <https://github.com/thaisadeodato-k/ta-na-lista/issues> com o título "Exclusão de dados". **Não escreva o seu número de telefone** na solicitação, porque ela é pública: a equipe vai combinar com você um jeito privado de identificar a sua conversa.

## 6. Seus direitos

Pela LGPD (art. 18), você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização, eliminação, informação sobre com quem compartilhamos, e revogação do consentimento. Use os canais do item 5.

## 7. Segurança

- O banco de dados não fica aberto à internet e só o sistema do projeto consegue acessá-lo.
- Chaves e senhas ficam guardadas em cofres das próprias plataformas, fora do código.
- O código do projeto é aberto e pode ser auditado: <https://github.com/thaisadeodato-k/ta-na-lista>.

## 8. Limites do serviço

O Zé **não dá orientação médica**: não fala de dose, efeito, troca ou interação de remédios. Para isso, procure um médico ou farmacêutico. Veja também os [Termos de Uso](termos.md).

## 9. Mudanças nesta política

Se esta política mudar, a data no topo será atualizada e as mudanças ficam registradas no histórico do repositório do projeto.
