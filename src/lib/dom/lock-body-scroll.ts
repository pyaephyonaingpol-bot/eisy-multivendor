/**
 * Lock document scroll without horizontal layout shift.
 * Compensates for the scrollbar disappearing when overflow is hidden.
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const body = document.body;
  const html = document.documentElement;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;
  const previousHtmlOverflow = html.style.overflow;

  const scrollbarGap = Math.max(0, window.innerWidth - html.clientWidth);
  body.style.overflow = "hidden";
  html.style.overflow = "hidden";
  if (scrollbarGap > 0) {
    body.style.paddingRight = `${scrollbarGap}px`;
  }

  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
    html.style.overflow = previousHtmlOverflow;
  };
}
