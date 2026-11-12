# Configuração passo a passo

Tempo estimado: **40 minutos** para a Fase 1.
Você vai precisar de: conta no **Supabase** (grátis), conta no **n8n Cloud** (você já tem) e conta na **plataforma de API da Anthropic** (Claude), com um pouco de crédito.

> 🔐 **Regra de ouro das chaves**: senhas e chaves só vão **dentro das credenciais do n8n**. Nunca cole chave em código, em planilha, no GitHub ou em conversa.
> Os menus dos sites mudam de vez em quando; se um nome de botão estiver um pouco diferente, procure o mais parecido.

---

## Parte 1 — Supabase (banco de dados)

### 1.1 Criar o projeto
1. Entre em <https://supabase.com> e clique em **Sign in** (pode entrar com o GitHub ou e-mail).
2. Clique em **New project**.
3. Preencha:
   - **Name**: `ta-na-lista`
   - **Database Password**: clique em **Generate a password** e **guarde essa senha** num gerenciador de senhas (você vai usar no n8n).
   - **Region**: **South America (São Paulo)**.
4. Clique em **Create new project** e espere 1–2 minutos.

### 1.2 Criar as tabelas e funções
1. No menu da esquerda, clique em **SQL Editor**.
2. Clique em **New query** (ou no **+**).
3. Abra o arquivo [`db/schema.sql`](../db/schema.sql) no seu computador (Bloco de Notas serve), selecione tudo (**Ctrl+A**), copie (**Ctrl+C**) e cole no editor (**Ctrl+V**).
4. Clique em **Run** (canto de baixo, à direita). Deve aparecer **Success. No rows returned**.
   - Se aparecer um aviso de "operação destrutiva", pode confirmar: o script não apaga dados.

### 1.3 Carregar os dados (lista oficial, marcas, sinônimos, farmácias de exemplo)
1. **New query** de novo.
2. Copie e cole todo o conteúdo de [`db/seed.sql`](../db/seed.sql).
3. **Run**. No resultado deve aparecer **itens_na_lista_oficial = 41**.

### 1.4 Conferir a regra de ouro (opcional, recomendado)
1. **New query**, cole [`tests/verificar_banco.sql`](../tests/verificar_banco.sql) e clique em **Run**.
2. Na coluna **ok**, todas as linhas devem estar `true`.

### 1.5 Limpeza automática de 24 h (opcional, recomendado para a LGPD)
1. Menu da esquerda: **Database** → **Extensions**.
2. Procure **pg_cron** e ligue a chave (**Enable**).
3. Volte ao **SQL Editor** → **New query**, cole a linha abaixo e clique em **Run**:
   ```sql
   select cron.schedule('tnl-limpeza-24h', '15 * * * *', $$select public.tnl_limpar_expiradas()$$);
   ```
   Isso apaga, a cada hora, as conversas paradas há mais de 24 h.

### 1.6 Anotar os dados de conexão (para o n8n)
1. No topo da página do projeto, clique no botão **Connect**.
2. Procure a opção **Session pooler**. Use essa, e não a "Direct connection": o n8n Cloud precisa dela (rede IPv4).
3. Anote estes dados:
   | Campo | Exemplo |
   |---|---|
   | Host | `aws-0-sa-east-1.pooler.supabase.com` |
   | Port | `5432` |
   | Database | `postgres` |
   | User | `postgres.abcdefghijklmno` (tem um ponto e um código depois de `postgres`) |
   | Password | a senha do passo 1.1 |

---

## Parte 2 — Chave da API do Claude

1. Entre em <https://platform.claude.com> (antigo console.anthropic.com) e crie a conta ou faça login.
2. Vá em **Billing** (Cobrança) e adicione créditos. **US$ 5** são suficientes para centenas de testes.
   - Custo aproximado com o modelo `claude-opus-5-5`: **US$ 0,02 a 0,05 por receita** (leitura da foto + redação da resposta).
