import { h } from './dom';
import { T } from './texts';

export type Step = 1 | 2 | 3;

/** Strip with the 4 steps of the job; highlights the current one. Sits on top of every screen of the flow. */
export function stepsBanner(current: Step): HTMLElement {
  return h(
    'nav',
    { class: 'steps-banner', 'aria-label': T.step(current) },
    h(
      'ol',
      {},
      T.stepShort.map((name, i) => {
        const n = i + 1;
        const status = n < current ? 'done' : n === current ? 'current' : '';
        return h(
          'li',
          { class: status, 'aria-current': n === current ? 'step' : undefined },
          h('span', { class: 'steps-num' }, n < current ? '✓' : String(n)),
          h('span', { class: 'steps-text' }, name),
        );
      }),
    ),
  );
}
