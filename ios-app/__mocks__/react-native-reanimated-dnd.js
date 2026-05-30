// Passthrough mock — the real library is native-gesture-driven and can't run
// in jsdom. Components just render their children so screens mount in tests.
const React = require('react');
const { View } = require('react-native');
const pass = ({ children }) => React.createElement(View, null, children);
module.exports = {
  DropProvider: pass,
  Draggable: pass,
  Droppable: pass,
  Sortable: pass,
  SortableItem: pass,
  SortableGrid: pass,
};
