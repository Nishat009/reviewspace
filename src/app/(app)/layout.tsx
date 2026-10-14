import { RealtimeProvider } from "@/components/realtime/realtime-provider";

export default function SignedInLayout({ children }: LayoutProps<"/">) {
  return <RealtimeProvider>{children}</RealtimeProvider>;
}
