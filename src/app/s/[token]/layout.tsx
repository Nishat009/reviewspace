import { RealtimeProvider } from "@/components/realtime/realtime-provider";

/** Share-link pages authenticate realtime with the link token, not a session. */
export default async function ShareLayout(props: LayoutProps<"/s/[token]">) {
  const { token } = await props.params;
  return <RealtimeProvider shareToken={token}>{props.children}</RealtimeProvider>;
}
