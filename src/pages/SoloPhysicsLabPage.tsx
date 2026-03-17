import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, RotateCcw, Wind } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type SoloActionType =
  | "move"
  | "tackle"
  | "pass_low"
  | "pass_high"
  | "pass_launch"
  | "shoot_controlled"
  | "shoot_power";

type SoloAttrs = {
  velocidade: number;
  aceleracao: number;
  stamina: number;
  forca: number;
  drible: number;
  agilidade: number;
  desarme: number;
  marcacao: number;
  antecipacao: number;
  passe_baixo: number;
  passe_alto: number;
  acuracia_chute: number;
  forca_chute: number;
  controle_bola: number;
  um_toque: number;
};

type DummyAttrs = {
  drible: number;
  desarme: number;
  marcacao: number;
  antecipacao: number;
  controle_bola: number;
  forca: number;
  agilidade: number;
  tomada_decisao: number;
  um_toque: number;
};

type GoalkeeperAttrs = {
  reflexo: number;
  posicionamento_gol: number;
  um_contra_um: number;
  tempo_reacao: number;
  agilidade: number;
};

type FieldPoint = { x: number; y: number };

type GoalSide = "left" | "right";

type PreviewAction = {
  type: SoloActionType;
  from: FieldPoint;
  intendedTo: FieldPoint;
  actualTo: FieldPoint;
  deviationDist: number;
  overGoal: boolean;
};

type BallFlight = {
  type: SoloActionType;
  from: FieldPoint;
  to: FieldPoint;
  startAt: number;
  durationMs: number;
  arcHeight: number;
};

type DeviationResult = {
  actualX: number;
  actualY: number;
  deviationDist: number;
  overGoal: boolean;
};

type BallOwner = "player" | "dummy" | "goalkeeper" | "loose";

type ControlContext = SoloActionType | "loose";

type BallResolution = {
  kind:
    | "player_hold"
    | "dummy_hold"
    | "reception"
    | "control"
    | "duel_player"
    | "duel_dummy"
    | "collision_dummy"
    | "save"
    | "goal"
    | "loose";
  label: string;
  detail: string;
  owner: BallOwner;
};

const ACTION_LABELS: Record<SoloActionType, string> = {
  move: "Mover",
  tackle: "Desarmar",
  pass_low: "Passe rasteiro",
  pass_high: "Passe alto",
  pass_launch: "Lancamento",
  shoot_controlled: "Chute controlado",
  shoot_power: "Chute forte",
};

const FIELD_W = 900;
const FIELD_H = 580;
const PAD = 20;
const INNER_W = FIELD_W - PAD * 2;
const INNER_H = FIELD_H - PAD * 2;
const FIELD_Y_MOVEMENT_SCALE = INNER_H / INNER_W;
const GOAL_LINE_OVERFLOW_PCT = 0.12;
const DEFAULT_ERROR_SCALE = 100;
const SOLO_ATTACK_GOAL_SIDE: GoalSide = "right";
const GOALKEEPER_RESTART_DELAY_MS = 700;
const POST_ACTION_MOVE_RATIO = 0.2;
const DRIBBLE_CONTEST_RADIUS = 7.5;
const DRIBBLE_END_CONTEST_DIST = 6.5;
const TACKLE_ACTION_RANGE = 3.1;
const TACKLE_CONTACT_RADIUS = 2.35;
const TACKLE_END_CONTACT_DIST = 2.8;
const BODY_COLLISION_RADIUS = 2.15;
const TOUCH_CONTROL_RADIUS = 1.55;
const PASS_ACTIONS: SoloActionType[] = ["pass_low", "pass_high", "pass_launch"];

const DEFAULT_ATTRS: SoloAttrs = {
  velocidade: 60,
  aceleracao: 60,
  stamina: 60,
  forca: 60,
  drible: 60,
  agilidade: 60,
  desarme: 60,
  marcacao: 60,
  antecipacao: 60,
  passe_baixo: 60,
  passe_alto: 60,
  acuracia_chute: 60,
  forca_chute: 60,
  controle_bola: 60,
  um_toque: 60,
};

const DEFAULT_DUMMY_ATTRS: DummyAttrs = {
  drible: 58,
  desarme: 62,
  marcacao: 58,
  antecipacao: 55,
  controle_bola: 50,
  forca: 60,
  agilidade: 60,
  tomada_decisao: 56,
  um_toque: 52,
};

const DEFAULT_GOALKEEPER_ATTRS: GoalkeeperAttrs = {
  reflexo: 72,
  posicionamento_gol: 70,
  um_contra_um: 68,
  tempo_reacao: 74,
  agilidade: 66,
};

const DEFAULT_PLAYER_POS: FieldPoint = { x: 28, y: 50 };
const DEFAULT_DUMMY_POS: FieldPoint = { x: 62, y: 50 };
const DEFAULT_GOALKEEPER_POS: FieldPoint = { x: 96, y: 50 };
const DEFAULT_BALL_RESOLUTION: BallResolution = {
  kind: "player_hold",
  label: "Jogador com a bola",
  detail: "Estado inicial do laboratorio.",
  owner: "player",
};

