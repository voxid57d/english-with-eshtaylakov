const LEAVE_EVENT = "app:confirm-leave";
const MESSAGE = "You have unsaved shift changes. Leave this page and discard them?";

// Call before actions such as logout, which change the session before navigating.
export function confirmPageLeave() {
   return window.dispatchEvent(new Event(LEAVE_EVENT, { cancelable: true }));
}

type NavigationEvent = Event & {
   navigationType: string;
   destination: { url: string };
};

export function installUnsavedChangesGuard(message = MESSAGE) {
   let confirmedUntil = 0;
   const confirm = () => {
      if (Date.now() < confirmedUntil) return true;
      if (!window.confirm(message)) return false;
      confirmedUntil = Date.now() + 5_000;
      return true;
   };
   const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Date.now() < confirmedUntil) return;
      event.preventDefault();
      event.returnValue = "";
   };
   const beforeLeave = (event: Event) => {
      if (!confirm()) event.preventDefault();
   };
   // Capture links before Next's click handler changes the route.
   const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (!/^https?:$/.test(destination.protocol)) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin) return;
      if (!confirm()) {
         event.preventDefault();
         event.stopImmediatePropagation();
      }
   };
   // Modern browsers allow cancellation of Back/Forward before Next sees it.
   // https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event
   const navigation = (window as Window & { navigation?: EventTarget }).navigation;
   const onNavigate = (event: Event) => {
      const navigationEvent = event as NavigationEvent;
      if (navigationEvent.navigationType !== "traverse" || !event.cancelable) return;
      const destination = new URL(navigationEvent.destination.url);
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!confirm()) event.preventDefault();
   };
   window.addEventListener("beforeunload", beforeUnload);
   window.addEventListener(LEAVE_EVENT, beforeLeave);
   document.addEventListener("click", onClick, { capture: true });
   navigation?.addEventListener("navigate", onNavigate);
   return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener(LEAVE_EVENT, beforeLeave);
      document.removeEventListener("click", onClick, { capture: true });
      navigation?.removeEventListener("navigate", onNavigate);
   };
}
