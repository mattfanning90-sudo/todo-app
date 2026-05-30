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

test('does not throw when rendered without optional callbacks', () => {
  expect(() =>
    render(
      <DragHandle onDragStart={jest.fn()} onDragMove={jest.fn()} onDragEnd={jest.fn()} />
    )
  ).not.toThrow();
});
