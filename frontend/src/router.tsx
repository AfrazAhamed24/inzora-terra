/**
 * INZORA TERRA — minimal client-side router (History API)
 * Zero dependencies: pushState navigation, popstate support (back/forward),
 * real anchors so links open in new tabs / can be copied.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

interface RouterValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', navigate: () => undefined });

function currentPath(): string {
  return window.location.pathname || '/';
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath);

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback(
    (to: string) => {
      const target = to.startsWith('/') ? to : `/${to}`;
      if (target === currentPath()) return;
      window.history.pushState({}, '', target);
      setPath(target);
    },
    []
  );

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  return useContext(RouterContext);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  children: ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (new tab / window).
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (onClick) onClick(event);
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
