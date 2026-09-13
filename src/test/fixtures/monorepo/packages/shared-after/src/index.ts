export function greet(name: string, title: string): string {
  return `hello ${title} ${name}`;
}

export function add(a: number, b: number): number {
  return a + b;
}

export type Helper = { id: number };
