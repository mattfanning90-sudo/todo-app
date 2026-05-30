const React = require('react');
const { View, FlatList } = require('react-native');

// Minimal mock for react-native-draggable-flatlist used in BoardScreen tests.
// Renders a plain FlatList for NestableDraggableFlatList and a plain View for
// NestableScrollContainer so task cards appear in the tree.

function NestableScrollContainer({ children, refreshControl, contentContainerStyle, showsVerticalScrollIndicator, scrollEnabled, onScroll, scrollEventThrottle, ...rest }) {
  return React.createElement(View, rest, children);
}

function NestableDraggableFlatList({ data, renderItem, keyExtractor, onDragEnd, activationDistance, extraData, ...rest }) {
  return React.createElement(
    FlatList,
    {
      data,
      renderItem,
      keyExtractor,
      ...rest,
    }
  );
}

function ScaleDecorator({ children }) {
  return children;
}

const DraggableFlatList = NestableDraggableFlatList;

module.exports = {
  default: DraggableFlatList,
  DraggableFlatList,
  NestableScrollContainer,
  NestableDraggableFlatList,
  ScaleDecorator,
};
