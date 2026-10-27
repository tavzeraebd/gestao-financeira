# ADR-0029 — Notificações internas geradas sob demanda, idempotentes, por usuário, sem e-mail nem push

Status: aceita (2026-10-24, Etapa 7) · Escopo: `notifications`, `refresh_notifications`, `/notificacoes` · Refina `data-model.md` §5.9 e a ADR-0011 (mesmo padrão de geração)

**Contexto.** A spec §7.14 pede uma central interna (vencimento próximo, conta vencida, meta perto de ser alcançada, orçamento perto do limite, novo integrante, convite recebido, evento financeiro relevante), marcar como lida e navegar ao recurso; e-mail e push só com infraestrutura real e consentimento. Não há job (ADR-0011). Convites são compartilhados por link e o token não é recuperável (ADR-0007).

**Decisão.**
1. Tabela `notifications` por **usuário** (`user_id`) e família. Leitura e "marcar como lida" só pelo próprio usuário com vínculo ativo na família. Ninguém insere nem apaga pela API.
2. Geração **sob demanda** pela RPC `refresh_notifications()` (`security definer`, **sem parâmetros**), chamada pelo backend ao ler a central e o contador (`ensureNotificationsRefreshed`, uma vez por requisição, falha silenciosa e registrada). Ela gera só para o chamador, só na família dele, com `unique (user_id, dedupe_key)` + `on conflict do nothing`. Teto de 100 inserções por chamada.
3. A notificação guarda `type`, a entidade e um `data` pequeno (instantâneo dos números). O texto pt-BR e o link são montados no app (`notifications/domain`), a partir de `type` e da entidade, por uma lista fechada de rotas internas. Nada de URL gravada.
4. Limpeza na mesma RPC: notificação de compromisso que deixou de estar pendente é removida; notificação com mais de 90 dias é removida.
5. **"Convite recebido" não é gerado no MVP**: quem recebe um convite não tem vínculo na família que convida (a notificação não teria família nem RLS), e o token não pode ser reapresentado. O convite chega pelo link. Fica para quando houver e-mail (Etapa 9). "Novo integrante" cobre o lado de quem convidou.
6. Fora: e-mail, push, preferências de notificação.

**Alternativas.** Job (`pg_cron`) gerando para todos: contra a ADR-0011 e sem garantia no ambiente local. Gerar em triggers de cada tabela: espalha a regra por muitos triggers e não cobre "vence em 3 dias", que depende do dia. Texto montado no SQL: formatação de moeda e data pt-BR duplicada fora de `lib/money`/`lib/dates`.

**Consequências.** A central só fica atualizada quando o usuário usa o app (é uma central interna, não um alerta). Uma notificação é um instantâneo: ao abrir, o recurso mostra o estado atual.
