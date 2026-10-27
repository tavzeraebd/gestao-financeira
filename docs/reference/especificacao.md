# PROMPT MESTRE — DESENVOLVIMENTO DO NÚCLEO
Plataforma de gestão financeira familiar — especificação técnica e plano de execução multiagente.

> Transcrição fiel da especificação colada pelo usuário em 2026-10-23. O texto original foi
> **truncado no início da seção 15** ("Regras de execução para o Sonnet", item 2 em diante) —
> o restante não chegou. Mockup de referência: arquivo `mockups.png` (ver caminho no prompt).

---

## 1. PAPEL E MISSÃO

Arquiteto principal / líder técnico coordenando agentes especializados. Desenvolver uma aplicação
completa de gestão financeira familiar, com qualidade de produção, interface moderna, arquitetura
sustentável, segurança de dados e experiência consistente em desktop, tablet e celular.

**Não é protótipo visual.** Sistema funcional: autenticação, banco real, regras de negócio,
persistência, relatórios, testes automatizados e documentação. Seguir rigorosamente as referências
visuais, a identidade da marca, as tecnologias e as regras deste documento.

### 1.1 Objetivo do produto
Plataforma para a família organizar suas finanças num único ambiente colaborativo, simples para uso
diário por pessoas com diferentes níveis de conhecimento financeiro. Deve responder rápido e com
confiança:
- Quanto dinheiro temos disponível? Quanto ganhamos e quanto gastamos? Para onde o dinheiro vai?
- Quais contas ainda precisamos pagar? Quem é responsável por cada despesa?
- Quanto cada pessoa contribuiu? Quais são nossos objetivos? Estamos cumprindo o planejamento?
- Podemos fazer uma compra importante sem comprometer o orçamento?
- Como ficará nossa situação nos próximos meses? O que mudou desde o último mês?

### 1.2 Princípios fundamentais
1. Precisão financeira (valores, saldos e relatórios confiáveis).
2. Simplicidade (operações frequentes com poucos passos).
3. Transparência (todo cálculo/indicador com definição clara).
4. Colaboração (ambiente compartilhado, respeitando permissões).
5. Segurança (dados de uma família nunca acessíveis por outra sem autorização explícita).
6. Responsividade (nenhuma funcionalidade essencial só no desktop).
7. Consistência visual (design system centralizado).
8. Manutenibilidade (módulos com responsabilidades bem definidas).
9. Testabilidade (regras importantes cobertas por testes automatizados).
10. Entrega incremental (cada etapa funcional e validada antes de avançar).

Não inventar funcionalidades complexas sem avaliar valor. Base funcional e confiável antes de recursos avançados.

---

## 2. REFERÊNCIA VISUAL E IDENTIDADE

Direção visual aprovada = mockups do Núcleo (imagem `mockups.png`). Usar como referência de produto
e interface durante toda a implementação. **Não substituir o conceito visual por template
administrativo genérico.**

O mockup mostra: marca "Núcleo" (folha verde-limão), slogan "Sua família no controle do dinheiro.",
"Mais clareza hoje, mais liberdade amanhã."; roadmap em 4 fases (MVP; Organização e Insights;
Planejamento e Futuro; Experiência e Comunidade); e 10 telas: 1 Login/Cadastro (e-mail, senha,
Entrar, Criar conta, Google/Apple), 2 Dashboard (saudação "Olá, Ana!", saldo total com variação vs
mês anterior, receitas/despesas, donut de categorias, barras de fluxo de caixa mensal, próximos
vencimentos; sidebar com Início, Transações, Metas, Planejamento, Relatórios, Família,
Configurações), 3 Nova transação (abas Despesa/Receita, descrição, categoria, valor, data, forma de
pagamento, repetir transação, Salvar), 4 Metas (abas Ativas/Concluídas/Todas, cards com imagem,
valor atual/alvo, barra e %, prazo em meses, "+ Nova meta"), 5 Relatórios (7 dias/30 dias/3 meses/
12 meses, resumo do período, donut por categoria), 6 Divisão de contas (Todas/Penduradas/Pagas,
responsável, badges Pendente/Pago), 7 Planejamento de cenários (objetivo, valor, entrada, prazo,
resultado estimado de parcela e total com juros, insight), 8 Perfil da família (membros, papéis
Administrador/Convidar), 9 Notificações (Todas/Lembretes/Conquistas), 10 Mobile (visão compacta
com navegação inferior: Início, Transações, Metas, Mais).

