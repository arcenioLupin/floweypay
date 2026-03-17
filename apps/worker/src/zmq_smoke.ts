import * as zmq from "zeromq";

const endpoint = process.env.BTC_ZMQ_RAWTX ?? "tcp://127.0.0.1:28332";

async function main() {
  const sock = new zmq.Subscriber();
  sock.connect(endpoint);

  // 👇 Suscríbete a TODO para descartar tema de topic
  sock.subscribe();

  console.log(`[smoke] connected to ${endpoint}, waiting...`);

  for await (const parts of sock) {
    const topic = parts[0]?.toString() ?? "";
    const bodyLen = parts[1]?.length ?? 0;

    // Bitcoin Core suele mandar 3 frames: topic, body, sequence
    const seq =
      parts[2] && parts[2].length >= 4 ? parts[2].readUInt32LE(0) : null;

    console.log(`[smoke] topic=${topic} bodyBytes=${bodyLen} seq=${seq}`);
    break; // con 1 mensaje nos basta
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});