3. Vá em **API Keys** → **Create Key**.
   - Nome: `ta-na-lista-n8n`
4. **Copie a chave** (começa com `sk-ant-`). Ela só aparece uma vez. Guarde no gerenciador de senhas.
5. Sugestão: em **Limits** (Limites), defina um limite de gasto mensal (ex.: US$ 10) para não ter surpresa.

---

## Parte 3 — n8n Cloud (o fluxo)

### 3.1 Importar o fluxo
1. Entre no seu n8n Cloud.
2. Clique em **Create Workflow** (ou **+** → **Workflow**).
3. No canto de cima, à direita, clique nos **três pontinhos (…)** → **Import from File…**
4. Escolha o arquivo [`n8n/ta_na_lista_fase1.json`](../n8n/ta_na_lista_fase1.json).
5. O fluxo aparece com ~20 caixinhas. Algumas vão mostrar um alerta de credencial: é normal, vamos resolver agora.

### 3.2 Credencial do Supabase (Postgres)
1. Dê **dois cliques** no nó **Carregar conversa**.
2. Em **Credential to connect with**, clique em **Create new credential**.
3. Preencha com os dados do passo 1.6:
   - **Host**, **Database** (`postgres`), **User**, **Password**, **Port** (`5432`)
   - **SSL**: `Require` (se der erro de certificado, ligue também **Ignore SSL Issues**)
4. No topo da janela, renomeie a credencial para **`Supabase Postgres (Tá na Lista)`**.
5. Clique em **Save**. Deve aparecer "Connection tested successfully".
6. Feche e repita **só a escolha** (sem criar de novo) nos outros 3 nós Postgres: **Consultar base oficial**, **Farmácias mais próximas** e **Salvar conversa**. Em cada um, abra e selecione `Supabase Postgres (Tá na Lista)` na lista.

### 3.3 Credencial do Claude
1. Dê dois cliques no nó **Claude: ler receita**.
2. Em **Credential for Header Auth**, clique em **Create new credential**.
3. Preencha:
   - **Name**: `x-api-key` (exatamente assim, é o nome do cabeçalho)
   - **Value**: sua chave `sk-ant-...`
4. Renomeie a credencial para **`Claude API (x-api-key)`** e clique em **Save**.
5. Abra o nó **Claude: redigir resposta do Zé** e selecione a mesma credencial.

### 3.4 Salvar e testar
1. Clique em **Save** (canto de cima, à direita).
2. Embaixo do canvas, clique em **Open chat** (ou no botão **Chat**).
3. Mande `oi` → o Zé pede consentimento → mande `SIM`.
4. Mande `losartana 50mg` → confira a leitura → mande `SIM` → mande `01310100`.
5. Para mandar foto: clique no **clipe** do chat, escolha a imagem e escreva qualquer texto (ex.: `receita`).
6. Siga os 20 casos de [`tests/casos_de_teste.md`](../tests/casos_de_teste.md).

### 3.5 Se algo der errado
- Aba **Executions** (no topo do fluxo): mostra cada execução e em qual nó parou. O nó com erro fica vermelho.
- **Erro de conexão no Postgres** (ex.: `ENETUNREACH`, `timeout`): confira se usou o **Session pooler** e o **User** com o código depois do ponto.
- **Zé responde "Ops, tive um probleminha"**: abra o nó **Claude: ler receita** na execução e veja a resposta:
  - `authentication_error` → chave errada ou sem crédito.
  - Erro falando de `fallbacks` → no arquivo `n8n/codigo/_comum.js`, troque `USAR_FALLBACK = true` por `false`, rode `node scripts/gerar_fluxo_n8n.mjs` e importe o fluxo de novo. Ou me peça que eu faço.
- **A foto não chega**: confira se o nó **Chat de teste (Fase 1)** está com **Allow File Uploads** ligado (Options).