### 2.1 Identidade visual
Nome: **Núcleo**. Proposta: "Sua família no controle do dinheiro."
Personalidade: moderna, organizada, acolhedora, minimalista, confiável, profissional sem parecer
corporativa demais, foco em clareza e tranquilidade financeira.
Cartões com cantos arredondados, hierarquia tipográfica clara, espaçamentos consistentes, gráficos
legíveis, ícones discretos e feedback visual em toda ação relevante.

### 2.2 Tema claro (padrão inicial)
Destaque: escala **Lime** do Tailwind, especialmente `lime-500` (`#84CC16`).
- Fundo principal: branco ou cinza muito claro. Superfícies: branco. Bordas: cinza claro.
- Texto principal: cinza muito escuro. Secundário: cinza médio.
- Ações principais: Lime 500. Hover/ativo: variações mais escuras ou claras do verde-limão.
- Fundos de destaque: Lime 50 ou Lime 100.
- Receitas/positivo: verde semântico. Despesas/erros: vermelho semântico. Avisos: amarelo ou laranja. Neutro: cinza.
Evitar Lime 500 como fundo de grandes áreas — usar em botões, indicadores, seleções, barras de
progresso, gráficos e destaques. Garantir contraste: quando Lime 500 não der contraste para texto
pequeno, usar tonalidade mais escura para o texto ou botão, mantendo Lime 500 como referência.

### 2.3 Tema escuro — paleta Rocket (preservar valores EXATAMENTE)
```js
module.exports = {
  theme: {
    extend: {
      colors: {
        rocket: {
          gray: {
            900: '#121214',
            800: '#202024',
            700: '#29292E',
            400: '#7C7C8A',
            300: '#C4C4CC',
            100: '#E1E1E6',
          },
          green: {
            base: '#00B37E',
            light: '#00F593',
          },
          red: '#F75A68',
          yellow: '#FBA94C',
        }
      }
    }
  }
}
```
Não substituir por azul escuro, índigo ou outra identidade. Uso:
- `rocket.gray.900` fundo principal; `rocket.gray.800` cartões e painéis; `rocket.gray.700` bordas e superfícies secundárias.
- `rocket.gray.100` textos de maior destaque; `rocket.gray.300` textos secundários; `rocket.gray.400` menor hierarquia (respeitando contraste).
- `rocket.green.base` ações e indicadores positivos; `rocket.green.light` destaques luminosos.
- `rocket.red` despesas, erros e alertas críticos; `rocket.yellow` avisos e atenção.

### 2.4 Arquitetura de temas
Tokens semânticos centralizados, mapeados para as paletas de cada tema. Exemplos conceituais:
`background`, `foreground`, `surface`, `surface-secondary`, `border`, `primary`,
`primary-foreground`, `success`, `danger`, `warning`, `muted`, `chart-income`, `chart-expense`.
Não espalhar hexadecimais pelos componentes. Alternância: claro, escuro e (se viável) preferência
do sistema. Escolha manual persiste entre sessões. Respeitar a versão do Tailwind: em v4, usar
variáveis de tema CSS, sem misturar configuração incompatível (v3 → config JS).

### 2.5 Layout desktop
Sidebar vertical com logotipo Núcleo e navegação; área principal; cabeçalho com saudação; seletor
de período quando aplicável; notificações; identificação do usuário; indicadores financeiros;
gráficos; listas de transações e vencimentos; cartões de metas e planejamento. Sidebar recolhível
em telas intermediárias. Conteúdo aproveita o espaço sem cartões excessivamente largos.

### 2.6 Layout mobile
Uma coluna; navegação inferior ou menu adaptado; ações financeiras principais acessíveis; sem
tabelas largas (converter em cartões/listas); formulários para toque; gráficos legíveis; modais
dentro da área útil; respeitar safe areas; não depender de hover; menus/filtros/seletores por toque.
Resultado: web app responsiva e instalável como PWA (se viável sem comprometer segurança/consistência).

---

## 3. STACK TECNOLÓGICA
Inspecionar o repositório antes de instalar; não atualizar indiscriminadamente. Projeto vazio → stack abaixo.

