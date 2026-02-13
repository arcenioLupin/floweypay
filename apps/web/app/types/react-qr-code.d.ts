declare module "react-qr-code" {
  import * as React from "react";

  export interface QRCodeProps extends React.SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    bgColor?: string;
    fgColor?: string;
    level?: "L" | "M" | "Q" | "H";
  }

  const QRCode: React.FC<QRCodeProps>;
  export default QRCode;
}

