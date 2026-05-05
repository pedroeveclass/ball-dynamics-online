// TEMP — sandbox page for V2 avatar iteration. Delete once V2 ships.
// Renders a grid of variants so we can spot issues fast: skin tones,
// team colors, GK, captain, sock heights, shin guard, etc.

import { useMemo, useState } from 'react';
import { PlayerAvatarV2 } from '@/components/PlayerAvatarV2';
import {
  DEFAULT_APPEARANCE,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  EYEBROWS,
  EYES,
  MOUTHS,
  FACIAL_HAIR,
  ACCESSORIES,
  type PlayerAppearance,
} from '@/lib/avatar';

const KITS: Array<{ name: string; primary: string; secondary: string }> = [
  { name: 'Cinza (referência)', primary: '#D5D5D5', secondary: '#ADADAE' },
  { name: 'Vermelho/Branco',    primary: '#D32F2F', secondary: '#FFFFFF' },
  { name: 'Azul/Branco',        primary: '#1976D2', secondary: '#FFFFFF' },
  { name: 'Verde/Branco',       primary: '#2E7D32', secondary: '#FFFFFF' },
  { name: 'Preto/Branco',       primary: '#1A1A1A', secondary: '#FFFFFF' },
  { name: 'Amarelo/Verde',      primary: '#FFD600', secondary: '#2E7D32' },
];

