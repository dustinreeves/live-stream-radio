// Singleton service to store the most recent activites, api.number_of_history_items of them (100 by default)
const DEFAULT_NUMBER_OF_HISTORY_ITEMS = 100;

const history = [];
let numberOfHistoryItems = DEFAULT_NUMBER_OF_HISTORY_ITEMS;

// Drop the oldest items, keeping the newest numberOfHistoryItems
const trimHistory = () => {
  if (history.length > numberOfHistoryItems) {
    history.splice(0, history.length - numberOfHistoryItems);
  }
};

module.exports = {
  getHistory: () => {
    return history;
  },
  setNumberOfHistoryItems: number => {
    const parsed = parseInt(number, 10);
    numberOfHistoryItems = parsed > 0 ? parsed : DEFAULT_NUMBER_OF_HISTORY_ITEMS;
    trimHistory();
  },
  addItemToHistory: item => {
    const historyItem = {
      ...item
    };

    historyItem.date = Date.now();

    history.push(historyItem);
    trimHistory();
  }
};
