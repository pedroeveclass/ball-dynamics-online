import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trans, useTranslation } from 'react-i18next';

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'geral' | 'fases' | 'acoes' | 'atalhos';
}

export function HelpModal({ open, onOpenChange, defaultTab = 'geral' }: HelpModalProps) {
  const { t } = useTranslation('help');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-[hsl(220,15%,12%)] border-[hsl(220,10%,25%)] text-[hsl(45,20%,90%)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-display uppercase tracking-wider text-[hsl(45,30%,80%)]">
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={defaultTab} className="mt-2">
          <TabsList className="grid grid-cols-4 w-full bg-[hsl(220,15%,18%)]">
            <TabsTrigger value="geral">{t('tabs.general')}</TabsTrigger>
            <TabsTrigger value="fases">{t('tabs.phases')}</TabsTrigger>
            <TabsTrigger value="acoes">{t('tabs.actions')}</TabsTrigger>
            <TabsTrigger value="atalhos">{t('tabs.shortcuts')}</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="mt-4 space-y-3 text-sm leading-relaxed">
            <p>
              <Trans
                t={t}
                i18nKey="general.intro_p1"
                components={[<strong key="0" />, <strong key="1" />]}
              />
            </p>
            <p>
              <Trans
                t={t}
                i18nKey="general.intro_p2"
                components={[<strong key="0" />, <strong key="1" />]}
              />
            </p>
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                {t('general.flow_title')}
              </div>
              <ol className="text-xs list-decimal list-inside space-y-0.5 text-[hsl(45,20%,80%)]">
                <li>{t('general.flow_step1')}</li>
                <li>{t('general.flow_step2')}</li>
                <li>{t('general.flow_step3')}</li>
                <li>{t('general.flow_step4')}</li>
                <li>{t('general.flow_step5')}</li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="fases" className="mt-4 space-y-4 text-sm leading-relaxed">
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">{t('phases.positioning_title')}</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">{t('phases.positioning_body')}</p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">{t('phases.ball_holder_title')}</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                <Trans
                  t={t}
                  i18nKey="phases.ball_holder_body"
                  components={[
                    <strong key="0" />,
                    <strong key="1" />,
                    <strong key="2" />,
                    <strong key="3" />,
                    <strong key="4" />,
                    <strong key="5" />,
                  ]}
                />
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">{t('phases.attacking_title')}</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                <Trans t={t} i18nKey="phases.attacking_body" components={[<strong key="0" />]} />
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">{t('phases.defending_title')}</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">
                <Trans
                  t={t}
                  i18nKey="phases.defending_body"
                  components={[
                    <strong key="0" />,
                    <strong key="1" />,
                    <strong key="2" />,
                    <strong key="3" />,
                    <strong key="4" />,
                  ]}
                />
              </p>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[hsl(45,30%,80%)] mb-1">{t('phases.resolution_title')}</h3>
              <p className="text-xs text-[hsl(45,20%,75%)]">{t('phases.resolution_body')}</p>
            </div>
          </TabsContent>

          <TabsContent value="acoes" className="mt-4 space-y-3 text-sm leading-relaxed">
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                {t('actions.green_circle_title')}
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">{t('actions.green_circle_body')}</p>
            </div>
            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(280,30%,40%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(280,60%,70%)] mb-2">
                {t('actions.purple_circle_title')}
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">{t('actions.purple_circle_body')}</p>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                {t('actions.ball_zones_title')}
              </div>
              <ul className="text-xs list-disc list-inside space-y-0.5 text-[hsl(45,20%,80%)]">
                <li>
                  <Trans
                    t={t}
                    i18nKey="actions.ball_zone_green"
                    components={[<span key="0" className="text-green-400" />]}
                  />
                </li>
                <li>
                  <Trans
                    t={t}
                    i18nKey="actions.ball_zone_yellow"
                    components={[<span key="0" className="text-yellow-400" />]}
                  />
                </li>
                <li>
                  <Trans
                    t={t}
                    i18nKey="actions.ball_zone_red"
                    components={[<span key="0" className="text-red-400" />]}
                  />
                </li>
              </ul>
            </div>
            <div className="bg-[hsl(30,60%,14%)] rounded p-3 border border-[hsl(30,60%,35%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(30,80%,70%)] mb-1">
                {t('actions.inertia_title')}
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">
                <Trans t={t} i18nKey="actions.inertia_body" components={[<strong key="0" />]} />
              </p>
              <ul className="text-xs text-[hsl(45,20%,75%)] list-disc list-inside mt-1.5 space-y-0.5">
                <li>
                  <Trans t={t} i18nKey="actions.inertia_100" components={[<strong key="0" />]} />
                </li>
                <li>
                  <Trans t={t} i18nKey="actions.inertia_0" components={[<strong key="0" />]} />
                </li>
                <li>
                  <Trans t={t} i18nKey="actions.inertia_50" components={[<strong key="0" />]} />
                </li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-1">
                {t('actions.one_touch_title')}
              </div>
              <p className="text-xs text-[hsl(45,20%,80%)]">{t('actions.one_touch_body')}</p>
            </div>
          </TabsContent>

          <TabsContent value="atalhos" className="mt-4 space-y-3 text-sm leading-relaxed">
            <p className="text-xs text-[hsl(45,20%,75%)]">{t('shortcuts.intro')}</p>

            <div className="bg-[hsl(220,15%,16%)] rounded p-3 border border-[hsl(220,10%,25%)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[hsl(45,30%,60%)] mb-2">
                {t('shortcuts.row_top_title')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Q', t('shortcuts.key_q')],
                  ['W', t('shortcuts.key_w')],
                  ['E', t('shortcuts.key_e')],
                  ['R', t('shortcuts.key_r')],
                  ['T', t('shortcuts.key_t')],
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
                {t('shortcuts.row_mid_title')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['A', t('shortcuts.key_a')],
                  ['S', t('shortcuts.key_s')],
                  ['D', t('shortcuts.key_d')],
                  ['F', t('shortcuts.key_f')],
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
                {t('shortcuts.row_bot_title')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Z', t('shortcuts.key_z')],
                  ['X', t('shortcuts.key_x')],
                  ['C', t('shortcuts.key_c')],
                  ['V', t('shortcuts.key_v')],
                  ['B', t('shortcuts.key_b')],
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