export default function AvatarPreviewPage() {
  const [skinIdx, setSkinIdx] = useState(1);
  const [kitIdx, setKitIdx] = useState(0);
  const [position, setPosition] = useState<'ATA' | 'GOL'>('ATA');
  const [isCaptain, setIsCaptain] = useState(false);
  const [sockHeight, setSockHeight] = useState<'alto' | 'baixo'>('alto');
  const [hasShinGuard, setHasShinGuard] = useState(false);
  const [shinGuardColor, setShinGuardColor] = useState<string>('#FFFFFF');
  const [cleatColor, setCleatColor] = useState<string>('#1A1A1A');
  const [gloveColor, setGloveColor] = useState<string>('#1A1A1A');
  const [hasWinterGlove, setHasWinterGlove] = useState(false);
  const [hasBicepsBand, setHasBicepsBand] = useState(false);
  const [bicepsBandColor, setBicepsBandColor] = useState<string>('#1A1A1A');
  const [bicepsBandSide, setBicepsBandSide] = useState<'left' | 'right'>('left');
  const [hasWristband, setHasWristband] = useState(false);
  const [wristbandColor, setWristbandColor] = useState<string>('#FFFFFF');
  const [wristbandSide, setWristbandSide] = useState<'left' | 'right'>('left');
  const [hasSecondSkinShirt, setHasSecondSkinShirt] = useState(false);
  const [secondSkinShirtColor, setSecondSkinShirtColor] = useState<string>('#1A1A1A');
  const [secondSkinShirtSide, setSecondSkinShirtSide] = useState<'left' | 'right' | 'both'>('both');
  const [hasSecondSkinPants, setHasSecondSkinPants] = useState(false);
  const [secondSkinPantsColor, setSecondSkinPantsColor] = useState<string>('#1A1A1A');
  const [secondSkinPantsSide, setSecondSkinPantsSide] = useState<'left' | 'right' | 'both'>('both');
  const [hideShirt, setHideShirt] = useState(false);
  const [outfit, setOutfit] = useState<'player' | 'coach'>('player');
  const [jerseyPattern, setJerseyPattern] = useState<string>('solid');

  // Cosmetic prototypes (sandbox)
  const [tattooDesign, setTattooDesign] = useState<string>('none');
  const [tattooSide, setTattooSide] = useState<'left' | 'right'>('right');
  const [tattooColor, setTattooColor] = useState<string>('#1A1A1A');
  const [facePaintDesign, setFacePaintDesign] = useState<string>('none');
  const [facePaintColor, setFacePaintColor] = useState<string>('#FFD600');
  const [facePaintColor2, setFacePaintColor2] = useState<string>('#0066CC');
  const [hasEarring, setHasEarring] = useState(false);
  const [earringSide, setEarringSide] = useState<'left' | 'right' | 'both'>('both');
  const [earringColor, setEarringColor] = useState<string>('#FFD600');
  const [hasHeadband, setHasHeadband] = useState(false);
  const [headbandColor, setHeadbandColor] = useState<string>('#D32F2F');
  const [hasNecklace, setHasNecklace] = useState(false);
  const [necklaceColor, setNecklaceColor] = useState<string>('#FFD600');
  const [hasBracelet, setHasBracelet] = useState(false);
  const [braceletSide, setBraceletSide] = useState<'left' | 'right'>('right');
  const [braceletColor, setBraceletColor] = useState<string>('#C9A227');
  const [hasBandana, setHasBandana] = useState(false);
  const [bandanaColor, setBandanaColor] = useState<string>('#D32F2F');

  // Face state — drives every selectable slot of the DiceBear-style head.
  const [hair, setHair] = useState<string>(DEFAULT_APPEARANCE.hair);
  // Hex with leading '#'. Stripped to bare hex when piped into appearance.
  const [hairColorHex, setHairColorHex] = useState<string>(`#${DEFAULT_APPEARANCE.hairColor}`);
  const [eyebrows, setEyebrows] = useState<string>(DEFAULT_APPEARANCE.eyebrows);
  const [eyes, setEyes] = useState<string>(DEFAULT_APPEARANCE.eyes);
  const [mouth, setMouth] = useState<string>(DEFAULT_APPEARANCE.mouth);
  const [facialHair, setFacialHair] = useState<string>('none');
  const [accessories, setAccessories] = useState<string>('none');

  const appearance = useMemo<PlayerAppearance>(() => {
    const hairColorBare = hairColorHex.replace('#', '').toUpperCase();
    return {
      ...DEFAULT_APPEARANCE,
      skinTone: SKIN_TONES[skinIdx].id,
      hair,
      hairColor: hairColorBare,
      eyebrows,
      eyes,
      mouth,
      facialHair: facialHair === 'none' ? null : facialHair,
      facialHairColor: hairColorBare,
      accessories: accessories === 'none' ? null : accessories,
    };
  }, [skinIdx, hair, hairColorHex, eyebrows, eyes, mouth, facialHair, accessories]);

  const kit = KITS[kitIdx];

  const showcaseTiles: Array<{ label: string; props: Partial<React.ComponentProps<typeof PlayerAvatarV2>> }> = [
    { label: 'Linha · cinza',     props: { clubPrimaryColor: '#D5D5D5', clubSecondaryColor: '#ADADAE' } },
    { label: 'Linha · vermelho',  props: { clubPrimaryColor: '#D32F2F', clubSecondaryColor: '#FFFFFF' } },
    { label: 'Linha · azul',      props: { clubPrimaryColor: '#1976D2', clubSecondaryColor: '#FFFFFF' } },
    { label: 'Linha · preto',     props: { clubPrimaryColor: '#1A1A1A', clubSecondaryColor: '#FFFFFF' } },
    { label: 'Capitão',           props: { clubPrimaryColor: '#D32F2F', clubSecondaryColor: '#FFFFFF', isCaptain: true } },
    { label: 'Goleiro',           props: { clubPrimaryColor: '#FFD600', clubSecondaryColor: '#1A1A1A', position: 'GOL' } },
    { label: 'Meião alto',        props: { clubPrimaryColor: '#1A1A1A', clubSecondaryColor: '#FFFFFF', sockHeight: 'alto' } },
    { label: 'Meião baixo',       props: { clubPrimaryColor: '#1A1A1A', clubSecondaryColor: '#FFFFFF', sockHeight: 'baixo' } },
    { label: 'Caneleira',         props: { clubPrimaryColor: '#D32F2F', clubSecondaryColor: '#FFFFFF', hasShinGuard: true, shinGuardColor: '#FFFFFF' } },
    { label: 'Chuteira azul',     props: { clubPrimaryColor: '#FFFFFF', clubSecondaryColor: '#1A1A1A', cleatColor: '#1976D2' } },
    { label: 'Chuteira branca',   props: { clubPrimaryColor: '#1A1A1A', clubSecondaryColor: '#FFFFFF', cleatColor: '#FFFFFF' } },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Avatar V2 Preview (TEMP)</h1>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Controls */}
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, minWidth: 280 }}>
          <Field label="Tom de pele">
            <select value={skinIdx} onChange={(e) => setSkinIdx(Number(e.target.value))}>
              {SKIN_TONES.map((s, i) => (
                <option key={s.id} value={i}>{s.label} (#{s.id})</option>
              ))}
            </select>
          </Field>

          <Field label="Uniforme">
            <select value={kitIdx} onChange={(e) => setKitIdx(Number(e.target.value))}>
              {KITS.map((k, i) => (
                <option key={k.name} value={i}>{k.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Quem">
            <label style={{ marginRight: 12 }}>
              <input type="radio" checked={outfit === 'player'} onChange={() => setOutfit('player')} /> Jogador
            </label>
            <label>
              <input type="radio" checked={outfit === 'coach'} onChange={() => setOutfit('coach')} /> Treinador
            </label>
          </Field>

          <Field label="Padrão da camisa">
            <select value={jerseyPattern} onChange={(e) => setJerseyPattern(e.target.value)} style={{ width: '100%' }} disabled={outfit === 'coach'}>
              <option value="solid">Solid (sem padrão)</option>
              <optgroup label="Bicolor (metade/metade)">
                <option value="bicolor_horizontal">Horizontal</option>
                <option value="bicolor_vertical">Vertical</option>
                <option value="bicolor_diagonal">Diagonal</option>
              </optgroup>
              <optgroup label="Listras verticais">
                <option value="stripe_vertical_single">Single (Botafogo)</option>
                <option value="stripe_vertical_double">Double</option>
                <option value="stripe_vertical_triple">Triple</option>
                <option value="stripe_vertical_unique">Faixa única central</option>
              </optgroup>
              <optgroup label="Listras horizontais">
                <option value="stripe_horizontal_single">Single (São Paulo)</option>
                <option value="stripe_horizontal_double">Double</option>
                <option value="stripe_horizontal_triple">Triple (Atlético-MG)</option>
                <option value="stripe_horizontal_unique">Faixa única horizontal</option>
              </optgroup>
              <optgroup label="Listras diagonais">
                <option value="stripe_diagonal_single">Single</option>
                <option value="stripe_diagonal_double">Double</option>
                <option value="stripe_diagonal_triple">Triple</option>
                <option value="stripe_diagonal_unique">Faixa única (Vasco)</option>
              </optgroup>
            </select>
          </Field>

          <Field label="Posição">
            <label style={{ marginRight: 12 }}>
              <input type="radio" checked={position === 'ATA'} onChange={() => setPosition('ATA')} /> Linha
            </label>
            <label>
              <input type="radio" checked={position === 'GOL'} onChange={() => setPosition('GOL')} /> Goleiro
            </label>
          </Field>

          <Field label="Meião">
            <select value={sockHeight} onChange={(e) => setSockHeight(e.target.value as any)}>
              <option value="alto">Alto</option>
              <option value="baixo">Baixo</option>
            </select>
          </Field>

          <Field label="Cor da chuteira">
            <ColorPicker value={cleatColor} onChange={setCleatColor} resetTo="#1A1A1A" />
          </Field>

          <Field label="Cor da luva">
            <ColorPicker value={gloveColor} onChange={setGloveColor} resetTo="#1A1A1A" />
          </Field>

          <Field label="Caneleira">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasShinGuard} onChange={(e) => setHasShinGuard(e.target.checked)} /> Usar
            </label>
            {hasShinGuard && <ColorPicker value={shinGuardColor} onChange={setShinGuardColor} resetTo="#FFFFFF" />}
          </Field>

          <Field label="Luva de inverno (linha)">
            <label style={{ display: 'block' }}>
              <input type="checkbox" checked={hasWinterGlove} onChange={(e) => setHasWinterGlove(e.target.checked)} disabled={position === 'GOL'} /> Usar
              {position === 'GOL' && <span style={{ fontSize: 10, color: '#888', marginLeft: 6 }}>(GK já tem)</span>}
            </label>
          </Field>

          <Field label="Biceps band">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasBicepsBand} onChange={(e) => setHasBicepsBand(e.target.checked)} /> Usar
            </label>
            {hasBicepsBand && (
              <>
                <ColorPicker value={bicepsBandColor} onChange={setBicepsBandColor} resetTo="#1A1A1A" />
                <SideToggle value={bicepsBandSide} onChange={setBicepsBandSide} />
              </>
            )}
          </Field>

          <Field label="Munhequeira">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasWristband} onChange={(e) => setHasWristband(e.target.checked)} /> Usar
            </label>
            {hasWristband && (
              <>
                <ColorPicker value={wristbandColor} onChange={setWristbandColor} resetTo="#FFFFFF" />
                <SideToggle value={wristbandSide} onChange={setWristbandSide} />
              </>
            )}
          </Field>

          <Field label="Manga 2ª pele">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasSecondSkinShirt} onChange={(e) => setHasSecondSkinShirt(e.target.checked)} /> Usar
            </label>
            {hasSecondSkinShirt && (
              <>
                <ColorPicker value={secondSkinShirtColor} onChange={setSecondSkinShirtColor} resetTo="#1A1A1A" />
                <SideToggleBoth value={secondSkinShirtSide} onChange={setSecondSkinShirtSide} />
              </>
            )}
          </Field>

          <Field label="Calça 2ª pele">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasSecondSkinPants} onChange={(e) => setHasSecondSkinPants(e.target.checked)} /> Usar
            </label>
            {hasSecondSkinPants && (
              <>
                <ColorPicker value={secondSkinPantsColor} onChange={setSecondSkinPantsColor} resetTo="#1A1A1A" />
                <SideToggleBoth value={secondSkinPantsSide} onChange={setSecondSkinPantsSide} />
              </>
            )}
          </Field>

          <Field label="Outros">
            <label style={{ display: 'block' }}>
              <input type="checkbox" checked={isCaptain} onChange={(e) => setIsCaptain(e.target.checked)} /> Capitão (faixa)
            </label>
            <label style={{ display: 'block' }}>
              <input type="checkbox" checked={hideShirt} onChange={(e) => setHideShirt(e.target.checked)} /> Esconder camiseta (ver tronco)
            </label>
          </Field>

          <hr style={{ margin: '14px 0', border: 'none', borderTop: '2px dashed #c33' }} />
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#c33' }}>Protótipos novos (sandbox)</div>

          <Field label="Tatuagem (bíceps)">
            <select value={tattooDesign} onChange={(e) => setTattooDesign(e.target.value)} style={{ width: '100%' }}>
              <option value="none">Nenhuma</option>
              <option value="tribal">Tribal</option>
              <option value="cross">Cruz</option>
              <option value="heart">Coração</option>
              <option value="anchor">Âncora</option>
              <option value="star">Estrela</option>
            </select>
            {tattooDesign !== 'none' && (
              <div style={{ marginTop: 4 }}>
                <ColorPicker value={tattooColor} onChange={setTattooColor} resetTo="#1A1A1A" />
                <SideToggle value={tattooSide} onChange={setTattooSide} />
              </div>
            )}
          </Field>

          <Field label="Pintura facial">
            <select value={facePaintDesign} onChange={(e) => setFacePaintDesign(e.target.value)} style={{ width: '100%' }}>
              <option value="none">Nenhuma</option>
              <option value="brasil">Brasil (faixas amarela+azul)</option>
              <option value="horizontal">Faixa horizontal</option>
              <option value="two_stripes">Duas listras (war paint)</option>
              <option value="wings">Asas laterais</option>
            </select>
            {facePaintDesign !== 'none' && (
              <div style={{ marginTop: 4 }}>
                <ColorPicker value={facePaintColor} onChange={setFacePaintColor} resetTo="#FFD600" />
                {facePaintDesign === 'brasil' && (
                  <div style={{ marginTop: 4 }}>
                    <ColorPicker value={facePaintColor2} onChange={setFacePaintColor2} resetTo="#0066CC" />
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field label="Brinco">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasEarring} onChange={(e) => setHasEarring(e.target.checked)} /> Usar
            </label>
            {hasEarring && (
              <>
                <ColorPicker value={earringColor} onChange={setEarringColor} resetTo="#FFD600" />
                <SideToggleBoth value={earringSide} onChange={setEarringSide} />
              </>
            )}
          </Field>

          <Field label="Headband (faixa de cabelo)">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasHeadband} onChange={(e) => setHasHeadband(e.target.checked)} /> Usar
            </label>
            {hasHeadband && <ColorPicker value={headbandColor} onChange={setHeadbandColor} resetTo="#D32F2F" />}
          </Field>

          <Field label="Cordão (necklace)">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasNecklace} onChange={(e) => setHasNecklace(e.target.checked)} /> Usar
            </label>
            {hasNecklace && <ColorPicker value={necklaceColor} onChange={setNecklaceColor} resetTo="#FFD600" />}
          </Field>

          <Field label="Pulseira (fina)">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasBracelet} onChange={(e) => setHasBracelet(e.target.checked)} /> Usar
            </label>
            {hasBracelet && (
              <>
                <ColorPicker value={braceletColor} onChange={setBraceletColor} resetTo="#C9A227" />
                <SideToggle value={braceletSide} onChange={setBraceletSide} />
              </>
            )}
          </Field>

          <Field label="Bandana">
            <label style={{ display: 'block', marginBottom: 4 }}>
              <input type="checkbox" checked={hasBandana} onChange={(e) => setHasBandana(e.target.checked)} /> Usar
            </label>
            {hasBandana && <ColorPicker value={bandanaColor} onChange={setBandanaColor} resetTo="#D32F2F" />}
          </Field>

          <hr style={{ margin: '14px 0', border: 'none', borderTop: '1px solid #ddd' }} />
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Rosto</div>

          <Field label="Cabelo (estilo)">
            <select value={hair} onChange={(e) => setHair(e.target.value)} style={{ width: '100%' }}>
              {HAIR_STYLES.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Cor do cabelo">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="color"
                value={hairColorHex}
                onChange={(e) => setHairColorHex(e.target.value)}
                style={{ width: 50, height: 26 }}
              />
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{hairColorHex.toUpperCase()}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {HAIR_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setHairColorHex(`#${c.id}`)}
                    title={c.label}
                    style={{
                      width: 18, height: 18, padding: 0,
                      border: hairColorHex.toUpperCase() === `#${c.id.toUpperCase()}` ? '2px solid #333' : '1px solid #aaa',
                      background: `#${c.id}`, cursor: 'pointer', borderRadius: 3,
                    }}
                  />
                ))}
              </div>
            </div>
          </Field>
          <Field label="Sobrancelha">
            <select value={eyebrows} onChange={(e) => setEyebrows(e.target.value)} style={{ width: '100%' }}>
              {EYEBROWS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Olhos">
            <select value={eyes} onChange={(e) => setEyes(e.target.value)} style={{ width: '100%' }}>
              {EYES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Boca">
            <select value={mouth} onChange={(e) => setMouth(e.target.value)} style={{ width: '100%' }}>
              {MOUTHS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Barba/bigode">
            <select value={facialHair} onChange={(e) => setFacialHair(e.target.value)} style={{ width: '100%' }}>
              {FACIAL_HAIR.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Acessório">
            <select value={accessories} onChange={(e) => setAccessories(e.target.value)} style={{ width: '100%' }}>
              {ACCESSORIES.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </Field>

          <div style={{ marginTop: 16, padding: 12, background: '#f0f0f0', borderRadius: 4, fontSize: 12 }}>
            <div><b>Primary:</b> <span style={{ background: kit.primary, padding: '0 8px' }}>{kit.primary}</span></div>
            <div><b>Secondary:</b> <span style={{ background: kit.secondary, padding: '0 8px' }}>{kit.secondary}</span></div>
            <div><b>Skin:</b> #{SKIN_TONES[skinIdx].id}</div>
          </div>
        </div>

        {/* Avatar */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 320, height: 480, background: '#e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
            <PlayerAvatarV2
              appearance={appearance}
              variant="full-front"
              clubPrimaryColor={kit.primary}
              clubSecondaryColor={kit.secondary}
              jerseyNumber={9}
              position={position}
              isCaptain={isCaptain}
              sockHeight={sockHeight}
              hasShinGuard={hasShinGuard}
              shinGuardColor={hasShinGuard ? shinGuardColor : undefined}
              cleatColor={cleatColor}
              gloveColor={gloveColor}
              hasWinterGlove={hasWinterGlove}
              bicepsBandColor={hasBicepsBand ? bicepsBandColor : null}
              bicepsBandSide={bicepsBandSide}
              wristbandColor={hasWristband ? wristbandColor : null}
              wristbandSide={wristbandSide}
              secondSkinShirtColor={hasSecondSkinShirt ? secondSkinShirtColor : null}
              secondSkinShirtSide={secondSkinShirtSide}
              secondSkinPantsColor={hasSecondSkinPants ? secondSkinPantsColor : null}
              secondSkinPantsSide={secondSkinPantsSide}
              hideShirt={hideShirt}
              outfit={outfit}
              jerseyPattern={jerseyPattern}
              tattooDesign={tattooDesign === 'none' ? null : tattooDesign}
              tattooSide={tattooSide}
              tattooColor={tattooColor}
              facePaintDesign={facePaintDesign === 'none' ? null : facePaintDesign}
              facePaintColor={facePaintColor}
              facePaintColor2={facePaintColor2}
              hasEarring={hasEarring}
              earringSide={earringSide}
              earringColor={earringColor}
              hasHeadband={hasHeadband}
              headbandColor={headbandColor}
              hasNecklace={hasNecklace}
              necklaceColor={necklaceColor}
              hasBracelet={hasBracelet}
              braceletSide={braceletSide}
              braceletColor={braceletColor}
              hasBandana={hasBandana}
              bandanaColor={bandanaColor}
              className="w-full h-full"
            />
          </div>
        </div>

        {/* All-skin-tones strip for quick comparison */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', padding: 12, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Todos os tons</div>
          {SKIN_TONES.map((s) => (
            <div key={s.id} style={{ width: 96, height: 144, background: '#e8e8e8', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              <PlayerAvatarV2
                appearance={{ ...DEFAULT_APPEARANCE, skinTone: s.id }}
                variant="full-front"
                clubPrimaryColor={kit.primary}
                clubSecondaryColor={kit.secondary}
                position={position}
                className="w-full h-full"
              />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 9, padding: 1, background: 'rgba(0,0,0,0.5)', color: '#fff', textAlign: 'center' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Showcase grid — every variant at a glance */}
      <h2 style={{ fontSize: 18, margin: '32px 0 12px' }}>Showcase — variantes lado a lado</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {showcaseTiles.map((tile) => (
          <div key={tile.label} style={{ background: '#fff', borderRadius: 8, padding: 8 }}>
            <div style={{ width: '100%', height: 220, background: '#e8e8e8', borderRadius: 4, overflow: 'hidden' }}>
              <PlayerAvatarV2
                appearance={appearance}
                variant="full-front"
                jerseyNumber={9}
                {...tile.props}
                className="w-full h-full"
              />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, textAlign: 'center' }}>{tile.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function ColorPicker({ value, onChange, resetTo }: { value: string; onChange: (v: string) => void; resetTo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 50, height: 26 }} />
      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
      <button onClick={() => onChange(resetTo)} style={{ fontSize: 10, padding: '2px 5px' }}>Reset</button>
    </div>
  );
}

function SideToggle({ value, onChange }: { value: 'left' | 'right'; onChange: (v: 'left' | 'right') => void }) {
  return (
    <div style={{ marginTop: 4, fontSize: 11 }}>
      <label style={{ marginRight: 10 }}>
        <input type="radio" checked={value === 'left'} onChange={() => onChange('left')} /> Esq (jogador)
      </label>
      <label>
        <input type="radio" checked={value === 'right'} onChange={() => onChange('right')} /> Dir (jogador)
      </label>
    </div>
  );
}

function SideToggleBoth({ value, onChange }: { value: 'left' | 'right' | 'both'; onChange: (v: 'left' | 'right' | 'both') => void }) {
  return (
    <div style={{ marginTop: 4, fontSize: 11 }}>
      <label style={{ marginRight: 8 }}>
        <input type="radio" checked={value === 'left'} onChange={() => onChange('left')} /> Esq
      </label>
      <label style={{ marginRight: 8 }}>
        <input type="radio" checked={value === 'right'} onChange={() => onChange('right')} /> Dir
      </label>
      <label>
        <input type="radio" checked={value === 'both'} onChange={() => onChange('both')} /> Ambos
      </label>
    </div>
  );
}
