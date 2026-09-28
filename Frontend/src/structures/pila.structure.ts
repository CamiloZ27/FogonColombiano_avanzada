/**
 * Pila (Stack) — LIFO: Last In, First Out.
 * Se usa para registrar las operaciones recientes del sistema.
 */
export class Pila<T> {
  private items: T[] = [];

  /** Apila un elemento en la cima. */
  push(item: T): void {
    this.items.push(item);
  }

  /** Retira y devuelve el elemento en la cima. */
  pop(): T | undefined {
    return this.items.pop();
  }

  /** Devuelve el elemento en la cima sin retirarlo. */
  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Copia de los elementos con la cima primero (más reciente primero). */
  toArray(): T[] {
    return [...this.items].reverse();
  }
}
