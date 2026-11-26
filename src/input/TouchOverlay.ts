export interface TouchSample {
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  jumpHeld: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  grabHeld: boolean;
  grabPressed: boolean;
  grabReleased: boolean;
  machHeld: boolean;
  machPressed: boolean;
  tauntPressed: boolean;
  pausePressed: boolean;
  machLocked: boolean;
}

type TouchActionKey = 'jump' | 'grab' | 'taunt' | 'mach';

interface ActionPointerState {
  pointers: Set<number>;
  el: HTMLButtonElement;
}

const STICK_RADIUS = 56;
const STICK_DEADZONE = 14;

export class TouchOverlay {
  private readonly host: HTMLElement | null;
  private readonly root: HTMLDivElement | null = null;
  private readonly leftZone: HTMLDivElement | null = null;
  private readonly stickBase: HTMLDivElement | null = null;
  private readonly stickKnob: HTMLDivElement | null = null;
  private readonly machLockBtn: HTMLButtonElement | null = null;
  private readonly pauseBtn: HTMLButtonElement | null = null;
  private readonly actions = new Map<TouchActionKey, ActionPointerState>();

  /** STRICT ZERO-VISIBILITY DEFAULT */
  private visible = false;
  private opacity = 0.32;
  private machLocked = false;

  // Per-pointerId tracking (4+ fingers simultaneously)
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private moveX: -1 | 0 | 1 = 0;
  private moveY: -1 | 0 | 1 = 0;

  // Edge latches consumed per sim tick
  private jumpPressedEdge = false;
  private jumpReleasedEdge = false;
  private grabPressedEdge = false;
  private grabReleasedEdge = false;
  private machPressedEdge = false;
  private tauntPressedEdge = false;
  private pausePressedEdge = false;

  private readonly onPauseTapCallback?: () => void;

  constructor(host: HTMLElement | null, options?: { opacity?: number; machLockDefault?: boolean; onPauseTap?: () => void }) {
    this.host = host;
    this.opacity = this.clampOpacity(options?.opacity ?? 0.32);
    this.machLocked = Boolean(options?.machLockDefault ?? false);
    this.onPauseTapCallback = options?.onPauseTap;

    if (!this.host || typeof document === 'undefined') {
      return;
    }

    const root = document.createElement('div');
    root.className = 'kt-touch-overlay';
    root.dataset.touchVisible = 'false';
    root.style.display = 'none';
    root.style.visibility = 'hidden';
    root.style.pointerEvents = 'none';
    root.style.setProperty('--kt-touch-opacity', String(this.opacity));
    root.setAttribute('aria-hidden', 'true');

    // Left Zone: Floating/Anchored 8-way Virtual Joystick
    const leftZone = document.createElement('div');
    leftZone.className = 'kt-touch-left-zone';

    const stickBase = document.createElement('div');
    stickBase.className = 'kt-touch-stick-base';
    stickBase.innerHTML = `
      <div class="kt-touch-stick-ring"></div>
      <span class="kt-touch-dir kt-touch-dir--up">▲</span>
      <span class="kt-touch-dir kt-touch-dir--down">▼</span>
      <span class="kt-touch-dir kt-touch-dir--left">◀</span>
      <span class="kt-touch-dir kt-touch-dir--right">▶</span>
    `;

    const stickKnob = document.createElement('div');
    stickKnob.className = 'kt-touch-stick-knob';
    stickBase.appendChild(stickKnob);
    leftZone.appendChild(stickBase);
    root.appendChild(leftZone);

    // Right Zone: Ergonomic Thumb-Arc Circular Buttons + MACH LOCK Pill
    const rightZone = document.createElement('div');
    rightZone.className = 'kt-touch-right-zone';

    const machLockBtn = document.createElement('button');
    machLockBtn.type = 'button';
    machLockBtn.className = 'kt-touch-mach-lock';
    machLockBtn.textContent = 'MACH LOCK';
    rightZone.appendChild(machLockBtn);

    const buttonDefs: Array<{ key: TouchActionKey; glyph: string; sub: string; cls: string }> = [
      { key: 'jump', glyph: 'J', sub: 'JUMP', cls: 'kt-touch-btn--jump' },
      { key: 'grab', glyph: 'G', sub: 'GRAB', cls: 'kt-touch-btn--grab' },
      { key: 'taunt', glyph: 'T', sub: 'TAUNT', cls: 'kt-touch-btn--taunt' },
      { key: 'mach', glyph: 'M', sub: 'MACH', cls: 'kt-touch-btn--mach' },
    ];

    for (const def of buttonDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `kt-touch-btn ${def.cls}`;
      btn.innerHTML = `<span class="kt-touch-btn-key">${def.glyph}</span><span class="kt-touch-btn-sub">${def.sub}</span>`;
      rightZone.appendChild(btn);
      this.actions.set(def.key, { pointers: new Set<number>(), el: btn });
      this.bindActionButton(def.key, btn);
    }

    root.appendChild(rightZone);

    // Top-right tiny translucent PAUSE pill (ONLY inside TouchOverlay -> only visible when touchActive === true)
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'kt-touch-pause';
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.textContent = '||';
    root.appendChild(pauseBtn);

    this.host.appendChild(root);

    this.root = root;
    this.leftZone = leftZone;
    this.stickBase = stickBase;
    this.stickKnob = stickKnob;
    this.machLockBtn = machLockBtn;
    this.pauseBtn = pauseBtn;

    this.bindStickZone(leftZone);
    this.bindMachLock(machLockBtn);
    this.bindPause(pauseBtn);
    this.syncMachLockVisuals();
  }