### 3.1 Frontend
Next.js (App Router), React, TypeScript **estrito**, Tailwind CSS, shadcn/ui (quando compatível),
Lucide React, Recharts, React Hook Form, Zod, date-fns, TanStack Table só se houver necessidade
real. Versões estáveis e compatíveis, documentar as instaladas. Sem `any` indiscriminado; não
desativar verificações de TS para ocultar erro.

### 3.2 Backend e persistência
Supabase Auth; PostgreSQL; Supabase RLS para autorização no banco; Supabase Storage só se houver
necessidade real (ex.: comprovantes); Server Functions / Route Handlers para operações que exigem
validação no servidor; Supabase CLI para migrações e desenvolvimento reproduzível.
Separar validação de entrada, regras de negócio, autorização e persistência. Não concentrar regras
financeiras em componentes React.

### 3.3 Testes
Vitest (unitários), React Testing Library (componentes), Playwright (E2E), testes SQL para RLS
(ferramenta compatível com Supabase, ex.: pgTAP), ESLint e TypeScript para verificações estáticas.

### 3.4 Ferramentas complementares
pnpm (salvo incompatibilidade), ESLint, Prettier (se adotado), Git, `.env.example`, CI com GitHub
Actions se o repositório estiver no GitHub e a infraestrutura permitir.

### 3.5 Restrições arquiteturais — NÃO utilizar
- Dados financeiros só em `localStorage`.
- Valores monetários em ponto flutuante sem estratégia de precisão.
- Segredos de backend no bundle do navegador; chaves administrativas do Supabase no frontend.
- Autorização baseada apenas em esconder botões.
- Dados fictícios como substitutos permanentes do backend.
- Consultas SQL espalhadas pelos componentes.
- Microserviços sem justificativa concreta.
- Um único arquivo gigante.
Preferir **monólito modular**.

---

## 4. ARQUITETURA DE SOFTWARE
Organizar por módulos de domínio. Estrutura sugerida (referência, não criar pastas vazias):
```text
src/
├── app/
│   ├── (public)/ login/ cadastro/ recuperar-senha/
│   ├── (app)/ layout.tsx inicio/ transacoes/ contas/ categorias/ orcamentos/ metas/
│   │          planejamento/ relatorios/ familia/ notificacoes/ configuracoes/
│   └── api/
├── components/ ui/ layout/ charts/ shared/
├── modules/ auth/ family/ transactions/ accounts/ categories/ budgets/ goals/ planning/ reports/ notifications/
├── lib/ supabase/ money/ dates/ validation/ utils/
├── server/ services/ repositories/ authorization/
├── hooks/ types/ styles/
```

### 4.1 Camadas
- **Apresentação**: páginas, componentes, formulários e estados visuais.
- **Aplicação**: orquestra casos de uso (criar transação, pagar conta, concluir meta).
- **Domínio**: regras financeiras, invariantes, cálculos, estados válidos, políticas de negócio.
- **Infraestrutura**: Supabase, PostgreSQL, consultas, integrações, persistência.
- **Autorização**: identidade, participação familiar, papel e permissão específica.
Mudança visual não pode alterar inadvertidamente uma regra financeira.

### 4.2 Convenções
Componentes pequenos e de responsabilidade única; Server Components por padrão, Client Components
só com interatividade; não expor dados privados em props, logs ou respostas; tipos explícitos de
domínio; validações centralizadas; formatação monetária e de datas centralizada; transações SQL
quando várias alterações precisam ser atômicas; índices para consultas frequentes; paginação em
listas extensas; **ADRs** para decisões relevantes.

---

## 5. MODELO DE DOMÍNIO E BANCO DE DADOS
Projetar o banco antes dos módulos dependentes. Migrations versionadas e reproduzíveis; nada manual
no painel sem documentação. Esquema conceitual — o agente de banco refina, documenta e produz o
modelo relacional final antes de concluir a fundação.

### 5.1 Entidades (campos conceituais)
- **Profiles**: id (ligado ao usuário do Supabase Auth), display_name, avatar_url, created_at, updated_at.
- **Families**: id, name, created_by, base_currency (inicial BRL), created_at, updated_at.
- **Family Members**: id, family_id, user_id, role (`owner`|`admin`|`member`), status, joined_at.
  Papel e status validados no banco. Convites com token imprevisível, expiração e uso controlado.
