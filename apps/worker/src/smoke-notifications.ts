import { payment_notification_event } from "@prisma/client";
import { scheduleNotification } from "./notifications/notify";
import { sendPendingNotifications } from "./notifications/sendNotifications";

const paymentId = process.argv[2];

if (!paymentId) {
  console.error("Usage: yarn workspace @floweypay/worker exec tsx src/smoke-notifications.ts <paymentId>");
  process.exit(1);
}

async function main() {
  await scheduleNotification(paymentId, payment_notification_event.EXPIRED);
  await sendPendingNotifications();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});