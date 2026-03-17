import * as zmq from "zeromq";

const endpoint = process.env.BTC_ZMQ_RAWBLOCK ?? "tcp://127.0.0.1:28333";

async function main() {
  const sock = new zmq.Subscriber();
  sock.connect(endpoint);

  // Suscríbete a TODO para no fallar por topic
  sock.subscribe();

  console.log(`[smoke-block] connected to ${endpoint}, waiting...`);

  for await (const parts of sock) {
    const topic = parts[0]?.toString() ?? "";
    const bodyLen = parts[1]?.length ?? 0;
    console.log(`[smoke-block] topic=${topic} bodyBytes=${bodyLen}`);
    break;
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});