import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FlaskConical, RotateCcw, Wind } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type SoloActionType =
  | "move"
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
  passe_baixo: number;
  passe_alto: number;
  acuracia_chute: number;
  forca_chute: number;
  controle_bola: number;
  um_toque: number;
};

type FieldPoint = { x: number; y: number };

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

type BallOwner = "player" | "dummy" | "loose";

type ControlContext = SoloActionType | "loose";

type BallResolution = {
  kind:
    | "player_hold"
    | "dummy_hold"
    | "reception"
    | "control"
    | "duel_player"
    | "duel_dummy"
    | "loose";
  label: string;
  detail: string;
  owner: BallOwner;
};

const ACTION_LABELS: Record<SoloActionType, string> = {
  move: "Mover",
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
const PASS_ACTIONS: SoloActionType[] = ["pass_low", "pass_high", "pass_launch"];

const DEFAULT_ATTRS: SoloAttrs = {
  velocidade: 60,
  aceleracao: 60,
  stamina: 60,
  forca: 60,
  passe_baixo: 60,
  passe_alto: 60,
  acuracia_chute: 60,
  forca_chute: 60,
  controle_bola: 60,
  um_toque: 60,
};

const DEFAULT_PLAYER_POS: FieldPoint = { x: 28, y: 50 };
const DEFAULT_DUMMY_POS: FieldPoint = { x: 62, y: 50 };
const DEFAULT_BALL_RESOLUTION: BallResolution = {
  kind: "player_hold",
  label: "Jogador com a bola",
  detail: "Estado inicial do laboratorio.",
  owner: "player",
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeAttr = (val: number) => Math.max(0, Math.min(1, (val - 10) / 89));
const isPassAction = (type: ControlContext) => PASS_ACTIONS.includes(type as SoloActionType);

const toMovementSpace = (dx: number, dy: number) => ({
  x: dx,
  y: dy * FIELD_Y_MOVEMENT_SCALE,
});

const getMovementDistance = (dx: number, dy: number) => {
  const movementVec = toMovementSpace(dx, dy);
  return Math.hypot(movementVec.x, movementVec.y);
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
): DeviationResult {
  const dist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);

  let difficultyMultiplier: number;
  let skillFactor: number;
  let labDeviationBoost: number;

  switch (actionType) {
    case "pass_low":
      difficultyMultiplier = 5;
      skillFactor = normalizeAttr(attrs.passe_baixo ?? 40);
      labDeviationBoost = 1.35;
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
  const skillCurve = Math.pow(1 - skillFactor, 3.5);
  const minimumDeviation = skillFactor < 0.45 ? (1.5 + (0.45 - skillFactor) * 4.5) : 0;
  const deviationRadius =
    (baseDifficulty * skillCurve + minimumDeviation) *
    labDeviationBoost *
    errorScale *
    (0.8 + Math.random() * 0.5);
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

  if (context === "loose") return 4.8 + control * 2.8 + oneTouch * 0.7;
  if (context === "pass_low") return 5.7 + control * 1.9 + oneTouch * 1.6;
  if (context === "pass_high") return 5.0 + control * 1.5 + oneTouch * 1.8;
  if (context === "pass_launch") return 5.2 + control * 1.7 + oneTouch * 1.7;
  return 4.7 + control * 1.4;
}

function getDummyControlRadius(context: ControlContext) {
  if (context === "loose") return 5.4;
  if (context === "pass_low") return 5.1;
  if (context === "pass_high") return 4.6;
  if (context === "pass_launch") return 4.8;
  return 4.9;
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
) {
  const reach = Math.max(0, dummyRadius - dummyDist);
  const fixedSkill = context === "loose" ? 0.58 : context === "pass_high" ? 0.54 : 0.56;

  return reach * 1.8 + fixedSkill * 6 + (currentOwner === "dummy" ? 1.0 : 0);
}

function resolveBallOwnership(params: {
  landing: FieldPoint;
  context: ControlContext;
  playerPos: FieldPoint;
  dummyPos: FieldPoint;
  attrs: SoloAttrs;
  currentOwner: BallOwner;
}) {
  const { landing, context, playerPos, dummyPos, attrs, currentOwner } = params;
  const playerRadius = getPlayerControlRadius(context, attrs);
  const dummyRadius = getDummyControlRadius(context);
  const playerDist = getMovementDistance(landing.x - playerPos.x, landing.y - playerPos.y);
  const dummyDist = getMovementDistance(landing.x - dummyPos.x, landing.y - dummyPos.y);
  const playerCanControl = playerDist <= playerRadius;
  const dummyCanControl = dummyDist <= dummyRadius;
  const passContext = isPassAction(context);

  if (playerCanControl && dummyCanControl) {
    const playerScore = getPlayerContestScore(playerDist, playerRadius, context, attrs, currentOwner);
    const dummyScore = getDummyContestScore(dummyDist, dummyRadius, context, currentOwner);

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

export default function SoloPhysicsLabPage() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);

  const [attrs, setAttrs] = useState<SoloAttrs>(DEFAULT_ATTRS);
  const [playerPos, setPlayerPos] = useState<FieldPoint>(DEFAULT_PLAYER_POS);
  const [dummyPos, setDummyPos] = useState<FieldPoint>(DEFAULT_DUMMY_POS);
  const [lastMoveVector, setLastMoveVector] = useState<FieldPoint | null>(null);
  const [selectedAction, setSelectedAction] = useState<SoloActionType>("move");
  const [mouseFieldPct, setMouseFieldPct] = useState<FieldPoint | null>(null);
  const [committedAction, setCommittedAction] = useState<PreviewAction | null>(null);
  const [ballPos, setBallPos] = useState<FieldPoint>(DEFAULT_PLAYER_POS);
  const [ballOwner, setBallOwner] = useState<BallOwner>("player");
  const [ballFlight, setBallFlight] = useState<BallFlight | null>(null);
  const [ballFlightProgress, setBallFlightProgress] = useState(0);
  const [errorScalePct, setErrorScalePct] = useState(DEFAULT_ERROR_SCALE);
  const [lastResolution, setLastResolution] = useState<BallResolution>(DEFAULT_BALL_RESOLUTION);
  const playerPosRef = useRef(playerPos);
  const dummyPosRef = useRef(dummyPos);
  const attrsRef = useRef(attrs);
  const ballOwnerRef = useRef(ballOwner);
  const playerControlsBall = ballOwner === "player" && !ballFlight;

  playerPosRef.current = playerPos;
  dummyPosRef.current = dummyPos;
  attrsRef.current = attrs;
  ballOwnerRef.current = ballOwner;

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
        const multiplier = 1.2 - 0.4 * normalizedAngle;
        range *= multiplier;
      }
    }

    return range;
  };

  const idleMoveRange = useMemo(() => computeMaxMoveRange(), [attrs, lastMoveVector]);

  useEffect(() => {
    if (!playerControlsBall && selectedAction !== "move") {
      setSelectedAction("move");
    }
  }, [playerControlsBall, selectedAction]);

  const previewTarget = useMemo(() => {
    if (!mouseFieldPct) return null;
    if (selectedAction === "shoot_controlled" || selectedAction === "shoot_power") {
      return {
        x: playerPos.x <= 50 ? 100 + GOAL_LINE_OVERFLOW_PCT : 0 - GOAL_LINE_OVERFLOW_PCT,
        y: clamp(mouseFieldPct.y, 38, 62),
      };
    }
    return mouseFieldPct;
  }, [mouseFieldPct, playerPos.x, selectedAction]);

  const actionOrigin = playerPos;

  const previewMeta = useMemo(() => {
    if (!previewTarget) return null;
    return getActionColor(selectedAction, actionOrigin, previewTarget, attrs);
  }, [actionOrigin, attrs, previewTarget, selectedAction]);

  const moveEllipse = useMemo(() => {
    const center = toSVG(playerPos.x, playerPos.y);
    return {
      cx: center.x,
      cy: center.y,
      rx: (idleMoveRange / 100) * INNER_W,
      ry: ((idleMoveRange / FIELD_Y_MOVEMENT_SCALE) / 100) * INNER_H,
    };
  }, [idleMoveRange, playerPos.x, playerPos.y]);

  const updateAttr = (key: keyof SoloAttrs, value: number[]) => {
    setAttrs((prev) => ({ ...prev, [key]: value[0] ?? prev[key] }));
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

  const resetPlayer = () => {
    setPlayerPos(DEFAULT_PLAYER_POS);
    setDummyPos(DEFAULT_DUMMY_POS);
    setLastMoveVector(null);
    setMouseFieldPct(null);
    setCommittedAction(null);
    setSelectedAction("move");
    setBallPos(DEFAULT_PLAYER_POS);
    setBallOwner("player");
    setBallFlight(null);
    setBallFlightProgress(0);
    setErrorScalePct(DEFAULT_ERROR_SCALE);
    setLastResolution(DEFAULT_BALL_RESOLUTION);
  };

  const clearInertia = () => setLastMoveVector(null);

  const placeBallOnPlayer = () => {
    setBallPos(playerPos);
    setBallOwner("player");
    setBallFlight(null);
    setBallFlightProgress(0);
    setLastResolution({
      kind: "player_hold",
      label: "Jogador com a bola",
      detail: "Bola reposicionada manualmente no jogador.",
      owner: "player",
    });
  };

  const placeBallOnDummy = () => {
    setBallPos(dummyPos);
    setBallOwner("dummy");
    setBallFlight(null);
    setBallFlightProgress(0);
    setLastResolution({
      kind: "dummy_hold",
      label: "Boneco com a bola",
      detail: "Bola reposicionada manualmente no boneco.",
      owner: "dummy",
    });
  };

  const dropBallLoose = () => {
    const loosePos = ballOwner === "player" ? playerPos : ballOwner === "dummy" ? dummyPos : ballPos;
    setBallPos(loosePos);
    setBallOwner("loose");
    setBallFlight(null);
    setBallFlightProgress(0);
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

      const resolved = resolveBallOwnership({
        landing: ballFlight.to,
        context: ballFlight.type,
        playerPos: playerPosRef.current,
        dummyPos: dummyPosRef.current,
        attrs: attrsRef.current,
        currentOwner: ballOwnerRef.current,
      });
      applyResolution(resolved);
      setBallFlight(null);
      setBallFlightProgress(0);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [ballFlight]);

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
      const maxRange = computeMaxMoveRange(dist > 0.1 ? { x: dx, y: dy } : undefined);

      if (dist > maxRange) {
        const scale = maxRange / dist;
        finalX = playerPos.x + dx * scale;
        finalY = playerPos.y + dy * scale;
      }
    }

    setMouseFieldPct({ x: finalX, y: finalY });
  };

  const handleSvgClick = () => {
    if (!previewTarget) return;

    if (selectedAction === "move") {
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
      }

      if (getMovementDistance(dx, dy) > 0.5) {
        setLastMoveVector({ x: dx, y: dy });
      } else {
        setLastMoveVector(null);
      }
      setCommittedAction(nextAction);

      if (!ballFlight && ballOwner !== "player") {
        applyResolution(
          resolveBallOwnership({
            landing: ballOwner === "dummy" ? dummyPos : ballPos,
            context: "loose",
            playerPos: nextPlayerPos,
            dummyPos,
            attrs,
            currentOwner: ballOwner,
          }),
        );
      }
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
    }
  };

  const actionStroke = (type: SoloActionType) => {
    if (type === "pass_high") return "6,5";
    if (type === "pass_launch") return "10,7";
    return undefined;
  };

  const playerSvg = toSVG(playerPos.x, playerPos.y);
  const dummySvg = toSVG(dummyPos.x, dummyPos.y);
  const actionOriginSvg = toSVG(actionOrigin.x, actionOrigin.y);
  const previewSvg = previewTarget ? toSVG(previewTarget.x, previewTarget.y) : null;
  const committedFromSvg = committedAction ? toSVG(committedAction.from.x, committedAction.from.y) : null;
  const committedToSvg = committedAction ? toSVG(committedAction.actualTo.x, committedAction.actualTo.y) : null;
  const committedIntendedSvg = committedAction ? toSVG(committedAction.intendedTo.x, committedAction.intendedTo.y) : null;
  const liveBallPos = useMemo(() => {
    if (ballFlight) {
      return {
        x: ballFlight.from.x + (ballFlight.to.x - ballFlight.from.x) * ballFlightProgress,
        y: ballFlight.from.y + (ballFlight.to.y - ballFlight.from.y) * ballFlightProgress,
      };
    }

    if (ballOwner === "player") return playerPos;
    if (ballOwner === "dummy") return dummyPos;
    return ballPos;
  }, [ballFlight, ballFlightProgress, ballOwner, ballPos, dummyPos, playerPos]);
  const ballArcLift = ballFlight ? Math.sin(ballFlightProgress * Math.PI) * ballFlight.arcHeight : 0;
  const ballSvg = toSVG(liveBallPos.x, liveBallPos.y);

  const attrsList: Array<{ key: keyof SoloAttrs; label: string }> = [
    { key: "velocidade", label: "Velocidade" },
    { key: "aceleracao", label: "Aceleracao" },
    { key: "stamina", label: "Stamina" },
    { key: "forca", label: "Forca" },
    { key: "passe_baixo", label: "Passe rasteiro" },
    { key: "passe_alto", label: "Passe alto" },
    { key: "acuracia_chute", label: "Acerto do chute" },
    { key: "forca_chute", label: "Forca do chute" },
    { key: "controle_bola", label: "Controle de bola" },
    { key: "um_toque", label: "Um toque" },
  ];

  return (
    <div className="min-h-screen bg-[hsl(140,15%,12%)] text-foreground">
      <div className="border-b border-[hsl(140,10%,20%)] bg-[hsl(140,20%,8%)] px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/manager/challenges")} className="h-8 text-[10px] font-display">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Button>
          <Badge variant="secondary" className="text-[10px] font-display border-tactical/40 text-tactical">
            LAB SOLO
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-display">
            1 JOGADOR
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-display text-warning border-warning/40">
            SEM TIMER
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearInertia} className="h-8 text-[10px] font-display">
            <Wind className="h-3 w-3" /> Zerar inercia
          </Button>
          <Button variant="outline" size="sm" onClick={placeBallOnPlayer} className="h-8 text-[10px] font-display">
            Bola no pe
          </Button>
          <Button variant="outline" size="sm" onClick={resetPlayer} className="h-8 text-[10px] font-display">
            <RotateCcw className="h-3 w-3" /> Resetar
          </Button>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-49px)]">
        <aside className="w-[320px] shrink-0 border-r border-[hsl(140,10%,20%)] bg-[hsl(140,12%,9%)] p-4 overflow-y-auto space-y-5">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-tactical" />
              <h1 className="font-display text-sm font-bold uppercase tracking-widest">Acoes</h1>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ACTION_LABELS) as SoloActionType[]).map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant={selectedAction === action ? "default" : "outline"}
                  onClick={() => setSelectedAction(action)}
                  className="justify-start text-[11px] font-display"
                >
                  {ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-[hsl(140,10%,18%)] bg-[hsl(140,10%,11%)] p-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">Estado</h2>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-display">
              <div className="rounded bg-black/20 px-2 py-1.5">X: {playerPos.x.toFixed(1)}</div>
              <div className="rounded bg-black/20 px-2 py-1.5">Y: {playerPos.y.toFixed(1)}</div>
              <div className="rounded bg-black/20 px-2 py-1.5 col-span-2">
                Alcance base: {idleMoveRange.toFixed(1)}
              </div>
              <div className="rounded bg-black/20 px-2 py-1.5 col-span-2">
                Ultimo vetor: {lastMoveVector ? `${lastMoveVector.x.toFixed(1)}, ${lastMoveVector.y.toFixed(1)}` : "parado"}
              </div>
              <div className="rounded bg-black/20 px-2 py-1.5 col-span-2">
                Bola: {ballHeldByPlayer ? "com o jogador" : ballFlight ? `em voo (${Math.round(ballFlightProgress * 100)}%)` : "solta"}
              </div>
              {committedAction && committedAction.type !== "move" && (
                <div className="rounded bg-black/20 px-2 py-1.5 col-span-2">
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

        <main className="flex-1 flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg, hsl(140,15%,14%) 0%, hsl(140,12%,10%) 100%)" }}>
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
                fill="rgba(34,197,94,0.08)"
                stroke="rgba(34,197,94,0.45)"
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

              <g>
                <circle cx={playerSvg.x} cy={playerSvg.y} r={16} fill="rgba(34,197,94,0.16)" stroke="rgba(34,197,94,0.25)" strokeWidth="6" />
                <circle cx={playerSvg.x} cy={playerSvg.y} r={11} fill="#f8fafc" stroke="hsl(220,20%,15%)" strokeWidth="2" />
              </g>

              <ellipse cx={ballSvg.x + 0.8} cy={ballSvg.y + 2.6} rx={4.8} ry={1.9} fill="rgba(0,0,0,0.28)" />
              <g transform={`translate(0 ${-ballArcLift})`}>
                <circle cx={ballSvg.x} cy={ballSvg.y} r={5.2} fill="#f5f5f5" stroke="#111827" strokeWidth="1.1" />
                <circle cx={ballSvg.x - 2.3} cy={ballSvg.y - 1.8} r={0.9} fill="#111827" opacity="0.55" />
                <circle cx={ballSvg.x + 2.4} cy={ballSvg.y - 1.6} r={0.9} fill="#111827" opacity="0.55" />
                <circle cx={ballSvg.x} cy={ballSvg.y + 2.4} r={0.85} fill="#111827" opacity="0.45" />
              </g>
            </svg>

            <div className="absolute left-3 bottom-3 rounded border border-[hsl(140,10%,22%)] bg-[hsl(140,10%,10%)]/92 px-3 py-2 text-[11px] font-display">
              Clique no campo para aplicar <span className="font-bold">{ACTION_LABELS[selectedAction]}</span>.
              O jogador sempre usa o ultimo deslocamento como referencia de inercia, e a bola agora voa com perfil proprio por acao.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
