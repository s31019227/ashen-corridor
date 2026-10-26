import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/game';
import { PLAYER_CONFIG } from '../config/player';
import { THEME } from '../config/theme';
import { calcDamage } from '../core/damage';
import { edgeDist } from '../core/geometry';
import { selectTarget } from '../core/targeting';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { session } from '../state/session';
import { floatText } from '../ui/text';

/**
 * 玩家普攻：選目標、自動攻擊、手動攻擊、投射物。
 * 選目標規則在 core/targeting.ts。
 */
export class CombatSystem {
  private projectiles: Projectile[] = [];

  constructor(
    private scene: Phaser.Scene,
    private player: Player,
    private getEnemies: () => Enemy[],
    private onEnemyKilled: (enemy: Enemy) => void,
  ) {}

  private findEnemy(id: number | null) {
    return id === null ? undefined : this.getEnemies().find((e) => e.id === id);
  }

  /** 根據目前狀態選出普攻目標（不攻擊） */
  private refreshTarget() {
    const p = this.player;
    const result = selectTarget({
      attacker: p,
      range: p.attackRange,
      style: p.classDef.attackStyle,
      enemies: this.getEnemies(),
      lockedId: p.lockedId,
      previousId: p.lastAttackedId,
    });
    if (result.clearLock) p.lockedId = null;
    p.targetId = result.targetId;
  }

  /** 普攻只有兩種模式：自動普攻，或完全不普攻（由攻擊鍵切換） */
  update(dt: number) {
    this.refreshTarget();
    if (session.settings.autoAttack) this.tryAttack();
    this.updateProjectiles(dt);
  }

  lock(enemyId: number) {
    this.player.lockedId = enemyId;
  }

  unlock() {
    this.player.lockedId = null;
  }

  private tryAttack() {
    const p = this.player;
    const target = this.findEnemy(p.targetId);
    if (!target || !target.alive || !p.attackCd.ready) return;
    p.attackCd.trigger(p.attackInterval);
    p.lastAttackedId = target.id;
    p.face({ x: target.x - p.x, y: target.y - p.y });

    const def = p.classDef;
    const useMelee =
      def.attackStyle === 'melee' ||
      (def.attackStyle === 'hybrid' && edgeDist(p, p.radius, target, target.radius) <= (def.meleeRange ?? 0));
    const mult = useMelee ? (def.meleeDamageMult ?? 1) : (def.rangedDamageMult ?? 1);
    const crit = Math.random() * 100 < p.stats.critChance;
    let damage = calcDamage(p.stats.atk * mult, target.def.def);
    if (crit) damage = Math.round(damage * PLAYER_CONFIG.critMultiplier);

    if (useMelee) {
      this.drawSlash(target);
      this.hit(target, damage, def.attackKnockback, crit);
    } else {
      const proj = new Projectile(
        this.scene,
        p.x,
        p.y,
        target.id,
        damage,
        def.attackKnockback,
        crit,
        GAME_CONFIG.combat.projectileSpeed,
        def.color,
      );
      this.projectiles.push(proj);
    }
  }

  private hit(enemy: Enemy, damage: number, knockback: number, crit: boolean) {
    if (!enemy.alive) return;
    enemy.takeDamage(damage);
    enemy.knockback(this.player, knockback);
    const y = enemy.y - enemy.radius - 12;
    if (crit) floatText(this.scene, enemy.x, y, `${damage}!`, THEME.textGold, 22);
    else floatText(this.scene, enemy.x, y, `${damage}`, THEME.text, 16);
    if (!enemy.alive) {
      if (this.player.lockedId === enemy.id) this.player.lockedId = null;
      this.onEnemyKilled(enemy);
    }
  }

  private updateProjectiles(dt: number) {
    for (const proj of this.projectiles) {
      const target = this.findEnemy(proj.targetId);
      if (!target || !target.alive) {
        proj.destroy();
        continue;
      }
      if (proj.step(target, dt)) {
        this.hit(target, proj.damage, proj.knockback, proj.crit);
        proj.destroy();
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  private drawSlash(target: Enemy) {
    const p = this.player;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    const g = this.scene.add.graphics().setDepth(9);
    g.lineStyle(4, 0xe8e0c8, 0.9);
    g.beginPath();
    g.arc(p.x, p.y, p.radius + Math.min(p.attackRange, 60) * 0.8, angle - 0.7, angle + 0.7);
    g.strokePath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  destroy() {
    for (const p of this.projectiles) p.destroy();
    this.projectiles = [];
  }
}
