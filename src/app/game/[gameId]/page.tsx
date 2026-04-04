import dynamic from "next/dynamic";

const GameClient = dynamic(() => import("../../game-client").then((module) => module.GameClient), {
  ssr: false
});

export default function GamePage({
  params
}: {
  params: {
    gameId: string;
  };
}) {
  return <GameClient key={params.gameId} routeGameId={params.gameId} />;
}
