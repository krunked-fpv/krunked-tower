import {
  BossId,
  ENGINE_CONSTANTS,
  FloorId,
  InputDeviceMode,
  KeyBindings,
  PerfStats,
  RenderSettings,
  SimState,
  TvExpression,
} from '../contracts/index';
import { BOSSES, FLOOR_TOLLS, LEVELS } from '../data/index';
import { renderActionGlyphHtml } from '../input/InputRouter';

const TOPPIN_LABELS = ['SH', 'CH', 'TM', 'SG', 'PN'] as const;
const TOPPIN_COLORS = ['#d99b66', '#ffd23f', '#eb3b49', '#c95c3c', '#ffe247'] as const;

function formatClock(ticks: number): string {
  const totalSec = Math.max(0, Math.ceil(ticks / ENGINE_CONSTANTS.SIM_HZ));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class HudOverlay {
  private readonly host: HTMLElement | null;
  private readonly root: HTMLDivElement | null = null;

  // Cached DOM references for zero-thrash 60/120Hz updates
  private rankMeterEl: HTMLDivElement | null = null;
  private rankLetterEl: HTMLDivElement | null = null;
  private scoreValEl: HTMLDivElement | null = null;
  private scoreSubEl: HTMLDivElement | null = null;
  private toppinSlots: HTMLDivElement[] = [];
  private secretPips: HTMLSpanElement[] = [];
  private treasurePip: HTMLSpanElement | null = null;
  private toppinRowEl: HTMLDivElement | null = null;
  private stagePillEl: HTMLSpanElement | null = null;
  private riderPillEl: HTMLSpanElement | null = null;
  private cashPillEl: HTMLSpanElement | null = null;
  private fpsBadgeEl: HTMLSpanElement | null = null;

  private hudTrEl: HTMLDivElement | null = null;
  private crtShellEl: HTMLDivElement | null = null;
  private crtCanvas: HTMLCanvasElement | null = null;
  private crtCtx: CanvasRenderingContext2D | null = null;
  private crtLabelEl: HTMLSpanElement | null = null;
  private comboPanelEl: HTMLDivElement | null = null;
  private comboCountEl: HTMLDivElement | null = null;
  private comboFuseEl: HTMLDivElement | null = null;
  private superTauntEl: HTMLDivElement | null = null;
  private tvCalloutEl: HTMLDivElement | null = null;

  private escapeBarEl: HTMLDivElement | null = null;
  private escapeTitleEl: HTMLSpanElement | null = null;
  private lap2BadgeEl: HTMLSpanElement | null = null;
  private escapeClockEl: HTMLSpanElement | null = null;
  private escapeFuseEl: HTMLDivElement | null = null;
  private megaCrustAlertEl: HTMLDivElement | null = null;

  private bossHudEl: HTMLDivElement | null = null;
  private playerHpNameEl: HTMLDivElement | null = null;
  private playerHpPipsEl: HTMLDivElement | null = null;
  private bossHpNameEl: HTMLDivElement | null = null;
  private bossHpPipsEl: HTMLDivElement | null = null;
  private bossVsBannerEl: HTMLDivElement | null = null;
  private bossVsTitleEl: HTMLDivElement | null = null;
  private bossVsSubEl: HTMLDivElement | null = null;

  private contextPromptEl: HTMLDivElement | null = null;
  private controlsStripEl: HTMLDivElement | null = null;

  private lastPromptHtml = '';
  private lastControlsKey = '';
  private lastPlayerHpKey = '';
  private lastBossHpKey = '';
  private lastCrtKey = '';

  constructor(host: HTMLElement | null) {
    this.host = host;
    if (!this.host || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.className = 'kt-hud';
    root.innerHTML = `
      <div class="kt-hud-tl">
        <div class="kt-score-bar">
          <div class="kt-rank-meter" data-rank="D">
            <div class="kt-rank-meter-inner">D</div>
          </div>
          <div class="kt-score-box">
            <div class="kt-score-value">0</div>
            <div class="kt-score-sub">S-RANK: 16000</div>
          </div>
        </div>
        <div class="kt-toppins-row">
          ${TOPPIN_LABELS.map(
            (lbl, i) =>
              `<div class="kt-toppin-slot" data-toppin="${i}" title="Toppin Pal ${i + 1}" style="--tp-col:${TOPPIN_COLORS[i]}">${lbl}</div>`,
          ).join('')}
          <div class="kt-mini-pips">
            <span>SEC</span>
            <span class="kt-mini-pip" data-sec="0"></span>
            <span class="kt-mini-pip" data-sec="1"></span>
            <span class="kt-mini-pip" data-sec="2"></span>
            <span>TR</span>
            <span class="kt-mini-pip is-treasure" data-treasure="1"></span>
          </div>
        </div>
        <div class="kt-stage-pill-row">
          <span class="kt-stage-pill" data-role="stage-pill">FLOOR 1 LOBBY</span>
          <span class="kt-stage-pill kt-cash-pill" data-role="cash-pill">$0</span>
          <span class="kt-stage-pill" data-role="rider-pill" style="display:none"></span>
          <span class="kt-fps-badge" data-role="fps-badge">60 FPS</span>
        </div>
      </div>

      <div class="kt-hud-tr" data-role="hud-tr">
        <div class="kt-crt-shell" data-role="crt-shell">
          <div class="kt-crt-screen-wrap">
            <canvas class="kt-crt-canvas" width="94" height="76"></canvas>
            <div class="kt-crt-scanlines"></div>
          </div>
          <div class="kt-crt-led-row">
            <span class="kt-crt-label" data-role="crt-label">CHEF TV</span>
            <span class="kt-crt-led"></span>
          </div>
        </div>
        <div class="kt-combo-panel" data-role="combo-panel">
          <div class="kt-combo-count" data-role="combo-count">0x</div>
          <div class="kt-combo-fuse-track">
            <div class="kt-combo-fuse-fill" data-role="combo-fuse"></div>
          </div>
        </div>
        <div class="kt-supertaunt-badge" data-role="super-taunt"></div>
        <div class="kt-tv-callout" data-role="tv-callout"></div>
      </div>

      <div class="kt-boss-vs-banner" data-role="boss-vs">
        <div class="kt-boss-vs-title" data-role="boss-vs-title">CHEF PEPPO VS BOSS</div>
        <div class="kt-boss-vs-sub" data-role="boss-vs-sub">SHOWDOWN!</div>
      </div>

      <div class="kt-hud-bc">
        <div class="kt-escape-bar" data-role="escape-bar">
          <div class="kt-escape-head">
            <span class="kt-escape-title" data-role="escape-title">KRUNK TIME!</span>
            <div class="kt-escape-badges">
              <span class="kt-lap2-badge" data-role="lap2-badge">LAP 2!</span>
              <span class="kt-escape-clock" data-role="escape-clock">02:35</span>
            </div>
          </div>
          <div class="kt-escape-fuse-track">
            <div class="kt-escape-fuse-fill" data-role="escape-fuse"></div>
          </div>
          <div class="kt-megacrust-alert" data-role="megacrust-alert">⚠ MEGA-CRUST INCOMING! RUN! ⚠</div>
        </div>

        <div class="kt-boss-hud" data-role="boss-hud">
          <div class="kt-hp-col">
            <div class="kt-hp-name" data-role="player-hp-name">CHEF PEPPO</div>
            <div class="kt-hp-pips" data-role="player-hp-pips"></div>
          </div>
          <div class="kt-hp-col kt-hp-col--boss">
            <div class="kt-hp-name" data-role="boss-hp-name">BOSS</div>
            <div class="kt-hp-pips" data-role="boss-hp-pips"></div>
          </div>
        </div>

        <div class="kt-context-prompt" data-role="context-prompt"></div>
        <div class="kt-controls-strip" data-role="controls-strip"></div>
      </div>
    `;

    this.host.appendChild(root);
    this.root = root;

    this.rankMeterEl = root.querySelector('.kt-rank-meter');
    this.rankLetterEl = root.querySelector('.kt-rank-meter-inner');
    this.scoreValEl = root.querySelector('.kt-score-value');
    this.scoreSubEl = root.querySelector('.kt-score-sub');
    this.toppinRowEl = root.querySelector('.kt-toppins-row');
    this.toppinSlots = Array.from(root.querySelectorAll('.kt-toppin-slot'));
    this.secretPips = Array.from(root.querySelectorAll('[data-sec]'));
    this.treasurePip = root.querySelector('[data-treasure]');
    this.stagePillEl = root.querySelector('[data-role="stage-pill"]');
    this.cashPillEl = root.querySelector('[data-role="cash-pill"]');
    this.riderPillEl = root.querySelector('[data-role="rider-pill"]');
    this.fpsBadgeEl = root.querySelector('[data-role="fps-badge"]');

    this.hudTrEl = root.querySelector('[data-role="hud-tr"]');
    this.crtShellEl = root.querySelector('[data-role="crt-shell"]');
    this.crtCanvas = root.querySelector('.kt-crt-canvas');
    this.crtCtx = this.crtCanvas ? this.crtCanvas.getContext('2d') : null;
    this.crtLabelEl = root.querySelector('[data-role="crt-label"]');
    this.comboPanelEl = root.querySelector('[data-role="combo-panel"]');
    this.comboCountEl = root.querySelector('[data-role="combo-count"]');
    this.comboFuseEl = root.querySelector('[data-role="combo-fuse"]');
    this.superTauntEl = root.querySelector('[data-role="super-taunt"]');
    this.tvCalloutEl = root.querySelector('[data-role="tv-callout"]');

    this.escapeBarEl = root.querySelector('[data-role="escape-bar"]');
    this.escapeTitleEl = root.querySelector('[data-role="escape-title"]');
    this.lap2BadgeEl = root.querySelector('[data-role="lap2-badge"]');
    this.escapeClockEl = root.querySelector('[data-role="escape-clock"]');
    this.escapeFuseEl = root.querySelector('[data-role="escape-fuse"]');
    this.megaCrustAlertEl = root.querySelector('[data-role="megacrust-alert"]');

    this.bossHudEl = root.querySelector('[data-role="boss-hud"]');
    this.playerHpNameEl = root.querySelector('[data-role="player-hp-name"]');
    this.playerHpPipsEl = root.querySelector('[data-role="player-hp-pips"]');
    this.bossHpNameEl = root.querySelector('[data-role="boss-hp-name"]');
    this.bossHpPipsEl = root.querySelector('[data-role="boss-hp-pips"]');
    this.bossVsBannerEl = root.querySelector('[data-role="boss-vs"]');
    this.bossVsTitleEl = root.querySelector('[data-role="boss-vs-title"]');
    this.bossVsSubEl = root.querySelector('[data-role="boss-vs-sub"]');

    this.contextPromptEl = root.querySelector('[data-role="context-prompt"]');
    this.controlsStripEl = root.querySelector('[data-role="controls-strip"]');
  }

  public sync(
    state: SimState,
    deviceMode: InputDeviceMode,
    keyBindings: KeyBindings,
    renderSettings: RenderSettings,
    perfStats: PerfStats,
    touchActive: boolean,
  ): void {
    if (!this.root) return;

    const showHud = state.screen === 'hub' || state.screen === 'stage' || state.screen === 'boss';
    this.root.classList.toggle('is-visible', showHud);
    if (!showHud) return;

    // Top-left Score & Rank Pizza-Meter
    const stats = state.stageStats;
    const rank = stats.rank;
    const sTarget = Math.max(1, stats.sRankTarget || 16000);
    const pct = state.screen === 'stage' ? Math.min(100, Math.round((stats.score / sTarget) * 100)) : 100;

    if (this.rankMeterEl && this.rankLetterEl) {
      this.rankMeterEl.dataset.rank = rank;
      this.rankMeterEl.style.setProperty('--kt-rank-pct', String(pct));
      this.rankMeterEl.classList.toggle('is-prank', stats.pRankEligible && (rank === 'S' || rank === 'P'));
      this.rankLetterEl.textContent = state.screen === 'hub' ? `F${state.floor}` : rank;
    }

    if (this.scoreValEl) {
      this.scoreValEl.textContent =
        state.screen === 'hub'
          ? `${state.hub.stagesCleared.length}/19 CLEAR`
          : stats.score.toLocaleString('en-US');
    }

    if (this.scoreSubEl) {
      if (state.screen === 'hub') {
        this.scoreSubEl.textContent = `BOSSES: ${state.hub.bossesDefeated.length}/5`;
      } else if (state.screen === 'boss') {
        this.scoreSubEl.textContent = `NO-HIT BONUS: ${stats.hitsTaken === 0 ? 'LIVE' : 'LOST'}`;
      } else {
        this.scoreSubEl.textContent = stats.pRankEligible
          ? `P-RANK LIVE • S:${sTarget}`
          : `S-RANK: ${sTarget}`;
      }
    }

    if (this.toppinRowEl) {
      this.toppinRowEl.style.display = state.screen === 'stage' ? 'flex' : 'none';
    }
    if (state.screen === 'stage') {
      for (let i = 0; i < this.toppinSlots.length; i++) {
        this.toppinSlots[i].classList.toggle('is-found', Boolean(stats.toppinsCollected[i]));
      }
      for (let i = 0; i < this.secretPips.length; i++) {
        this.secretPips[i].classList.toggle('is-found', Boolean(stats.secretsFound[i]));
      }
      if (this.treasurePip) {
        this.treasurePip.classList.toggle('is-found', Boolean(stats.treasureCollected));
      }
    }

    if (this.stagePillEl) {
      if (state.screen === 'hub') {
        const roomName = state.room.name;
        this.stagePillEl.textContent = /^floor\s+\d+/i.test(roomName)
          ? roomName
          : `FLOOR ${state.floor} — ${roomName}`;
      } else if (state.screen === 'boss' && state.bossId) {
        const bDef = BOSSES[state.bossId];
        this.stagePillEl.textContent = bDef ? `BOSS: ${bDef.name}` : 'BOSS ARENA';
      } else if (state.stageId) {
        const lDef = LEVELS[state.stageId];
        this.stagePillEl.textContent = lDef ? lDef.name : state.room.name;
      }
    }

    if (this.cashPillEl) {
      this.cashPillEl.textContent = `$${state.hub.cash}`;
    }

    if (this.riderPillEl) {
      const badgeText =
        state.player.rider === 'gusto_chonks'
          ? 'GUSTO & CHONKS'
          : state.player.transformation !== 'none'
            ? `FORM: ${state.player.transformation.replace(/_/g, ' ').toUpperCase()}`
            : '';
      this.riderPillEl.style.display = badgeText ? 'inline-flex' : 'none';
      if (badgeText) this.riderPillEl.textContent = badgeText;
    }

    if (this.fpsBadgeEl) {
      this.fpsBadgeEl.classList.toggle('is-visible', renderSettings.showFps);
      if (renderSettings.showFps) {
        this.fpsBadgeEl.textContent = `${Math.round(perfStats.fps)} FPS | S:${perfStats.simMs.toFixed(1)}ms R:${perfStats.renderMs.toFixed(1)}ms`;
      }
    }

    // Top-right CRT TV + Combo + Super Taunt
    if (this.hudTrEl) {
      this.hudTrEl.classList.toggle('has-touch-pause', touchActive);
    }
    if (this.crtShellEl) {
      this.crtShellEl.classList.toggle('is-panic', state.escape.active || state.tv.expression === 'panic');
    }
    if (this.crtLabelEl) {
      this.crtLabelEl.textContent =
        state.player.rider === 'gusto_chonks'
          ? 'GUSTO TV'
          : state.character === 'static'
            ? 'STATIC TV'
            : 'CHEF TV';
    }
    this.drawCrtFace(state);

    if (this.comboPanelEl && this.comboCountEl && this.comboFuseEl) {
      const showCombo = state.player.combo > 0;
      this.comboPanelEl.classList.toggle('is-visible', showCombo);
      if (showCombo) {
        this.comboCountEl.textContent = `${state.player.combo}x`;
        const bounceScale = 1 + Math.min(0.28, Math.max(0, state.tv.comboBounce) * 0.03);
        this.comboPanelEl.style.transform = `rotate(2deg) scale(${bounceScale.toFixed(3)})`;
        const fusePct = Math.max(
          0,
          Math.min(100, (state.player.comboTime / ENGINE_CONSTANTS.COMBO_TIME_MAX) * 100),
        );
        this.comboFuseEl.style.width = `${fusePct.toFixed(1)}%`;
      }
    }

    if (this.superTauntEl) {
      const ready = state.player.superTauntReady;
      this.superTauntEl.classList.toggle('is-visible', ready);
      if (ready) {
        this.superTauntEl.innerHTML = `⚡ SUPER TAUNT ${renderActionGlyphHtml('up', deviceMode, keyBindings)}+${renderActionGlyphHtml('taunt', deviceMode, keyBindings)}`;
      }
    }

    if (this.tvCalloutEl) {
      const showCallout = state.tv.calloutTimer > 0 && state.tv.calloutText.length > 0;
      this.tvCalloutEl.classList.toggle('is-visible', showCallout);
      if (showCallout) {
        this.tvCalloutEl.textContent = state.tv.calloutText;
      }
    }

    // Bottom-center Escape Bar
    if (this.escapeBarEl) {
      const escActive = state.escape.active && state.screen === 'stage';
      this.escapeBarEl.classList.toggle('is-visible', escActive);
      if (escActive) {
        const critical = state.escape.timerTicks <= 60 * 20 || state.escape.megaCrustActive;
        this.escapeBarEl.classList.toggle('is-critical', critical);
        if (this.escapeTitleEl) {
          this.escapeTitleEl.textContent = state.escape.warMode ? 'WAR COUNTDOWN!' : 'KRUNK TIME!';
        }
        if (this.lap2BadgeEl) {
          this.lap2BadgeEl.classList.toggle('is-visible', state.escape.lap >= 2);
          this.lap2BadgeEl.textContent = `LAP ${state.escape.lap}!`;
        }
        if (this.escapeClockEl) {
          this.escapeClockEl.textContent = formatClock(state.escape.timerTicks);
        }
        if (this.escapeFuseEl) {
          const maxTicks = Math.max(1, state.escape.maxTicks);
          const pctEsc = Math.max(0, Math.min(100, (state.escape.timerTicks / maxTicks) * 100));
          this.escapeFuseEl.style.width = `${pctEsc.toFixed(1)}%`;
        }
        if (this.megaCrustAlertEl) {
          const megaWarn = state.escape.timerTicks <= 0 || state.escape.megaCrustActive;
          this.megaCrustAlertEl.classList.toggle('is-visible', megaWarn);
        }
      }
    }

    // Boss Arena HUD & VS Banner
    const inBoss = state.screen === 'boss' && state.boss !== null;
    if (this.bossHudEl) {
      this.bossHudEl.classList.toggle('is-visible', inBoss);
    }
    if (this.bossVsBannerEl) {
      const showVs = inBoss && state.bossIntroTicks > 0;
      this.bossVsBannerEl.classList.toggle('is-visible', showVs);
      if (showVs && state.boss) {
        const hero = state.character === 'static' ? 'THE STATIC' : 'CHEF PEPPO';
        const bDef = state.bossId ? BOSSES[state.bossId] : undefined;
        if (this.bossVsTitleEl) {
          this.bossVsTitleEl.textContent = `${hero} VS ${state.boss.name.toUpperCase()}`;
        }
        if (this.bossVsSubEl) {
          this.bossVsSubEl.textContent = bDef?.title?.toUpperCase() ?? 'TOWER SHOWDOWN!';
        }
      }
    }

    if (inBoss && state.boss) {
      if (this.playerHpNameEl) {
        this.playerHpNameEl.textContent =
          state.character === 'static' ? 'THE STATIC' : 'CHEF PEPPO';
      }
      const pKey = `${state.player.hp}/${state.player.maxHp}`;
      if (pKey !== this.lastPlayerHpKey && this.playerHpPipsEl) {
        this.lastPlayerHpKey = pKey;
        const maxP = Math.max(1, state.player.maxHp || ENGINE_CONSTANTS.BOSS_PLAYER_MAX_HP);
        let html = '';
        for (let i = 0; i < maxP; i++) {
          html += `<span class="kt-hp-pip kt-hp-pip--player ${i < state.player.hp ? 'is-filled' : ''}"></span>`;
        }
        this.playerHpPipsEl.innerHTML = html;
      }

      if (this.bossHpNameEl) {
        this.bossHpNameEl.textContent = `${state.boss.name} (P${state.boss.phase}/${state.boss.maxPhases})`;
      }
      const bKey = `${state.boss.hp}/${state.boss.maxHp}`;
      if (bKey !== this.lastBossHpKey && this.bossHpPipsEl) {
        this.lastBossHpKey = bKey;
        const maxB = Math.max(1, state.boss.maxHp);
        let html = '';
        for (let i = 0; i < maxB; i++) {
          html += `<span class="kt-hp-pip kt-hp-pip--boss ${i < state.boss.hp ? 'is-filled' : ''}"></span>`;
        }
        this.bossHpPipsEl.innerHTML = html;
      }
    }

    // Contextual Nearby Interaction Prompt (Hub / Doors / Signs)
    const promptHtml = this.computeContextPromptHtml(state, deviceMode, keyBindings);
    if (this.contextPromptEl && promptHtml !== this.lastPromptHtml) {
      this.lastPromptHtml = promptHtml;
      this.contextPromptEl.classList.toggle('is-visible', promptHtml.length > 0);
      this.contextPromptEl.innerHTML = promptHtml;
    }

    // Dynamic controls hint strip in Hub & Tutorial
    const showControls = state.screen === 'hub' || state.stageId === 'tutorial';
    if (this.controlsStripEl) {
      this.controlsStripEl.classList.toggle('is-visible', showControls);
      const ctrlKey = `${deviceMode}:${JSON.stringify(keyBindings)}`;
      if (showControls && ctrlKey !== this.lastControlsKey) {
        this.lastControlsKey = ctrlKey;
        this.controlsStripEl.innerHTML = [
          `${renderActionGlyphHtml('move', deviceMode, keyBindings)} MOVE`,
          `${renderActionGlyphHtml('jump', deviceMode, keyBindings)} JUMP`,
          `${renderActionGlyphHtml('grab', deviceMode, keyBindings)} GRAB`,
          `${renderActionGlyphHtml('mach', deviceMode, keyBindings)} MACH`,
          `${renderActionGlyphHtml('taunt', deviceMode, keyBindings)} TAUNT`,
          `${renderActionGlyphHtml('pause', deviceMode, keyBindings)} PAUSE`,
        ].join(' ');
      }
    }
  }

  private computeContextPromptHtml(
    state: SimState,
    deviceMode: InputDeviceMode,
    keyBindings: KeyBindings,
  ): string {
    const px = state.player.x;
    const py = state.player.y;
    const upGlyph = renderActionGlyphHtml('up', deviceMode, keyBindings);

    // Check props near player (exact AABB parity with levelRuntime.ts so shown ↑ prompts ALWAYS trigger!)
    const halfPlayerW = ENGINE_CONSTANTS.PLAYER_STAND_W * 0.5;
    const playerH = state.player.crouch
      ? ENGINE_CONSTANTS.PLAYER_CROUCH_H
      : ENGINE_CONSTANTS.PLAYER_STAND_H;
    for (const prop of state.props) {
      if (!prop.active) continue;
      if (prop.kind === 'tutorial_sign') {
        const dx = Math.abs(px - prop.x);
        const dy = Math.abs(py - prop.y);
        if (dx > 52 || dy > 64) continue;
      } else {
        const overlapsProp =
          px + halfPlayerW > prop.x - prop.width * 0.5 &&
          px - halfPlayerW < prop.x + prop.width * 0.5 &&
          py > prop.y - prop.height &&
          py - playerH < prop.y;
        if (!overlapsProp) continue;
      }

      switch (prop.kind) {
        case 'hub_stage_gate':
        case 'hub_bonus_gate': {
          const lDef = prop.targetStageId ? LEVELS[prop.targetStageId] : undefined;
          const label = lDef ? lDef.name.toUpperCase() : (prop.label ?? 'STAGE').toUpperCase();
          const best = prop.targetStageId ? state.hub.stageBestRanks[prop.targetStageId] : undefined;
          const rankSuffix = best ? ` [${best}]` : '';
          return `${upGlyph} ENTER ${escapeHtml(label)}${rankSuffix}`;
        }
        case 'hub_boss_gate': {
          const bossId = prop.targetBossId as BossId | undefined;
          const bDef = bossId ? BOSSES[bossId] : undefined;
          const floor = (bDef?.floor ?? state.floor) as FloorId;
          const toll = FLOOR_TOLLS[floor] ?? bDef?.tollCash ?? 0;
          const paid = toll === 0 || state.hub.brokerPaidFloors.includes(floor);
          const bName = (bDef?.name ?? prop.label ?? 'BOSS').toUpperCase();
          if (!paid) {
            return `LOCKED — PAY BROKER BUCK ($${toll}) FOR ${escapeHtml(bName)}`;
          }
          return `${upGlyph} CHALLENGE ${escapeHtml(bName)}`;
        }
        case 'hub_broker': {
          const floor = (prop.targetFloor ?? state.floor) as FloorId;
          const toll = FLOOR_TOLLS[floor] ?? 0;
          if (toll === 0 || state.hub.brokerPaidFloors.includes(floor)) {
            return `BROKER BUCK: BOSS GATE OPEN!`;
          }
          if (state.hub.cash >= toll) {
            return `${upGlyph} PAY BROKER BUCK ($${toll})`;
          }
          return `BROKER BUCK NEEDS $${toll} (HAVE $${state.hub.cash})`;
        }
        case 'hub_elevator': {
          const targetFloor = prop.targetFloor ?? (state.floor < 5 ? state.floor + 1 : 1);
          return `${upGlyph} ELEVATOR TO FLOOR ${targetFloor}`;
        }
        case 'exit_door': {
          if (state.escape.active || state.stageId === 'tutorial') {
            return `${upGlyph} EXIT STAGE!`;
          }
          return '';
        }
        case 'lap2_portal': {
          if (state.escape.active && state.escape.lap < 2) {
            return `${upGlyph} ENTER LAP 2! (+3000 PTS)`;
          }
          return '';
        }
        case 'taxi_warp': {
          return `${upGlyph} ${escapeHtml((prop.label ?? 'EXPRESS TAXI').toUpperCase())}`;
        }
        case 'tutorial_sign': {
          if (prop.label) {
            const expanded = escapeHtml(prop.label)
              .replace(/\[JUMP\]/g, renderActionGlyphHtml('jump', deviceMode, keyBindings))
              .replace(/\[GRAB\]/g, renderActionGlyphHtml('grab', deviceMode, keyBindings))
              .replace(/\[MACH\]/g, renderActionGlyphHtml('mach', deviceMode, keyBindings))
              .replace(/\[TAUNT\]/g, renderActionGlyphHtml('taunt', deviceMode, keyBindings))
              .replace(/\[UP\]/g, upGlyph);
            return expanded;
          }
          return '';
        }
        default:
          break;
      }
    }

    // Check doors requiring Up (exact AABB parity with levelRuntime.ts)
    for (const door of state.room.doors) {
      if (!door.requireUp) continue;
      if (door.escapeLocked && state.escape.active) continue;
      const overlapsDoor =
        px + halfPlayerW > door.x - 24 &&
        px - halfPlayerW < door.x + 24 &&
        py > door.y - 64 &&
        py - playerH < door.y;
      if (overlapsDoor) {
        return `${upGlyph} ${escapeHtml((door.label ?? 'ENTER DOOR').toUpperCase())}`;
      }
    }

    return '';
  }

  private drawCrtFace(state: SimState): void {
    const ctx = this.crtCtx;
    if (!ctx) return;

    const expr: TvExpression = state.tv.expression;
    const animStep = Math.floor(state.tv.animTick / 4) % 8;
    const key = `${expr}:${animStep}:${state.character}:${state.player.rider}:${state.escape.active ? 1 : 0}`;
    if (key === this.lastCrtKey) return;
    this.lastCrtKey = key;

    const w = 94;
    const h = 76;
    ctx.clearRect(0, 0, w, h);

    // Expressive background wash per expression
    const bgMap: Record<TvExpression, string> = {
      idle: '#283655',
      mach2: '#2d6a4f',
      mach3: '#d9480f',
      mach4: '#b5179e',
      panic: animStep % 2 === 0 ? '#a4133c' : '#590d22',
      hurt: '#4a154b',
      taunt: '#ffb703',
      combo: '#e85d04',
      happy: '#2a9d8f',
      boss: '#6a040f',
      gusto: '#2b9348',
      static: '#f4d35e',
      knight: '#495057',
      ghost: '#3a0ca3',
      shotgun: '#7f4f24',
      fire: '#dc2f02',
    };
    ctx.fillStyle = bgMap[expr] ?? '#283655';
    ctx.fillRect(0, 0, w, h);

    // Motion / comic rays
    if (expr === 'mach3' || expr === 'mach4' || expr === 'taunt' || expr === 'panic') {
      ctx.strokeStyle = expr === 'taunt' ? '#fff3b0' : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = ((i * 15 + animStep * 5) % h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + (expr === 'taunt' ? -8 : 0));
        ctx.stroke();
      }
    }

    const jitterX = expr === 'panic' || expr === 'mach4' || expr === 'hurt' ? (animStep % 2 === 0 ? -2 : 2) : 0;
    const bobY = Math.round(Math.sin(animStep * 0.8) * (expr === 'mach2' || expr === 'combo' ? 3 : 1.5));
    const cx = 47 + jitterX;
    const cy = 44 + bobY;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const isStatic = state.character === 'static' || expr === 'static';
    const isGusto = state.player.rider === 'gusto_chonks' || expr === 'gusto';

    // Headgear (Chef toque / Static cowl / Gusto red cap / Knight helm)
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#120918';
    if (expr === 'knight') {
      ctx.fillStyle = '#adb5bd';
      ctx.beginPath();
      ctx.arc(cx, cy - 6, 22, Math.PI, 0);
      ctx.lineTo(cx + 22, cy + 16);
      ctx.lineTo(cx - 22, cy + 16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Visor slit
      ctx.fillStyle = '#120918';
      ctx.fillRect(cx - 14, cy - 6, 28, 7);
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(cx - 8, cy - 4, 5, 3);
      ctx.fillRect(cx + 3, cy - 4, 5, 3);
      return;
    }

    // Face silhouette
    ctx.fillStyle = expr === 'ghost' ? '#bde0fe' : isStatic ? '#ffd60a' : '#ffddc2';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 22, 19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isStatic) {
      // Mischievous yellow cowl ears & black domino mask
      ctx.fillStyle = '#ffbe0b';
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 12);
      ctx.lineTo(cx - 26, cy - 30);
      ctx.lineTo(cx - 6, cy - 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, cy - 12);
      ctx.lineTo(cx + 26, cy - 30);
      ctx.lineTo(cx + 6, cy - 17);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#120918';
      ctx.fillRect(cx - 19, cy - 8, 38, 12);
    } else if (isGusto) {
      // Cozy red baker cap
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(cx, cy - 11, 21, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(cx - 24, cy - 13, 30, 5);
      ctx.strokeRect(cx - 24, cy - 13, 30, 5);
    } else {
      // Chef Peppo tall puffy toque hat
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 10, cy - 22, 11, 0, Math.PI * 2);
      ctx.arc(cx, cy - 26, 13, 0, Math.PI * 2);
      ctx.arc(cx + 10, cy - 22, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(cx - 17, cy - 18, 34, 8);
      ctx.strokeRect(cx - 17, cy - 18, 34, 8);
    }

    // Eyes
    const wide = expr === 'panic' || expr === 'mach3' || expr === 'mach4' || expr === 'boss';
    if (expr === 'hurt') {
      // X / dizzy eyes
      ctx.strokeStyle = '#120918';
      ctx.lineWidth = 3;
      const drawX = (ex: number, ey: number): void => {
        ctx.beginPath();
        ctx.moveTo(ex - 5, ey - 5);
        ctx.lineTo(ex + 5, ey + 5);
        ctx.moveTo(ex + 5, ey - 5);
        ctx.lineTo(ex - 5, ey + 5);
        ctx.stroke();
      };
      drawX(cx - 9, cy - 2);
      drawX(cx + 9, cy - 2);
    } else if (expr === 'taunt') {
      // Cool dark sunglasses
      ctx.fillStyle = '#120918';
      ctx.fillRect(cx - 18, cy - 7, 15, 9);
      ctx.fillRect(cx + 3, cy - 7, 15, 9);
      ctx.fillRect(cx - 3, cy - 5, 6, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 15, cy - 5, 4, 2);
      ctx.fillRect(cx + 6, cy - 5, 4, 2);
    } else {
      const eyeR = wide ? 7 : 5;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#120918';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx - 9, cy - 2, eyeR, 0, Math.PI * 2);
      ctx.arc(cx + 9, cy - 2, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const pupilR = wide ? 2 : 2.5;
      const lookX = expr === 'mach2' || expr === 'mach3' || expr === 'mach4' ? 2 : 0;
      ctx.fillStyle = '#120918';
      ctx.beginPath();
      ctx.arc(cx - 9 + lookX, cy - 2, pupilR, 0, Math.PI * 2);
      ctx.arc(cx + 9 + lookX, cy - 2, pupilR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Thick cartoon mustache for Peppo / Gusto
    if (!isStatic) {
      ctx.fillStyle = '#120918';
      ctx.beginPath();
      ctx.ellipse(cx - 7, cy + 7, 8, 3.5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(cx + 7, cy + 7, 8, 3.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth expression
    ctx.strokeStyle = '#120918';
    ctx.lineWidth = 2.5;
    if (wide || expr === 'fire') {
      ctx.fillStyle = '#9c1724';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 14, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 6, cy + 9, 12, 3);
    } else if (expr === 'happy' || expr === 'combo' || expr === 'taunt' || isStatic) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 10, 0.1, Math.PI - 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy + 13);
      ctx.quadraticCurveTo(cx, cy + (expr === 'hurt' ? 9 : 15), cx + 7, cy + 13);
      ctx.stroke();
    }

    // Sweat drop on panic
    if (expr === 'panic' || state.escape.active) {
      ctx.fillStyle = '#48cae4';
      ctx.beginPath();
      ctx.arc(cx + 25, cy - 10 + (animStep % 3) * 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  public dispose(): void {
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }
}
