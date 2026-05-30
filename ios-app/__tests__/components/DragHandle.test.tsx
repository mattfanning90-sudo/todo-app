import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DragHandle } from '../../src/components/DragHandle';

test('renders the ⠿ icon', () => {
  const { getByText } = render(
    <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  expect(getByText('⠿')).toBeTruthy();
});

test('calls onDragStart with absoluteY when long-pressed', () => {
  const onDragStart = jest.fn();
  const { getByTestId } = render(
    <DragHandle onDragStart={onDragStart} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  // The LongPressGestureHandler mock injects onLongPress onto its immediate
  // child (testID="drag-handle-lp-wrapper"). Firing longPress on that view
  // triggers onHandlerStateChange({ state: ACTIVE, absoluteY: 100 }).
  fireEvent(getByTestId('drag-handle-lp-wrapper'), 'longPress');
  expect(onDragStart).toHaveBeenCalledWith(100);
});

test('onDragStart receives the absoluteY value from the gesture mock (MOCK_ABSOLUTE_Y=100)', () => {
  // The RNGH mock fires absoluteY=100 for all long-press events.
  // This test documents that value so a reader doesn't have to trace the mock.
  const onDragStart = jest.fn();
  const { getByTestId } = render(
    <DragHandle onDragStart={onDragStart} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
  );
  fireEvent(getByTestId('drag-handle-lp-wrapper'), 'longPress');
  expect(onDragStart).toHaveBeenCalledWith(100);
});