- **Accounts**: id, family_id, name, type, opening_balance, institution_name?, credit_limit?,
  is_active, created_at, updated_at. Tipos: conta corrente, poupança, dinheiro, cartão de crédito,
  carteira digital, outros justificados. Refinar cartões: limite, compras, faturas e pagamento de fatura.
- **Categories**: id, family_id? (nulo = global), name, type, color, icon, parent_id?, is_default,
  created_at. Categorias personalizadas e subcategorias, sem comprometer o MVP.
- **Transactions**: id, family_id, account_id, category_id, created_by, assigned_member_id?, type
  (`income`|`expense`|`transfer`), description, amount, transaction_date, status, notes?,
  created_at, updated_at. Transferência entre contas da mesma família movimenta as duas de forma
  consistente, sem contar como receita/despesa consolidada. Despesa compartilhada identifica o
  responsável e, futuramente, distribui entre membros.
- **Recurrences**: id, family_id, account_id, category_id, type, description, amount, frequency,
  start_date, end_date?, next_occurrence_date, is_active, created_by. Dashboard não pode depender de
  job agendado para estar correto; definir como ocorrências futuras são representadas e como falhas
  de processamento são recuperadas.
- **Budgets**: id, family_id, category_id?, name, amount_limit, period_type, start_date, end_date,
  created_by. Comparar previsto x realizado.
- **Goals**: id, family_id, name, description?, target_amount, current_amount (quando aplicável),
  target_date?, status, created_by, created_at, updated_at. Uma única fonte de verdade para o
  progresso; aportes/retiradas por movimentações auditáveis.
- **Goal Contributions**: id, goal_id, family_id, member_id, amount, contribution_date,
  transaction_id?, created_at. Não contar o mesmo aporte como duas despesas ou despesa+receita.
- **Notifications**: id, family_id, user_id, type, title, message, read_at?, created_at,
  related_entity_type?, related_entity_id?.
- **Audit Events**: id, family_id, actor_user_id, entity_type, entity_id, action, metadata,
  created_at. Sem senhas, tokens ou dados pessoais desnecessários. Definir quais eventos exigem
  auditoria (permissões, exclusões, mudanças relevantes em lançamentos).

### 5.2 Regras de modelagem
UUIDs; `timestamptz` para instantes; `date` para datas financeiras de dia civil; `numeric` com
precisão definida para dinheiro; validar valores positivos e tipos permitidos; FKs; regras de
exclusão explícitas; created_at/updated_at; índices em family_id, datas e relacionamentos
frequentes; restrições únicas contra vínculos duplicados e operações repetidas; evitar cascata em
históricos financeiros; arquivamento/exclusão lógica quando preciso preservar histórico; documentar
decisões que afetam saldos, transferências, cartões e recorrências.

### 5.3 Precisão financeira
`numeric` no Postgres; centavos inteiros ou biblioteca decimal no domínio; conversão explícita
entre entrada, domínio e persistência; arredondamento documentado; formatação com
`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`. Entrada brasileira aceita
`1.234,56`, sem confundir separadores.

---

## 6. SEGURANÇA E ISOLAMENTO FAMILIAR (crítico)
Cada família é ambiente isolado. Ter `family_id` na requisição não significa autorização.

### 6.1 RLS
RLS em **todas** as tabelas acessíveis pelos papéis da API, com políticas explícitas para select,
insert, update e delete, verificando participação válida e nível de permissão. Não confiar em
filtros do frontend. Revisar também grants, funções privilegiadas (SECURITY DEFINER), views e
demais caminhos de acesso.

### 6.2 Autorização por papel
Exemplo inicial: `owner` administra a família e configurações; `admin` gerencia operações
autorizadas; `member` consulta e realiza operações conforme regras. Matriz final aprovada antes de
implementar permissões específicas. Usuário comum não altera o próprio papel. Mudança de papel só
por operação controlada no servidor e protegida por restrição no banco.

### 6.3 Autenticação
Cadastro e-mail/senha, login, logout, recuperação de senha, verificação de sessão, proteção de
rotas privadas, sessão expirada, estados de carregamento, mensagens de erro seguras, confirmação de
e-mail quando configurada. OAuth Google/Apple depois, com credenciais reais. **Nunca simular autenticação.**

### 6.4 Segredos
`.env.example` sem valores; separar públicas e privadas; service role só no servidor e restrita;
não logar tokens nem conteúdo financeiro sensível.

