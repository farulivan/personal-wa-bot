declare module 'qrcode-terminal' {
  const qrcode: {
    generate: (qr: string, options?: { small?: boolean }) => void;
  };
  export default qrcode;
}
