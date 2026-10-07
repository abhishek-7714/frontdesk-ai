"use client";
import { ConversationProvider } from "@elevenlabs/react";
import { CallScreen, type PreviewState } from "./CallScreen";

export function CallApp({ clinicName, preview }: { clinicName: string; preview: PreviewState }) {
  return (
    <ConversationProvider>
      <CallScreen clinicName={clinicName} preview={preview} />
    </ConversationProvider>
  );
}
