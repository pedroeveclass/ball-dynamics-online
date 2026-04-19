import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'geral' | 'fases' | 'acoes' | 'atalhos';
}

export function HelpModal({ open, onOpenChange, defaultTab = 'geral' }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-[hsl(220,15%,12%)] border-[hsl(220,10%,25%)] text-[hsl(45,20%,90%)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-display uppercase tracking-wider text-[hsl(45,30%,80%)]">
            Como jogar Ball Dynamics
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="mt-2">
          <TabsList className="grid grid-cols-4 w-full bg-[hsl(220,15%,18%)]">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="fases">Fases</TabsTrigger>
            <TabsTrigger value="acoes">Ações</TabsTrigger>
            <TabsTrigger value="atalhos">Atalhos</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4 space-y-3 text-sm leading-relaxed">
            <p>
              <strong>Ball Dynamics</strong> é um jogo de futebol tático por <strong>turnos sincronizados</strong>.
              Não é em tempo real: em cada turno, todos os jogadores decidem suas ações em fases curtas
              (cerca de 7 segundos cada), e o motor de jogo resolve tudo de uma vez no final.
            </p>
            <p>
              Você controla <strong>um jogador</strong> (se for Player) ou <strong>um time inteiro</strong> (se for Manager/Técnico).
              O objetivo é simples: marcar mais gols que o adversário em dois tempos.
            </p>
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                Fluxo de um turno
              </div>
              <ol className="text-xs list-decimal list-inside space-y-0.5 text-[hsl(45,20%,80%)]">
                <li>Posicionamento (apenas em kickoff, falta, lateral, tiro de meta)</li>
                <li>Fase 1 — Portador (Ball Holder)</li>
                <li>Fase 2 — Ataque (Attacking Support)</li>
                <li>Fase 3 — Defesa (Defending Response)</li>
                <li>Resolução / Motion (animação do que aconteceu)</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="fases" className="mt-4 space-y-4 text-sm leading-relaxed">
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">📍 Posicionamento</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                Antes de jogadas "paradas" (kickoff de gol ou início, falta, lateral, tiro de meta, escanteio).
                Cada time pode reposicionar todos os seus jogadores livremente antes do lance.
                Primeiro posiciona o time com a bola, depois o que defende.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">⚽ Fase do Portador (Ball Holder)</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                Apenas o jogador com a bola age. Escolhe entre: <strong>passe rasteiro</strong>, <strong>passe alto</strong>,
                <strong> lançamento</strong>, <strong>chute controlado</strong>, <strong>chute forte</strong> ou <strong>drible</strong> (move).
                Ficar parado com a bola também é uma opção.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">🏃 Fase de Ataque (Attacking Support)</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                Time com a bola se movimenta SEM a bola. Os outros atacantes podem <strong>Dominar</strong> passes que
                passem por eles (círculo roxo). Se o portador passou ou chutou, ele pode dar um mini-move.
                Se driblou, ele fica com a bola ao final do drible.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">🛡️ Fase de Defesa (Defending Response)</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                Time sem a bola age. Pode <strong>Desarmar</strong> (tackle) quem está driblando,
                <strong> Dominar</strong> (interceptar) passes, <strong>Bloquear</strong> chutes, ou apenas se posicionar.
                Goleiros podem <strong>Agarrar</strong> ou <strong>Espalmar</strong>.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">⚡ Resolução / Motion</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                O motor resolve tudo: calcula contestos (desarmes, defesas), anima os movimentos,
                decide gols, e prepara o próximo turno.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="acoes" className="mt-4 space-y-3 text-sm leading-relaxed">
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                🟢 Círculo verde
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">
                Você pode se mover, mas não alcança a bola nem a trajetória do passe/chute.
              </p>
            </div>
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(280,30%,40%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(280,60%,70%)] mb-2">
                🟣 Círculo roxo
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">
                Você PODE interagir com a bola/trajetória. Ao clicar, o menu já abre com as opções relevantes:
                Dominar, Desarme, Carrinho, Bloqueio ou Espalmar.
              </p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                Zonas da bola (altura)
              </div>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-[hsl(45,20%,80%)]">
                <li><span className="text-green-400">Verde</span>: bola no chão — pode dominar com pé.</li>
                <li><span className="text-yellow-400">Amarelo</span>: bola na altura da cabeça — pode cabecear (header).</li>
                <li><span className="text-red-400">Vermelho</span>: bola alta demais — não dá pra interagir.</li>
              </ul>
            </div>
            <div className="bg-[hsl(30,60%,14%)] rounded p-3 border border-[hsl(30,60%,35%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(30,80%,70%)] mb-1">
                🎯 Potência da Inércia
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">
                Depois que você confirma um move, uma seta laranja aparece no fim do seu movimento.
                Ela representa a <strong>potência da inércia</strong> que você carrega pro próximo turno.
                Arraste o cursor pra definir 0-100% e clique em qualquer lugar pra confirmar.
              </p>
              <ul className="text-xs text-[hsl(45,20%,75%)] list-disc list-inside mt-1.5 space-y-0.5">
                <li><strong>100%</strong>: máxima velocidade na mesma direção, máxima penalidade pra reverter.</li>
                <li><strong>0%</strong>: sem bônus nem penalidade — você pode ir pra qualquer direção igualmente no próximo turno.</li>
                <li><strong>50%</strong>: meio-termo.</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                ⚡ One-touch (jogada de primeira)
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">
                Quando você está na zona amarela (cabeceio) ou verde perto do fim do passe, pode dominar
                E já passar/chutar de primeira sem esperar o próximo turno. O menu mostra as opções
                marcadas com ⚡ quando disponível.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="atalhos" className="mt-4 space-y-3 text-sm leading-relaxed">
            <p className="text-xs text-[hsl(45,20%,75%)]">
              Com o menu de ações aberto, aperte a letra correspondente pra escolher direto —
              não precisa clicar no botão. As teclas ficam todas na mão esquerda, organizadas por linha:
            </p>

            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                ⚽ Linha de cima — Passes e chutes (QWERT)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Q', 'Passe rasteiro'],
                  ['W', 'Passe alto'],
                  ['E', 'Lançamento'],
                  ['R', 'Chute controlado'],
                  ['T', 'Chute forte'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[hsl(45,30%,80%)] bg-[hsl(220,15%,20%)] rounded px-1.5 py-0.5 min-w-[32px] text-center">
                      {key}
                    </span>
                    <span className="text-xs text-[hsl(45,20%,80%)]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                🤸 Linha do meio — Cabeceios (ASDF)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['A', 'Cabeceio baixo'],
                  ['S', 'Cabeceio alto'],
                  ['D', 'Cabeceio controlado'],
                  ['F', 'Cabeceio forte'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[hsl(45,30%,80%)] bg-[hsl(220,15%,20%)] rounded px-1.5 py-0.5 min-w-[32px] text-center">
                      {key}
                    </span>
                    <span className="text-xs text-[hsl(45,20%,80%)]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                🛡️ Linha de baixo — Movimento e defesa (ZXCVB)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Z', 'Sem ação / cancelar'],
                  ['X', 'Mover'],
                  ['C', 'Dominar / Desarme / Agarrar'],
                  ['V', 'Carrinho (tackle forte)'],
                  ['B', 'Bloquear / Espalmar'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[hsl(45,30%,80%)] bg-[hsl(220,15%,20%)] rounded px-1.5 py-0.5 min-w-[32px] text-center">
                      {key}
                    </span>
                    <span className="text-xs text-[hsl(45,20%,80%)]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
