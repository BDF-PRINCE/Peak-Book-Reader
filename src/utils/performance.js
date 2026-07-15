/* ===== Performance Optimization Utilities ===== */

const { Worker } = require('worker_threads');
const path = require('path');

// ===== Debounce =====
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ===== Throttle =====
function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ===== Lazy Loading Observer =====
function setupLazyLoading(selector, loadFn, options = {}) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        loadFn(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: options.rootMargin || '200px',
    threshold: options.threshold || 0
  });

  document.querySelectorAll(selector).forEach(el => observer.observe(el));
  return observer;
}

// ===== Virtual Scrolling (simplified) =====
class VirtualList {
  constructor(container, itemHeight, totalItems, renderFn) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.totalItems = totalItems;
    this.renderFn = renderFn;
    this.visibleCount = Math.ceil(container.clientHeight / itemHeight) + 2;
    this.startIndex = 0;

    this.scroller = document.createElement('div');
    this.scroller.style.position = 'relative';
    this.scroller.style.height = `${totalItems * itemHeight}px`;

    this.content = document.createElement('div');
    this.content.style.position = 'absolute';
    this.content.style.top = '0';
    this.content.style.width = '100%';

    this.scroller.appendChild(this.content);
    container.appendChild(this.scroller);

    container.addEventListener('scroll', this._onScroll.bind(this), { passive: true });
    this._render();
  }

  _onScroll() {
    this.startIndex = Math.floor(this.container.scrollTop / this.itemHeight);
    requestAnimationFrame(() => this._render());
  }

  _render() {
    const visibleStart = this.startIndex;
    const visibleEnd = Math.min(visibleStart + this.visibleCount, this.totalItems);

    this.content.style.top = `${visibleStart * this.itemHeight}px`;
    this.content.innerHTML = '';

    for (let i = visibleStart; i < visibleEnd; i++) {
      this.content.appendChild(this.renderFn(i));
    }
  }

  refresh(totalItems) {
    this.totalItems = totalItems;
    this.visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight) + 2;
    this.scroller.style.height = `${totalItems * this.itemHeight}px`;
    this._render();
  }

  destroy() {
    this.scroller.remove();
  }
}

// ===== Background Indexing =====
function backgroundIndexBooks(bookPaths, onProgress) {
  // In a real app, this would use worker_threads
  // For now, process in chunks with requestIdleCallback-like behavior
  const chunks = [];
  const chunkSize = 10;
  for (let i = 0; i < bookPaths.length; i += chunkSize) {
    chunks.push(bookPaths.slice(i, i + chunkSize));
  }

  let currentChunk = 0;

  function processNextChunk() {
    if (currentChunk >= chunks.length) {
      onProgress({ done: true, processed: bookPaths.length });
      return;
    }

    const chunk = chunks[currentChunk];
    const promises = chunk.map(async (filePath) => {
      try {
        const bookData = await require('../utils/metadata').extractMetadata(filePath);
        return bookData;
      } catch (e) {
        console.error('Failed to index:', filePath, e.message);
        return null;
      }
    });

    Promise.all(promises).then(results => {
      currentChunk++;
      onProgress({
        done: false,
        processed: currentChunk * chunkSize,
        total: bookPaths.length,
        books: results.filter(Boolean)
      });

      // Small delay to avoid blocking UI
      setTimeout(processNextChunk, 50);
    });
  }

  processNextChunk();
}

module.exports = {
  debounce,
  throttle,
  setupLazyLoading,
  VirtualList,
  backgroundIndexBooks
};