### Sobre o "fallbacks"
As chamadas ao Claude usam `fallbacks: "default"`. Se o modelo principal recusar por engano um pedido (filtro de segurança), a própria API tenta de novo num modelo alternativo, sem você fazer nada. Para desligar, use `USAR_FALLBACK = false` (ver acima).

---

## Parte 4 — Farmácias da cidade piloto

O arquivo [`data/farmacias_exemplo.csv`](../data/farmacias_exemplo.csv) tem 5 farmácias **fictícias** em São Paulo, só para testar. Para o piloto:

1. Levante as farmácias credenciadas da cidade:
   - página do programa: <https://www.gov.br/saude/pt-br/assuntos/farmaciapopular> (procure a busca de farmácias credenciadas);
   - Portal de Dados Abertos: <https://dados.gov.br> (busque "Farmácia Popular");
   - ou a Secretaria Municipal de Saúde.
2. Para cada farmácia, pegue a **latitude e longitude**: no Google Maps, clique com o botão direito no local → clique nos números que aparecem (ficam copiados, ex.: `-23.5505, -46.6333`).
3. Preencha o CSV (pode abrir no Excel/Google Sheets e salvar como **CSV separado por vírgula**, com ponto decimal nas coordenadas).
4. Para levar ao banco, escolha um jeito:
   - **Pelo projeto**: rode `node scripts/gerar_seed.mjs` e cole o novo `db/seed.sql` no SQL Editor; ou
   - **Pelo Supabase**: **Table Editor** → tabela `farmacia` → apague as linhas de exemplo → **Insert** → **Import data from CSV**.

---

## Fase 2 — WhatsApp Cloud API (Meta)

> Faça só depois que a Fase 1 estiver funcionando bem no chat de teste.
> A ideia: **trocar apenas a entrada e a saída**. Todo o meio do fluxo continua igual.

### F2.1 Criar o app na Meta
1. Entre em <https://developers.facebook.com> com uma conta do Facebook → **My Apps** (Meus apps) → **Create App** (Criar app).
2. Escolha o caso de uso **WhatsApp** (ou "Outro" → tipo **Business**). Dê um nome, ex.: `Ta na Lista`.
3. Associe a um **Portfólio empresarial** (Business Manager). Se não tiver, a Meta cria um durante o processo.
4. No painel do app, vá em **WhatsApp** → **API Setup** (Configuração da API).

### F2.2 Número de teste
1. Na tela **API Setup**, a Meta já fornece um **número de teste** (gratuito).
2. Anote o **Phone number ID** e o **WhatsApp Business Account ID**.
3. Em **To** (Para), adicione o seu celular (e de até 4 testadores). Cada um recebe um código no WhatsApp para confirmar.
   - O número de teste só conversa com esses números cadastrados.

### F2.3 Token de acesso
1. A tela **API Setup** mostra um **token temporário** (vale 24 h). Serve para os primeiros testes.
2. Para um token que não expira:
   - **Configurações do negócio** (business.facebook.com/settings) → **Usuários** → **Usuários do sistema** → **Adicionar** (perfil Admin).
   - Clique em **Gerar novo token** → escolha o app → marque as permissões `whatsapp_business_messaging` e `whatsapp_business_management` → gere e **guarde**.
   - Em **Atribuir ativos**, dê ao usuário do sistema acesso ao app e à conta do WhatsApp.
3. Anote também o **App ID** e o **App Secret** (no painel do app → **Configurações** → **Básico**).

### F2.4 Credenciais no n8n
1. **WhatsApp OAuth API** (para o gatilho): Client ID = **App ID**, Client Secret = **App Secret**. Nome: `WhatsApp Trigger (Tá na Lista)`.
2. **Header Auth** (para baixar fotos e enviar respostas): Name = `Authorization`, Value = `Bearer SEU_TOKEN` (a palavra Bearer, um espaço e o token). Nome: `WhatsApp token (Bearer)`.
   - Em **Allowed HTTP Request Domains**, escolha **Specific Domains** e coloque `graph.facebook.com, lookaside.fbsbx.com` (o token só pode ir para a Meta).

