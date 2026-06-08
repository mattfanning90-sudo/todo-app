import React from 'react';
import { render } from '@testing-library/react-native';
import { ProgressRing } from '../../src/components/ProgressRing';

test('renders the ring container', () => {
  const { getByTestId } = render(<ProgressRing pct={50} />);
  expect(getByTestId('progress-ring')).toBeTruthy();
});

test('shows pct label for 0%', () => {
  const { getByTestId } = render(<ProgressRing pct={0} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('0%');
});

test('shows pct label for 100%', () => {
  const { getByTestId } = render(<ProgressRing pct={100} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('100%');
});

test('clamps values above 100', () => {
  const { getByTestId } = render(<ProgressRing pct={150} />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('100%');
});

test('accepts a custom label', () => {
  const { getByTestId } = render(<ProgressRing pct={75} label="75%" />);
  expect(getByTestId('progress-ring-pct').props.children).toBe('75%');
});