  private clampOpacity(value: number): number {
    return Math.max(0.15, Math.min(0.6, Number.isFinite(value) ? value : 0.32));
  }

  private bindStickZone(zone: HTMLDivElement): void {
    const onDown = (e: PointerEvent): void => {
      if (!this.visible) return;
      if (this.stickPointerId !== null) return;
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      this.stickOriginX = e.clientX;
      this.stickOriginY = e.clientY;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure on synthetic pointers
      }
      this.positionFloatingStick(e.clientX, e.clientY);
      this.updateStickVector(e.clientX, e.clientY);
    };

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      this.updateStickVector(e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      this.resetStick();
    };

    zone.addEventListener('pointerdown', onDown, { passive: false });
    zone.addEventListener('pointermove', onMove, { passive: false });
    zone.addEventListener('pointerup', onUp, { passive: false });
    zone.addEventListener('pointercancel', onUp, { passive: false });
    zone.addEventListener('lostpointercapture', onUp);
  }

  private positionFloatingStick(clientX: number, clientY: number): void {
    if (!this.leftZone || !this.stickBase) return;
    const rect = this.leftZone.getBoundingClientRect();
    const baseSize = 148;
    const half = baseSize / 2;
    const relX = Math.max(half + 6, Math.min(rect.width - half - 6, clientX - rect.left));
    const relY = Math.max(half + 6, Math.min(rect.height - half - 6, clientY - rect.top));
    this.stickBase.style.left = `${Math.round(relX - half)}px`;
    this.stickBase.style.top = `${Math.round(relY - half)}px`;
    this.stickBase.style.bottom = 'auto';
    this.stickOriginX = rect.left + relX;
    this.stickOriginY = rect.top + relY;
  }

  private updateStickVector(clientX: number, clientY: number): void {
    const dx = clientX - this.stickOriginX;
    const dy = clientY - this.stickOriginY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, STICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0.001 ? Math.cos(angle) * clampedDist : 0;
    const knobY = dist > 0.001 ? Math.sin(angle) * clampedDist : 0;

    if (this.stickKnob) {
      this.stickKnob.style.transform = `translate3d(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px, 0)`;
    }

    if (dist < STICK_DEADZONE) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    // Crisp 8-way directional sectors (each cardinal spans 67.5 deg, diagonals span 22.5 deg bands)
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.moveX = cos > 0.38 ? 1 : cos < -0.38 ? -1 : 0;
    this.moveY = sin > 0.38 ? 1 : sin < -0.38 ? -1 : 0;
  }

  private resetStick(): void {
    this.stickPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    if (this.stickKnob) {
      this.stickKnob.style.transform = 'translate3d(0px, 0px, 0)';
    }
    if (this.stickBase) {
      this.stickBase.style.left = '';
      this.stickBase.style.top = '';
      this.stickBase.style.bottom = '';
    }
  }

  private bindActionButton(action: TouchActionKey, btn: HTMLButtonElement): void {
    const onDown = (e: PointerEvent): void => {
      if (!this.visible) return;
      e.preventDefault();
      e.stopPropagation();
      const entry = this.actions.get(action);
      if (!entry) return;
      const wasEmpty = entry.pointers.size === 0;
      entry.pointers.add(e.pointerId);
      btn.classList.add('is-pressed');
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic pointer capture error
      }

      if (wasEmpty) {
        if (action === 'jump') this.jumpPressedEdge = true;
        if (action === 'grab') this.grabPressedEdge = true;
        if (action === 'taunt') this.tauntPressedEdge = true;
        if (action === 'mach') this.machPressedEdge = true;
      }
    };

    const onUp = (e: PointerEvent): void => {
      const entry = this.actions.get(action);
      if (!entry || !entry.pointers.has(e.pointerId)) return;
      e.preventDefault();
      entry.pointers.delete(e.pointerId);
      if (entry.pointers.size === 0) {
        btn.classList.remove('is-pressed');
        if (action === 'jump') this.jumpReleasedEdge = true;
        if (action === 'grab') this.grabReleasedEdge = true;
      }
    };

    btn.addEventListener('pointerdown', onDown, { passive: false });
    btn.addEventListener('pointerup', onUp, { passive: false });
    btn.addEventListener('pointercancel', onUp, { passive: false });
    btn.addEventListener('lostpointercapture', onUp);
  }

  private bindMachLock(btn: HTMLButtonElement): void {
    btn.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (!this.visible) return;
        e.preventDefault();
        e.stopPropagation();
        this.machLocked = !this.machLocked;
        if (this.machLocked) {
          this.machPressedEdge = true;
        }
        this.syncMachLockVisuals();
      },
      { passive: false },
    );
  }

  private bindPause(btn: HTMLButtonElement): void {
    btn.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (!this.visible) return;
        e.preventDefault();
        e.stopPropagation();
        this.pausePressedEdge = true;
        this.onPauseTapCallback?.();
      },
      { passive: false },
    );
  }

  private syncMachLockVisuals(): void {
    if (this.machLockBtn) {
      this.machLockBtn.classList.toggle('is-active', this.machLocked);
      this.machLockBtn.textContent = this.machLocked ? 'MACH: ON' : 'MACH LOCK';
    }
    const machEntry = this.actions.get('mach');
    if (machEntry) {
      machEntry.el.classList.toggle('is-locked', this.machLocked);
    }
  }

  public setVisible(visible: boolean): void {
    const next = Boolean(visible);
    if (this.visible === next && this.root) {
      return;
    }
    this.visible = next;

    if (!next) {
      this.clearActiveInputs();
    }

    if (this.root) {
      this.root.dataset.touchVisible = next ? 'true' : 'false';
      this.root.style.display = next ? 'block' : 'none';
      this.root.style.visibility = next ? 'visible' : 'hidden';
      this.root.style.pointerEvents = 'none';
      this.root.setAttribute('aria-hidden', next ? 'false' : 'true');
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public getRootElement(): HTMLDivElement | null {
    return this.root;
  }

  public setOpacity(opacity: number): void {
    this.opacity = this.clampOpacity(opacity);
    if (this.root) {
      this.root.style.setProperty('--kt-touch-opacity', String(this.opacity));
    }
  }

  public setMachLockDefault(enabled: boolean): void {
    this.machLocked = Boolean(enabled);
    this.syncMachLockVisuals();
  }

  public isMachLocked(): boolean {
    return this.machLocked;
  }

  public clearActiveInputs(): void {
    this.resetStick();
    for (const entry of this.actions.values()) {
      entry.pointers.clear();
      entry.el.classList.remove('is-pressed');
    }
    this.jumpPressedEdge = false;
    this.jumpReleasedEdge = false;
    this.grabPressedEdge = false;
    this.grabReleasedEdge = false;
    this.machPressedEdge = false;
    this.tauntPressedEdge = false;
    this.pausePressedEdge = false;
  }

  public sample(): TouchSample {
    const jumpHeld = (this.actions.get('jump')?.pointers.size ?? 0) > 0;
    const grabHeld = (this.actions.get('grab')?.pointers.size ?? 0) > 0;
    const machButtonHeld = (this.actions.get('mach')?.pointers.size ?? 0) > 0;
    const machHeld = this.visible && (machButtonHeld || this.machLocked);

    const sample: TouchSample = {
      moveX: this.visible ? this.moveX : 0,
      moveY: this.visible ? this.moveY : 0,
      jumpHeld: this.visible && jumpHeld,
      jumpPressed: this.visible && this.jumpPressedEdge,
      jumpReleased: this.jumpReleasedEdge,
      grabHeld: this.visible && grabHeld,
      grabPressed: this.visible && this.grabPressedEdge,
      grabReleased: this.grabReleasedEdge,
      machHeld,
      machPressed: this.visible && this.machPressedEdge,
      tauntPressed: this.visible && this.tauntPressedEdge,
      pausePressed: this.pausePressedEdge,
      machLocked: this.machLocked,
    };

    this.jumpPressedEdge = false;
    this.jumpReleasedEdge = false;
    this.grabPressedEdge = false;
    this.grabReleasedEdge = false;
    this.machPressedEdge = false;
    this.tauntPressedEdge = false;
    this.pausePressedEdge = false;
    return sample;
  }

  public dispose(): void {
    this.clearActiveInputs();
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }
}
