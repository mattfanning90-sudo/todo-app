import React from 'react';
import { render } from '@testing-library/react-native';
import { DragHandle } from '../../src/components/DragHandle';

// DragHandle is now a thin wrapper over the modern RNGH Gesture API. The
// gesture itself is native-only and can't be fired in jsdom, so these are
// render/smoke tests — the drag behaviour is validated on-device. The
// cross-stage resolution logic it feeds is unit-tested separately in
// resolveStageFromBounds.test.ts.

test('renders the ⠿ grip', () => {
  const { getByText } = render(
    <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  expect(getByText('⠿')).toBeTruthy();
});

test('exposes a grab handle (testID="drag-handle") without throwing', () => {
  const { getByTestId } = render(
    <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  expect(getByTestId('drag-handle')).toBeTruthy();
});