### F2.5 Importar o fluxo do WhatsApp
O fluxo já vem pronto em [`n8n/ta_na_lista_whatsapp.json`](../n8n/ta_na_lista_whatsapp.json). É um fluxo **separado** do chat de teste: o "meio" é idêntico, só a entrada e a saída mudam.
1. No n8n: **Create Workflow** → **…** → **Import** → **From URL** →
   `https://raw.githubusercontent.com/thaisadeodato-k/ta-na-lista/main/n8n/ta_na_lista_whatsapp.json`
   (ou **From file**, escolhendo o arquivo no computador).
2. Abra os nós com alerta de credencial e selecione:
   - **WhatsApp Trigger** → `WhatsApp Trigger (Tá na Lista)`
   - **Meta: pegar URL da mídia**, **Meta: baixar mídia**, **Saída → WhatsApp** → `WhatsApp token (Bearer)`
   - nós do Postgres e do Claude → as mesmas credenciais da Fase 1.
3. Não precisa digitar o Phone number ID: o fluxo responde pelo mesmo número que recebeu a mensagem.

O que o fluxo faz na entrada:
- **WhatsApp: separar mensagem** pega quem mandou, o texto e o ID da foto. Avisos de "entregue/lido" são ignorados.
- **Tem mídia?** → se for foto, **Meta: pegar URL da mídia** e **Meta: baixar mídia** trazem a imagem (só na memória da execução).
- **Entrada → formato padrão** monta o formato padrão. Celulares do Brasil que chegam sem o 9 recebem o 9 de volta, para a resposta não ser recusada.

### F2.6 Saída
O nó **Saída → WhatsApp** envia a resposta pela Graph API (`/messages`). O telefone só existe na memória da execução; no banco ele é sempre hash.

### F2.7 Webhook e ativação
1. Salve o fluxo e clique em **Publish** (canto de cima). O WhatsApp Trigger registra o webhook na Meta automaticamente.
2. No painel da Meta → **WhatsApp** → **Configuration** (Configuração) → **Webhook**: confira se o campo **messages** está assinado (**Subscribe**).
3. Mande `oi` do seu celular para o número de teste. O Zé deve responder com o consentimento.

### F2.8 Cuidados na Fase 2
- **Janela de 24 h**: pelo WhatsApp, o bot só pode responder livremente até 24 h depois da última mensagem da pessoa. Mensagens iniciadas pelo bot (ex.: lembretes) exigem **templates aprovados** pela Meta.
- **Política de IA do WhatsApp**: o escopo já é fechado (só Farmácia Popular); mantenha assim.
- **Áudio**: a API do Claude não recebe áudio. Por enquanto o Zé pede foto ou texto. Para aceitar áudio, será preciso adicionar um serviço de transcrição antes do nó "Entrada → formato padrão".
- **Privacidade**: no consentimento, o Zé já explica que a foto é lida pelo Claude (Anthropic). Revise o texto com quem cuida da parte jurídica do projeto antes do piloto com o público.

---

## Como atualizar depois

| Quero mudar… | Faça |
|---|---|
| A lista oficial (nova versão do Ministério) | Edite `data/elenco_pfp.csv` → `node scripts/gerar_seed.mjs` → cole `db/seed.sql` no Supabase |
| Marcas ou sinônimos | Edite o CSV → mesmo caminho acima |
| Textos fixos do Zé | Edite `n8n/codigo/_comum.js` → `node scripts/gerar_fluxo_n8n.mjs` → importe o fluxo de novo |
| Prompts do Claude | Edite `prompts/*.md` → `node scripts/gerar_fluxo_n8n.mjs` → importe de novo |

> Ao importar o fluxo de novo, o n8n cria uma cópia: apague a antiga e selecione de novo as credenciais (elas continuam salvas).