const getGoalLineX = (side: GoalSide) => (side === "right" ? 96 : 4);
const getShotGoalTargetX = (side: GoalSide) => (side === "right" ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeAttr = (val: number) => Math.max(0, Math.min(1, (val - 10) / 89));
const isPassAction = (type: ControlContext) => PASS_ACTIONS.includes(type as SoloActionType);

function getBaseMoveRange(attrs: SoloAttrs) {
  const vel = Number(attrs.velocidade ?? 40);
  const accel = Number(attrs.aceleracao ?? 40);
  const stam = Number(attrs.stamina ?? 40);
  const force = Number(attrs.forca ?? 40);
  const baseRange = 8 + normalizeAttr(vel) * 17;
  const accelFactor = 0.6 + normalizeAttr(accel) * 0.4;
  const staminaFactor = 0.9 + normalizeAttr(stam) * 0.1;
  const forceFactor = 1.0 + normalizeAttr(force) * 0.1;

  return baseRange * accelFactor * staminaFactor * forceFactor;
}

function getExecutionSpeedLoad(lastMoveVector: FieldPoint | null, attrs: SoloAttrs) {
  if (!lastMoveVector) return 0;

  const stride = getMovementDistance(lastMoveVector.x, lastMoveVector.y);
  const baseMoveRange = getBaseMoveRange(attrs);
  const strideRatio = baseMoveRange > 0 ? stride / baseMoveRange : 0;

  return clamp((strideRatio - 0.45) / 0.55, 0, 1);
}

function getGoalkeeperHomePosition(side: GoalSide): FieldPoint {
  return {
    x: getGoalLineX(side),
    y: 50,
  };
}

function getFixedShotTarget(targetY: number) {
  return {
    x: getShotGoalTargetX(SOLO_ATTACK_GOAL_SIDE),
    y: clamp(targetY, 38, 62),
  };
}

function isShotOnTarget(type: SoloActionType, to: FieldPoint) {
  if (type !== "shoot_controlled" && type !== "shoot_power") return false;

  const defendingLineX = getGoalLineX(SOLO_ATTACK_GOAL_SIDE);
  const onGoalLine =
    SOLO_ATTACK_GOAL_SIDE === "right"
      ? to.x >= defendingLineX - 0.5
      : to.x <= defendingLineX + 0.5;

  return onGoalLine && to.y >= 38 && to.y <= 62;
}

function getGoalkeeperTarget(params: {
  side: GoalSide;
  goalkeeperPos: FieldPoint;
  ballPos: FieldPoint;
  ballFlight: BallFlight | null;
  attrs: GoalkeeperAttrs;
}) {
  const { side, goalkeeperPos, ballPos, ballFlight, attrs } = params;
  const home = getGoalkeeperHomePosition(side);
  const reaction = normalizeAttr(attrs.tempo_reacao);
  const positioning = normalizeAttr(attrs.posicionamento_gol);
  const agility = normalizeAttr(attrs.agilidade);
  const defendingGoalX = getGoalLineX(side);
  const ballThreat =
    side === "right"
      ? clamp((ballPos.x - 52) / 48, 0, 1)
      : clamp((48 - ballPos.x) / 48, 0, 1);
  const shotThreat = ballFlight && (ballFlight.type === "shoot_controlled" || ballFlight.type === "shoot_power") ? 0.22 : 0;
  const targetY = clamp(ballFlight && ballFlight.to.y >= 38 && ballFlight.to.y <= 62 ? ballFlight.to.y : ballPos.y, 38, 62);
  const lateralFollow = 0.25 + positioning * 0.25 + ballThreat * 0.25 + shotThreat;
  const y = clamp(home.y + (targetY - home.y) * lateralFollow, 38, 62);
  const advanceDepth = (2 + agility * 3 + reaction * 1.5) * (ballThreat + shotThreat);
  const x = side === "right" ? defendingGoalX - advanceDepth : defendingGoalX + advanceDepth;

  if (Math.abs(goalkeeperPos.x - x) < 0.05 && Math.abs(goalkeeperPos.y - y) < 0.05) {
    return goalkeeperPos;
  }

  return { x, y };
}

function getShotInterceptPoint(from: FieldPoint, to: FieldPoint, interceptX: number) {
  const deltaX = to.x - from.x;

  if (Math.abs(deltaX) < 0.001) {
    return {
      x: interceptX,
      y: to.y,
    };
  }

  const ratio = clamp((interceptX - from.x) / deltaX, 0, 1);
  return getPointAlongPath(from, to, ratio);
}

function computeGoalkeeperSaveChance(params: {
  actionType: SoloActionType;
  shooterAttrs: SoloAttrs;
  goalkeeperAttrs: GoalkeeperAttrs;
  goalkeeperPos: FieldPoint;
  shotFrom: FieldPoint;
  shotTarget: FieldPoint;
}) {
  const { actionType, shooterAttrs, goalkeeperAttrs, goalkeeperPos, shotFrom, shotTarget } = params;
  const shooterSkill =
    actionType === "shoot_power"
      ? normalizeAttr(shooterAttrs.forca_chute ?? 40) * 0.6 + normalizeAttr(shooterAttrs.acuracia_chute ?? 40) * 0.4
      : normalizeAttr(shooterAttrs.acuracia_chute ?? 40) * 0.7 + normalizeAttr(shooterAttrs.forca_chute ?? 40) * 0.3;
  const keeperSkill =
    normalizeAttr(goalkeeperAttrs.reflexo) * 0.3 +
    normalizeAttr(goalkeeperAttrs.posicionamento_gol) * 0.25 +
    normalizeAttr(goalkeeperAttrs.um_contra_um) * 0.25 +
    normalizeAttr(goalkeeperAttrs.tempo_reacao) * 0.2;
  const interceptPoint = getShotInterceptPoint(shotFrom, shotTarget, goalkeeperPos.x);
  const interceptDistance = getMovementDistance(interceptPoint.x - goalkeeperPos.x, interceptPoint.y - goalkeeperPos.y);
  const lateralReach = Math.abs(interceptPoint.y - goalkeeperPos.y);
  const positioningFactor = 1 - clamp(interceptDistance / 4.5, 0, 1);
  const reachFactor = 1 - clamp(lateralReach / 11, 0, 1);
  const shotPowerFactor = actionType === "shoot_power" ? 0.88 : 1;
  const baseCoverage = 0.26 + positioningFactor * 0.42 + reachFactor * 0.16;
  let chance = baseCoverage * (0.35 + keeperSkill * 0.65) * (1 - shooterSkill * 0.45) * shotPowerFactor;

  return clamp(chance, 0.05, 0.96);
}

function getGoalkeeperRestartTarget(params: {
  playerPos: FieldPoint;
  dummyPos: FieldPoint;
}) {
  const { playerPos, dummyPos } = params;
  const baseX = playerPos.x > 60 ? playerPos.x - 16 : playerPos.x + 8;
  let targetY = clamp(playerPos.y, 18, 82);

  if (Math.abs(dummyPos.x - baseX) < 12 && Math.abs(dummyPos.y - targetY) < 8) {
    targetY = clamp(targetY + (targetY <= 50 ? -12 : 12), 14, 86);
  }

  return {
    x: clamp(baseX, 28, 74),
    y: targetY,
  };
}

function getGoalkeeperRestartFlight(from: FieldPoint, to: FieldPoint, attrs: GoalkeeperAttrs) {
  const dist = getMovementDistance(to.x - from.x, to.y - from.y);
  const distributionSkill = normalizeAttr(attrs.agilidade) * 0.55 + normalizeAttr(attrs.tempo_reacao) * 0.45;

  return {
    durationMs: 520 + dist * (14 - distributionSkill * 4),
    arcHeight: 18 + distributionSkill * 14,
  };
}

function computeTackleSuccessChance(params: {
  distance: number;
  attrs: SoloAttrs;
  dummyAttrs: DummyAttrs;
  speedLoad: number;
}) {
  const { distance, attrs, dummyAttrs, speedLoad } = params;
  const tacklerSkill =
    normalizeAttr(attrs.desarme ?? 40) * 0.3 +
    normalizeAttr(attrs.marcacao ?? 40) * 0.25 +
    normalizeAttr(attrs.controle_bola ?? 40) * 0.2 +
    normalizeAttr(attrs.forca ?? 40) * 0.15 +
    normalizeAttr(attrs.antecipacao ?? 40) * 0.1;
  const ballHolderSkill =
    normalizeAttr(dummyAttrs.drible ?? 40) * 0.35 +
    normalizeAttr(dummyAttrs.controle_bola ?? 40) * 0.25 +
    normalizeAttr(dummyAttrs.forca ?? 40) * 0.2 +
    normalizeAttr(dummyAttrs.agilidade ?? 40) * 0.2;
  const proximity = 1 - clamp((distance - TOUCH_CONTROL_RADIUS) / Math.max(0.01, TACKLE_ACTION_RANGE - TOUCH_CONTROL_RADIUS), 0, 1);
  let chance = (0.42 + proximity * 0.24) * (0.5 + tacklerSkill * 0.5) * (1 - ballHolderSkill * 0.3);
  chance *= 1 - speedLoad * 0.28;

  return clamp(chance, 0.05, 0.92);
}

const toMovementSpace = (dx: number, dy: number) => ({
  x: dx,
  y: dy * FIELD_Y_MOVEMENT_SCALE,
});

const getMovementDistance = (dx: number, dy: number) => {
  const movementVec = toMovementSpace(dx, dy);
  return Math.hypot(movementVec.x, movementVec.y);
};

const getPointAlongPath = (from: FieldPoint, to: FieldPoint, ratio: number) => ({
  x: from.x + (to.x - from.x) * ratio,
  y: from.y + (to.y - from.y) * ratio,
});

const getDistanceToSegment = (point: FieldPoint, start: FieldPoint, end: FieldPoint) => {
  const a = toMovementSpace(start.x, start.y);
  const b = toMovementSpace(end.x, end.y);
  const p = toMovementSpace(point.x, point.y);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;

  if (abLenSq < 0.0001) {
    return {
      distance: Math.hypot(p.x - a.x, p.y - a.y),
      progress: 0,
    };
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const rawProgress = (apx * abx + apy * aby) / abLenSq;
  const progress = clamp(rawProgress, 0, 1);
  const closestX = a.x + abx * progress;
  const closestY = a.y + aby * progress;

  return {
    distance: Math.hypot(p.x - closestX, p.y - closestY),
    progress,
  };
};

const toSVG = (pctX: number, pctY: number) => ({
  x: PAD + (pctX / 100) * INNER_W,
  y: PAD + (pctY / 100) * INNER_H,
});

const toField = (svgX: number, svgY: number) => ({
  x: ((svgX - PAD) / INNER_W) * 100,
  y: ((svgY - PAD) / INNER_H) * 100,
});

function getActionColor(
  type: SoloActionType,
  from: FieldPoint,
  to: FieldPoint,
  attrs: SoloAttrs,
) {
  const dist = getMovementDistance(to.x - from.x, to.y - from.y);

  if (type === "move") {
    return { color: "#0f172a", label: "Movimento" };
  }

  let score = 0;

  if (type === "tackle") score = attrs.desarme * 0.4 + attrs.marcacao * 0.25 + attrs.antecipacao * 0.15 + attrs.forca * 0.1 + attrs.agilidade * 0.1 - dist * 14;
  if (type === "pass_low") score = attrs.passe_baixo - dist * 1.15;
  if (type === "pass_high") score = attrs.passe_alto - dist * 1.0;
  if (type === "pass_launch") score = attrs.passe_alto * 0.7 + attrs.forca * 0.3 - dist * 0.9;
  if (type === "shoot_controlled") score = attrs.acuracia_chute - dist * 0.85;
  if (type === "shoot_power") score = attrs.forca_chute - dist * 0.7;

  if (score >= 45) return { color: "#22c55e", label: "Boa" };
  if (score >= 20) return { color: "#f59e0b", label: "Media" };
  return { color: "#ef4444", label: "Ruim" };
}

function computeDeviation(
  targetX: number,
  targetY: number,
  startX: number,
  startY: number,
  actionType: SoloActionType,
  attrs: SoloAttrs,
  errorScale: number,
  speedLoad: number,
): DeviationResult {
  const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

  let difficultyMultiplier: number;
  let skillFactor: number;
  let labDeviationBoost: number;

  switch (actionType) {
    case "pass_low":
      difficultyMultiplier = 5;
      skillFactor = normalizeAttr(attrs.passe_baixo ?? 40);
      labDeviationBoost = 1.05;
      break;
    case "pass_high":
      difficultyMultiplier = 7;
      skillFactor = normalizeAttr(attrs.passe_alto ?? 40);
      labDeviationBoost = 1.25;
      break;
    case "pass_launch":
      difficultyMultiplier = 6;
      skillFactor = (normalizeAttr(attrs.passe_baixo ?? 40) + normalizeAttr(attrs.passe_alto ?? 40)) / 2;
      labDeviationBoost = 1.3;
      break;
    case "shoot_controlled":
      difficultyMultiplier = 4;
      skillFactor = normalizeAttr(attrs.acuracia_chute ?? 40);
      labDeviationBoost = 1.4;
      break;
    case "shoot_power":
      difficultyMultiplier = 8;
      skillFactor = (normalizeAttr(attrs.acuracia_chute ?? 40) + normalizeAttr(attrs.forca_chute ?? 40)) / 2;
      labDeviationBoost = 1.55;
      break;
    default:
      return { actualX: targetX, actualY: targetY, deviationDist: 0, overGoal: false };
  }

  const baseDifficulty = (dist / 100) * difficultyMultiplier;
  const speedPenalty = speedLoad * speedLoad;
  const easeBonus = actionType === "pass_low" ? 0.04 : 0;
  const perfectChanceBase = clamp(skillFactor * 0.96 - baseDifficulty * 0.03 - speedPenalty * 0.42 + easeBonus, 0.01, 0.9);
  const perfectChance = clamp(perfectChanceBase / (0.72 + errorScale * 0.28), 0.01, 0.9);

  if (Math.random() < perfectChance) {
    return { actualX: targetX, actualY: targetY, deviationDist: 0, overGoal: false };
  }

  const skillCurve = Math.pow(1 - skillFactor, 1.8);
  const minimumDeviationBase = Math.max(0, 2.6 - skillFactor * 2.2) + speedPenalty * (0.9 + difficultyMultiplier * 0.12);
  const minimumDeviation = actionType === "pass_low" ? minimumDeviationBase * 0.82 : minimumDeviationBase;
  let actionVariance = 0.95 + Math.random() * 0.75;

  if (actionType === "pass_low") {
    const harshErrorChance = 0.04 + speedPenalty * 0.12 + Math.max(0, 0.45 - skillFactor) * 0.18;
    actionVariance = 0.68 + Math.pow(Math.random(), 2.3) * 0.34;

    if (Math.random() < harshErrorChance) {
      actionVariance = 1.02 + Math.random() * 0.38;
    }
  }

  const deviationRadius =
    (baseDifficulty * skillCurve + minimumDeviation) *
    labDeviationBoost *
    errorScale *
    (1 + speedPenalty * 0.9) *
    actionVariance;
  const angle = Math.random() * 2 * Math.PI;
  let actualX = targetX + Math.cos(angle) * deviationRadius;
  let actualY = targetY + Math.sin(angle) * deviationRadius;

  let overGoal = false;
  if (actionType === "shoot_power" && deviationRadius > 1.0) {
    if (actualY >= 38 && actualY <= 62) {
      actualY = Math.random() > 0.5 ? 35 - Math.random() * 5 : 65 + Math.random() * 5;
      overGoal = true;
    }
  }

  actualX = Math.max(0, Math.min(100, actualX));
  actualY = Math.max(0, Math.min(100, actualY));

  const deviationDist = Math.sqrt((actualX - targetX) ** 2 + (actualY - targetY) ** 2);

  return { actualX, actualY, deviationDist, overGoal };
}

function getBallFlightConfig(type: SoloActionType, from: FieldPoint, to: FieldPoint, attrs: SoloAttrs) {
  const dist = getMovementDistance(to.x - from.x, to.y - from.y);

  if (type === "pass_low") {
    return {
      durationMs: 420 + dist * (19 - normalizeAttr(attrs.passe_baixo) * 5),
      arcHeight: 0,
    };
  }

  if (type === "pass_high") {
    return {
      durationMs: 620 + dist * (20 - normalizeAttr(attrs.passe_alto) * 4),
      arcHeight: 22 + normalizeAttr(attrs.passe_alto) * 18,
    };
  }

  if (type === "pass_launch") {
    return {
      durationMs: 760 + dist * (22 - normalizeAttr(attrs.passe_alto) * 5),
      arcHeight: 34 + normalizeAttr(attrs.forca) * 26,
    };
  }

  if (type === "shoot_controlled") {
    return {
      durationMs: 380 + dist * (12 - normalizeAttr(attrs.acuracia_chute) * 2),
      arcHeight: 10 + normalizeAttr(attrs.acuracia_chute) * 8,
    };
  }

  if (type === "shoot_power") {
    return {
      durationMs: 260 + dist * (8 - normalizeAttr(attrs.forca_chute) * 2),
      arcHeight: 6 + normalizeAttr(attrs.forca_chute) * 5,
    };
  }

  return {
    durationMs: 0,
    arcHeight: 0,
  };
}

function getPlayerControlRadius(context: ControlContext, attrs: SoloAttrs) {
  const control = normalizeAttr(attrs.controle_bola);
  const oneTouch = normalizeAttr(attrs.um_toque);
  const touchBonus =
    context === "pass_high" || context === "pass_launch"
      ? control * 0.14 + oneTouch * 0.2
      : control * 0.18 + oneTouch * 0.12;

  return TOUCH_CONTROL_RADIUS + touchBonus;
}

function getDummyControlRadius(context: ControlContext, dummyAttrs: DummyAttrs) {
  const control = normalizeAttr(dummyAttrs.controle_bola);
  const oneTouch = normalizeAttr(dummyAttrs.um_toque);
  const touchBonus =
    context === "pass_high" || context === "pass_launch"
      ? control * 0.12 + oneTouch * 0.18
      : control * 0.16 + oneTouch * 0.1;

  return TOUCH_CONTROL_RADIUS + touchBonus;
}

function getPlayerContestScore(
  playerDist: number,
  playerRadius: number,
  context: ControlContext,
  attrs: SoloAttrs,
  currentOwner: BallOwner,
) {
  const control = normalizeAttr(attrs.controle_bola);
  const oneTouch = normalizeAttr(attrs.um_toque);
  const accel = normalizeAttr(attrs.aceleracao);
  const strength = normalizeAttr(attrs.forca);
  const reach = Math.max(0, playerRadius - playerDist);
  const skillBase =
    context === "loose"
      ? control * 0.45 + accel * 0.25 + strength * 0.15 + oneTouch * 0.15
      : control * 0.45 + oneTouch * 0.35 + strength * 0.1 + accel * 0.1;

  return reach * 1.8 + skillBase * 6 + (currentOwner === "player" ? 0.9 : 0);
}

function getDummyContestScore(
  dummyDist: number,
  dummyRadius: number,
  context: ControlContext,
  currentOwner: BallOwner,
  dummyAttrs: DummyAttrs,
) {
  const reach = Math.max(0, dummyRadius - dummyDist);
  const control = normalizeAttr(dummyAttrs.controle_bola);
  const oneTouch = normalizeAttr(dummyAttrs.um_toque);
  const decision = normalizeAttr(dummyAttrs.tomada_decisao);
  const anticipation = normalizeAttr(dummyAttrs.antecipacao);
  const fixedSkill =
    context === "loose"
      ? control * 0.35 + anticipation * 0.35 + decision * 0.2 + oneTouch * 0.1
      : control * 0.35 + oneTouch * 0.3 + decision * 0.2 + anticipation * 0.15;

  return reach * 1.8 + fixedSkill * 6 + (currentOwner === "dummy" ? 1.0 : 0);
}

function resolveBallOwnership(params: {
  landing: FieldPoint;
  context: ControlContext;
  playerPos: FieldPoint;
  dummyPos: FieldPoint;
  attrs: SoloAttrs;
  dummyAttrs: DummyAttrs;
  currentOwner: BallOwner;
}) {
  const { landing, context, playerPos, dummyPos, attrs, dummyAttrs, currentOwner } = params;
  const playerRadius = getPlayerControlRadius(context, attrs);
  const dummyRadius = getDummyControlRadius(context, dummyAttrs);
  const playerDist = getMovementDistance(landing.x - playerPos.x, landing.y - playerPos.y);
  const dummyDist = getMovementDistance(landing.x - dummyPos.x, landing.y - dummyPos.y);
  const playerCanControl = playerDist <= playerRadius;
  const dummyCanControl = dummyDist <= dummyRadius;
  const passContext = isPassAction(context);

  if (playerCanControl && dummyCanControl) {
    const playerScore = getPlayerContestScore(playerDist, playerRadius, context, attrs, currentOwner);
    const dummyScore = getDummyContestScore(dummyDist, dummyRadius, context, currentOwner, dummyAttrs);

    if (playerScore >= dummyScore) {
      return {
        owner: "player" as const,
        ballPos: playerPos,
        resolution: {
          kind: "duel_player" as const,
          label: "Disputa vencida",
          detail: passContext ? "Recepcao sob pressao contra o boneco." : "Jogador dominou a sobra em disputa.",
          owner: "player" as const,
        },
      };
    }

    return {
      owner: "dummy" as const,
      ballPos: dummyPos,
      resolution: {
        kind: "duel_dummy" as const,
        label: "Disputa perdida",
        detail: "O boneco ficou com a bola na disputa.",
        owner: "dummy" as const,
      },
    };
  }

  if (playerCanControl) {
    return {
      owner: "player" as const,
      ballPos: playerPos,
      resolution: {
        kind: passContext ? ("reception" as const) : ("control" as const),
        label: passContext ? "Recepcao limpa" : "Dominio limpo",
        detail: passContext ? "Jogador amortizou a bola sem disputa." : "Jogador dominou a bola solta.",
        owner: "player" as const,
      },
    };
  }

  if (dummyCanControl) {
    return {
      owner: "dummy" as const,
      ballPos: dummyPos,
      resolution: {
        kind: "dummy_hold" as const,
        label: passContext ? "Boneco interceptou" : "Boneco dominou",
        detail: passContext ? "A bola caiu no raio de recepcao do boneco." : "O boneco ficou com a sobra.",
        owner: "dummy" as const,
      },
    };
  }

  return {
    owner: "loose" as const,
    ballPos: landing,
    resolution: {
      kind: "loose" as const,
      label: "Bola solta",
      detail: "Ninguem ficou em raio de dominio.",
      owner: "loose" as const,
    },
  };
}

function resolveDribbleAttempt(params: {
  from: FieldPoint;
  to: FieldPoint;
  dummyPos: FieldPoint;
  attrs: SoloAttrs;
  dummyAttrs: DummyAttrs;
  errorScalePct: number;
}) {
  const { from, to, dummyPos, attrs, dummyAttrs, errorScalePct } = params;
  const pathInfo = getDistanceToSegment(dummyPos, from, to);
  const endDist = getMovementDistance(to.x - dummyPos.x, to.y - dummyPos.y);

  if (pathInfo.distance > DRIBBLE_CONTEST_RADIUS && endDist > DRIBBLE_END_CONTEST_DIST) {
    return {
      success: true,
      endPos: to,
      ballOwner: "player" as const,
      ballPos: to,
      resolution: {
        kind: "player_hold" as const,
        label: "Drible livre",
        detail: "O boneco nao entrou no raio de desarme.",
        owner: "player" as const,
      },
    };
  }

  const attackerSkill =
    normalizeAttr(attrs.drible ?? 40) * 0.35 +
    normalizeAttr(attrs.controle_bola ?? 40) * 0.25 +
    normalizeAttr(attrs.forca ?? 40) * 0.2 +
    normalizeAttr(attrs.agilidade ?? 40) * 0.2;
  const defenderSkill =
    normalizeAttr(dummyAttrs.desarme) * 0.3 +
    normalizeAttr(dummyAttrs.marcacao) * 0.25 +
    normalizeAttr(dummyAttrs.controle_bola) * 0.2 +
    normalizeAttr(dummyAttrs.forca) * 0.15 +
    normalizeAttr(dummyAttrs.antecipacao) * 0.1;
  const tackleTouch =
    pathInfo.distance <= TACKLE_CONTACT_RADIUS || endDist <= TACKLE_END_CONTACT_DIST;
  const pathPressure = tackleTouch ? 1 - clamp(pathInfo.distance / TACKLE_CONTACT_RADIUS, 0, 1) : 0;
  const endPressure = tackleTouch ? 1 - clamp(endDist / TACKLE_END_CONTACT_DIST, 0, 1) : 0;
  const bodyOverlap = 1 - clamp(pathInfo.distance / BODY_COLLISION_RADIUS, 0, 1);
  const collisionSkill = normalizeAttr(attrs.drible) * 0.35 + normalizeAttr(attrs.agilidade) * 0.35 + normalizeAttr(attrs.controle_bola) * 0.3;

  let tackleChance = 0;

  if (tackleTouch) {
    tackleChance = (0.12 + pathPressure * 0.42 + endPressure * 0.16) * (0.5 + defenderSkill * 0.5) * (1 - attackerSkill * 0.3);
    tackleChance *= 0.75 + (errorScalePct / 100) * 0.25;
    tackleChance = clamp(tackleChance, 0.02, 0.95);
  }

  let bodyCollisionChance =
    (0.04 + bodyOverlap * 0.18 + endPressure * 0.05) *
    (0.6 + normalizeAttr(dummyAttrs.forca) * 0.4) *
    (1 - collisionSkill * 0.45);
  bodyCollisionChance *= 0.85 + (errorScalePct / 100) * 0.15;
  bodyCollisionChance = bodyOverlap > 0 ? clamp(bodyCollisionChance, 0.02, 0.24) : 0;

  if (tackleChance > 0 && Math.random() < tackleChance) {
    const stopProgress = clamp(pathInfo.progress - 0.08, 0.15, 0.85);
    const stoppedPos = getPointAlongPath(from, to, stopProgress);
    return {
      success: false,
      endPos: stoppedPos,
      ballOwner: "dummy" as const,
      ballPos: dummyPos,
      resolution: {
        kind: "duel_dummy" as const,
        label: "Drible travado",
        detail: `O boneco roubou a bola. Chance de desarme: ${Math.round(tackleChance * 100)}%.`,
        owner: "dummy" as const,
      },
    };
  }

  if (bodyCollisionChance > 0 && Math.random() < bodyCollisionChance) {
    const stopProgress = clamp(pathInfo.progress - 0.04, 0.18, 0.92);
    const stoppedPos = getPointAlongPath(from, to, stopProgress);
    return {
      success: false,
      endPos: stoppedPos,
      ballOwner: "dummy" as const,
      ballPos: dummyPos,
      resolution: {
        kind: "collision_dummy" as const,
        label: "Choque corporal",
        detail: `O jogador tentou atravessar o boneco e perdeu a bola. Chance de choque: ${Math.round(bodyCollisionChance * 100)}%.`,
        owner: "dummy" as const,
      },
    };
  }

  return {
    success: true,
    endPos: to,
    ballOwner: "player" as const,
    ballPos: to,
    resolution: {
      kind: "duel_player" as const,
      label: "Drible bem-sucedido",
      detail: `Jogador passou pelo boneco. Chance de desarme evitada: ${Math.round(tackleChance * 100)}%.`,
      owner: "player" as const,
    },
  };
}

function resolveTackleAttempt(params: {
  playerPos: FieldPoint;
  dummyPos: FieldPoint;
  attrs: SoloAttrs;
  dummyAttrs: DummyAttrs;
  speedLoad: number;
}) {
  const { playerPos, dummyPos, attrs, dummyAttrs, speedLoad } = params;
  const distance = getMovementDistance(dummyPos.x - playerPos.x, dummyPos.y - playerPos.y);

  if (distance > TACKLE_ACTION_RANGE) {
    return {
      success: false,
      ballOwner: "dummy" as const,
      ballPos: dummyPos,
      resolution: {
        kind: "dummy_hold" as const,
        label: "Fora do alcance",
        detail: "Aproxime mais o jogador para tentar o desarme.",
        owner: "dummy" as const,
      },
    };
  }

  const tackleChance = computeTackleSuccessChance({
    distance,
    attrs,
    dummyAttrs,
    speedLoad,
  });

  if (Math.random() < tackleChance) {
    return {
      success: true,
      ballOwner: "player" as const,
      ballPos: playerPos,
      resolution: {
        kind: "duel_player" as const,
        label: "Desarme bem-sucedido",
        detail: `Jogador roubou a bola. Chance de desarme: ${Math.round(tackleChance * 100)}%.`,
        owner: "player" as const,
      },
    };
  }

  return {
    success: false,
    ballOwner: "dummy" as const,
    ballPos: dummyPos,
    resolution: {
      kind: "duel_dummy" as const,
      label: "Desarme falhou",
      detail: `O boneco protegeu a bola. Chance de desarme: ${Math.round(tackleChance * 100)}%.`,
      owner: "dummy" as const,
    },
  };
}

function shouldResolveDribbleContest(from: FieldPoint, to: FieldPoint, dummyPos: FieldPoint) {
  const pathInfo = getDistanceToSegment(dummyPos, from, to);
  const endDist = getMovementDistance(to.x - dummyPos.x, to.y - dummyPos.y);

  return pathInfo.distance <= DRIBBLE_CONTEST_RADIUS || endDist <= DRIBBLE_END_CONTEST_DIST;
}

export default function SoloPhysicsLabPage() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);

  const [attrs, setAttrs] = useState<SoloAttrs>(DEFAULT_ATTRS);
  const [dummyAttrs, setDummyAttrs] = useState<DummyAttrs>(DEFAULT_DUMMY_ATTRS);
  const [goalkeeperAttrs, setGoalkeeperAttrs] = useState<GoalkeeperAttrs>(DEFAULT_GOALKEEPER_ATTRS);
  const [goalkeeperEnabled, setGoalkeeperEnabled] = useState(false);
  const [playerPos, setPlayerPos] = useState<FieldPoint>(DEFAULT_PLAYER_POS);
  const [dummyPos, setDummyPos] = useState<FieldPoint>(DEFAULT_DUMMY_POS);
  const [goalkeeperPos, setGoalkeeperPos] = useState<FieldPoint>(DEFAULT_GOALKEEPER_POS);
  const [lastMoveVector, setLastMoveVector] = useState<FieldPoint | null>(null);
  const [selectedAction, setSelectedAction] = useState<SoloActionType>("move");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [mouseFieldPct, setMouseFieldPct] = useState<FieldPoint | null>(null);
  const [committedAction, setCommittedAction] = useState<PreviewAction | null>(null);
  const [ballPos, setBallPos] = useState<FieldPoint>(DEFAULT_PLAYER_POS);
  const [ballOwner, setBallOwner] = useState<BallOwner>("player");
  const [ballFlight, setBallFlight] = useState<BallFlight | null>(null);
  const [ballFlightProgress, setBallFlightProgress] = useState(0);
  const [errorScalePct, setErrorScalePct] = useState(DEFAULT_ERROR_SCALE);
  const [lastResolution, setLastResolution] = useState<BallResolution>(DEFAULT_BALL_RESOLUTION);
  const [postActionMoveAvailable, setPostActionMoveAvailable] = useState(false);
  const playerPosRef = useRef(playerPos);
  const dummyPosRef = useRef(dummyPos);
  const goalkeeperPosRef = useRef(goalkeeperPos);
  const attrsRef = useRef(attrs);
  const dummyAttrsRef = useRef(dummyAttrs);
  const goalkeeperAttrsRef = useRef(goalkeeperAttrs);
  const ballOwnerRef = useRef(ballOwner);
  const ballFlightRef = useRef<BallFlight | null>(ballFlight);
  const liveBallPosRef = useRef<FieldPoint>(DEFAULT_PLAYER_POS);
  const goalkeeperRestartTimeoutRef = useRef<number | null>(null);
  const playerControlsBall = ballOwner === "player" && !ballFlight;
  const dummyControlsBall = ballOwner === "dummy" && !ballFlight;
  const goalkeeperControlsBall = ballOwner === "goalkeeper" && !ballFlight;

  playerPosRef.current = playerPos;
  dummyPosRef.current = dummyPos;
  goalkeeperPosRef.current = goalkeeperPos;
  attrsRef.current = attrs;
  dummyAttrsRef.current = dummyAttrs;
  goalkeeperAttrsRef.current = goalkeeperAttrs;
  ballOwnerRef.current = ballOwner;
  ballFlightRef.current = ballFlight;

  const computeMaxMoveRange = (targetDirection?: FieldPoint) => {
    const vel = Number(attrs.velocidade ?? 40);
    const accel = Number(attrs.aceleracao ?? 40);
    const stam = Number(attrs.stamina ?? 40);
    const force = Number(attrs.forca ?? 40);
    const baseRange = 8 + normalizeAttr(vel) * 17;
    const accelFactor = 0.6 + normalizeAttr(accel) * 0.4;
    const staminaFactor = 0.9 + normalizeAttr(stam) * 0.1;
    const forceFactor = 1.0 + normalizeAttr(force) * 0.1;
    let range = baseRange * accelFactor * staminaFactor * forceFactor;

    if (targetDirection && lastMoveVector) {
      const prevVec = toMovementSpace(lastMoveVector.x, lastMoveVector.y);
      const curVec = toMovementSpace(targetDirection.x, targetDirection.y);
      const prevLen = Math.hypot(prevVec.x, prevVec.y);
      const curLen = Math.hypot(curVec.x, curVec.y);

      if (prevLen > 0.1 && curLen > 0.1) {
        const dot = (prevVec.x * curVec.x + prevVec.y * curVec.y) / (prevLen * curLen);
        const angleDiff = Math.acos(Math.max(-1, Math.min(1, dot)));
        const normalizedAngle = angleDiff / Math.PI;
        const multiplier = 1.2 - 0.7 * normalizedAngle;
        range *= multiplier;
      }
    }

    return range;
  };

  const idleMoveRange = useMemo(() => computeMaxMoveRange(), [attrs, lastMoveVector]);
  const currentMoveRangeRatio = postActionMoveAvailable ? POST_ACTION_MOVE_RATIO : 1;
  const displayedMoveRange = idleMoveRange * currentMoveRangeRatio;

  useEffect(() => {
    if (selectedAction === "tackle" && !dummyControlsBall) {
      setSelectedAction("move");
      return;
    }

    if (selectedAction !== "move" && selectedAction !== "tackle" && !playerControlsBall) {
      setSelectedAction("move");
    }
  }, [dummyControlsBall, playerControlsBall, selectedAction]);

  const previewTarget = useMemo(() => {
    if (selectedAction === "tackle") return dummyPos;
    if (!mouseFieldPct) return null;
    if (selectedAction === "shoot_controlled" || selectedAction === "shoot_power") {
      return getFixedShotTarget(mouseFieldPct.y);
    }
    return mouseFieldPct;
  }, [dummyPos, mouseFieldPct, selectedAction]);

  const actionOrigin = playerPos;

  const previewMeta = useMemo(() => {
    if (!previewTarget) return null;
    return getActionColor(selectedAction, actionOrigin, previewTarget, attrs);
  }, [actionOrigin, attrs, previewTarget, selectedAction]);
  const actionExecutionSpeedLoad = useMemo(
    () => (selectedAction === "move" ? 0 : getExecutionSpeedLoad(lastMoveVector, attrs)),
    [attrs, lastMoveVector, selectedAction],
  );
  const movementDebug = useMemo(() => {
    const speedAttr = Number(attrs.velocidade ?? 40);
    const accelAttr = Number(attrs.aceleracao ?? 40);
    const staminaAttr = Number(attrs.stamina ?? 40);
    const strengthAttr = Number(attrs.forca ?? 40);
    const speedNorm = normalizeAttr(speedAttr);
    const accelNorm = normalizeAttr(accelAttr);
    const staminaNorm = normalizeAttr(staminaAttr);
    const strengthNorm = normalizeAttr(strengthAttr);
    const baseSpeed = 8 + speedNorm * 17;
    const accelFactor = 0.6 + accelNorm * 0.4;
    const staminaFactor = 0.9 + staminaNorm * 0.1;
    const strengthFactor = 1.0 + strengthNorm * 0.1;
    const baseMoveRange = baseSpeed * accelFactor * staminaFactor * strengthFactor;
    const lastStride = lastMoveVector ? getMovementDistance(lastMoveVector.x, lastMoveVector.y) : 0;
    const previewVector =
      selectedAction === "move" && previewTarget
        ? {
            x: previewTarget.x - playerPos.x,
            y: previewTarget.y - playerPos.y,
          }
        : null;
    const previewStride = previewVector ? getMovementDistance(previewVector.x, previewVector.y) : 0;
    const previewMaxRange = previewVector ? computeMaxMoveRange(previewVector) : baseMoveRange;
    const directionalMultiplier = baseMoveRange > 0 ? previewMaxRange / baseMoveRange : 1;

    return {
      speedAttr,
      accelAttr,
      speedNorm,
      accelNorm,
      baseSpeed,
      accelFactor,
      staminaFactor,
      strengthFactor,
      baseMoveRange,
      lastStride,
      previewStride,
      previewMaxRange,
      directionalMultiplier,
    };
  }, [attrs, computeMaxMoveRange, lastMoveVector, playerPos.x, playerPos.y, previewTarget, selectedAction]);
  const availableActions = useMemo(
    () =>
      (Object.keys(ACTION_LABELS) as SoloActionType[]).filter((action) => {
        if (action === "tackle") return dummyControlsBall;
        if (action !== "move" && !playerControlsBall) return false;
        return true;
      }),
    [dummyControlsBall, playerControlsBall],
  );

  const moveEllipse = useMemo(() => {
    const center = toSVG(playerPos.x, playerPos.y);
    return {
      cx: center.x,
      cy: center.y,
      rx: (displayedMoveRange / 100) * INNER_W,
      ry: ((displayedMoveRange / FIELD_Y_MOVEMENT_SCALE) / 100) * INNER_H,
    };
  }, [displayedMoveRange, playerPos.x, playerPos.y]);

  const updateAttr = (key: keyof SoloAttrs, value: number[]) => {
    setAttrs((prev) => ({ ...prev, [key]: value[0] ?? prev[key] }));
  };

  const updateDummyAttr = (key: keyof DummyAttrs, value: number[]) => {
    setDummyAttrs((prev) => ({ ...prev, [key]: value[0] ?? prev[key] }));
  };

  const updateGoalkeeperAttr = (key: keyof GoalkeeperAttrs, value: number[]) => {
    setGoalkeeperAttrs((prev) => ({ ...prev, [key]: value[0] ?? prev[key] }));
  };

  const updateDummyAxis = (axis: keyof FieldPoint, value: number[]) => {
    const nextValue = value[0] ?? dummyPos[axis];
    const nextDummyPos = { ...dummyPos, [axis]: nextValue };
    setDummyPos(nextDummyPos);

    if (ballOwner === "dummy" && !ballFlight) {
      setBallPos(nextDummyPos);
    }
  };

  const applyResolution = (result: ReturnType<typeof resolveBallOwnership>) => {
    setBallOwner(result.owner);
    setBallPos(result.ballPos);
    setLastResolution(result.resolution);
  };

  const toggleGoalkeeper = () => {
    setGoalkeeperEnabled((prev) => {
      const next = !prev;

      if (!next && ballOwner === "goalkeeper") {
        setBallOwner("loose");
        setBallPos(goalkeeperPos);
        setLastResolution({
          kind: "loose",
          label: "Goleiro removido",
          detail: "A bola ficou solta onde o goleiro estava.",
          owner: "loose",
        });
      }

      if (next) {
        setGoalkeeperPos(getGoalkeeperHomePosition(SOLO_ATTACK_GOAL_SIDE));
      }

      setShowActionMenu(false);
      return next;
    });
  };

  const resetPlayer = () => {
    setAttrs(DEFAULT_ATTRS);
    setDummyAttrs(DEFAULT_DUMMY_ATTRS);
    setGoalkeeperAttrs(DEFAULT_GOALKEEPER_ATTRS);
    setPlayerPos(DEFAULT_PLAYER_POS);
    setDummyPos(DEFAULT_DUMMY_POS);
    setGoalkeeperPos(getGoalkeeperHomePosition(SOLO_ATTACK_GOAL_SIDE));
    setLastMoveVector(null);
    setShowActionMenu(false);
    setMouseFieldPct(null);
    setCommittedAction(null);
    setSelectedAction("move");
    setBallPos(DEFAULT_PLAYER_POS);
    setBallOwner("player");
    setBallFlight(null);
    setBallFlightProgress(0);
    setErrorScalePct(DEFAULT_ERROR_SCALE);
    setLastResolution(DEFAULT_BALL_RESOLUTION);
    setPostActionMoveAvailable(false);
  };

  const clearInertia = () => setLastMoveVector(null);

  const placeBallOnPlayer = () => {
    setShowActionMenu(false);
    setBallPos(playerPos);
    setBallOwner("player");
    setBallFlight(null);
    setBallFlightProgress(0);
    setPostActionMoveAvailable(false);
    setLastResolution({
      kind: "player_hold",
      label: "Jogador com a bola",
      detail: "Bola reposicionada manualmente no jogador.",
      owner: "player",
    });
  };

  const placeBallOnDummy = () => {
    setShowActionMenu(false);
    setBallPos(dummyPos);
    setBallOwner("dummy");
    setBallFlight(null);
    setBallFlightProgress(0);
    setPostActionMoveAvailable(false);
    setLastResolution({
      kind: "dummy_hold",
      label: "Boneco com a bola",
      detail: "Bola reposicionada manualmente no boneco.",
      owner: "dummy",
    });
  };

  const dropBallLoose = () => {
    setShowActionMenu(false);
    const loosePos =
      ballOwner === "player"
        ? playerPos
        : ballOwner === "dummy"
          ? dummyPos
          : ballOwner === "goalkeeper"
            ? goalkeeperPos
            : ballPos;
    setBallPos(loosePos);
    setBallOwner("loose");
    setBallFlight(null);
    setBallFlightProgress(0);
    setPostActionMoveAvailable(false);
    setLastResolution({
      kind: "loose",
      label: "Bola solta",
      detail: "Bola solta manualmente para testar dominio.",
      owner: "loose",
    });
  };

  useEffect(() => {
    if (!ballFlight) return;

    let frameId = 0;

    const tick = (now: number) => {
      const progress = clamp((now - ballFlight.startAt) / ballFlight.durationMs, 0, 1);
      setBallFlightProgress(progress);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
        return;
      }

      const shotOnTarget = isShotOnTarget(ballFlight.type, ballFlight.to);

      if (shotOnTarget) {
        if (goalkeeperEnabled) {
          const saveChance = computeGoalkeeperSaveChance({
            actionType: ballFlight.type,
            shooterAttrs: attrsRef.current,
            goalkeeperAttrs: goalkeeperAttrsRef.current,
            goalkeeperPos: goalkeeperPosRef.current,
            shotFrom: ballFlight.from,
            shotTarget: ballFlight.to,
          });

          if (Math.random() < saveChance) {
            setBallOwner("goalkeeper");
            setBallPos(goalkeeperPosRef.current);
            setLastResolution({
              kind: "save",
              label: "Defesa do goleiro",
              detail: `O goleiro defendeu o chute. Chance de defesa: ${Math.round(saveChance * 100)}%.`,
              owner: "goalkeeper",
            });
            setBallFlight(null);
            setBallFlightProgress(0);
            return;
          }

          setBallOwner("loose");
          setBallPos(ballFlight.to);
          setLastResolution({
            kind: "goal",
            label: "Gol",
            detail: `O chute venceu o goleiro. Chance de defesa: ${Math.round(saveChance * 100)}%.`,
            owner: "loose",
          });
          setBallFlight(null);
          setBallFlightProgress(0);
          return;
        }

        setBallOwner("loose");
        setBallPos(ballFlight.to);
        setLastResolution({
          kind: "goal",
          label: "Gol",
          detail: "O chute entrou direto porque nao havia defesa no lance.",
          owner: "loose",
        });
        setBallFlight(null);
        setBallFlightProgress(0);
        return;
      }

      const resolved = resolveBallOwnership({
        landing: ballFlight.to,
        context: ballFlight.type,
        playerPos: playerPosRef.current,
        dummyPos: dummyPosRef.current,
        attrs: attrsRef.current,
        dummyAttrs: dummyAttrsRef.current,
        currentOwner: ballOwnerRef.current,
      });
      applyResolution(resolved);
      setBallFlight(null);
      setBallFlightProgress(0);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [ballFlight, goalkeeperEnabled]);

  useEffect(() => {
    if (goalkeeperRestartTimeoutRef.current !== null) {
      window.clearTimeout(goalkeeperRestartTimeoutRef.current);
      goalkeeperRestartTimeoutRef.current = null;
    }

    if (!goalkeeperEnabled || ballOwner !== "goalkeeper" || ballFlight) {
      return;
    }

    goalkeeperRestartTimeoutRef.current = window.setTimeout(() => {
      if (!goalkeeperEnabled || ballOwnerRef.current !== "goalkeeper" || ballFlightRef.current) {
        return;
      }

      const from = goalkeeperPosRef.current;
      const target = getGoalkeeperRestartTarget({
        playerPos: playerPosRef.current,
        dummyPos: dummyPosRef.current,
      });
      const flight = getGoalkeeperRestartFlight(from, target, goalkeeperAttrsRef.current);

      setCommittedAction({
        type: "pass_launch",
        from,
        intendedTo: target,
        actualTo: target,
        deviationDist: 0,
        overGoal: false,
      });
      setBallOwner("loose");
      setBallPos(from);
      setBallFlightProgress(0);
      setBallFlight({
        type: "pass_launch",
        from,
        to: target,
        startAt: performance.now(),
        durationMs: flight.durationMs,
        arcHeight: flight.arcHeight,
      });
      setLastResolution({
        kind: "loose",
        label: "Reposicao do goleiro",
        detail: "O goleiro segurou e relancou a bola para reiniciar a jogada.",
        owner: "loose",
      });
    }, GOALKEEPER_RESTART_DELAY_MS);

    return () => {
      if (goalkeeperRestartTimeoutRef.current !== null) {
        window.clearTimeout(goalkeeperRestartTimeoutRef.current);
        goalkeeperRestartTimeoutRef.current = null;
      }
    };
  }, [ballFlight, ballOwner, goalkeeperEnabled]);

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;
    const svgX = ((e.clientX - rect.left) / rect.width) * totalW;
    const svgY = ((e.clientY - rect.top) / rect.height) * totalH;
    const fp = toField(svgX, svgY);
    let finalX = clamp(fp.x, 0, 100);
    let finalY = clamp(fp.y, 0, 100);

    if (selectedAction === "move") {
      const dx = finalX - playerPos.x;
      const dy = finalY - playerPos.y;
      const dist = getMovementDistance(dx, dy);
      const maxRange = computeMaxMoveRange(dist > 0.1 ? { x: dx, y: dy } : undefined) * currentMoveRangeRatio;

      if (dist > maxRange) {
        const scale = maxRange / dist;
        finalX = playerPos.x + dx * scale;
        finalY = playerPos.y + dy * scale;
      }
    }

    setMouseFieldPct({ x: finalX, y: finalY });
  };

  const handleSvgClick = () => {
    if (showActionMenu) {
      setShowActionMenu(false);
      return;
    }

    if (!previewTarget) return;

    if (selectedAction === "move") {
      if (playerControlsBall && shouldResolveDribbleContest(playerPos, previewTarget, dummyPos)) {
        const dribble = resolveDribbleAttempt({
          from: playerPos,
          to: previewTarget,
          dummyPos,
          attrs,
          dummyAttrs,
          errorScalePct,
        });
        const nextAction: PreviewAction = {
          type: "move",
          from: actionOrigin,
          intendedTo: previewTarget,
          actualTo: dribble.endPos,
          deviationDist: getMovementDistance(previewTarget.x - dribble.endPos.x, previewTarget.y - dribble.endPos.y),
          overGoal: false,
        };
        const dx = dribble.endPos.x - playerPos.x;
        const dy = dribble.endPos.y - playerPos.y;

        setPlayerPos(dribble.endPos);
        setBallOwner(dribble.ballOwner);
        setBallPos(dribble.ballPos);
        setLastResolution(dribble.resolution);
        setCommittedAction(nextAction);

        if (getMovementDistance(dx, dy) > 0.5) {
          setLastMoveVector({ x: dx, y: dy });
        } else {
          setLastMoveVector(null);
        }
        if (postActionMoveAvailable) {
          setPostActionMoveAvailable(false);
        }
        return;
      }

      const nextAction: PreviewAction = {
        type: selectedAction,
        from: actionOrigin,
        intendedTo: previewTarget,
        actualTo: previewTarget,
        deviationDist: 0,
        overGoal: false,
      };
      const dx = previewTarget.x - playerPos.x;
      const dy = previewTarget.y - playerPos.y;
      const nextPlayerPos = previewTarget;
      setPlayerPos(nextPlayerPos);

      if (ballOwner === "player") {
        setBallPos(nextPlayerPos);
        setLastResolution({
          kind: "player_hold",
          label: "Conducao livre",
          detail: "Movimento com posse sem disputa de espaco.",
          owner: "player",
        });
      }

      if (getMovementDistance(dx, dy) > 0.5) {
        setLastMoveVector({ x: dx, y: dy });
      } else {
        setLastMoveVector(null);
      }
      setCommittedAction(nextAction);
      if (postActionMoveAvailable) {
        setPostActionMoveAvailable(false);
      }

      if (!ballFlight && (ballOwner === "dummy" || ballOwner === "loose")) {
        applyResolution(
          resolveBallOwnership({
            landing: ballOwner === "dummy" ? dummyPos : ballPos,
            context: "loose",
            playerPos: nextPlayerPos,
            dummyPos,
            attrs,
            dummyAttrs,
            currentOwner: ballOwner,
          }),
        );
      }
    } else if (selectedAction === "tackle") {
      if (!dummyControlsBall) {
        setLastResolution({
          kind: ballOwner === "player" ? "player_hold" : "loose",
          label: "Sem alvo",
          detail: "O boneco precisa estar com a bola para sofrer desarme.",
          owner: ballOwner,
        });
        return;
      }

      const tackle = resolveTackleAttempt({
        playerPos,
        dummyPos,
        attrs,
        dummyAttrs,
        speedLoad: actionExecutionSpeedLoad,
      });
      setBallOwner(tackle.ballOwner);
      setBallPos(tackle.ballPos);
      setLastResolution(tackle.resolution);
      setCommittedAction({
        type: "tackle",
        from: playerPos,
        intendedTo: dummyPos,
        actualTo: dummyPos,
        deviationDist: 0,
        overGoal: false,
      });
      setPostActionMoveAvailable(true);
      setSelectedAction("move");
      setMouseFieldPct(null);
    } else {
      if (!playerControlsBall) {
        setLastResolution({
          kind: ballOwner === "dummy" ? "dummy_hold" : "loose",
          label: "Sem posse",
          detail: "Recupere a bola antes de testar passe ou chute.",
          owner: ballOwner,
        });
        return;
      }

      const deviation = computeDeviation(
        previewTarget.x,
        previewTarget.y,
        actionOrigin.x,
        actionOrigin.y,
        selectedAction,
        attrs,
        errorScalePct / 100,
        actionExecutionSpeedLoad,
      );
      const actualTarget = {
        x: deviation.actualX,
        y: deviation.actualY,
      };
      const nextAction: PreviewAction = {
        type: selectedAction,
        from: actionOrigin,
        intendedTo: previewTarget,
        actualTo: actualTarget,
        deviationDist: deviation.deviationDist,
        overGoal: deviation.overGoal,
      };
      const flight = getBallFlightConfig(selectedAction, actionOrigin, actualTarget, attrs);
      setBallOwner("loose");
      setBallFlightProgress(0);
      setBallFlight({
        type: selectedAction,
        from: actionOrigin,
        to: actualTarget,
        startAt: performance.now(),
        durationMs: flight.durationMs,
        arcHeight: flight.arcHeight,
      });
      setCommittedAction(nextAction);
      setLastResolution({
        kind: "loose",
        label: "Bola em voo",
        detail: "Posicione o jogador para testar recepcao, dominio ou disputa.",
        owner: "loose",
      });
      setPostActionMoveAvailable(true);
      setSelectedAction("move");
      setMouseFieldPct(null);
    }
  };

  const handlePlayerClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    setShowActionMenu((prev) => !prev);
    setMouseFieldPct(null);
  };

  const handleActionMenuSelect = (action: SoloActionType) => {
    setSelectedAction(action);
    if (action !== "move" && postActionMoveAvailable) {
      setPostActionMoveAvailable(false);
    }
    setShowActionMenu(false);
    setMouseFieldPct(null);
  };

  const actionStroke = (type: SoloActionType) => {
    if (type === "pass_high") return "6,5";
    if (type === "pass_launch") return "10,7";
    return undefined;
  };

  const playerSvg = toSVG(playerPos.x, playerPos.y);
  const dummySvg = toSVG(dummyPos.x, dummyPos.y);
  const goalkeeperSvg = toSVG(goalkeeperPos.x, goalkeeperPos.y);
  const actionOriginSvg = toSVG(actionOrigin.x, actionOrigin.y);
  const previewSvg = previewTarget ? toSVG(previewTarget.x, previewTarget.y) : null;
  const committedFromSvg = committedAction ? toSVG(committedAction.from.x, committedAction.from.y) : null;
  const committedToSvg = committedAction ? toSVG(committedAction.actualTo.x, committedAction.actualTo.y) : null;
  const committedIntendedSvg = committedAction ? toSVG(committedAction.intendedTo.x, committedAction.intendedTo.y) : null;
  const getPlayerActionMenuPos = () => {
    if (!svgRef.current) return null;

    const rect = svgRef.current.getBoundingClientRect();
    const containerRect = svgRef.current.parentElement?.getBoundingClientRect();

    if (!containerRect) return null;

    const totalW = FIELD_W + PAD * 2;
    const totalH = FIELD_H + PAD * 2;

    return {
      left: rect.left - containerRect.left + (playerSvg.x / totalW) * rect.width + 18,
      top: rect.top - containerRect.top + (playerSvg.y / totalH) * rect.height - 10,
    };
  };
  const liveBallPos = useMemo(() => {
    if (ballFlight) {
      return {
        x: ballFlight.from.x + (ballFlight.to.x - ballFlight.from.x) * ballFlightProgress,
        y: ballFlight.from.y + (ballFlight.to.y - ballFlight.from.y) * ballFlightProgress,
      };
    }

    if (ballOwner === "player") return playerPos;
    if (ballOwner === "dummy") return dummyPos;
    if (ballOwner === "goalkeeper") return goalkeeperPos;
    return ballPos;
  }, [ballFlight, ballFlightProgress, ballOwner, ballPos, dummyPos, goalkeeperPos, playerPos]);
  const ballArcLift = ballFlight ? Math.sin(ballFlightProgress * Math.PI) * ballFlight.arcHeight : 0;
  const ballSvg = toSVG(liveBallPos.x, liveBallPos.y);
  liveBallPosRef.current = liveBallPos;

  useEffect(() => {
    if (!goalkeeperEnabled) return;

    let frameId = 0;
    let lastNow = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      const target = getGoalkeeperTarget({
        side: SOLO_ATTACK_GOAL_SIDE,
        goalkeeperPos: goalkeeperPosRef.current,
        ballPos: liveBallPosRef.current,
        ballFlight: ballFlightRef.current,
        attrs: goalkeeperAttrsRef.current,
      });
      const reaction = 0.45 + normalizeAttr(goalkeeperAttrsRef.current.tempo_reacao) * 0.55;
      const speed = 10 + normalizeAttr(goalkeeperAttrsRef.current.agilidade) * 10;
      const maxStep = speed * reaction * dt;
      const dx = target.x - goalkeeperPosRef.current.x;
      const dy = target.y - goalkeeperPosRef.current.y;
      const dist = getMovementDistance(dx, dy);

      if (dist > 0.01) {
        const ratio = Math.min(1, maxStep / dist);
        const nextPos = {
          x: goalkeeperPosRef.current.x + dx * ratio,
          y: goalkeeperPosRef.current.y + dy * ratio,
        };
        goalkeeperPosRef.current = nextPos;
        setGoalkeeperPos(nextPos);

        if (ballOwnerRef.current === "goalkeeper") {
          setBallPos(nextPos);
        }
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [goalkeeperEnabled]);

  const attrsList: Array<{ key: keyof SoloAttrs; label: string }> = [
    { key: "velocidade", label: "Velocidade" },
    { key: "aceleracao", label: "Aceleracao" },
    { key: "stamina", label: "Stamina" },
    { key: "forca", label: "Forca" },
    { key: "drible", label: "Drible" },
    { key: "agilidade", label: "Agilidade" },
    { key: "desarme", label: "Desarme" },
    { key: "marcacao", label: "Marcacao" },
    { key: "antecipacao", label: "Antecipacao" },
    { key: "passe_baixo", label: "Passe rasteiro" },
    { key: "passe_alto", label: "Passe alto" },
    { key: "acuracia_chute", label: "Acerto do chute" },
    { key: "forca_chute", label: "Forca do chute" },
    { key: "controle_bola", label: "Controle de bola" },
    { key: "um_toque", label: "Um toque" },
  ];
  const dummyAttrsList: Array<{ key: keyof DummyAttrs; label: string }> = [
    { key: "drible", label: "Drible" },
    { key: "desarme", label: "Desarme" },
    { key: "marcacao", label: "Marcacao" },
    { key: "antecipacao", label: "Antecipacao" },
    { key: "controle_bola", label: "Controle de bola" },
    { key: "forca", label: "Forca" },
    { key: "agilidade", label: "Agilidade" },
    { key: "tomada_decisao", label: "Tomada de decisao" },
    { key: "um_toque", label: "Um toque" },
  ];
  const goalkeeperAttrsList: Array<{ key: keyof GoalkeeperAttrs; label: string }> = [
    { key: "reflexo", label: "Reflexo" },
    { key: "posicionamento_gol", label: "Posicionamento" },
    { key: "um_contra_um", label: "Um contra um" },
    { key: "tempo_reacao", label: "Tempo de reacao" },
    { key: "agilidade", label: "Agilidade" },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[hsl(140,15%,12%)] text-foreground flex flex-col">
      <div className="shrink-0 border-b border-[hsl(140,10%,20%)] bg-[hsl(140,20%,8%)] px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/manager/challenges")} className="h-8 text-[10px] font-display">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Button>
          <Badge
            variant="secondary"
            className="border-sky-400/40 bg-sky-500/15 text-[10px] font-display text-sky-50"
          >
            LAB SOLO
          </Badge>
          <Badge
            variant="secondary"
            className="border-white/15 bg-white/10 text-[10px] font-display text-slate-100"
          >
            JOGADOR + BONECO
          </Badge>
          <Badge
            variant="secondary"
            className="border-warning/50 bg-warning/15 text-[10px] font-display text-amber-100"
          >
            SEM TIMER
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={clearInertia} className="h-8 text-[10px] font-display">
            <Wind className="h-3 w-3" /> Zerar inercia
          </Button>
          <Button variant="outline" size="sm" onClick={placeBallOnPlayer} className="h-8 text-[10px] font-display">
            Bola no pe
          </Button>
          <Button variant="outline" size="sm" onClick={placeBallOnDummy} className="h-8 text-[10px] font-display">
            Bola no boneco
          </Button>
          <Button variant="outline" size="sm" onClick={dropBallLoose} className="h-8 text-[10px] font-display">
            Bola solta
          </Button>
          <Button variant="outline" size="sm" onClick={resetPlayer} className="h-8 text-[10px] font-display">
            <RotateCcw className="h-3 w-3" /> Resetar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-[320px] min-h-0 shrink-0 overflow-y-auto border-r border-[hsl(140,10%,20%)] bg-[hsl(140,12%,9%)] p-4 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-tactical" />
              <h1 className="font-display text-sm font-bold uppercase tracking-widest">Acoes</h1>
            </div>
            <div className="rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] px-3 py-2 text-[11px] font-display text-muted-foreground">
              Clique no jogador no campo para abrir o menu de acoes.
            </div>
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-display text-emerald-50">
              Acao atual: <span className="font-bold">{ACTION_LABELS[selectedAction]}</span>
            </div>
            {postActionMoveAvailable && (
              <div className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-[11px] font-display text-sky-50">
                Passo pos-acao disponivel: mova ate {Math.round(POST_ACTION_MOVE_RATIO * 100)}% do alcance.
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Estado</h2>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-display">
              <div className="rounded bg-white/20 px-2 py-1.5">X: {playerPos.x.toFixed(1)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Y: {playerPos.y.toFixed(1)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Boneco X: {dummyPos.x.toFixed(1)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Boneco Y: {dummyPos.y.toFixed(1)}</div>
              {goalkeeperEnabled && (
                <>
                  <div className="rounded bg-white/20 px-2 py-1.5">Goleiro X: {goalkeeperPos.x.toFixed(1)}</div>
                  <div className="rounded bg-white/20 px-2 py-1.5">Goleiro Y: {goalkeeperPos.y.toFixed(1)}</div>
                </>
              )}
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Alcance atual: {displayedMoveRange.toFixed(1)}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Ultimo vetor: {lastMoveVector ? `${lastMoveVector.x.toFixed(1)}, ${lastMoveVector.y.toFixed(1)}` : "parado"}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Bola:{" "}
                {ballFlight
                  ? `em voo (${Math.round(ballFlightProgress * 100)}%)`
                  : ballOwner === "player"
                    ? "com o jogador"
                    : ballOwner === "dummy"
                      ? "com o boneco"
                      : ballOwner === "goalkeeper"
                        ? "com o goleiro"
                      : "solta"}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Resultado: {lastResolution.label}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2 text-muted-foreground">
                {lastResolution.detail}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Severidade do erro: {errorScalePct}%
              </div>
              {selectedAction !== "move" && (
                <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                  Penalidade por velocidade: {Math.round(actionExecutionSpeedLoad * 100)}%
                </div>
              )}
              {committedAction && committedAction.type !== "move" && committedAction.type !== "tackle" && (
                <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                  Desvio real: {committedAction.deviationDist.toFixed(2)}
                  {committedAction.overGoal ? " (por cima)" : ""}
                </div>
              )}
              {previewMeta && (
                <div className="rounded px-2 py-1.5 col-span-2 font-bold" style={{ backgroundColor: `${previewMeta.color}22`, color: previewMeta.color }}>
                  {ACTION_LABELS[selectedAction]}: {previewMeta.label}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Telemetria</h2>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-display">
              <div className="rounded bg-sky-500/10 px-2 py-1.5">Velocidade: {movementDebug.speedAttr.toFixed(0)}</div>
              <div className="rounded bg-sky-500/10 px-2 py-1.5">Vel. norm.: {Math.round(movementDebug.speedNorm * 100)}%</div>
              <div className="rounded bg-amber-500/10 px-2 py-1.5">Aceleracao: {movementDebug.accelAttr.toFixed(0)}</div>
              <div className="rounded bg-amber-500/10 px-2 py-1.5">Accel. norm.: {Math.round(movementDebug.accelNorm * 100)}%</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Base vel.: {movementDebug.baseSpeed.toFixed(2)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Fator accel.: {movementDebug.accelFactor.toFixed(2)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Fator stamina: {movementDebug.staminaFactor.toFixed(2)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Fator forca: {movementDebug.strengthFactor.toFixed(2)}</div>
              <div className="rounded bg-emerald-500/10 px-2 py-1.5 col-span-2">
                Alcance final: {movementDebug.baseMoveRange.toFixed(2)}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Passada em hover: {movementDebug.previewStride.toFixed(2)} / {movementDebug.previewMaxRange.toFixed(2)}
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5">Inercia dir.: x{movementDebug.directionalMultiplier.toFixed(2)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5">Ultima passada: {movementDebug.lastStride.toFixed(2)}</div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Carga de velocidade: {Math.round(actionExecutionSpeedLoad * 100)}%
              </div>
              <div className="rounded bg-white/20 px-2 py-1.5 col-span-2">
                Passo pos-acao: {postActionMoveAvailable ? `${Math.round(POST_ACTION_MOVE_RATIO * 100)}% liberado` : "indisponivel"}
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Simulacao</h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-display">Erro da acao</Label>
                <span className="text-[11px] font-display text-muted-foreground">{errorScalePct}%</span>
              </div>
              <Slider min={25} max={250} step={5} value={[errorScalePct]} onValueChange={(value) => setErrorScalePct(value[0] ?? DEFAULT_ERROR_SCALE)} />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Goleiro Bot</h2>
              <Button variant="outline" size="sm" onClick={toggleGoalkeeper} className="h-8 text-[10px] font-display">
                {goalkeeperEnabled ? "Remover" : "Adicionar"}
              </Button>
            </div>
            <div className="text-[11px] font-display text-muted-foreground">
              {goalkeeperEnabled
                ? "O goleiro acompanha a bola, defende apenas o gol da direita e repoe a jogada apos a defesa."
                : "Ative para adicionar um goleiro com movimento automatico."}
            </div>
          </section>

          {goalkeeperEnabled && (
            <section className="space-y-3">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Atributos do goleiro</h2>
              {goalkeeperAttrsList.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-display">{label}</Label>
                    <span className="text-[11px] font-display text-muted-foreground">{goalkeeperAttrs[key]}</span>
                  </div>
                  <Slider
                    min={10}
                    max={99}
                    step={1}
                    value={[goalkeeperAttrs[key]]}
                    onValueChange={(value) => updateGoalkeeperAttr(key, value)}
                  />
                </div>
              ))}
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Boneco</h2>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-display">Posicao X</Label>
                <span className="text-[11px] font-display text-muted-foreground">{dummyPos.x.toFixed(1)}</span>
              </div>
              <Slider min={0} max={100} step={0.5} value={[dummyPos.x]} onValueChange={(value) => updateDummyAxis("x", value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-display">Posicao Y</Label>
                <span className="text-[11px] font-display text-muted-foreground">{dummyPos.y.toFixed(1)}</span>
              </div>
              <Slider min={0} max={100} step={0.5} value={[dummyPos.y]} onValueChange={(value) => updateDummyAxis("y", value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Atributos do boneco</h2>
            {dummyAttrsList.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-display">{label}</Label>
                  <span className="text-[11px] font-display text-muted-foreground">{dummyAttrs[key]}</span>
                </div>
                <Slider
                  min={10}
                  max={99}
                  step={1}
                  value={[dummyAttrs[key]]}
                  onValueChange={(value) => updateDummyAttr(key, value)}
                />
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Atributos</h2>
            {attrsList.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-display">{label}</Label>
                  <span className="text-[11px] font-display text-muted-foreground">{attrs[key]}</span>
                </div>
                <Slider
                  min={10}
                  max={99}
                  step={1}
                  value={[attrs[key]]}
                  onValueChange={(value) => updateAttr(key, value)}
                />
              </div>
            ))}
          </section>
        </aside>

        <main className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)" }}>
          <div className="relative w-full" style={{ maxWidth: 1120 }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${FIELD_W + PAD * 2} ${FIELD_H + PAD * 2}`}
              className="w-full rounded-lg"
              onMouseMove={handleSvgMouseMove}
              onClick={handleSvgClick}
            >
              <defs>
                <marker id="solo-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill={previewMeta?.color || "#22c55e"} />
                </marker>
                <pattern id="solo-grass" x="0" y="0" width="80" height={INNER_H} patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="40" height={INNER_H} fill="hsl(100,45%,28%)" />
                  <rect x="40" y="0" width="40" height={INNER_H} fill="hsl(100,42%,25%)" />
                </pattern>
              </defs>

              <rect x="0" y="0" width={FIELD_W + PAD * 2} height={FIELD_H + PAD * 2} fill="hsl(140,10%,15%)" rx="8" />
              <rect x={PAD} y={PAD} width={INNER_W} height={INNER_H} fill="url(#solo-grass)" />
              <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2">
                <rect x={PAD + 2} y={PAD + 2} width={INNER_W - 4} height={INNER_H - 4} />
                <line x1={PAD + INNER_W / 2} y1={PAD + 2} x2={PAD + INNER_W / 2} y2={PAD + INNER_H - 2} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={INNER_H * 0.15} />
                <circle cx={PAD + INNER_W / 2} cy={PAD + INNER_H / 2} r={3} fill="rgba(255,255,255,0.7)" />
                <rect x={PAD + 2} y={PAD + INNER_H * 0.22} width={INNER_W * 0.16} height={INNER_H * 0.56} />
                <rect x={PAD + 2} y={PAD + INNER_H * 0.35} width={INNER_W * 0.06} height={INNER_H * 0.3} />
                <rect x={PAD + INNER_W - INNER_W * 0.16 - 2} y={PAD + INNER_H * 0.22} width={INNER_W * 0.16} height={INNER_H * 0.56} />
                <rect x={PAD + INNER_W - INNER_W * 0.06 - 2} y={PAD + INNER_H * 0.35} width={INNER_W * 0.06} height={INNER_H * 0.3} />
              </g>

              <ellipse
                cx={moveEllipse.cx}
                cy={moveEllipse.cy}
                rx={moveEllipse.rx}
                ry={moveEllipse.ry}
                fill={postActionMoveAvailable ? "rgba(56,189,248,0.08)" : "rgba(34,197,94,0.08)"}
                stroke={postActionMoveAvailable ? "rgba(56,189,248,0.5)" : "rgba(34,197,94,0.45)"}
                strokeWidth="1.5"
                strokeDasharray="7,5"
              />

              {committedAction && committedFromSvg && committedToSvg && (
                <>
                  {committedAction.type !== "move" &&
                    committedIntendedSvg &&
                    committedAction.deviationDist > 0.01 && (
                      <g opacity={0.35}>
                        <line
                          x1={committedFromSvg.x}
                          y1={committedFromSvg.y}
                          x2={committedIntendedSvg.x}
                          y2={committedIntendedSvg.y}
                          stroke="rgba(255,255,255,0.7)"
                          strokeWidth="2"
                          strokeDasharray="5,5"
                        />
                        <circle
                          cx={committedIntendedSvg.x}
                          cy={committedIntendedSvg.y}
                          r={5}
                          fill="none"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth="1.2"
                          strokeDasharray="2,2"
                        />
                      </g>
                    )}
                  <line
                    x1={committedFromSvg.x}
                    y1={committedFromSvg.y}
                    x2={committedToSvg.x}
                    y2={committedToSvg.y}
                    stroke={getActionColor(committedAction.type, committedAction.from, committedAction.actualTo, attrs).color}
                    strokeWidth={committedAction.type === "move" ? 2.5 : 3}
                    strokeDasharray={actionStroke(committedAction.type)}
                    markerEnd="url(#solo-arrow)"
                    opacity={0.55}
                  />
                </>
              )}

              {previewSvg && (
                <line
                  x1={actionOriginSvg.x}
                  y1={actionOriginSvg.y}
                  x2={previewSvg.x}
                  y2={previewSvg.y}
                  stroke={previewMeta?.color || "#22c55e"}
                  strokeWidth={selectedAction === "move" ? 3 : 3.5}
                  strokeDasharray={actionStroke(selectedAction)}
                  markerEnd="url(#solo-arrow)"
                />
              )}

              {previewSvg && selectedAction === "move" && (
                <circle
                  cx={previewSvg.x}
                  cy={previewSvg.y}
                  r={9}
                  fill="rgba(34,197,94,0.18)"
                  stroke="rgba(34,197,94,0.55)"
                  strokeWidth="1.2"
                />
              )}

              <g onClick={handlePlayerClick} style={{ cursor: "pointer" }}>
                <circle
                  cx={playerSvg.x}
                  cy={playerSvg.y}
                  r={16}
                  fill="rgba(34,197,94,0.16)"
                  stroke={ballOwner === "player" ? "rgba(34,197,94,0.55)" : "rgba(34,197,94,0.25)"}
                  strokeWidth="6"
                />
                <circle cx={playerSvg.x} cy={playerSvg.y} r={11} fill="#f8fafc" stroke="hsl(220,20%,15%)" strokeWidth="2" />
              </g>

              <g>
                <circle
                  cx={dummySvg.x}
                  cy={dummySvg.y}
                  r={16}
                  fill="rgba(248,113,113,0.12)"
                  stroke={ballOwner === "dummy" ? "rgba(248,113,113,0.55)" : "rgba(248,113,113,0.28)"}
                  strokeWidth="6"
                />
                <circle cx={dummySvg.x} cy={dummySvg.y} r={11} fill="#fee2e2" stroke="#7f1d1d" strokeWidth="2" />
                <line x1={dummySvg.x - 5} y1={dummySvg.y - 5} x2={dummySvg.x + 5} y2={dummySvg.y + 5} stroke="#7f1d1d" strokeWidth="1.5" />
                <line x1={dummySvg.x + 5} y1={dummySvg.y - 5} x2={dummySvg.x - 5} y2={dummySvg.y + 5} stroke="#7f1d1d" strokeWidth="1.5" />
              </g>

              {goalkeeperEnabled && (
                <g>
                  <circle
                    cx={goalkeeperSvg.x}
                    cy={goalkeeperSvg.y}
                    r={17}
                    fill="rgba(56,189,248,0.12)"
                    stroke={ballOwner === "goalkeeper" ? "rgba(56,189,248,0.6)" : "rgba(56,189,248,0.3)"}
                    strokeWidth="6"
                  />
                  <circle cx={goalkeeperSvg.x} cy={goalkeeperSvg.y} r={12} fill="#e0f2fe" stroke="#0f172a" strokeWidth="2" />
                  <rect x={goalkeeperSvg.x - 5} y={goalkeeperSvg.y - 5} width={10} height={10} rx={2} fill="#38bdf8" opacity="0.55" />
                </g>
              )}

              <ellipse cx={ballSvg.x + 0.8} cy={ballSvg.y + 2.6} rx={4.8} ry={1.9} fill="rgba(0,0,0,0.28)" />
              <g transform={`translate(0 ${-ballArcLift})`}>
                <circle cx={ballSvg.x} cy={ballSvg.y} r={5.2} fill="#f5f5f5" stroke="#111827" strokeWidth="1.1" />
                <circle cx={ballSvg.x - 2.3} cy={ballSvg.y - 1.8} r={0.9} fill="#111827" opacity="0.55" />
                <circle cx={ballSvg.x + 2.4} cy={ballSvg.y - 1.6} r={0.9} fill="#111827" opacity="0.55" />
                <circle cx={ballSvg.x} cy={ballSvg.y + 2.4} r={0.85} fill="#111827" opacity="0.45" />
              </g>
            </svg>

            {showActionMenu && (() => {
              const menuPos = getPlayerActionMenuPos();
              if (!menuPos || availableActions.length === 0) return null;

              return (
                <div
                  className="absolute z-50 min-w-[170px] rounded border border-[hsl(140,10%,24%)] bg-[hsl(140,10%,10%)]/95 py-1 shadow-lg backdrop-blur"
                  style={{ left: menuPos.left, top: menuPos.top, transform: "translateY(-50%)" }}
                >
                  {availableActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => handleActionMenuSelect(action)}
                      className={
                        selectedAction === action
                          ? "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-display font-bold text-emerald-50 bg-emerald-500/20"
                          : "flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-display text-slate-100 hover:bg-white/10"
                      }
                    >
                      <span>{ACTION_LABELS[action]}</span>
                      {selectedAction === action && <span className="text-[10px] text-emerald-200">ativa</span>}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="absolute left-3 bottom-3 rounded border border-[hsl(140,10%,22%)] bg-[hsl(140,10%,10%)]/92 px-3 py-2 text-[11px] font-display">
              {postActionMoveAvailable ? (
                <>
                  Passo pos-acao liberado: clique no campo para mover ate <span className="font-bold">{Math.round(POST_ACTION_MOVE_RATIO * 100)}%</span> do alcance.
                </>
              ) : (
                <>
                  Clique no jogador para escolher a acao e depois clique no campo para aplicar <span className="font-bold">{ACTION_LABELS[selectedAction]}</span>.
                  Movimento com posse conduz a bola e so vira disputa de drible quando o trajeto entra na zona do boneco.
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