### 6.5 Testes de segurança (obrigatórios — etapa não conclui sem acesso permitido E negado)
1. Autenticado acessa dados da própria família.
2. Sem vínculo não acessa dados de outra família.
3. Não cria lançamentos em família alheia.
4. Não altera permissões sem autorização.
5. Não manipula identificadores para contornar políticas.
6. Não acessa arquivos privados sem autorização.
7. Operação não autorizada falha sem alterações parciais.

---

## 7. FUNCIONALIDADES (por etapas, não todas ao mesmo tempo)

### 7.1 Autenticação e onboarding
Telas: login, cadastro, recuperação de senha, configuração inicial, criação da família, convite.
Fluxo: cria conta → confirma e-mail se necessário → acessa → cria família ou aceita convite →
informações básicas → primeira conta financeira → saldo inicial → dashboard → orientação contextual
para registrar receitas e despesas. Simples, retomável depois.

### 7.2 Dashboard (visualmente próximo ao mockup)
Saldo consolidado; receitas, despesas e resultado líquido do período; variação vs período
anterior; despesas por categoria; fluxo de caixa mensal; próximos vencimentos; últimas transações;
progresso das metas; atividade recente da família. Filtros: mês atual, mês anterior, intervalo
personalizado. Cada indicador com definição de cálculo documentada. Sem números fictícios; sem
dados → estado vazio útil.

### 7.3 Receitas e despesas
Criar receita/despesa, editar, detalhes, excluir ou estornar conforme regra, pesquisar por
descrição, filtrar (data, categoria, conta, responsável, tipo), ordenar e paginar, observações,
identificar recorrentes, histórico de alterações relevantes. Formulário: tipo, descrição, valor,
categoria, conta, data, responsável, observações, recorrência. Estados de carregamento, sucesso,
falha e validação. Prevenir submissão duplicada; falha de rede não perde dados digitados.

### 7.4 Contas financeiras
Criar, editar, ativar/arquivar, saldo inicial, saldo atual, movimentações, transferir entre
contas, tipo. Uma única fonte de verdade para saldo (calculado por movimentações ou projeção
derivada). Transferências atômicas.

### 7.5 Categorias
Despesa: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Assinaturas, Contas domésticas,
Compras, Outros. Receita: Salário, Renda extra, Freelance, Rendimentos, Reembolsos (conforme
política), Outros. Personalização; não excluir categoria com histórico sem estratégia explícita.

### 7.6 Contas a pagar e receber
Vencimento, valor previsto, categoria, responsável, status (pendente, pago/recebido, vencido,
cancelado), data de pagamento, lembretes, histórico. Não marcar como pago porque venceu. Relação
compromisso ↔ transação sem dupla contabilização.

### 7.7 Recorrências
Mensal, semanal e outras com valor real. Regras: próxima ocorrência, encerramento, alterar uma
ocorrência, alterar a série, pausar/reativar, prevenir duplicidade, recuperar após falha. Não
prometer processamento automático sem mecanismo real de execução e recuperação.

### 7.8 Orçamentos
Planejado, realizado, saldo disponível, % consumido, indicadores de atenção, comparação com
períodos anteriores. Definir o que entra no cálculo (estornos, transferências).

### 7.9 Metas
Nome, objetivo, acumulado, restante, %, data-alvo, histórico de aportes, status. Criar, editar,
pausar, concluir. Estimativas de conclusão mostram a premissa, não são certezas.

### 7.10 Divisão de contas
Responsável pelo pagamento; associar a integrantes; divisão igual ou por valor; quanto cabe a cada
um; pendentes; liquidações (se implementado). Diferenciar: (1) despesa familiar original,
(2) distribuição de responsabilidade, (3) liquidação entre membros. Divisão interna não duplica a
despesa no consolidado. Regra de arredondamento: soma das parcelas = valor original exato.

### 7.11 Relatórios
Receitas x despesas, fluxo de caixa, por categoria, por conta, por integrante, evolução mensal,
comparação de períodos, orçado x realizado, progresso das metas. Recharts. Todo gráfico com
título, período, legenda quando necessária, formatação monetária, estado sem dados, responsivo,
acessível sem depender só de cor. **Mesmos serviços de cálculo do dashboard.**

