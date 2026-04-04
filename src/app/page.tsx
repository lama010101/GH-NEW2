import dynamic from "next/dynamic";

const GameClient = dynamic(() => import("./game-client").then((module) => module.GameClient), {
  ssr: false
});

export default function Page() {
  return <GameClient />;
}
