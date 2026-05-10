declare module 'next/router' {
  const router: {
    events: {
      on(event: string, handler: (...args: any[]) => void): void;
      off(event: string, handler: (...args: any[]) => void): void;
    };
  };
  export default router;
}