### 7.12 Planejamento e cenários (após estabilizar o básico)
Simular compra de carro, viagem, prazo de meta, novo compromisso mensal, redução de despesas,
saldo futuro. Premissas e resultados transparentes; diferenciar conhecido, informado e estimado;
não é aconselhamento financeiro garantido.

### 7.13 Família e membros
Ver integrantes, convidar, aceitar/recusar, papel, alterar permissões (quando autorizado), remover
conforme regras, atividade. Definir o destino de transações/metas/registros de quem sai.

### 7.14 Notificações
Central interna: vencimento próximo, conta vencida, meta perto de ser alcançada, orçamento perto do
limite, novo integrante, convite recebido, evento financeiro relevante. Marcar como lida e navegar
ao recurso. E-mail/push só depois, com infraestrutura real, consentimento e preferências.

---

## 8. DEFINIÇÕES FINANCEIRAS OBRIGATÓRIAS (documentar antes de dashboards/relatórios)
Saldo consolidado; participação do saldo inicial; agregação de receitas e despesas; exclusão de
transferências do resultado consolidado; representação de estornos; despesa paga x pendente;
contas a pagar ↔ transações; compras e pagamento de fatura de cartão; aportes/retiradas de metas e
saldos; despesas compartilhadas nos relatórios; qual data determina o período de cada lançamento;
meses com quantidades diferentes de dias nas recorrências. Testes de domínio para cada regra.
Nada de fórmulas isoladas em componentes.

---

## 9. EXPERIÊNCIA DE USUÁRIO
- **Navegação**: Início, Transações, Contas, Orçamentos, Metas, Planejamento, Relatórios, Família,
  Notificações, Configurações. Sidebar no desktop; compacta no mobile com itens menos frequentes em menu secundário.
- **Feedback**: carregamento, sucesso, erro, validação, confirmação de exclusão, sem resultados,
  sem dados, falha de conexão, sessão expirada. Sem alertas nativos do navegador.
- **Acessibilidade**: HTML semântico, teclado, foco visível, labels associados, erros acessíveis,
  contraste, estados acessíveis, alternativas textuais para gráficos, `prefers-reduced-motion`.
- **Estados vazios**: explicam a situação e oferecem ação clara.

---

## 10. ARQUITETURA MULTIAGENTE
Contratos explícitos; agentes não alteram indiscriminadamente os mesmos arquivos; orquestrador
distribui, resolve conflitos, revisa e integra.
1. **Orquestrador/Tech Lead**: plano, mapa de dependências, ADRs, critérios de aceite, relatórios por etapa.
2. **UX/UI e Design System**: tokens, tema claro/escuro, componentes base, padrões responsivos,
   documentação visual. Não cria regra financeira nem muda modelo de dados.
3. **Banco e segurança**: entidades, migrations, restrições, índices, RLS, permissões, testes de isolamento.
4. **Backend e domínio financeiro**: regras, serviços, casos de uso, operações atômicas, cálculos
   monetários, validações, consultas/relatórios, testes; documentação das fórmulas.
5. **Frontend e navegação**: layouts, páginas, formulários, navegação desktop/mobile, integração
   com serviços reais, estados, responsividade, testes de componentes.
6. **QA**: estratégia, validação financeira, integração, auth, permissões, responsividade, regressões.
7. **DevOps e documentação**: scripts, ambientes, CI, `.env.example`, README, setup local, deploy.
Protocolo: contratos versionados (entidades, tipos de entrada/saída, autorização,
responsabilidades, dependências, critérios de aceite, arquivos que pode alterar). Conclusão =
integração + testes + revisão, não "gerou código".

---

## 11. ROADMAP DE IMPLEMENTAÇÃO
- **ETAPA 0 — Descoberta e planejamento.** Inspecionar repo, tecnologias, scripts, Supabase e
  credenciais, referências visuais; arquitetura inicial; modelo conceitual; contratos; backlog
  priorizado; critérios de aceite. Entregáveis: `docs/architecture.md`, `docs/roadmap.md`,
  `docs/data-model.md`, `docs/permissions.md`, `docs/acceptance-criteria.md`, ADRs.
  Saída: orquestrador aprova a arquitetura e identifica bloqueadores.
- **ETAPA 1 — Fundação técnica e design system.** Next.js+TS, Tailwind, lint/format, tokens,
  temas claro/escuro, componentes base, layout responsivo, Supabase, validação, scripts de
  execução e teste, variáveis de ambiente, página inicial de autenticação.
  Saída: compila, executa, aplica os temas, layout responsivo validado.
