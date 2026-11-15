import { Vector2D } from './Vector2D';

export interface BoidConfig {
  maxSpeed: number;
  maxForce: number;
  separationDist: number;
  neighborDist: number;
  cursorAvoidRadius: number;
  cursorAvoidForce: number;
}

export class Boid {
  public position: Vector2D;
  public velocity: Vector2D;
  public acceleration: Vector2D;
  public size: number;
  public phase: number;
  public hueOffset: number;

  constructor(x: number, y: number) {
    this.position = new Vector2D(x, y);
    const angle = Math.random() * Math.PI * 2;
    this.velocity = new Vector2D(Math.cos(angle) * 1.5, Math.sin(angle) * 1.5);
    this.acceleration = new Vector2D(0, 0);
    this.size = 1 + Math.random() * 0.8;
    this.phase = Math.random() * Math.PI * 2;
    this.hueOffset = (Math.random() - 0.5) * 30;
  }

  public applyForce(force: Vector2D): void {
    this.acceleration.add(force);
  }

  public update(maxSpeed: number, delta: number): void {
    this.velocity.add(this.acceleration);
    this.velocity.limit(maxSpeed);
    const step = this.velocity.clone().mult(delta * 60);
    this.position.add(step);
    this.acceleration.set(0, 0);
    this.phase += this.velocity.mag() * 0.15;
  }
}

export class BoidsSystem {
  public boids: Boid[] = [];
  public width: number = 800;
  public height: number = 600;
  public config: BoidConfig = {
    maxSpeed: 2.5,
    maxForce: 0.08,
    separationDist: 22,
    neighborDist: 50,
    cursorAvoidRadius: 100,
    cursorAvoidForce: 0.35,
  };

  constructor(count = 60, width = 800, height = 600) {
    this.width = width;
    this.height = height;
    for (let i = 0; i < count; i++) {
      this.boids.push(new Boid(Math.random() * width, Math.random() * height));
    }
  }

  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Broadcasts an instantaneous shockwave that startles creatures,
   * launching them outward with a high-energy velocity burst
   */
  public startle(x: number, y: number, radius = 180, power = 3.5): void {
    const origin = new Vector2D(x, y);
    for (const boid of this.boids) {
      const d = boid.position.dist(origin);
      if (d < radius && d > 0) {
        const burst = Vector2D.sub(boid.position, origin);
        burst.normalize();
        const factor = (1 - d / radius) * power;
        burst.mult(factor);
        boid.velocity.add(burst);
      }
    }
  }

  public update(
    delta: number,
    mouseX: number,
    mouseY: number,
    mouseActive: boolean
  ): void {
    const mousePos = new Vector2D(mouseX, mouseY);

    for (let i = 0; i < this.boids.length; i++) {
      const boid = this.boids[i];

      // Flocking forces
      const sep = this.separate(boid);
      const ali = this.align(boid);
      const coh = this.cohere(boid);

      sep.mult(1.5);
      ali.mult(1.0);
      coh.mult(1.0);

      boid.applyForce(sep);
      boid.applyForce(ali);
      boid.applyForce(coh);

      // Cursor avoidance force
      if (mouseActive) {
        const d = boid.position.dist(mousePos);
        if (d < this.config.cursorAvoidRadius && d > 0) {
          const repel = Vector2D.sub(boid.position, mousePos);
          repel.normalize();
          const strength = (1 - d / this.config.cursorAvoidRadius) * this.config.cursorAvoidForce;
          repel.mult(strength);
          boid.applyForce(repel);
        }
      }

      // Smooth soft boundary steering
      const pad = 40;
      if (boid.position.x < pad) boid.applyForce(new Vector2D(this.config.maxForce * 1.5, 0));
      if (boid.position.x > this.width - pad) boid.applyForce(new Vector2D(-this.config.maxForce * 1.5, 0));
      if (boid.position.y < pad) boid.applyForce(new Vector2D(0, this.config.maxForce * 1.5));
      if (boid.position.y > this.height - pad) boid.applyForce(new Vector2D(0, -this.config.maxForce * 1.5));

      boid.update(this.config.maxSpeed, delta);
    }
  }

  private separate(boid: Boid): Vector2D {
    const steer = new Vector2D(0, 0);
    let count = 0;
    for (const other of this.boids) {
      const d = boid.position.dist(other.position);
      if (d > 0 && d < this.config.separationDist) {
        const diff = Vector2D.sub(boid.position, other.position);
        diff.normalize();
        diff.div(d); // Closer = stronger
        steer.add(diff);
        count++;
      }
    }
    if (count > 0) {
      steer.div(count);
      if (steer.mag() > 0) {
        steer.normalize();
        steer.mult(this.config.maxSpeed);
        steer.sub(boid.velocity);
        steer.limit(this.config.maxForce);
      }
    }
    return steer;
  }

  private align(boid: Boid): Vector2D {
    const sum = new Vector2D(0, 0);
    let count = 0;
    for (const other of this.boids) {
      const d = boid.position.dist(other.position);
      if (d > 0 && d < this.config.neighborDist) {
        sum.add(other.velocity);
        count++;
      }
    }
    if (count > 0) {
      sum.div(count);
      sum.normalize();
      sum.mult(this.config.maxSpeed);
      const steer = Vector2D.sub(sum, boid.velocity);
      steer.limit(this.config.maxForce);
      return steer;
    }
    return new Vector2D(0, 0);
  }

  private cohere(boid: Boid): Vector2D {
    const sum = new Vector2D(0, 0);
    let count = 0;
    for (const other of this.boids) {
      const d = boid.position.dist(other.position);
      if (d > 0 && d < this.config.neighborDist) {
        sum.add(other.position);
        count++;
      }
    }
    if (count > 0) {
      sum.div(count);
      return this.seek(boid, sum);
    }
    return new Vector2D(0, 0);
  }

  private seek(boid: Boid, target: Vector2D): Vector2D {
    const desired = Vector2D.sub(target, boid.position);
    desired.normalize();
    desired.mult(this.config.maxSpeed);
    const steer = Vector2D.sub(desired, boid.velocity);
    steer.limit(this.config.maxForce);
    return steer;
  }
}
