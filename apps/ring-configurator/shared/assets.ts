import type { Shape } from './contract';

/** Approved build-time assets. New files require validation and a deployment before publication. */
export const ASSEMBLIES = [
  { version: 'lumen-visual-v1', family: 'hidden-halo', label: 'The Lumen · historical v1' },
  { version: 'lumen-visual-v2', family: 'hidden-halo', label: 'The Lumen · v2' },
  { version: 'lumen-visual-v3', family: 'hidden-halo', label: 'The Lumen · v3 with anchors' },
  { version: 'solitaire-visual-v1', family: 'solitaire', label: 'Solitaire · v1' },
] as const;
export const assetFiles = ASSEMBLIES.flatMap(a => ['round', 'oval'].map(shape => `${a.version}-${shape}.glb`));
export function assembly(version: string | undefined, shape?: Shape | '') {
  return (!shape || shape === 'Round' || shape === 'Oval') ? ASSEMBLIES.find(a => a.version === version) : undefined;
}
export const RULE_VERSION = 'multi-setting-v1';