- **ETAPA 2 — Banco, autenticação e autorização.** Migrations iniciais; profiles; families;
  family members; autenticação; autorização; RLS; testes de acesso permitido e negado; criação da
  primeira família; onboarding básico. Saída: usuário cria conta e família; testes comprovam isolamento.
- **ETAPA 3 — Contas, categorias e transações** (receitas, despesas, transferências, edição e
  cancelamento seguro, filtros, paginação, histórico, testes). Saída: movimentações persistidas com integridade.
- **ETAPA 4 — Dashboard** (saldo consolidado, indicadores, comparação mensal, gráficos, últimas
  movimentações, estados vazios, vencimentos). Saída: indicadores = dados reais e testes de cálculo.
- **ETAPA 5 — Contas a pagar, recorrências e orçamentos** (mecanismo confiável, sem duplicidade,
  testes de datas). 
- **ETAPA 6 — Metas, divisão de contas e planejamento** (sem dupla contabilização).
- **ETAPA 7 — Relatórios, notificações e família** (convites, membros, permissões, auditoria).
- **ETAPA 8 — PWA, acessibilidade e responsividade.**
- **ETAPA 9 — Hardening, homologação e entrega** (todas as suítes, build, deps, envs, logs,
  a11y, desempenho, deploy, checklist).

---

## 12. CRITÉRIOS DE ACEITE FUNCIONAIS (ponta a ponta)
- **A — Primeiro acesso**: cria conta; auth funciona; cria família; cadastra conta; saldo inicial; acessa dashboard.
- **B — Despesa**: registra; valida valor; persiste; saldo atualizado/recalculado; aparece na
  listagem; dashboard e relatório por categoria refletem.
- **C — Receitas e despesas**: totais corretos; comparação com intervalos definidos; transferência
  não é receita/despesa consolidada.
- **D — Edição e exclusão**: valores antigos deixam de afetar, novos passam a afetar, consistente, histórico preservado.
- **E — Colaboração**: integrante autorizado consulta; sem vínculo não acessa; verificado no servidor e no banco.
- **F — Responsividade**: login, dashboard, formulário por toque, listagem adaptada, metas e
  relatórios utilizáveis no celular; sem rolagem horizontal indevida.
- **G — Temas**: claro com Lime; escuro com Rocket; troca não altera dados; persiste após reload; contraste adequado.

---

## 13. ESTRATÉGIA DE TESTES (acompanha o desenvolvimento)
- **Unitários**: parsing/formatação monetária, saldos, receitas/despesas, comparação de períodos,
  recorrência, orçamento, metas, divisão, autorização, validação de formulários.
- **Integração**: persistência, relacionamentos, integridade referencial, atomicidade,
  consistência após edição e estorno, isolamento familiar, recorrência, relatórios.
- **E2E (Playwright)**: cadastro/login, onboarding, conta, receita, despesa, edição, dashboard,
  meta, membros, responsividade, tema.
- **Regressão financeira** com valores conhecidos — ex.: saldo inicial R$ 1.000,00; receita
  R$ 500,00; despesa R$ 200,00; transferência interna R$ 100,00 → consolidado reflete saldo
  inicial + receita − despesa, sem alteração pela transferência. Casos adicionais: estornos,
  divisões, arredondamentos, períodos mensais.

---

## 14. DESEMPENHO, OBSERVABILIDADE E OPERAÇÃO
- **Desempenho**: sem consultas repetidas; índices; paginação; não carregar todas as transações
  para totais; agregação no banco; cache só com invalidação explícita e nunca compartilhado entre
  famílias; gráficos pesados só onde precisa.
- **Observabilidade**: erros consistentes; registrar request id, operação, módulo, código de erro,
  contexto técnico não sensível; nunca senhas, tokens ou dados financeiros completos. Mensagem
  técnica útil para o time, mensagem ao usuário clara e segura.
- **Backup e recuperação**: documentar estratégia, procedimento, migrations, ambientes
  (dev/homolog/prod), validação pós-deploy. Não afirmar backup configurado sem verificar.

---

## 15. REGRAS DE EXECUÇÃO (TRUNCADO NO ORIGINAL)
1. Leia integralmente este documento antes de implementar.
2. Inspecione o repositório an… **[o restante da especificação não foi recebido]**
