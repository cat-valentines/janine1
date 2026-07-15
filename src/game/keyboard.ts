export type GameAction = 'left' | 'right' | 'up' | 'down';

const actions: Record<string, GameAction | undefined> = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
};

export function actionFromKey(key: string) {
  return actions[key];
}
