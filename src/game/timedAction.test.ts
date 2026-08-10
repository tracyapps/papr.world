import { describe, expect, it, vi } from 'vitest';
import { createTimedActionController } from './timedAction';

describe('timed actions', () => {
  it('reports progress and commits only after the duration finishes', () => {
    const complete = vi.fn();
    const controller = createTimedActionController();

    expect(controller.start({
      steps: [{ kind: 'build', durationMs: 2_000 }],
      onComplete: complete,
    }, 1_000)).toBe(true);

    expect(controller.snapshot(2_000)).toMatchObject({
      active: true,
      kind: 'build',
      label: 'Building',
      progress: 0.5,
    });
    expect(complete).not.toHaveBeenCalled();

    controller.update(3_000);
    expect(complete).toHaveBeenCalledOnce();
    expect(controller.snapshot(3_000)).toEqual({ active: false });
  });

  it('runs authored part and assembly steps in order', () => {
    const completedSteps: string[] = [];
    const complete = vi.fn();
    const controller = createTimedActionController();

    controller.start({
      steps: [
        { id: 'frame', kind: 'build', label: 'Making frame', durationMs: 1_000 },
        { id: 'shell', kind: 'build', label: 'Making shell', durationMs: 500 },
        { id: 'join', kind: 'assemble', durationMs: 750 },
      ],
      onStepComplete: (step) => completedSteps.push(step.id ?? ''),
      onComplete: complete,
    }, 100);

    controller.update(1_100);
    expect(completedSteps).toEqual(['frame']);
    expect(controller.snapshot(1_100)).toMatchObject({
      active: true,
      kind: 'build',
      label: 'Making shell',
      progress: 0,
    });

    controller.update(2_350);
    expect(completedSteps).toEqual(['frame', 'shell', 'join']);
    expect(complete).toHaveBeenCalledOnce();
    expect(controller.isActive()).toBe(false);
  });

  it('cancels without committing and reports why', () => {
    const complete = vi.fn();
    const cancel = vi.fn();
    const controller = createTimedActionController();

    controller.start({
      steps: [{ kind: 'harvest', durationMs: 1_200 }],
      onComplete: complete,
      onCancel: cancel,
    }, 0);

    expect(controller.cancel('escape')).toBe(true);
    expect(cancel).toHaveBeenCalledWith('escape');
    expect(complete).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });

  it('refuses a second action while one is already running', () => {
    const controller = createTimedActionController();
    expect(controller.start({ steps: [{ kind: 'plant', durationMs: 1_000 }] }, 0)).toBe(true);
    expect(controller.start({ steps: [{ kind: 'cook', durationMs: 1_000 }] }, 50)).toBe(false);
    expect(controller.snapshot(50)).toMatchObject({ kind: 'plant', label: 'Planting' });
  });
});
