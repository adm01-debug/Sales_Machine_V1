/**
 * Porta mínima de acesso a tabelas, por duck typing.
 *
 * Aceita tanto o SupabaseClient real quanto os fakes dos testes unitários,
 * sem acoplar os serviços ao tipo gerado do banco. O retorno de `from` é o
 * builder fluente (`select/eq/order/range/...`), que não tem um tipo
 * estrutural simples; cada chamador valida/mapeia as linhas que lê.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder fluente do Supabase; ver comentário acima
export type TableQuery = any;

export interface TableClient {
  from: (table: string) => TableQuery;
}
