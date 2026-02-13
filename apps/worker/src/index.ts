console.log("[worker] up");

setInterval(() => {
  // placeholder heartbeat para mantener vivo el proceso
  console.log("[worker] heartbeat");
}, 30_000);
