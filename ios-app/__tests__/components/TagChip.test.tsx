import React from 'react';
import { render } from '@testing-library/react-native';
import { TagChip } from '../../src/components/TagChip';

test('renders the category name', () => {
  const { getByText } = render(<TagChip name="Work" color="#3B82F6" />);
  expect(getByText('Work')).toBeTruthy();
});

test('applies tinted background (hex + 1a alpha)', () => {
  const { getByTestId } = render(<TagChip name="Work" color="#3B82F6" testID="chip" />);
  const chip = getByTestId('chip');
  // Background should be the hex color with low opacity
  expect(chip.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ backgroundColor: '#3B82F61a' })])
  );
});

test('renders nothing when name is falsy', () => {
  const { queryByTestId } = render(<TagChip name="" color="#3B82F6" testID="chip" />);
  expect(queryByTestId('chip')).toBeNull();
});
