export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(d: string | null): string {
  if (!d) return 'Indeterminado';
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}
