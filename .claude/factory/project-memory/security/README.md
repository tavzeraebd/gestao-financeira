# Segurança deste projeto

Arquivos de segurança **locais ao projeto** (v1.3.0, proposta 0007). Não duplicam a fábrica global.

| Arquivo | Para quê | Quem usa |
|---|---|---|
| `achados.md` | Tabela de achados de segurança. Alto ou crítico com status `aberto` **bloqueia** o gate. | `security/gate.mjs`, `factory-security`, `factory-pentest` |
| `escopo.md` | Regras de engajamento do teste autorizado: alvos, ambiente, contas de teste, proibições. **Sem este arquivo, não há pentest.** | `factory-pentest` |
| `threat-model.md` | Threat model completo, quando a tarefa foi `structural`. | `factory-architect`, `factory-security`, `factory-qa` |

O gate também grava aqui `.gate-pass.json` (resultado + HEAD + data do último gate). É **estado local
da máquina**, lido pelo hook de publicação (proposta 0008): adicione `.gate-pass.json` ao `.gitignore`
do projeto — não versione.

## Regras

- Estes arquivos são **do projeto**, não da fábrica global. Não vão para `~/.claude/agent-memory/`.
- **Nunca** guardar segredo, credencial ou dado pessoal real aqui. Evidência é sempre sanitizada.
- Exceções do gate ficam em `.gitleaksignore` / `.trivyignore` na raiz do projeto, não aqui.
- O `escopo.md` é aprovado pelo usuário. Agente não cria nem amplia escopo por conta própria.
- `.gate-pass.json` é gerado pelo gate e não é versionado (vai no `.gitignore`).
