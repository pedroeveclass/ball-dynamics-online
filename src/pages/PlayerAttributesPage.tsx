import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { players } from '@/data/mock';

const player = players[0];
const { physical, technical, mental, shooting } = player.attributes;

const sections = [
  { title: 'Físico', attrs: [
    { label: 'Velocidade', value: physical.speed },
    { label: 'Aceleração', value: physical.acceleration },
    { label: 'Agilidade', value: physical.agility },
    { label: 'Força', value: physical.strength },
    { label: 'Equilíbrio', value: physical.balance },
    { label: 'Resistência', value: physical.stamina },
    { label: 'Pulo', value: physical.jumping },
    { label: 'Fôlego', value: physical.endurance },
  ]},
  { title: 'Técnico', attrs: [
    { label: 'Drible', value: technical.dribbling },
    { label: 'Controle de Bola', value: technical.ballControl },
    { label: 'Marcação', value: technical.marking },
    { label: 'Desarme', value: technical.tackling },
    { label: 'Um Toque', value: technical.oneTouch },
    { label: 'Curva', value: technical.curve },
    { label: 'Passe Curto', value: technical.shortPassing },
    { label: 'Passe Longo', value: technical.longPassing },
  ]},
  { title: 'Mental', attrs: [
    { label: 'Visão de Jogo', value: mental.vision },
    { label: 'Tomada de Decisão', value: mental.decisionMaking },
    { label: 'Antecipação', value: mental.anticipation },
    { label: 'Trabalho em Equipe', value: mental.teamwork },
    { label: 'Coragem', value: mental.courage },
    { label: 'Posicionamento Ofensivo', value: mental.offensivePositioning },
    { label: 'Posicionamento Defensivo', value: mental.defensivePositioning },
  ]},
  { title: 'Chute', attrs: [
    { label: 'Cabeceio', value: shooting.heading },
    { label: 'Acurácia do Chute', value: shooting.shotAccuracy },
    { label: 'Força do Chute', value: shooting.shotPower },
  ]},
];

export default function PlayerAttributesPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Atributos</h1>
          <p className="text-sm text-muted-foreground">{player.name} • OVR {player.overallRating}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sections.map(section => (
            <div key={section.title} className="stat-card">
              <h2 className="font-display text-lg font-bold mb-4">{section.title}</h2>
              <div className="space-y-3">
                {section.attrs.map(a => (
                  <AttributeBar key={a.label} label={a.label} value={a.value} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
