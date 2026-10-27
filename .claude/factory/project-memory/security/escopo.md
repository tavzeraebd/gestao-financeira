# Escopo do teste de segurança autorizado

Regras de engajamento do `factory-pentest`. Política: `~/.claude/factory/policies/pentest.md`.

**Sem este arquivo preenchido e aprovado pelo usuário, o `factory-pentest` não executa nada.**

```
Alvos permitidos:   <endereços de local/staging — ex.: http://localhost:3000>
Ambiente:           local | staging        (produção: NÃO, salvo autorização por execução)
Contas de teste:    <usuário/papel de teste — descrição, sem credencial neste arquivo>
Método:             gray box (padrão) | black box | white box
Proibido:           <além da política: caminhos, ações ou dados que não podem ser tocados>
Aprovado por:       <usuário>
Data:               <AAAA-MM-DD>
```

## Lembretes fixos (valem sempre, mesmo que não repetidos acima)

- Só alvos desta lista. Produção só com autorização explícita na própria execução.
- Só contas e dados de teste. Dado de prova é sintético.
- Sem teste de carga, sem negação de serviço, sem derrubar o serviço, sem destruir dado.
- Sistemas de terceiros (ERP, banco, API externa) estão fora do escopo, sempre.
- Nada sai do ambiente de teste.
