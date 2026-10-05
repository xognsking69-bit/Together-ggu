import { Redirect, useLocalSearchParams } from "expo-router";

// Keep a single home screen and pass the invite to its existing join flow.
export default function Invite() {
  const { payload } = useLocalSearchParams<{ payload?: string | string[] }>();
  const value = Array.isArray(payload) ? payload[0] : payload;
  return <Redirect href={value ? { pathname: "/", params: { payload: value } } : "/"} />;
}
