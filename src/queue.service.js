// Singleton service for tracks requested from the web console.
// Queued tracks play in order before the stream goes back to picking at random.
// Kept in memory, so the queue is empty again after a restart.
const MAX_QUEUE_LENGTH = 200;

const queue = [];

module.exports = {
  getQueue: () => {
    return queue;
  },
  // Add to the end, or to the front with playNext
  add: (path, playNext) => {
    if (queue.length >= MAX_QUEUE_LENGTH) {
      return false;
    }
    const item = { path: path, date: Date.now() };
    if (playNext) {
      queue.unshift(item);
    } else {
      queue.push(item);
    }
    return true;
  },
  remove: index => {
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1);
      return true;
    }
    return false;
  },
  clear: () => {
    queue.splice(0, queue.length);
  },
  // Take the next track to play, if any
  take: () => {
    return queue.shift();
  },
  hasTracks: () => {
    return queue.length > 0;
  }
};
