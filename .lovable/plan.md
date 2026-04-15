

## Plano: Remover limite de 1.000 clientes

### Problema
A query de clientes na página `/lists` (linha 71-83 de `Lists.tsx`) busca todos os clientes sem paginação. O Supabase retorna no máximo 1.000 registros por padrão, por isso o "Total de contatos" trava em 1.000. O banco já tem 3.121 clientes — não há limite no banco, apenas nas queries do frontend.

### O que será feito

**1. `src/pages/Lists.tsx` — Usar contagem real do banco**
- Substituir a query `customers` (que busca todos os registros só para exibir `customers.length`) por uma query com `count: 'exact'` e `head: true` — retorna apenas o número total sem transferir dados
- Isso suporta até centenas de milhares de registros sem impacto de performance
- Manter a query completa de clientes apenas quando o dialog de adicionar membros estiver aberto (lazy loading)

**2. `src/pages/Lists.tsx` — Paginar a query de clientes para o dialog de adicionar membros**
- Quando o dialog `addMembersOpen` abrir, buscar clientes com paginação (batches de 1.000 usando `.range()`) ou buscar sob demanda com search server-side

**3. `src/pages/Customers.tsx` — Leads sem limite**  
- A query de leads (linha 70-82) também não pagina. Aplicar a mesma lógica de `fetchAllRows` com `.range()` para garantir que leads acima de 1.000 sejam carregados.

### Detalhes técnicos

```text
Lists.tsx (contagem total):
  ANTES:  .select("id, name, email, phone") → customers.length
  DEPOIS: .select("*", { count: "exact", head: true }) → count

Lists.tsx (dialog de membros):
  Busca lazy com .range(0, 999), .range(1000, 1999), etc.
  Ou search server-side com .ilike("name", `%${search}%`)

Customers.tsx (leads):
  Mesma paginação server-side já usada para customers (PAGE_SIZE = 50)
```

### Resultado
- Total de contatos exibirá o número real (3.121+, até 50.000+)
- Zero impacto de performance — sem transferir 50k registros ao frontend
- Dialog de adicionar membros funciona com busca server-side

