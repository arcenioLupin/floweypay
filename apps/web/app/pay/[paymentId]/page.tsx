import BtcPaymentLinkClient from "./BtcPaymentLinkClient";

export default async function Page({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <BtcPaymentLinkClient paymentId={paymentId} />;
}
