export class Cooldown {
  remaining = 0;

  constructor(public duration: number) {}

  get ready(): boolean {
    return this.remaining <= 0;
  }

  /** 剩餘比例，1 = 剛觸發，0 = 可使用 */
  get progress(): number {
    return this.duration > 0 ? Math.max(0, this.remaining / this.duration) : 0;
  }

  trigger(duration = this.duration) {
    this.remaining = duration;
  }

  tick(dt: number) {
    if (this.remaining > 0) this.remaining = Math.max(0, this.remaining - dt);
  }
}
