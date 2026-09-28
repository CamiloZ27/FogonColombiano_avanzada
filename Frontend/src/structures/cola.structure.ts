/**
 * Cola (Queue) — FIFO: First In, First Out.
 * Se usa para atender clientes en el orden en que llegan.
 */
export class Cola<T> {
  private items: T[] = [];

  /** Agrega un elemento al final de la cola. */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /** Retira y devuelve el elemento más antiguo de la cola. */
  dequeue(): T | undefined {
    return this.items.shift();
  }

  /** Devuelve el siguiente elemento sin retirarlo. */
  peek(): T | undefined {
    return this.items[0];
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Copia de los elementos en orden de atención (el primero es el siguiente). */
  toArray(): T[] {
    return [...this.items];
  }
}
