import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { AttributeBar } from '@/components/AttributeBar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export default function PlayerAttributesPage() {
  const { playerProfile } = useAuth();
  const [attrs, setAttrs] = useState<Tables<'player_attributes'> | null>(null);

  useEffect(() => {
    if (!playerProfile) return;
    supabase.from('player_attributes').select('*').eq('player_profile_id', playerProfile.id).single()
      .then(({ data }) => setAttrs(data));
  }, [playerProfile]);

  if (!playerProfile || !attrs) {
    return <AppLayout><p className="text-muted-foreground">Carregando atributos...</p></AppLayout>;
  }

  const isGK = playerProfile.primary_position === 'GK';

  const sections = [
    { title: 'Físico', attrs: [
      { label: 'Velocidade', value: attrs.velocidade },
      { label: 'Aceleração', value: attrs.aceleracao },
      { label: 'Agilidade', value: attrs.agilidade },
      { label: 'Força', value: attrs.forca },
      { label: 'Equilíbrio', value: attrs.equilibrio },
      { label: 'Resistência', value: attrs.resistencia },
      { label: 'Pulo', value: attrs.pulo },
      { label: 'Stamina', value: attrs.stamina },
    ]},
    { title: 'Técnico', attrs: [
      { label: 'Drible', value: attrs.drible },
      { label: 'Controle de Bola', value: attrs.controle_bola },
      { label: 'Marcação', value: attrs.marcacao },
      { label: 'Desarme', value: attrs.desarme },
      { label: 'Um Toque', value: attrs.um_toque },
      { label: 'Curva', value: attrs.curva },
      { label: 'Passe Baixo', value: attrs.passe_baixo },
      { label: 'Passe Alto', value: attrs.passe_alto },
    ]},
    { title: 'Mental', attrs: [
      { label: 'Visão de Jogo', value: attrs.visao_jogo },
      { label: 'Tomada de Decisão', value: attrs.tomada_decisao },
      { label: 'Antecipação', value: attrs.antecipacao },
      { label: 'Trabalho em Equipe', value: attrs.trabalho_equipe },
      { label: 'Coragem', value: attrs.coragem },
      { label: 'Posicionamento Ofensivo', value: attrs.posicionamento_ofensivo },
      { label: 'Posicionamento Defensivo', value: attrs.posicionamento_defensivo },
    ]},
    { title: 'Chute', attrs: [
      { label: 'Cabeceio', value: attrs.cabeceio },
      { label: 'Acurácia do Chute', value: attrs.acuracia_chute },
      { label: 'Força do Chute', value: attrs.forca_chute },
    ]},
  ];

  const gkSection = {
    title: 'Goleiro', attrs: [
      { label: 'Reflexo', value: attrs.reflexo },
      { label: 'Posicionamento', value: attrs.posicionamento_gol },
      { label: 'Defesa Aérea', value: attrs.defesa_aerea },
      { label: 'Pegada', value: attrs.pegada },
      { label: 'Saída do Gol', value: attrs.saida_gol },
      { label: 'Um Contra Um', value: attrs.um_contra_um },
      { label: 'Distribuição Curta', value: attrs.distribuicao_curta },
      { label: 'Distribuição Longa', value: attrs.distribuicao_longa },
      { label: 'Tempo de Reação', value: attrs.tempo_reacao },
      { label: 'Comando de Área', value: attrs.comando_area },
    ],
  };

  const displaySections = isGK ? [gkSection, ...sections] : [...sections, gkSection];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Atributos</h1>
          <p className="text-sm text-muted-foreground">{playerProfile.full_name} • OVR {playerProfile.overall}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displaySections.map(section => (
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
