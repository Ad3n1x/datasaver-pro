/**
 * DataSaver Pro - Web Page Optimization Content Script
 * Strips autoplay videos, suppresses pre-buffered media, and enables click-to-play.
 */

(function () {
  'use strict';

  // Prevent video pre-buffering and autoplay
  function neutraliseVideos(rootNode = document) {
    const videos = rootNode.querySelectorAll('video');
    videos.forEach((video) => {
      // Disable autoplay
      video.autoplay = false;
      video.removeAttribute('autoplay');

      // Prevent aggressive pre-buffering (saves 20MB - 100MB per video)
      if (video.getAttribute('preload') !== 'none') {
        video.setAttribute('preload', 'none');
      }

      // Pause if currently playing
      if (!video.paused) {
        try {
          video.pause();
        } catch (e) {}
      }
    });

    const audios = rootNode.querySelectorAll('audio');
    audios.forEach((audio) => {
      audio.autoplay = false;
      audio.removeAttribute('autoplay');
      audio.setAttribute('preload', 'none');
    });
  }

  // Run immediately and observe dynamic additions (e.g. infinite scroll feeds)
  neutraliseVideos();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            neutraliseVideos(node);
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
