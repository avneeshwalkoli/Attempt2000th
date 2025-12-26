import { io } from "socket.io-client";

export const anydeskSocket = io("http://localhost:5000", {
  path: "/anydesk"
});
